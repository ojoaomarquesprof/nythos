import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logSafeError, safeClientError } from "@/lib/errors/safe-error";
import type { Profile } from "@/types/database";

export const runtime = "nodejs";

type BrandImageField = "avatar_url" | "clinic_logo_url" | "signature_url";

const BRAND_BUCKET = "brand";
const BRAND_ASSET_MAX_SIZE_MB = 15;
const BRAND_ASSET_MAX_SIZE_BYTES = BRAND_ASSET_MAX_SIZE_MB * 1024 * 1024;
const ALLOWED_BRAND_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);
const ALLOWED_BRAND_FIELDS = new Set<BrandImageField>([
  "avatar_url",
  "clinic_logo_url",
  "signature_url",
]);
const ALLOWED_BRAND_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const MIME_EXTENSION_FALLBACK: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function isBrandImageField(value: string): value is BrandImageField {
  return ALLOWED_BRAND_FIELDS.has(value as BrandImageField);
}

function getSafeExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (ALLOWED_BRAND_IMAGE_EXTENSIONS.has(extension)) return extension;
  return MIME_EXTENSION_FALLBACK[file.type] || "png";
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: safeClientError(message) }, { status });
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonError("Sessao invalida. Faca login novamente.", 401);
    }

    if (user.user_metadata?.user_type === "patient") {
      return jsonError("Sem permissao para enviar assets profissionais.", 403);
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return jsonError("Envio invalido.", 400);
    }

    const field = asString(formData.get("field"));
    if (!isBrandImageField(field)) {
      return jsonError("Campo de imagem invalido.", 400);
    }

    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File) || fileEntry.size <= 0) {
      return jsonError("Envie uma imagem para continuar.", 400);
    }

    if (!ALLOWED_BRAND_IMAGE_TYPES.has(fileEntry.type)) {
      return jsonError("Envie uma imagem JPG, PNG, GIF ou WebP.", 400);
    }

    if (fileEntry.size > BRAND_ASSET_MAX_SIZE_BYTES) {
      return jsonError(`A imagem deve ter no maximo ${BRAND_ASSET_MAX_SIZE_MB}MB.`, 400);
    }

    const safeExt = getSafeExtension(fileEntry);
    const path = `${user.id}/${field}-${Date.now()}.${safeExt}`;
    uploadedPath = path;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(BRAND_BUCKET)
      .upload(path, await fileEntry.arrayBuffer(), {
        cacheControl: "public, max-age=31536000",
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      logSafeError("[brand-assets:upload] Storage upload failed", uploadError, {
        field,
        bucket: BRAND_BUCKET,
        path,
        fileType: fileEntry.type,
        fileSize: fileEntry.size,
      });
      return jsonError("Nao foi possivel enviar a imagem pelo servidor.", 500);
    }

    const { data: publicUrlData } = admin.storage.from(BRAND_BUCKET).getPublicUrl(path);
    const publicUrl = publicUrlData.publicUrl;

    if (!publicUrl) {
      logSafeError("[brand-assets:upload] Public URL was not returned", new Error("Missing publicUrl"), {
        field,
        bucket: BRAND_BUCKET,
        path,
      });
      await admin.storage.from(BRAND_BUCKET).remove([path]);
      uploadedPath = null;
      return jsonError("A imagem foi enviada, mas nao foi possivel gerar a URL publica.", 500);
    }

    const profileImageUpdate = {
      [field]: publicUrl,
    } as Partial<Pick<Profile, "avatar_url" | "clinic_logo_url" | "signature_url">>;

    const { error: updateError } = await admin
      .from("profiles")
      .update(profileImageUpdate)
      .eq("id", user.id)
      .select("id")
      .single();

    if (updateError) {
      logSafeError("[brand-assets:upload] Profile image URL update failed", updateError, {
        field,
        bucket: BRAND_BUCKET,
        path,
      });
      await admin.storage.from(BRAND_BUCKET).remove([path]);
      uploadedPath = null;
      return jsonError("A imagem foi enviada, mas nao foi possivel salvar a URL no perfil.", 500);
    }

    return NextResponse.json({
      success: true,
      field,
      publicUrl,
    });
  } catch (error) {
    logSafeError("[brand-assets:upload] Unexpected upload failure", error, {
      uploaded: Boolean(uploadedPath),
    });
    return jsonError("Nao foi possivel enviar a imagem com seguranca.", 500);
  }
}
