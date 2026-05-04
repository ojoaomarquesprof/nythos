import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    // Merge profiles with their subscriptions
    const usersWithSubs = profiles.map(p => {
      const sub = subscriptions.find(s => s.user_id === p.id);
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
