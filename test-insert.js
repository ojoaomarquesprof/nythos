const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ubgjaiqimaklvvzqtqwu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZ2phaXFpbWFrbHZ2enF0cXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg2NTk2MSwiZXhwIjoyMDkyNDQxOTYxfQ.I3DrbJ7v-nilKJhLAZIjZzhm4a0pSOVmHzLT2k-2DvI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  console.log("Fetching a user...");
  // Get any user to assign records
  const { data: usersData, error: authError } = await supabase.auth.admin.listUsers();
  
  if (authError || !usersData || usersData.users.length === 0) {
    console.error("No users found or auth error:", authError);
    return;
  }
  
  const user = usersData.users[0];
  console.log("Using user ID:", user.id);

  console.log("Testing patient insert...");
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert({
      user_id: user.id,
      full_name: 'Paciente Teste Script',
      email: 'teste@script.com',
      status: 'active'
    })
    .select()
    .single();

  if (patientError) {
    console.error("❌ Error inserting patient:", patientError.message, patientError.details, patientError.hint);
  } else {
    console.log("✅ Patient inserted successfully:", patient.id);
  }
}

run();
