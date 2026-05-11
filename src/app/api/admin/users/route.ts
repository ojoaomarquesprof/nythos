import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPlatformAdmin } from '@/lib/auth/admin-authorization';

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

    // Fetch all subscriptions
    const { data: subscriptions, error: subsError } = await adminClient
      .from('subscriptions')
      .select('*');

    if (subsError) {
      throw subsError;
    }

    const profilesData = profiles;
    const subsData = subscriptions;

    // Merge profiles with their subscriptions
    const usersWithSubs = profilesData.map(p => {
      const sub = subsData.find(s => s.user_id === p.id);
      return {
        ...p,
        subscription: sub || null
      };
    });

    return NextResponse.json(usersWithSubs);
  } catch (error: any) {
    console.error('Admin users API error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

