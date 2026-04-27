"use client";

import { ShieldAlert, ArrowRight, Clock } from "lucide-react";
import Link from "next/link";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

export function SubscriptionBanner() {
  const { hasSubscription, isTrial, daysLeft, loading, isSecretary } = useSubscription();

  if (loading) return null;
  
  // Se tem assinatura e NÃO é trial (ou seja, é um pagante real), não mostra nada
  if (hasSubscription && !isTrial) return null;

  const isExpired = !hasSubscription;

  return (
    <div className={cn(
      "border-b py-2 px-4 flex items-center justify-center gap-4 text-sm animate-fade-in sticky top-0 z-50 shadow-sm transition-colors",
      isExpired 
        ? "bg-amber-50 border-amber-200 text-amber-800" 
        : "bg-indigo-50 border-indigo-200 text-indigo-800"
    )}>
      <div className="flex items-center gap-2 text-center md:text-left">
        {isExpired ? (
          <ShieldAlert className="w-4 h-4 text-amber-600" />
        ) : (
          <Clock className="w-4 h-4 text-indigo-600" />
        )}
        <span className="font-medium whitespace-nowrap">
          {isSecretary 
            ? (isExpired ? "Acesso Suspenso:" : "Status da Clínica:") 
            : (isExpired ? "Modo de Visualização:" : "Período de Teste Grátis:")
          }
        </span>
        <span className="opacity-90">
          {isSecretary 
            ? (isExpired 
                ? "O acesso da clínica está suspenso. Por favor, avise o administrador." 
                : `A clínica está em período de teste. Restam ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'}.`)
            : (isExpired 
                ? "Você ainda não possui uma assinatura ativa." 
                : `Você tem ${daysLeft} ${daysLeft === 1 ? 'dia' : 'dias'} de acesso total liberado!`)
          }
        </span>
      </div>
      {!isSecretary && (
        <Link 
          href="/dashboard/settings/billing"
          className={cn(
            "flex items-center gap-1 font-bold hover:underline whitespace-nowrap",
            isExpired ? "text-amber-900" : "text-indigo-900"
          )}
        >
          {isExpired ? "Escolher um plano" : "Garantir minha assinatura"}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
