/**
 * scripts/confirm-users.js
 * Confirm all unverified users in Supabase Auth.
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Usage: node scripts/confirm-users.js
 */

async function loadEnvLocal() {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const envPath = path.join(__dirname, "..", ".env.local");

  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, "utf8")
      .split("\n")
      .forEach((line) => {
        const [key, ...rest] = line.split("=");
        if (key && !key.startsWith("#") && rest.length) {
          process.env[key.trim()] = rest.join("=").trim();
        }
      });
  }
}

async function createSupabaseAdminClient() {
  await loadEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      "Missing required environment variables.\n" +
      "   Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local"
    );
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function autoConfirm() {
  const supabase = await createSupabaseAdminClient();

  console.log("Buscando usuarios...");
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error("Erro ao buscar usuarios:", listError);
    return;
  }

  for (const user of usersData.users) {
    if (!user.email_confirmed_at) {
      console.log(`Confirmando email para: ${user.email}`);
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });
      if (error) {
        console.error(`Erro ao confirmar ${user.email}:`, error.message);
      } else {
        console.log(`Email ${user.email} confirmado com sucesso!`);
      }
    }
  }
  console.log("Processo finalizado!");
}

autoConfirm().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
