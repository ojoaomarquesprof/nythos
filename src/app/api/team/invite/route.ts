import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const { email, password, full_name } = await req.json();

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    // 1. Verificar se o solicitante é um psicólogo logado
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
    ) as any;

    const { data: { user: therapist } } = await supabase.auth.getUser();

    if (!therapist) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Opcional: Verificar se o solicitante já é uma secretária (não pode convidar outros)
    const { data: therapistProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', therapist.id)
      .single();

    if (therapistProfile?.role === 'secretary') {
      return NextResponse.json({ error: 'Secretárias não podem convidar outros membros' }, { status: 403 });
    }

    // 2. Criar o novo usuário no Auth via Admin
    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name,
        role: 'secretary',
        employer_id: therapist.id
      }
    });

    if (authError) {
      console.error('Erro ao criar usuário Auth:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    if (!newUser.user) {
      return NextResponse.json({ error: 'Falha ao criar usuário' }, { status: 500 });
    }

    // 3. Atualizar o perfil da nova secretária
    // Como a tabela profiles é populada automaticamente via trigger (provavelmente),
    // vamos usar o admin para forçar o papel e o vínculo.
    const { error: profileError } = await (supabaseAdmin as any)
      .from('profiles')
      .update({
        full_name: full_name,
        email: email,
        role: 'secretary',
        employer_id: therapist.id
      })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error('Erro ao atualizar perfil da secretária:', profileError);
      return NextResponse.json({ 
        error: 'Usuário criado, mas erro ao configurar perfil: ' + profileError.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Secretária cadastrada e vinculada com sucesso!',
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        full_name
      }
    });

  } catch (error: any) {
    console.error('Erro no convite de equipe:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
