import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isValidUuid } from "@/lib/validation/input";
import { logSafeError } from "@/lib/errors/safe-error";

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const secretaryIdRaw = searchParams.get("id");
    const secretaryId = String(secretaryIdRaw ?? "").trim();

    if (!isValidUuid(secretaryId)) {
      return NextResponse.json({ error: "ID da secretaria invalido" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user: actor },
    } = await supabase.auth.getUser();

    if (!actor) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
    }

    const { data: actorProfile, error: actorProfileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", actor.id)
      .maybeSingle();

    if (
      actorProfileError ||
      !actorProfile ||
      !["therapist", "admin"].includes(actorProfile.role ?? "")
    ) {
      return NextResponse.json({ error: "Sem permissao para remover membro da equipe" }, { status: 403 });
    }

    const { data: secretaryProfile, error: secretaryProfileError } = await supabase
      .from("profiles")
      .select("role, employer_id")
      .eq("id", secretaryId)
      .maybeSingle();

    if (secretaryProfileError || !secretaryProfile) {
      return NextResponse.json({ error: "Membro da equipe nao encontrado." }, { status: 404 });
    }

    if (
      secretaryProfile.role !== "secretary" ||
      secretaryProfile.employer_id !== actor.id
    ) {
      return NextResponse.json(
        { error: "Voce nao tem permissao para remover este membro da equipe" },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(secretaryId);

    if (deleteError) {
      logSafeError("[api/team/remove] Erro ao remover usuario no Auth", deleteError);
      return NextResponse.json({ error: "Nao foi possivel remover o acesso." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Acesso removido com sucesso!",
    });
  } catch (error: any) {
    logSafeError("[api/team/remove] Erro interno", error);
    return NextResponse.json({ error: "Erro interno ao remover membro da equipe." }, { status: 500 });
  }
}
