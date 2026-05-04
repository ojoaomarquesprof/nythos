import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
      
    const profile = data as { role: string } | null;

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    const { data: existingSub } = await adminClient
      .from('subscriptions')
      .select('id')
      .eq('user_id', id)
      .single();

    let result;
    if (existingSub) {
      result = await (adminClient as any)
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
      result = await (adminClient as any)
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
    console.error('Admin subscription API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
