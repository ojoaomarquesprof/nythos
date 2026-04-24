import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN;
    const authToken = req.headers.get('asaas-access-token');
    
    if (!webhookToken || authToken !== webhookToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const event = body.event;
    const payment = body.payment;

    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
      const userId = payment.externalReference;

      const { error } = await supabaseAdmin
        .from('subscriptions')
        .upsert({
          user_id: userId,
          status: 'active',
          gateway_subscription_id: payment.subscription || null,
          gateway_customer_id: payment.customer,
          current_period_end: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
    }

    if (event === 'PAYMENT_OVERDUE') {
        await supabaseAdmin
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('user_id', payment.externalReference);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Erro no Webhook:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
