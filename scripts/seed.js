/**
 * scripts/seed.js
 * Seeds the database with sample patients, sessions, and cash flow records.
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Usage: npm run seed
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

async function seed() {
  const supabase = await createSupabaseAdminClient();

  console.log("Fetching user...");
  const { data: usersData } = await supabase.auth.admin.listUsers();
  if (!usersData || usersData.users.length === 0) return console.log("No users.");

  const user = usersData.users[0];
  const userId = user.id;

  console.log("Seeding patients...");
  const patientsToInsert = [
    { user_id: userId, full_name: "Ana Carolina Silva", email: "ana@exemplo.com", phone: "11999991111", status: "active", session_price: 150 },
    { user_id: userId, full_name: "Bruno Mendes", email: "bruno@exemplo.com", phone: "11999992222", status: "active", session_price: 200 },
    { user_id: userId, full_name: "Marina Costa", email: "marina@exemplo.com", phone: "11999993333", status: "active", session_price: 180 },
    { user_id: userId, full_name: "Carlos Santos", email: "carlos@exemplo.com", phone: "11999994444", status: "inactive", session_price: 150 },
  ];

  const { data: patients, error: patientsError } = await supabase.from("patients").insert(patientsToInsert).select();
  if (patientsError) return console.error("Error inserting patients", patientsError);

  console.log("Seeding sessions...");
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const sessionsToInsert = [
    {
      user_id: userId,
      patient_id: patients[0].id,
      scheduled_at: yesterday.toISOString(),
      duration_minutes: 50,
      session_type: "individual",
      status: "completed",
      location: "office",
    },
    {
      user_id: userId,
      patient_id: patients[1].id,
      scheduled_at: today.toISOString().replace(/T.*/, "T14:00:00.000Z"),
      duration_minutes: 50,
      session_type: "online",
      status: "scheduled",
      location: "google_meet",
    },
    {
      user_id: userId,
      patient_id: patients[2].id,
      scheduled_at: tomorrow.toISOString().replace(/T.*/, "T10:00:00.000Z"),
      duration_minutes: 50,
      session_type: "individual",
      status: "scheduled",
      location: "office",
    },
  ];

  const { error: sessionsError } = await supabase.from("sessions").insert(sessionsToInsert);
  if (sessionsError) return console.error("Error inserting sessions", sessionsError);

  console.log("Seeding cash flow...");
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const cashFlowToInsert = [
    {
      user_id: userId,
      type: "income",
      amount: 150,
      description: "Sessao Ana Carolina",
      category: "session",
      status: "confirmed",
      created_at: yesterday.toISOString(),
      paid_at: yesterday.toISOString(),
    },
    {
      user_id: userId,
      type: "income",
      amount: 200,
      description: "Sessao Bruno (Adiantada)",
      category: "session",
      status: "pending",
      created_at: today.toISOString(),
    },
    {
      user_id: userId,
      type: "expense",
      amount: 1200,
      description: "Aluguel Consultorio",
      category: "rent",
      status: "confirmed",
      created_at: lastMonth.toISOString(),
      paid_at: lastMonth.toISOString(),
    },
    {
      user_id: userId,
      type: "income",
      amount: 3500,
      description: "Pacotes Fechados Mes Passado",
      category: "session",
      status: "confirmed",
      created_at: lastMonth.toISOString(),
      paid_at: lastMonth.toISOString(),
    },
  ];

  const { error: cashFlowError } = await supabase.from("cash_flow").insert(cashFlowToInsert);
  if (cashFlowError) return console.error("Error inserting cash flow", cashFlowError);

  console.log("Seed complete! Dashboard should now have real data.");
}

seed().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
