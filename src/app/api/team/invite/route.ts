import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { hasOnlyAllowedKeys, isPlainObject, isValidEmail } from "@/lib/validation/input";

const ALLOWED_INVITE_KEYS = ["email", "password", "full_name"] as const;

export async function POST(req: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    if (!isPlainObject(rawBody) || !hasOnlyAllowedKeys(rawBody, ALLOWED_INVITE_KEYS)) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }

    const email = String(rawBody.email ?? "").trim().toLowerCase();
    const password = String(rawBody.password ?? "");
    const fullName = String(rawBody.full_name ?? "").trim();

    if (!email || !password || !fullName) {
      return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 422 });
    }
    if (password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: "Senha inválida" }, { status: 422 });
    }
    if (fullName.length < 2 || fullName.length > 180) {
      return NextResponse.json({ error: "Nome inválido" }, { status: 422 });
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
      data: { user: therapist },
    } = await supabase.auth.getUser();

    if (!therapist) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
    }

    const { data: therapistProfile, error: therapistProfileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", therapist.id)
      .single();

    if (
      therapistProfileError ||
      !therapistProfile ||
      !["therapist", "admin"].includes(therapistProfile.role)
    ) {
      return NextResponse.json({ error: "Sem permissao para convidar membros" }, { status: 403 });
    }

    const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "secretary",
        employer_id: therapist.id,
      },
    });

    if (authError) {
      console.error("[api/team/invite] Erro ao criar usuario no Auth:", authError);
      return NextResponse.json({ error: "Nao foi possivel criar o usuario convidado." }, { status: 500 });
    }

    if (!newUser.user) {
      return NextResponse.json({ error: "Falha ao criar usuario" }, { status: 500 });
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: fullName,
        email,
        role: "secretary",
        employer_id: therapist.id,
      })
      .eq("id", newUser.user.id);

    if (profileError) {
      console.error("[api/team/invite] Erro ao atualizar perfil da secretaria:", profileError);
      return NextResponse.json(
        { error: "Usuario criado, mas nao foi possivel concluir a configuracao do perfil." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Secretaria cadastrada e vinculada com sucesso!",
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        full_name: fullName,
      },
    });
  } catch (error: any) {
    console.error("[api/team/invite] Erro interno:", error);
    return NextResponse.json({ error: "Erro interno ao processar convite." }, { status: 500 });
  }
}
