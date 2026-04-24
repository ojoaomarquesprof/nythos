import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

let browserClient: any | undefined;

export function createClient() {
  if (browserClient) return browserClient;
  
  browserClient = createBrowserClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  
  return browserClient;
}
