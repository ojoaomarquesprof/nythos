/**
 * scripts/test-insert.js
 * Tests inserting a sample patient record into the database.
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Usage: node scripts/test-insert.js
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

async function run() {
  const supabase = await createSupabaseAdminClient();

  console.log("Fetching a user...");
  const { data: usersData, error: authError } = await supabase.auth.admin.listUsers();

  if (authError || !usersData || usersData.users.length === 0) {
    console.error("No users found or auth error:", authError);
    return;
  }

  const user = usersData.users[0];
  console.log("Using user ID:", user.id);

  console.log("Testing patient insert...");
  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .insert({
      user_id: user.id,
      full_name: "Paciente Teste Script",
      email: "teste@script.com",
      status: "active",
    })
    .select()
    .single();

  if (patientError) {
    console.error("Error inserting patient:", patientError.message, patientError.details, patientError.hint);
  } else {
    console.log("Patient inserted successfully:", patient.id);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
