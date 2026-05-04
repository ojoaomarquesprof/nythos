import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Create a Supabase client with the service role key.
// This client bypasses RLS policies. It should ONLY be used in secure 
// server-side contexts like API routes or Server Actions where authorization 
// has already been manually verified.
export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase URL or Service Role Key in environment variables.');
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
