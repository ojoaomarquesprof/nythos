const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ubgjaiqimaklvvzqtqwu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZ2phaXFpbWFrbHZ2enF0cXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg2NTk2MSwiZXhwIjoyMDkyNDQxOTYxfQ.I3DrbJ7v-nilKJhLAZIjZzhm4a0pSOVmHzLT2k-2DvI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function autoConfirm() {
  console.log("Buscando usuários...");
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error("Erro ao buscar usuários:", listError);
    return;
  }

  for (const user of usersData.users) {
    if (!user.email_confirmed_at) {
      console.log(`Confirmando email para: ${user.email}`);
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        email_confirm: true
      });
      if (error) {
        console.error(`Erro ao confirmar ${user.email}:`, error.message);
      } else {
        console.log(`✅ Email ${user.email} confirmado com sucesso!`);
      }
    }
  }
  console.log("Processo finalizado!");
}

autoConfirm();
