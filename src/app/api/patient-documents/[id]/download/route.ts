import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/audit-events";
import { recordAuditEvent } from "@/lib/audit/server";
import {
  PATIENT_DOCUMENT_BUCKET,
  PATIENT_DOCUMENT_SIGNED_URL_TTL_SECONDS,
} from "@/lib/patient-documents/file-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createAdminClient>;

async function getReadableDocument(admin: AdminClient, documentId: string, actorId: string) {
  const { data: document, error: documentError } = await admin
    .from("patient_documents")
    .select("id,patient_id,file_name,storage_path")
    .eq("id", documentId)
    .maybeSingle();

  if (documentError) {
    throw documentError;
  }
  if (!document) {
    return { document: null, authorized: false };
  }

  const [{ data: patient, error: patientError }, { data: actorProfile, error: profileError }] =
    await Promise.all([
      admin.from("patients").select("id,user_id").eq("id", document.patient_id).maybeSingle(),
      admin.from("profiles").select("id,employer_id").eq("id", actorId).maybeSingle(),
    ]);

  if (patientError) {
    throw patientError;
  }
  if (profileError) {
    throw profileError;
  }
  if (!patient) {
    return { document: null, authorized: false };
  }

  const authorized = patient.user_id === actorId || actorProfile?.employer_id === patient.user_id;
  return { document, authorized };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Documento invalido." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || user.user_metadata?.user_type === "patient") {
      return NextResponse.json({ error: "Sessao invalida." }, { status: 401 });
    }

    const admin = createAdminClient();
    const { document, authorized } = await getReadableDocument(admin, id, user.id);

    if (!document || !authorized) {
      return NextResponse.json({ error: "Documento nao encontrado." }, { status: 404 });
    }

    if (!document.storage_path) {
      return NextResponse.json({ error: "Este registro nao possui arquivo anexado." }, { status: 400 });
    }

    const { data, error } = await admin.storage
      .from(PATIENT_DOCUMENT_BUCKET)
      .createSignedUrl(document.storage_path, PATIENT_DOCUMENT_SIGNED_URL_TTL_SECONDS, {
        download: document.file_name || true,
      });

    if (error || !data?.signedUrl) {
      throw error || new Error("Signed URL was not returned.");
    }

    await recordAuditEvent({
      actorId: user.id,
      action: AUDIT_ACTIONS.DOWNLOAD_PATIENT_DOCUMENT,
      entityType: AUDIT_ENTITY_TYPES.PATIENT_DOCUMENT,
      entityId: document.id,
      patientId: document.patient_id,
      documentId: document.id,
      metadata: {
        has_file: true,
        expires_in_seconds: PATIENT_DOCUMENT_SIGNED_URL_TTL_SECONDS,
      },
    });

    return NextResponse.json({
      url: data.signedUrl,
      expiresIn: PATIENT_DOCUMENT_SIGNED_URL_TTL_SECONDS,
    });
  } catch (error) {
    logSafeError("[patient-documents:download] Failed to sign patient document URL", error);
    return NextResponse.json(
      { error: safeClientError("Nao foi possivel preparar o download seguro.") },
      { status: 500 }
    );
  }
}
