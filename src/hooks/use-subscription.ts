"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function useSubscription() {
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [isTrial, setIsTrial] = useState(false);
  const [daysLeft, setDaysLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function checkSubscription() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setHasSubscription(false);
          return;
        }

        // Verificar assinatura no banco
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.id)
          .single();

        const active = subscription && ['active', 'trialing'].includes(subscription.status);
        
        if (active) {
          setHasSubscription(true);
          setIsTrial(subscription.status === 'trialing');
        } else {
          // Lógica de Trial Grátis de 2 dias (48h)
          const createdAt = new Date(user.created_at);
          const now = new Date();
          const diffInMs = now.getTime() - createdAt.getTime();
          const diffInHours = diffInMs / (1000 * 60 * 60);
          
          if (diffInHours < 48) {
            setHasSubscription(true);
            setIsTrial(true);
            setDaysLeft(Math.ceil((48 - diffInHours) / 24));
          } else {
            setHasSubscription(false);
            setIsTrial(false);
          }
        }
      } catch (error) {
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
      router.push("/dashboard/settings/billing");
    }
  };

  return { hasSubscription, isTrial, daysLeft, loading, gateAction };
}
