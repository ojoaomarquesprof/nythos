"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

// Fallback local de segurança: usado APENAS se a query ao banco falhar.
// O valor canônico vive em system_settings.trial_duration_hours no Supabase.
const TRIAL_HOURS_FALLBACK = 168; // 7 dias

/**
 * Busca o valor de trial_duration_hours da tabela system_settings.
 * Retorna o fallback local em caso de erro de rede ou ausência do registro.
 */
async function fetchTrialHours(supabase: ReturnType<typeof createClient>): Promise<number> {
  try {
    const { data, error } = await (supabase as any)
      .from("system_settings")
      .select("value")
      .eq("key", "trial_duration_hours")
      .maybeSingle();

    if (error || !data?.value) {
      console.warn(
        "[use-subscription] Não foi possível carregar trial_duration_hours do banco. " +
        `Usando fallback local: ${TRIAL_HOURS_FALLBACK}h.`,
        error
      );
      return TRIAL_HOURS_FALLBACK;
    }

    const parsed = parseInt(data.value, 10);
    if (isNaN(parsed) || parsed <= 0) {
      console.warn(
        `[use-subscription] Valor inválido em system_settings.trial_duration_hours: "${data.value}". ` +
        `Usando fallback local: ${TRIAL_HOURS_FALLBACK}h.`
      );
      return TRIAL_HOURS_FALLBACK;
    }

    return parsed;
  } catch {
    return TRIAL_HOURS_FALLBACK;
  }
}

export function useSubscription() {
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [isSecretary, setIsSecretary] = useState(false);
  const [therapistId, setTherapistId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient() as any;
  const router = useRouter();

  useEffect(() => {
    async function checkSubscription() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setHasSubscription(false);
          setLoading(false);
          return;
        }

        // 1. Buscar perfil para ver role e employer_id
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, employer_id, created_at")
          .eq("id", user.id)
          .maybeSingle();

        const role = profile?.role || "therapist";
        const employerId = profile?.employer_id;
        const userCreatedAt = profile?.created_at || user.created_at;

        setIsSecretary(role === "secretary");

        // 2. Determinar qual ID usar para checar a assinatura e qual data para o trial
        const targetUserId = (role === "secretary" && employerId) ? employerId : user.id;
        setTherapistId(targetUserId);

        let referenceCreatedAt = userCreatedAt;

        // Se for secretária, usamos a data de criação do chefe para o trial
        if (role === "secretary" && employerId) {
          const { data: employerProfile } = await supabase
            .from("profiles")
            .select("created_at")
            .eq("id", employerId)
            .maybeSingle();
          if (employerProfile) referenceCreatedAt = employerProfile.created_at;
        }

        // 3. Verificar assinatura no banco para o targetUserId
        const { data: subscriptions } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", targetUserId)
          .limit(1);

        const subscription = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null;
        const active = subscription && ["active", "trialing"].includes(subscription.status);

        if (active) {
          setHasSubscription(true);
          setIsTrial(subscription.status === "trialing");
          return; // assinatura paga ativa — não precisa calcular trial
        }

        // 4. Lógica de Trial Grátis — duração carregada dinamicamente do banco
        const trialHours = await fetchTrialHours(supabase);

        const createdAt = new Date(referenceCreatedAt);
        const now = new Date();
        const diffInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

        if (diffInHours < trialHours) {
          setHasSubscription(true);
          setIsTrial(true);
          setDaysLeft(Math.ceil((trialHours - diffInHours) / 24));
        } else {
          setHasSubscription(false);
          setIsTrial(false);
        }
      } catch (error) {
        console.error("[use-subscription] Erro ao verificar assinatura:", error);
        setHasSubscription(false);
      } finally {
        setLoading(false);
      }
    }

    checkSubscription();
  }, []);

  const gateAction = (action: () => void) => {
    if (loading) return;
    if (hasSubscription) {
      action();
    } else {
      if (isSecretary) {
        alert("O acesso da clínica está suspenso. Por favor, avise o administrador.");
      } else {
        router.push("/dashboard/settings/billing");
      }
    }
  };

  return { hasSubscription, isTrial, daysLeft, loading, gateAction, isSecretary, therapistId };
}
