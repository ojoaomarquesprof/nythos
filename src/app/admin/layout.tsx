import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
    
  const profile = data as { role: string } | null;

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white py-4 px-6 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-teal-500 rounded-lg flex items-center justify-center font-black">
            N
          </div>
          <span className="font-bold tracking-tight">Nythos Super Admin</span>
        </div>
        <div className="text-xs font-bold text-slate-400 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
          Acesso Restrito
        </div>
      </header>
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}
