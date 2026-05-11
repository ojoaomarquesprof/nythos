import type { User } from "@supabase/supabase-js";

export function isPlatformAdmin(user: User | null): boolean {
  return user?.app_metadata?.role === "admin";
}
