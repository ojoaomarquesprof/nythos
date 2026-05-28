"use client";

import { ArrowRight, Clock, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import { ONLINE_PAYMENT_STANDBY_MESSAGE } from "@/lib/billing/payment-standby";
import { cn } from "@/lib/utils";

export function SubscriptionBanner() {
  const { hasSubscription, isTrial, daysLeft, loading, isSecretary } = useSubscription();
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setHasMounted(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasMounted || loading) return null;

  // Se tem assinatura e nao e trial, nao mostra nada.
  if (hasSubscription && !isTrial) return null;

  const isExpired = !hasSubscription;

  return (
    <div className={cn(
      "border-b py-2 px-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs md:text-sm animate-fade-in sticky top-0 z-50 shadow-sm transition-colors",
      isExpired
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-teal-50 border-teal-200 text-teal-900"
    )}>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
        <div className="flex items-center gap-1.5">
          {isExpired ? (
            <ShieldCheck className="w-3.5 h-3.5 md:w-4 md:h-4 text-amber-600 shrink-0" />
          ) : (
            <Clock className="w-3.5 h-3.5 md:w-4 md:h-4 text-teal-600 shrink-0" />
          )}
          <span className="font-bold whitespace-nowrap">
            {isSecretary ? "STATUS:" : (isExpired ? "ACESSO LIBERADO:" : "TESTE GRATIS:")}
          </span>
        </div>
        <span className="opacity-100 font-medium">
          {isSecretary
            ? (isExpired
                ? ONLINE_PAYMENT_STANDBY_MESSAGE
                : `Restam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}.`)
            : (isExpired
                ? ONLINE_PAYMENT_STANDBY_MESSAGE
                : `Restam ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"} de acesso. ${ONLINE_PAYMENT_STANDBY_MESSAGE}`)
          }
        </span>
      </div>
      {!isSecretary && (
        <Link
          href="/dashboard/settings/billing"
          className={cn(
            "flex items-center gap-1 font-black hover:scale-105 transition-transform whitespace-nowrap px-3 py-1.5 rounded-full text-[10px] md:text-xs shadow-sm",
            isExpired ? "bg-amber-600 text-white" : "bg-teal-600 text-white"
          )}
        >
          Ver planos
          <ArrowRight className="w-3 h-3 md:w-3.5 md:h-3.5" />
        </Link>
      )}
    </div>
  );
}
