import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import {
  PATIENT_DOCUMENT_BUCKET,
} from "@/lib/patient-documents/file-rules";
import {
  sanitizePatientDocumentFilename,
  validateUploadedPatientDocument,
} from "@/lib/patient-documents/validation";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_CATEGORIES = new Set([
  "consent",
  "report",
  "assessment",
  "certificate",
  "referral",
  "school_document",
  "receipt",
  "image",
  "other",
]);

type AdminClient = ReturnType<typeof createAdminClient>;

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

async function validateFile(file: File) {
  return validateUploadedPatientDocument(file);
}

async function getDocuments(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string) {
  const { data, error } = await supabase.rpc("get_patient_documents_decrypted", {
    p_patient_id: patientId,
  });
  if (error) throw error;
  return data || [];
}

async function getWritablePatient(admin: AdminClient, patientId: string, actorId: string) {
  const [{ data: patient, error: patientError }, { data: actorProfile, error: profileError }] =
    await Promise.all([
      admin.from("patients").select("id,user_id").eq("id", patientId).maybeSingle(),
      admin.from("profiles").select("id,role,employer_id").eq("id", actorId).maybeSingle(),
    ]);

  if (patientError) {
    throw patientError;
  }
  if (profileError) {
    throw profileError;
  }
  if (!patient) {
    return { patient: null, authorized: false };
  }

  const isOwner = patient.user_id === actorId;
  const isAuthorizedClinicalTeamMember =
    actorProfile?.employer_id === patient.user_id && actorProfile?.role !== "secretary";

  return {
    patient,
    authorized: isOwner || isAuthorizedClinicalTeamMember,
  };
}

export async function POST(request: Request) {
  let createdDocumentId: string | null = null;
  let uploadedPath: string | null = null;
  let admin: AdminClient | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || user.user_metadata?.user_type === "patient") {
      return NextResponse.json({ error: "Sessao invalida." }, { status: 401 });
    }

    const formData = await request.formData();
    const patientId = asString(formData.get("patientId"));
    const category = asString(formData.get("category")) || "other";
    const title = asString(formData.get("title"));
    const description = asString(formData.get("description"));
    const documentDate = asString(formData.get("documentDate"));
    const fileEntry = formData.get("file");
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;

    if (!UUID_RE.test(patientId)) {
      return NextResponse.json({ error: "Paciente invalido." }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "Informe um titulo para o documento." }, { status: 400 });
    }
    if (!ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json({ error: "Categoria de documento invalida." }, { status: 400 });
    }
    if (documentDate && !/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) {
      return NextResponse.json({ error: "Data do documento invalida." }, { status: 400 });
    }

    if (file) {
      const fileError = await validateFile(file);
      if (fileError) {
        return NextResponse.json({ error: fileError }, { status: 400 });
      }
    }

    admin = createAdminClient();
    const { patient, authorized } = await getWritablePatient(admin, patientId, user.id);

    if (!patient) {
      return NextResponse.json({ error: "Paciente nao encontrado ou sem permissao." }, { status: 404 });
    }
    if (!authorized) {
      return NextResponse.json({ error: "Sem permissao para registrar documento clinico." }, { status: 403 });
    }

    const { data: inserted, error: insertError } = await admin
      .from("patient_documents")
      .insert({
        patient_id: patient.id,
        therapist_id: patient.user_id,
        category,
        title,
        description_encrypted: description || null,
        document_date: documentDate || null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      throw insertError || new Error("Patient document insert returned no row.");
    }

    createdDocumentId = inserted.id;

    if (file) {
      const path = `patients/${patient.id}/${inserted.id}/${sanitizePatientDocumentFilename(file.name)}`;
      const { error: uploadError } = await admin.storage
        .from(PATIENT_DOCUMENT_BUCKET)
        .upload(path, await file.arrayBuffer(), {
          contentType: file.type,
          cacheControl: "private, max-age=0",
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadedPath = path;

      const { error: updateError } = await admin
        .from("patient_documents")
        .update({
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        })
        .eq("id", inserted.id);

      if (updateError) {
        throw updateError;
      }
    }

    return NextResponse.json({
      documents: await getDocuments(supabase, patient.id),
    });
  } catch (error) {
    logSafeError("[patient-documents:create] Failed to create patient document", error, {
      createdDocumentId,
      uploaded: Boolean(uploadedPath),
    });

    try {
      const rollbackClient = admin || createAdminClient();
      if (uploadedPath) {
        await rollbackClient.storage.from(PATIENT_DOCUMENT_BUCKET).remove([uploadedPath]);
      }
      if (createdDocumentId) {
        await rollbackClient.from("patient_documents").delete().eq("id", createdDocumentId);
      }
    } catch (rollbackError) {
      logSafeError("[patient-documents:create] Rollback failed", rollbackError, {
        createdDocumentId,
        uploaded: Boolean(uploadedPath),
      });
    }

    return NextResponse.json(
      { error: safeClientError("Nao foi possivel anexar o documento com seguranca.") },
      { status: 500 }
    );
  }
}
