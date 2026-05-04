import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

const ASAAS_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://sandbox.asaas.com/api/v3";

function getAsaasKey(): string {
  let key = process.env.ASAAS_API_KEY ?? "";
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");
  if (!key.startsWith("$")) key = "$" + key;
  return key;
}

async function asaasFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: getAsaasKey(),
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// Preços definidos SERVER-SIDE — nunca confiar no frontend
const PLAN_CONFIG = {
  monthly: { value: 89.0,  cycle: "MONTHLY", label: "Mensal" },
  yearly:  { value: 890.0, cycle: "YEARLY",  label: "Anual"  },
} as const;

type PlanType = keyof typeof PLAN_CONFIG;

function friendlyCardError(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("insufficient") || r.includes("saldo"))   return "Saldo insuficiente no cartão.";
  if (r.includes("invalid card") || r.includes("inválido")) return "Número do cartão inválido.";
  if (r.includes("expired") || r.includes("expirado"))     return "Cartão expirado.";
  if (r.includes("cvv") || r.includes("security"))         return "CVV inválido.";
  if (r.includes("blocked") || r.includes("bloqueado"))    return "Cartão bloqueado pelo banco.";
  if (r.includes("holder") || r.includes("titular"))       return "Nome do titular não confere.";
  if (r.includes("cpf") || r.includes("cnpj"))             return "CPF do titular inválido.";
  return `Pagamento recusado: ${raw}`;
}

export async function POST(request: Request) {
  try {
    // 1. Autenticar
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
        },
      }
    ) as any;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    // 2. Parsear body
    let body: {
      planType: PlanType;
      cardNumber: string;
      cardHolder: string;
      expiryMonth: string;
      expiryYear: string;
      cvv: string;
      holderCpf: string;
    };
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: "Body inválido." }, { status: 400 }); }

    const { planType, cardNumber, cardHolder, expiryMonth, expiryYear, cvv, holderCpf } = body;

    if (!planType || !PLAN_CONFIG[planType]) {
      return NextResponse.json({ error: "Plano inválido." }, { status: 422 });
    }

    const cardDigits = cardNumber.replace(/\s/g, "");
    if (cardDigits.length < 13) return NextResponse.json({ error: "Número do cartão inválido." }, { status: 422 });
    if (!cardHolder?.trim())    return NextResponse.json({ error: "Nome do titular obrigatório." }, { status: 422 });
    if (!expiryMonth || !expiryYear || !cvv) return NextResponse.json({ error: "Validade/CVV obrigatórios." }, { status: 422 });
    if (!holderCpf?.replace(/\D/g, ""))     return NextResponse.json({ error: "CPF do titular obrigatório." }, { status: 422 });

    const plan = PLAN_CONFIG[planType];

    // 3. Buscar perfil
    const { data: profileData } = await supabaseAdmin
      .from("profiles").select("full_name, cpf, phone").eq("id", user.id).maybeSingle();
      
    const profile = profileData as { full_name: string | null; cpf: string | null; phone: string | null } | null;

    const customerEmail = user.email!;
    const customerCpf   = (profile?.cpf || holderCpf).replace(/\D/g, "");
    const customerName  = profile?.full_name || customerEmail;

    // 4. Criar/recuperar cliente Asaas
    let customerId: string;
    const search = await asaasFetch(`/customers?email=${encodeURIComponent(customerEmail)}&limit=1`);

    if (search.ok && search.data?.data?.length > 0) {
      customerId = search.data.data[0].id;
      if (!search.data.data[0].cpfCnpj && customerCpf) {
        await asaasFetch(`/customers/${customerId}`, {
          method: "PUT",
          body: JSON.stringify({ cpfCnpj: customerCpf }),
        });
      }
    } else {
      const created = await asaasFetch("/customers", {
        method: "POST",
        body: JSON.stringify({
          name: customerName,
          email: customerEmail,
          cpfCnpj: customerCpf,
          externalReference: user.id,
          ...(profile?.phone ? { phone: profile.phone } : {}),
        }),
      });
      if (!created.ok) {
        const msg = created.data?.errors?.[0]?.description || "Erro ao registrar cliente.";
        return NextResponse.json({ error: msg }, { status: 422 });
      }
      customerId = created.data.id;
    }

    // 5. Criar assinatura com cartão — PASS-THROUGH, nunca persiste no Supabase
    const subResult = await asaasFetch("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        customer: customerId,
        billingType: "CREDIT_CARD",
        value: plan.value,
        nextDueDate: new Date().toISOString().split("T")[0],
        cycle: plan.cycle,
        description: `Assinatura Nythos — Plano ${plan.label}`,
        externalReference: user.id,
        creditCard: {
          holderName: cardHolder.trim(),
          number: cardDigits,
          expiryMonth: expiryMonth.padStart(2, "0"),
          expiryYear,
          ccv: cvv,
        },
        creditCardHolderInfo: {
          name: cardHolder.trim(),
          email: customerEmail,
          cpfCnpj: holderCpf.replace(/\D/g, ""),
          ...(profile?.phone ? { phone: profile.phone } : {}),
        },
      }),
    });

    if (!subResult.ok) {
      const raw = subResult.data?.errors?.[0]?.description || subResult.data?.errors?.[0]?.code || "Recusado.";
      console.error("[checkout] Asaas error:", subResult.data);
      return NextResponse.json({ error: friendlyCardError(raw) }, { status: 422 });
    }

    // 6. Persistir apenas metadados (sem dados do cartão) no Supabase
    await (supabaseAdmin as any).from("subscriptions").upsert(
      {
        user_id: user.id,
        status: "active",
        gateway_subscription_id: subResult.data.id,
        gateway_customer_id: customerId,
        current_period_end: new Date(
          Date.now() + (planType === "yearly" ? 365 : 30) * 24 * 60 * 60 * 1000
        ).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return NextResponse.json({
      success: true,
      plan: planType,
      subscriptionId: subResult.data.id,
      message: `Assinatura ${plan.label} ativada!`,
    });
  } catch (error: any) {
    console.error("[checkout] Erro inesperado:", error);
    return NextResponse.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
  }
}
