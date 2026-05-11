import { redirect } from "next/navigation";
import { InteractivePatientDashboard } from "@/components/patient/interactive-dashboard";
import { getPatientAccessState } from "@/lib/auth/patient-access";
import { getPatientSessionDetails } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmotionDiary, Patient, PatientTask } from "@/types/database";

type PatientDashboardProfile = Pick<Patient, "id" | "full_name">;

export default async function PatientDashboardPage() {
  const session = await getPatientSessionDetails();
  if (!session) redirect("/patient/login");

  // service_role is scoped by the signed patient HMAC cookie; no Supabase auth session exists here.
  const admin = createAdminClient();

  const { data: patient, error: patientErr } = await admin
    .from("patients")
    .select("id, full_name, status, access_token_issued_at, access_token_expires_at, access_token_revoked_at")
    .eq("id", session.patientId)
    .single();

  if (patientErr || !patient) redirect("/patient/login");
  if (getPatientAccessState(patient, session.issuedAt) !== "active") {
    redirect("/patient/login");
  }

  const [{ data: tasksRaw }, { data: diaryRaw }] = await Promise.all([
    admin
      .from("patient_tasks")
      .select("id, patient_id, title, description, category, due_date, status, completed_at, created_at, updated_at")
      .eq("patient_id", session.patientId)
      .neq("status", "cancelled")
      .order("due_date", { ascending: true, nullsFirst: false }),
    admin
      .from("emotion_diary")
      .select("id, patient_id, emotion, intensity, notes, context, created_at")
      .eq("patient_id", session.patientId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const patientProfile: PatientDashboardProfile = {
    id: patient.id,
    full_name: patient.full_name,
  };

  return (
    <InteractivePatientDashboard
      patient={patientProfile}
      initialTasks={tasksRaw ?? []}
      initialDiary={diaryRaw ?? []}
    />
  );
}
