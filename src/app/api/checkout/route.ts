import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  console.log('API Checkout: Recebendo requisição POST');
  try {
    const { plan, price } = await req.json();
    const cookieStore = await cookies();
    
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, cpf')
      .eq('id', user.id)
      .single();

    // Tenta pegar o CPF do perfil ou do metadata do usuário (como fallback)
    const cpf = profile?.cpf || user.user_metadata?.cpf;
    
    if (!cpf) {
      console.error('CPF não encontrado para o usuário:', user.id, 'Metadata:', user.user_metadata);
      return NextResponse.json({ 
        error: 'CPF ou CNPJ não encontrado. Por favor, saia e entre novamente ou complete seu cadastro.' 
      }, { status: 400 });
    }

    let asaasKey = process.env.ASAAS_API_KEY;
    if (!asaasKey) {
      throw new Error('ASAAS_API_KEY não configurada no ambiente');
    }

    // Adiciona o $ de volta se o Next.js o removeu do .env.local
    if (!asaasKey.startsWith('$')) {
      asaasKey = '$' + asaasKey;
    }

    // Usando a URL do Sandbox para testes
    const asaasUrl = 'https://sandbox.asaas.com/api/v3';

    // 0. Busca se o cliente já existe pelo email
    const searchRes = await fetch(`${asaasUrl}/customers?email=${encodeURIComponent(user.email)}`, {
      method: 'GET',
      headers: {
        'access_token': asaasKey,
      },
    });
    const searchData = await searchRes.json();
    
    let customerId = '';
    
    if (searchRes.ok && searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
      // Opcional: Atualizar o CPF se estiver faltando
      if (!searchData.data[0].cpfCnpj) {
        await fetch(`${asaasUrl}/customers/${customerId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access_token': asaasKey,
          },
          body: JSON.stringify({ cpfCnpj: cpf }),
        });
      }
    } else {
      // 1. Cria o cliente no Asaas se não existir
      const customerRes = await fetch(`${asaasUrl}/customers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': asaasKey,
        },
        body: JSON.stringify({
          name: profile?.full_name || user.email,
          email: user.email,
          cpfCnpj: cpf,
          externalReference: user.id,
        }),
      });

      const customerData = await customerRes.json();
      if (!customerRes.ok) {
        console.error('Asaas Customer Error:', customerData);
        throw new Error(customerData.errors?.[0]?.description || 'Erro ao criar cliente no Asaas');
      }
      customerId = customerData.id;
    }

    // 2. Cria a assinatura mensal e gera a cobrança
    const subRes = await fetch(`${asaasUrl}/subscriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasKey,
      },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'UNDEFINED', // Deixa em aberto para PIX, Boleto ou Cartão
        value: price,
        nextDueDate: new Date().toISOString().split('T')[0],
        cycle: 'MONTHLY',
        description: `Assinatura Nythos - Plano ${plan}`,
      }),
    });

    const subData = await subRes.json();
    if (!subRes.ok) {
      console.error('Asaas Subscription Error:', subData);
      throw new Error(subData.errors?.[0]?.description || 'Erro ao criar assinatura');
    }

    // 3. Busca a primeira cobrança gerada para esta assinatura
    const paymentsRes = await fetch(`${asaasUrl}/subscriptions/${subData.id}/payments`, {
      method: 'GET',
      headers: {
        'access_token': asaasKey,
      },
    });
    const paymentsData = await paymentsRes.json();
    
    // Pega a URL da primeira cobrança pendente
    const checkoutUrl = paymentsData.data?.[0]?.invoiceUrl || paymentsData.data?.[0]?.bankSlipUrl;
    
    console.log('Checkout URL generated from payment:', checkoutUrl);
    return NextResponse.json({ checkoutUrl });

  } catch (error: any) {
    console.error('Erro no checkout:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
