import { redirect } from "next/navigation";
import { InteractivePatientDashboard } from "@/components/patient/interactive-dashboard";
import { getPatientAccessState } from "@/lib/auth/patient-access";
import { getPatientSessionDetails } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmotionDiary, Patient, PatientTask } from "@/types/database";

export default async function PatientDashboardPage() {
  const session = await getPatientSessionDetails();
  if (!session) redirect("/patient/login");

  // service_role is scoped by the signed patient HMAC cookie; no Supabase auth session exists here.
  const admin = createAdminClient() as any;

  const { data: patient, error: patientErr } = await admin
    .from("patients")
    .select("*")
    .eq("id", session.patientId)
    .single() as { data: Patient | null; error: any };

  if (patientErr || !patient) redirect("/patient/login");
  if (getPatientAccessState(patient, session.issuedAt) !== "active") {
    redirect("/patient/login");
  }

  const [{ data: tasksRaw }, { data: diaryRaw }] = await Promise.all([
    admin
      .from("patient_tasks")
      .select("*")
      .eq("patient_id", session.patientId)
      .neq("status", "cancelled")
      .order("due_date", { ascending: true, nullsFirst: false }) as Promise<{
        data: PatientTask[] | null;
      }>,
    admin
      .from("emotion_diary")
      .select("*")
      .eq("patient_id", session.patientId)
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
