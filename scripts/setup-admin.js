/**
 * scripts/setup-admin.js
 * Creates or updates the superadmin user in Supabase Auth and sets role='admin' in profiles.
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
 * Usage: npm run setup:admin
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
      "Missing Supabase credentials.\n" +
      "   Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local"
    );
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function setupAdmin() {
  const supabase = await createSupabaseAdminClient();
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.error(
      "Missing admin credentials.\n" +
      "   Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.local before running this script."
    );
    process.exit(1);
  }

  console.log(`Setting up superadmin: ${adminEmail}`);

  const { data: users, error: searchError } = await supabase.auth.admin.listUsers();

  if (searchError) {
    console.error("Error listing users:", searchError);
    return;
  }

  let user = users.users.find((item) => item.email === adminEmail);

  if (!user) {
    console.log("Creating new admin user...");
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      app_metadata: {
        role: "admin",
      },
      user_metadata: {
        full_name: "Super Admin",
      },
    });

    if (createError) {
      console.error("Failed to create admin:", createError);
      return;
    }
    user = createdUser.user;
    console.log("Admin user created.");
  } else {
    console.log("Admin user already exists. Updating password to ensure access...");
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: adminPassword,
      app_metadata: {
        ...(user.app_metadata || {}),
        role: "admin",
      },
    });
    if (updateError) {
      console.error("Failed to update password:", updateError);
    }
  }

  console.log(`Updating profile role to 'admin' for user ID: ${user.id}`);
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", user.id);

  if (profileError) {
    console.error("Failed to update profile role:", profileError);
    console.log("Trying to insert profile...");
    const { error: insertError } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: "Super Admin",
      email: adminEmail,
      role: "admin",
    });
    if (insertError) {
      console.error("Failed to insert profile:", insertError);
    } else {
      console.log("Profile created successfully.");
    }
  } else {
    console.log("Profile role updated successfully.");
  }

  console.log("Super admin setup complete!");
}

setupAdmin().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
