"use client";

import { useSubscription } from "@/hooks/use-subscription";
import { useRouter } from "next/navigation";
import React from "react";

interface SubscriptionGateProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Componente que protege ações ou elementos que exigem assinatura.
 * Se o usuário não tiver assinatura, redireciona para o billing ao clicar.
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { hasSubscription, loading } = useSubscription();
  const router = useRouter();

  if (loading) return children; // Deixa renderizar enquanto carrega para não quebrar o layout

  const handleClick = (e: React.MouseEvent) => {
    if (!hasSubscription) {
      e.preventDefault();
      e.stopPropagation();
      router.push("/dashboard/settings/billing");
    }
  };

  return (
    <div onClickCapture={handleClick} className="contents">
      {children}
    </div>
  );
}
