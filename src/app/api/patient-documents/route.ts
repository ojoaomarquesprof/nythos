import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import {
  PATIENT_DOCUMENT_ALLOWED_EXTENSIONS,
  PATIENT_DOCUMENT_ALLOWED_MIME_TYPES,
  PATIENT_DOCUMENT_BUCKET,
  PATIENT_DOCUMENT_MAX_SIZE_BYTES,
} from "@/lib/patient-documents/file-rules";

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

function safeFilename(filename: string) {
  const withoutPath = filename.split(/[/\\]/).pop() || "documento";
  const dotIndex = withoutPath.lastIndexOf(".");
  const rawBase = dotIndex > 0 ? withoutPath.slice(0, dotIndex) : withoutPath;
  const rawExt = dotIndex > 0 ? withoutPath.slice(dotIndex).toLowerCase() : "";
  const base = rawBase
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "documento";
  const ext = rawExt.replace(/[^a-z0-9.]/g, "").slice(0, 12);
  return `${base}${ext}`;
}

function extensionFor(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function hasMagicBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "application/pdf") {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }
  if (mimeType === "image/png") {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    return (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    );
  }
  if (mimeType === "application/msword") {
    return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
  }
  return false;
}

async function validateFile(file: File) {
  if (file.size <= 0) {
    return "O arquivo selecionado esta vazio.";
  }

  if (file.size > PATIENT_DOCUMENT_MAX_SIZE_BYTES) {
    return "O arquivo excede o limite de 20 MB.";
  }

  const mimeType = file.type;
  if (!PATIENT_DOCUMENT_ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return "Tipo de arquivo nao permitido. Envie PDF, imagem PNG/JPG/WebP, DOC ou DOCX.";
  }

  const ext = extensionFor(file.name);
  const allowedExtensions = PATIENT_DOCUMENT_ALLOWED_EXTENSIONS[mimeType] || [];
  if (!allowedExtensions.includes(ext)) {
    return "A extensao do arquivo nao corresponde ao tipo enviado.";
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!hasMagicBytes(header, mimeType)) {
    return "O conteudo do arquivo nao corresponde ao tipo informado.";
  }

  return null;
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
      const path = `patients/${patient.id}/${inserted.id}/${safeFilename(file.name)}`;
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
