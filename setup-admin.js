const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.join(__dirname, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

let url = '';
let key = '';

envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    url = line.split('=')[1].trim();
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    key = line.split('=')[1].trim();
  }
});

if (!url || !key) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key);

async function setupAdmin() {
  const email = 'agencia.sonusprime@gmail.com';
  const password = 'Sonusprime2026@';

  console.log(`Setting up superadmin: ${email}`);

  // Check if user exists
  const { data: users, error: searchError } = await supabase.auth.admin.listUsers();
  
  if (searchError) {
    console.error("Error listing users:", searchError);
    return;
  }

  let user = users.users.find(u => u.email === email);

  if (!user) {
    console.log("Creating new admin user...");
    const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Super Admin',
      }
    });

    if (createError) {
      console.error("Failed to create admin:", createError);
      return;
    }
    user = createdUser.user;
    console.log("Admin user created.");
  } else {
    console.log("Admin user already exists in auth. Updating password to ensure access...");
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password
    });
    if (updateError) {
      console.error("Failed to update password:", updateError);
    }
  }

  // Ensure profile role is admin
  console.log(`Updating profile role to 'admin' for user ID: ${user.id}`);
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', user.id);

  if (profileError) {
    console.error("Failed to update profile role:", profileError);
    // Profile might not exist yet if triggers are delayed
    console.log("Trying to insert profile...");
    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      full_name: 'Super Admin',
      email: email,
      role: 'admin'
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

setupAdmin();
