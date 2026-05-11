import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { logSafeError } from '@/lib/errors/safe-error';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      if (!UUID_RE.test(userId ?? '')) {
        return NextResponse.json({ error: 'Invalid external reference' }, { status: 400 });
      }

      // service_role is required for trusted Asaas server-to-server subscription updates.
      const { error } = await supabaseAdmin
        .from('subscriptions')
        .upsert({
          user_id: userId,
          status: 'active',
          plan_id: payment.subscription || null,
          current_period_start: new Date().toISOString(),
          current_period_end: new Date(
            new Date().getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;
    }

    if (event === 'PAYMENT_OVERDUE') {
      if (!UUID_RE.test(payment.externalReference ?? '')) {
        return NextResponse.json({ error: 'Invalid external reference' }, { status: 400 });
      }

      // service_role is required for trusted Asaas server-to-server subscription updates.
      await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'past_due' })
        .eq('user_id', payment.externalReference);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logSafeError('Erro no Webhook', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
