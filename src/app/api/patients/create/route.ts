import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { logSafeError } from "@/lib/errors/safe-error";
import {
  hasOnlyAllowedKeys,
  isLikelyPhoneOrCpf,
  isPlainObject,
  isValidEmail,
  isValidIsoDate,
  toFiniteNumber,
} from "@/lib/validation/input";

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
  send_invite?: boolean;           // legado: fluxo OTP desativado
  guardian?: {
    full_name: string;
    email?: string;
    phone?: string;
    cpf?: string;
    relationship?: string;
    is_financial_responsible?: boolean;
  };
}

interface CreatePatientResponse {
  patient_id: string;
  access_token: string;
  auth_user_id: string;
  invite_sent: boolean;
  auth_user_already_existed: boolean;
  guardian_saved: boolean;
}

const ALLOWED_GENDERS = new Set(["male", "female", "other", "prefer_not_to_say"]);
const ALLOWED_GUARDIAN_RELATIONSHIPS = new Set(["mother", "father", "grandparent", "other"]);
const ROOT_ALLOWED_KEYS = [
  "full_name",
  "email",
  "phone",
  "cpf",
  "date_of_birth",
  "gender",
  "emergency_contact_name",
  "emergency_contact_phone",
  "address",
  "session_price",
  "insurance_provider",
  "insurance_number",
  "send_invite",
  "guardian",
] as const;
const GUARDIAN_ALLOWED_KEYS = [
  "full_name",
  "email",
  "phone",
  "cpf",
  "relationship",
  "is_financial_responsible",
] as const;

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
 *  4. O acesso do paciente usa /p/[token] + data de nascimento.
 *
 * SEGURANÇA:
 *  • Usa supabaseAdmin (service_role) APENAS no lado do servidor.
 *  • A chave service_role NUNCA é exposta ao browser.
 *  • Antes de qualquer operação com service_role, valida sessão + perfil
 *    profissional e calcula o owner (effectiveTherapistId) no servidor.
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
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("role, employer_id")
    .eq("id", therapist.id)
    .maybeSingle();

  const profile = profileData as {
    role: "therapist" | "secretary" | "admin";
    employer_id: string | null;
  } | null;

  if (profileError || !profile || !["therapist", "admin", "secretary"].includes(profile.role)) {
    return NextResponse.json(
      { error: "Apenas profissionais autorizados podem cadastrar pacientes." },
      { status: 403 }
    );
  }

  const callerRole = profile.role;
  let effectiveTherapistId = therapist.id;

  if (callerRole === "secretary") {
    if (!profile.employer_id) {
      return NextResponse.json(
        { error: "Secretária sem terapeuta responsável vinculado." },
        { status: 403 }
      );
    }

    const { data: employerProfile, error: employerProfileError } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", profile.employer_id)
      .maybeSingle();

    if (
      employerProfileError ||
      !employerProfile ||
      !["therapist", "admin"].includes(employerProfile.role ?? "")
    ) {
      return NextResponse.json(
        { error: "Vínculo profissional inválido para cadastro de paciente." },
        { status: 403 }
      );
    }

    effectiveTherapistId = employerProfile.id;
  }

  // ── 2. Validar e parsear o body ──
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  if (!isPlainObject(rawBody) || !hasOnlyAllowedKeys(rawBody, ROOT_ALLOWED_KEYS)) {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
  }

  const body = rawBody as unknown as CreatePatientRequest;
  const { full_name, email, guardian, ...patientFields } = body;

  if (!full_name?.trim() || full_name.trim().length > 180) {
    return NextResponse.json({ error: "Nome completo é obrigatório." }, { status: 422 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Email inválido." }, { status: 422 });
  }
  if (patientFields.phone && !isLikelyPhoneOrCpf(patientFields.phone)) {
    return NextResponse.json({ error: "Telefone inválido." }, { status: 422 });
  }
  if (patientFields.cpf && !isLikelyPhoneOrCpf(patientFields.cpf)) {
    return NextResponse.json({ error: "CPF inválido." }, { status: 422 });
  }
  if (patientFields.date_of_birth && !isValidIsoDate(patientFields.date_of_birth)) {
    return NextResponse.json({ error: "Data de nascimento inválida." }, { status: 422 });
  }
  if (patientFields.gender && !ALLOWED_GENDERS.has(patientFields.gender)) {
    return NextResponse.json({ error: "Gênero inválido." }, { status: 422 });
  }
  const sessionPrice = toFiniteNumber(patientFields.session_price);
  if (patientFields.session_price !== undefined && (sessionPrice === null || sessionPrice < 0)) {
    return NextResponse.json({ error: "Preço de sessão inválido." }, { status: 422 });
  }

  if (guardian !== undefined) {
    if (!isPlainObject(guardian) || !hasOnlyAllowedKeys(guardian, GUARDIAN_ALLOWED_KEYS)) {
      return NextResponse.json({ error: "Dados de responsável inválidos." }, { status: 422 });
    }
    const hasGuardianName = !!guardian.full_name?.trim();
    const hasGuardianSideData = !!(guardian.email || guardian.phone || guardian.cpf || guardian.relationship);
    if (!hasGuardianName && hasGuardianSideData) {
      return NextResponse.json({ error: "Nome do responsável é obrigatório." }, { status: 422 });
    }
    if (hasGuardianName && guardian.full_name!.trim().length > 180) {
      return NextResponse.json({ error: "Nome do responsável inválido." }, { status: 422 });
    }
    if (guardian.email && !isValidEmail(guardian.email)) {
      return NextResponse.json({ error: "Email do responsável inválido." }, { status: 422 });
    }
    if (guardian.phone && !isLikelyPhoneOrCpf(guardian.phone)) {
      return NextResponse.json({ error: "Telefone do responsável inválido." }, { status: 422 });
    }
    if (guardian.cpf && !isLikelyPhoneOrCpf(guardian.cpf)) {
      return NextResponse.json({ error: "CPF do responsável inválido." }, { status: 422 });
    }
    if (guardian.relationship && !ALLOWED_GUARDIAN_RELATIONSHIPS.has(guardian.relationship)) {
      return NextResponse.json({ error: "Parentesco inválido do responsável." }, { status: 422 });
    }
  }

  const normalizedEmail = email.trim().toLowerCase();

  // ── 3. Resolver auth_user_id (reutilizar ou criar) ──
  let authUserId: string;
  let authUserAlreadyExisted = false;

  // service_role is needed here to reuse an existing patient auth account by email across records.
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
      email_confirm: true,
      user_metadata: {
        user_type: "patient",
        full_name: full_name.trim(),
      },
    });

    if (createError) {
      logSafeError("[api/patients/create] Erro ao criar auth user", createError);
      return NextResponse.json(
        {
          error: "Não foi possível criar a conta de acesso do paciente.",
        },
        { status: 409 }
      );
    }

    authUserId = newAuthUser.user.id;
  }

  // ── 4. Inserir paciente em public.patients com auth_user_id já definido ──
  // service_role is required here because patients INSERT triggers call
  // encryption helpers that are intentionally not executable by authenticated.
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
      session_price:            sessionPrice,
      insurance_provider:       patientFields.insurance_provider ?? null,
      insurance_number:         patientFields.insurance_number ?? null,
      status: "active",
    })
    .select("id, access_token")
    .single();

  if (insertError || !newPatient) {
    logSafeError("[api/patients/create] Erro ao inserir paciente", insertError);
    // Rollback manual: se criamos um auth user novo mas o INSERT falhou, remover o auth user
    if (!authUserAlreadyExisted) {
      await supabaseAdmin.auth.admin
        .deleteUser(authUserId)
        .catch((rollbackError) =>
          logSafeError("[api/patients/create] Erro ao remover auth user no rollback", rollbackError)
        );
    }
    return NextResponse.json(
      { error: "Erro ao salvar o paciente no banco de dados." },
      { status: 500 }
    );
  }

  // ── 5. Convite OTP desativado ──
  let guardianSaved = false;

  if (guardian?.full_name?.trim()) {
    // service_role is required because guardian RLS currently permits only direct therapist ownership.
    const { error: guardianError } = await supabaseAdmin
      .from("patient_guardians")
      .insert({
        patient_id: newPatient.id,
        full_name: guardian.full_name.trim(),
        email: guardian.email?.trim() || null,
        phone: guardian.phone?.trim() || null,
        cpf: guardian.cpf?.trim() || null,
        relationship: guardian.relationship || "other",
        is_financial_responsible: guardian.is_financial_responsible ?? false,
      });

    if (guardianError) {
      logSafeError("[api/patients/create] Erro ao inserir responsavel", guardianError);
      // service_role rollback is required because secretaries cannot delete employer-owned patients via RLS.
      const { error: rollbackError } = await supabaseAdmin
        .from("patients")
        .delete()
        .eq("id", newPatient.id);
      if (rollbackError) logSafeError("[api/patients/create] Erro no rollback do paciente", rollbackError);
      if (!authUserAlreadyExisted) {
        await supabaseAdmin.auth.admin
          .deleteUser(authUserId)
          .catch((rollbackError) =>
            logSafeError("[api/patients/create] Erro ao remover auth user no rollback", rollbackError)
          );
      }
      return NextResponse.json(
        { error: "Erro ao salvar o responsável do paciente." },
        { status: 500 }
      );
    }

    guardianSaved = true;
  }

  const inviteSent = false;

  // ── 6. Retornar sucesso ──
  const response: CreatePatientResponse = {
    patient_id: newPatient.id,
    access_token: String((newPatient as { access_token: string }).access_token),
    auth_user_id: authUserId,
    invite_sent: inviteSent,
    auth_user_already_existed: authUserAlreadyExisted,
    guardian_saved: guardianSaved,
  };

  return NextResponse.json(response, { status: 201 });
}
