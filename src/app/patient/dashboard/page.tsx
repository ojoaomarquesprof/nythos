import { redirect } from "next/navigation";
import { getPatientSession } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Patient, PatientTask, EmotionDiary } from "@/types/database";
import { InteractivePatientDashboard } from "@/components/patient/interactive-dashboard";

export default async function PatientDashboardPage() {
  // 1. Lê o patient_id do cookie HMAC — sem Supabase Auth
  const patientId = await getPatientSession();
  if (!patientId) redirect("/patient/login");

  // 2. Usa o cliente admin (service role) com filtro estrito de patient_id
  const admin = createAdminClient() as any;

  const { data: patient, error: patientErr } = await admin
    .from("patients")
    .select("*")
    .eq("id", patientId)        // ← filtro obrigatório do cookie
    .single() as { data: Patient | null; error: any };

  if (patientErr || !patient) redirect("/patient/login");

  const [{ data: tasksRaw }, { data: diaryRaw }] = await Promise.all([
    admin
      .from("patient_tasks")
      .select("*")
      .eq("patient_id", patientId)   // ← filtro obrigatório
      .neq("status", "cancelled")
      .order("due_date", { ascending: true, nullsFirst: false }) as Promise<{ data: PatientTask[] | null }>,
    admin
      .from("emotion_diary")
      .select("*")
      .eq("patient_id", patientId)   // ← filtro obrigatório
      .order("created_at", { ascending: false })
      .limit(5) as Promise<{ data: EmotionDiary[] | null }>,
  ]);

  return (
    <InteractivePatientDashboard
      patient={patient}
      initialTasks={tasksRaw ?? []}
      initialDiary={diaryRaw ?? []}
    />
  );
}
