import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdmin } from '@/lib/auth/admin-authorization';
import { logSafeError, safeClientError } from '@/lib/errors/safe-error';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdmin(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // service_role is required here because platform admins list all tenant profiles/subscriptions.
    const adminClient = createAdminClient();

    // Fetch all profiles
    const { data: profiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (profilesError) {
      throw profilesError;
    }

    // Fetch all SaaS account subscriptions. Provider identifiers stay out of
    // the payload returned to the admin UI.
    const { data: subscriptions, error: subsError } = await adminClient
      .from('account_subscriptions')
      .select('id, owner_user_id, plan_id, status, trial_ends_at, current_period_ends_at, cancel_at_period_end, created_at, updated_at');

    if (subsError) {
      throw subsError;
    }

    const profilesData = profiles;
    const subsData = subscriptions;

    // Merge profiles with their account subscriptions.
    const usersWithSubs = profilesData.map(p => {
      const sub = subsData.find(s => s.owner_user_id === p.id);
      return {
        ...p,
        subscription: sub ? {
          ...sub,
          user_id: sub.owner_user_id,
          current_period_end: sub.current_period_ends_at ?? sub.trial_ends_at,
        } : null
      };
    });

    return NextResponse.json(usersWithSubs);
  } catch (error: unknown) {
    logSafeError('Admin users API error', error);
    return NextResponse.json({ error: safeClientError('Não foi possível concluir a operação.') }, { status: 500 });
  }
}

