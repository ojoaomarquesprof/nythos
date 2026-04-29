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
        : "bg-teal-50 border-teal-200 text-teal-900"
    )}>
      <div className="flex items-center gap-2 text-center md:text-left">
        {isExpired ? (
          <ShieldAlert className="w-4 h-4 text-amber-600" />
        ) : (
          <Clock className="w-4 h-4 text-teal-600" />
        )}
        <span className="font-bold whitespace-nowrap">
          {isSecretary 
            ? (isExpired ? "ACESSO SUSPENSO:" : "STATUS DA CLÍNICA:") 
            : (isExpired ? "MODO DE VISUALIZAÇÃO:" : "PERÍODO DE TESTE GRÁTIS:")
          }
        </span>
        <span className="opacity-100 font-medium">
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
            "flex items-center gap-1 font-black hover:scale-105 transition-transform whitespace-nowrap px-3 py-1 rounded-full",
            isExpired ? "bg-amber-600 text-white" : "bg-teal-600 text-white"
          )}
        >
          {isExpired ? "Escolher um plano" : "Garantir minha assinatura"}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </div>
  );
}
