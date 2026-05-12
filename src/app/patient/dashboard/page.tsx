import { redirect } from "next/navigation";
import { InteractivePatientDashboard } from "@/components/patient/interactive-dashboard";
import { getPatientAccessState } from "@/lib/auth/patient-access";
import { getPatientSessionDetails } from "@/lib/auth/patient-session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Patient, PatientMoodCheckin } from "@/types/database";

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

  const [{ data: tasksRaw }, { data: diaryRaw }, { data: moodCheckinsRaw }] = await Promise.all([
    admin.rpc("get_patient_portal_tasks_decrypted", { p_patient_id: session.patientId }),
    admin.rpc("get_patient_portal_emotion_diary_decrypted", { p_patient_id: session.patientId }),
    admin.rpc("get_patient_portal_mood_checkins_decrypted", { p_patient_id: session.patientId }),
  ]);

  const patientProfile: PatientDashboardProfile = {
    id: patient.id,
    full_name: patient.full_name,
  };

  return (
    <InteractivePatientDashboard
      patient={patientProfile}
      initialTasks={Array.isArray(tasksRaw) ? tasksRaw as any : []}
      initialDiary={Array.isArray(diaryRaw) ? diaryRaw as any : []}
      initialMoodCheckins={Array.isArray(moodCheckinsRaw) ? moodCheckinsRaw as PatientMoodCheckin[] : []}
    />
  );
}
