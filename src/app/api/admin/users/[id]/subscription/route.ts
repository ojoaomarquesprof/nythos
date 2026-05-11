import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdmin } from '@/lib/auth/admin-authorization';
import { logSafeError, safeClientError } from '@/lib/errors/safe-error';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { days } = body; 
    const status = body.status as "active" | "trialing" | "past_due" | "canceled" | "unpaid";

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdmin(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }

    if (!["active", "trialing", "past_due", "canceled", "unpaid"].includes(status)) {
      return NextResponse.json({ error: 'Invalid subscription status' }, { status: 400 });
    }

    // service_role is required because subscriptions are writable only by backend/admin flows.
    const adminClient = createAdminClient();

    // Calculate dates if providing trial or active
    let current_period_end = new Date();
    if (days) {
      current_period_end.setDate(current_period_end.getDate() + Number(days));
    } else {
      // Default 30 days if 'active', 7 days if 'trialing'
      if (status === 'active') current_period_end.setDate(current_period_end.getDate() + 30);
      else if (status === 'trialing') current_period_end.setDate(current_period_end.getDate() + 7);
    }

    const { data: subData } = await adminClient
      .from('subscriptions')
      .select('id')
      .eq('user_id', id)
      .single();

    const existingSub = subData as { id: string } | null;

    let result;
    if (existingSub) {
      result = await adminClient
        .from('subscriptions')
        .update({
          status,
          current_period_start: new Date().toISOString(),
          current_period_end: current_period_end.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingSub.id)
        .select()
        .single();
    } else {
      result = await adminClient
        .from('subscriptions')
        .insert({
          user_id: id,
          status,
          plan_id: 'manual_admin_grant',
          current_period_start: new Date().toISOString(),
          current_period_end: current_period_end.toISOString(),
        })
        .select()
        .single();
    }

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({ success: true, subscription: result.data });
  } catch (error: any) {
    logSafeError('Admin subscription API error', error);
    return NextResponse.json({ error: safeClientError('Não foi possível concluir a operação.') }, { status: 500 });
  }
}
