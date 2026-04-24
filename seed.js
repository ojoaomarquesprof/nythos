const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://ubgjaiqimaklvvzqtqwu.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InViZ2phaXFpbWFrbHZ2enF0cXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njg2NTk2MSwiZXhwIjoyMDkyNDQxOTYxfQ.I3DrbJ7v-nilKJhLAZIjZzhm4a0pSOVmHzLT2k-2DvI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seed() {
  console.log("Fetching user...");
  const { data: usersData } = await supabase.auth.admin.listUsers();
  if (!usersData || usersData.users.length === 0) return console.log("No users.");
  
  const user = usersData.users[0];
  const userId = user.id;

  console.log("Seeding patients...");
  const patientsToInsert = [
    { user_id: userId, full_name: 'Ana Carolina Silva', email: 'ana@exemplo.com', phone: '11999991111', status: 'active', session_price: 150 },
    { user_id: userId, full_name: 'Bruno Mendes', email: 'bruno@exemplo.com', phone: '11999992222', status: 'active', session_price: 200 },
    { user_id: userId, full_name: 'Marina Costa', email: 'marina@exemplo.com', phone: '11999993333', status: 'active', session_price: 180 },
    { user_id: userId, full_name: 'Carlos Santos', email: 'carlos@exemplo.com', phone: '11999994444', status: 'inactive', session_price: 150 },
  ];

  const { data: patients, error: pErr } = await supabase.from('patients').insert(patientsToInsert).select();
  if (pErr) return console.error("Error inserting patients", pErr);

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
      session_type: 'individual',
      status: 'completed',
      location: 'office'
    },
    {
      user_id: userId,
      patient_id: patients[1].id,
      scheduled_at: today.toISOString().replace(/T.*/, 'T14:00:00.000Z'),
      duration_minutes: 50,
      session_type: 'online',
      status: 'scheduled',
      location: 'google_meet'
    },
    {
      user_id: userId,
      patient_id: patients[2].id,
      scheduled_at: tomorrow.toISOString().replace(/T.*/, 'T10:00:00.000Z'),
      duration_minutes: 50,
      session_type: 'individual',
      status: 'scheduled',
      location: 'office'
    }
  ];

  const { error: sErr } = await supabase.from('sessions').insert(sessionsToInsert);
  if (sErr) return console.error("Error inserting sessions", sErr);

  console.log("Seeding cash flow...");
  const lastMonth = new Date(today);
  lastMonth.setMonth(lastMonth.getMonth() - 1);

  const cashFlowToInsert = [
    {
      user_id: userId,
      type: 'income',
      amount: 150,
      description: 'Sessão Ana Carolina',
      category: 'session',
      status: 'confirmed',
      created_at: yesterday.toISOString(),
      paid_at: yesterday.toISOString()
    },
    {
      user_id: userId,
      type: 'income',
      amount: 200,
      description: 'Sessão Bruno (Adiantada)',
      category: 'session',
      status: 'pending',
      created_at: today.toISOString()
    },
    {
      user_id: userId,
      type: 'expense',
      amount: 1200,
      description: 'Aluguel Consultório',
      category: 'rent',
      status: 'confirmed',
      created_at: lastMonth.toISOString(),
      paid_at: lastMonth.toISOString()
    },
    {
      user_id: userId,
      type: 'income',
      amount: 3500,
      description: 'Pacotes Fechados Mês Passado',
      category: 'session',
      status: 'confirmed',
      created_at: lastMonth.toISOString(),
      paid_at: lastMonth.toISOString()
    }
  ];

  const { error: cErr } = await supabase.from('cash_flow').insert(cashFlowToInsert);
  if (cErr) return console.error("Error inserting cash flow", cErr);

  console.log("✅ Seed complete! Dashboard should now have real data.");
}

seed();
