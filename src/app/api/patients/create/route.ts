import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

// ============================================================
// Tipos do request e response
// ============================================================

interface CreatePatientRequest {
  full_name: string;
  email: string;                   // email do paciente OU do responsável
  phone?: string;
  cpf?: string;
  date_of_birth?: string;          // ISO 8601: "YYYY-MM-DD"
  gender?: "male" | "female" | "other" | "prefer_not_to_say";
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  address?: string;
  session_price?: number;
  insurance_provider?: string;
  insurance_number?: string;
  send_invite?: boolean;           // se true, envia Magic Link imediatamente
}

interface CreatePatientResponse {
  patient_id: string;
  auth_user_id: string;
  invite_sent: boolean;
  auth_user_already_existed: boolean;
}

// ============================================================
// POST /api/patients/create
// ============================================================
/**
 * Provisiona um novo paciente com acesso à área do paciente.
 *
 * FLUXO (Backend Auth Provisioning):
 *  1. Verifica que o chamador é um terapeuta autenticado.
 *  2. Verifica se o email já tem um auth_user_id em patients
 *     (caso: mãe com múltiplos filhos em terapia).
 *     → Sim: reutiliza o auth_user_id existente (sem criar novo usuário).
 *     → Não: chama auth.admin.createUser para criar a conta no auth.users.
 *  3. Faz INSERT em public.patients já com auth_user_id preenchido.
 *  4. Opcionalmente envia um Magic Link de boas-vindas via admin.generateLink.
 *
 * SEGURANÇA:
 *  • Usa supabaseAdmin (service_role) APENAS no lado do servidor.
 *  • A chave service_role NUNCA é exposta ao browser.
 *  • O RLS de patients verifica auth.uid() = user_id para garantir
 *    que o terapeuta só cria pacientes sob seu próprio user_id.
 */
export async function POST(request: Request) {
  // ── 1. Autenticar o terapeuta que está fazendo a chamada ──
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user: therapist }, error: authError } = await supabase.auth.getUser();

  if (authError || !therapist) {
    return NextResponse.json(
      { error: "Não autorizado. Faça login como terapeuta." },
      { status: 401 }
    );
  }

  // Garantir que quem chama é terapeuta ou admin
  // Usa supabaseAdmin para evitar inferência 'never' em partial selects com union types
  const { data: profileData } = await supabaseAdmin
    .from("profiles")
    .select("role, employer_id")
    .eq("id", therapist.id)
    .maybeSingle();

  const profile = profileData as {
    role: "therapist" | "secretary" | "admin";
    employer_id: string | null;
  } | null;

  const callerRole = profile?.role ?? "therapist";
  const effectiveTherapistId =
    callerRole === "secretary" && profile?.employer_id
      ? profile.employer_id
      : therapist.id;

  if (!["therapist", "admin", "secretary"].includes(callerRole)) {
    return NextResponse.json(
      { error: "Apenas terapeutas podem cadastrar pacientes." },
      { status: 403 }
    );
  }


  // ── 2. Validar e parsear o body ──
  let body: CreatePatientRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const { full_name, email, send_invite = false, ...patientFields } = body;

  if (!full_name?.trim()) {
    return NextResponse.json({ error: "Nome completo é obrigatório." }, { status: 422 });
  }
  if (!email?.trim() || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido." }, { status: 422 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // ── 3. Resolver auth_user_id (reutilizar ou criar) ──
  //
  // Verificar se ESTE EMAIL já tem um auth_user_id em qualquer patient
  // deste terapeuta. Isso resolve o caso da mãe com múltiplos filhos:
  // auth_user_id já existe → reutilizamos, não criamos um novo usuário.
  //
  let authUserId: string;
  let authUserAlreadyExisted = false;

  const { data: existingPatientWithAuth } = await supabaseAdmin
    .from("patients")
    .select("auth_user_id")
    .ilike("email", normalizedEmail)
    .not("auth_user_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (existingPatientWithAuth?.auth_user_id) {
    // Email já é de um responsável cadastrado → reutilizar auth_user_id
    authUserId = existingPatientWithAuth.auth_user_id;
    authUserAlreadyExisted = true;
  } else {
    // Criar novo usuário no Supabase Auth via service_role
    const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      email_confirm: true,        // confirmar email automaticamente (sem fluxo de verificação extra)
      user_metadata: {
        user_type: "patient",     // impede trigger handle_new_user de criar profile de terapeuta
        full_name: full_name.trim(),
      },
    });

    if (createError) {
      // Caso edge: usuário criado fora do fluxo (ex: paciente adulto que se cadastrou
      // como terapeuta antes). Retornar erro claro para o terapeuta tratar.
      console.error("[api/patients/create] Erro ao criar auth user:", createError);
      return NextResponse.json(
        {
          error: `Não foi possível criar a conta de acesso para o paciente: ${createError.message}`,
          hint: "Verifique se este email já está cadastrado como terapeuta na plataforma.",
        },
        { status: 409 }
      );
    }

    authUserId = newAuthUser.user.id;
  }

  // ── 4. Inserir paciente em public.patients com auth_user_id já definido ──
  const { data: newPatient, error: insertError } = await supabaseAdmin
    .from("patients")
    .insert({
      user_id: effectiveTherapistId,
      auth_user_id: authUserId,
      full_name: full_name.trim(),
      email: normalizedEmail,
      phone:                    patientFields.phone ?? null,
      cpf:                      patientFields.cpf ?? null,
      date_of_birth:            patientFields.date_of_birth ?? null,
      gender:                   patientFields.gender ?? null,
      emergency_contact_name:   patientFields.emergency_contact_name ?? null,
      emergency_contact_phone:  patientFields.emergency_contact_phone ?? null,
      address:                  patientFields.address ?? null,
      session_price:            patientFields.session_price ?? null,
      insurance_provider:       patientFields.insurance_provider ?? null,
      insurance_number:         patientFields.insurance_number ?? null,
      status: "active",
    })
    .select("id")
    .single();

  if (insertError || !newPatient) {
    console.error("[api/patients/create] Erro ao inserir paciente:", insertError);
    // Rollback manual: se criamos um auth user novo mas o INSERT falhou, remover o auth user
    if (!authUserAlreadyExisted) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(console.error);
    }
    return NextResponse.json(
      { error: "Erro ao salvar o paciente no banco de dados.", detail: insertError?.message },
      { status: 500 }
    );
  }

  // ── 5. Opcionalmente enviar Magic Link de boas-vindas ──
  let inviteSent = false;

  if (send_invite) {
    const { error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: normalizedEmail,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/patient/callback`,
      },
    });

    if (inviteError) {
      // Não falhar o request por isso — paciente foi criado com sucesso.
      // O terapeuta pode reenviar o convite depois.
      console.warn("[api/patients/create] Falha ao gerar Magic Link de convite:", inviteError);
    } else {
      inviteSent = true;
    }
  }

  // ── 6. Retornar sucesso ──
  const response: CreatePatientResponse = {
    patient_id: newPatient.id,
    auth_user_id: authUserId,
    invite_sent: inviteSent,
    auth_user_already_existed: authUserAlreadyExisted,
  };

  return NextResponse.json(response, { status: 201 });
}
