import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "@/lib/audit/audit-events";
import { recordAuditEvent } from "@/lib/audit/server";
import { PATIENT_DOCUMENT_BUCKET } from "@/lib/patient-documents/file-rules";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AdminClient = ReturnType<typeof createAdminClient>;

async function getDocuments(supabase: Awaited<ReturnType<typeof createClient>>, patientId: string) {
  const { data, error } = await supabase.rpc("get_patient_documents_decrypted", {
    p_patient_id: patientId,
  });
  if (error) throw error;
  return data || [];
}

async function getWritableDocument(admin: AdminClient, documentId: string, actorId: string) {
  const { data: document, error: documentError } = await admin
    .from("patient_documents")
    .select("id,patient_id,storage_path")
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
      admin.from("profiles").select("id,role,employer_id").eq("id", actorId).maybeSingle(),
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

  const isOwner = patient.user_id === actorId;
  const isAuthorizedClinicalTeamMember =
    actorProfile?.employer_id === patient.user_id && actorProfile?.role !== "secretary";

  return {
    document,
    authorized: isOwner || isAuthorizedClinicalTeamMember,
  };
}

export async function DELETE(
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
    const { document, authorized } = await getWritableDocument(admin, id, user.id);

    if (!document) {
      return NextResponse.json({ error: "Documento nao encontrado." }, { status: 404 });
    }
    if (!authorized) {
      return NextResponse.json({ error: "Sem permissao para remover este documento." }, { status: 403 });
    }

    const { error: deleteError } = await admin.from("patient_documents").delete().eq("id", id);

    if (deleteError) {
      throw deleteError;
    }

    let warning: string | null = null;

    if (document.storage_path) {
      const { error: storageError } = await admin.storage
        .from(PATIENT_DOCUMENT_BUCKET)
        .remove([document.storage_path]);

      if (storageError) {
        warning = "O registro foi removido, mas nao foi possivel confirmar a remocao do arquivo privado.";
        logSafeError("[patient-documents:delete] Storage removal failed", storageError, {
          documentId: document.id,
          patientId: document.patient_id,
        });
      }
    }

    await recordAuditEvent({
      actorId: user.id,
      action: AUDIT_ACTIONS.DELETE_PATIENT_DOCUMENT,
      entityType: AUDIT_ENTITY_TYPES.PATIENT_DOCUMENT,
      entityId: document.id,
      patientId: document.patient_id,
      documentId: document.id,
      metadata: {
        had_file: Boolean(document.storage_path),
        storage_removal_warning: Boolean(warning),
      },
    });

    return NextResponse.json({
      documents: await getDocuments(supabase, document.patient_id),
      warning,
    });
  } catch (error) {
    logSafeError("[patient-documents:delete] Failed to delete patient document", error);
    return NextResponse.json(
      { error: safeClientError("Nao foi possivel remover o documento.") },
      { status: 500 }
    );
  }
}
