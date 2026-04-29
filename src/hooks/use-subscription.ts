"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

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
          .from('profiles')
          .select('role, employer_id, created_at')
          .eq('id', user.id)
          .maybeSingle();

        const role = profile?.role || 'therapist';
        const employerId = profile?.employer_id;
        const userCreatedAt = profile?.created_at || user.created_at;
        
        setIsSecretary(role === 'secretary');

        // 2. Determinar qual ID usar para checar a assinatura e qual data para o trial
        const targetUserId = (role === 'secretary' && employerId) ? employerId : user.id;
        setTherapistId(targetUserId);
        
        let referenceCreatedAt = userCreatedAt;

        // Se for secretária, precisamos da data de criação do chefe para o trial de 48h
        if (role === 'secretary' && employerId) {
          const { data: employerProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', employerId)
            .maybeSingle();
          if (employerProfile) referenceCreatedAt = employerProfile.created_at;
        }

        // 3. Verificar assinatura no banco para o targetUserId
        // Usamos uma consulta simples sem .single() para evitar erro 406 em alguns ambientes
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', targetUserId)
          .limit(1);

        const subscription = subscriptions && subscriptions.length > 0 ? subscriptions[0] : null;
        const active = subscription && ['active', 'trialing'].includes(subscription.status);

        
        if (active) {
          setHasSubscription(true);
          setIsTrial(subscription.status === 'trialing');
        } else {
          // 4. Lógica de Fallback (Trial Grátis de 7 dias baseada no chefe ou em si mesmo)
          const createdAt = new Date(referenceCreatedAt);
          const now = new Date();
          const diffInMs = now.getTime() - createdAt.getTime();
          const diffInHours = diffInMs / (1000 * 60 * 60);
          const trialHours = 168; // 7 dias
          
          if (diffInHours < trialHours) {
            setHasSubscription(true);
            setIsTrial(true);
            setDaysLeft(Math.ceil((trialHours - diffInHours) / 24));
          } else {
            setHasSubscription(false);
            setIsTrial(false);
          }
        }
      } catch (error) {
        console.error('Subscription error:', error);
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
