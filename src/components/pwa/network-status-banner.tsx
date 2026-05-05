"use client";

import { WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/use-network-status";

export function NetworkStatusBanner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium z-[100] relative animate-in slide-in-from-top-full">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Você está offline. Alterações serão salvas quando a conexão voltar.</span>
    </div>
  );
}
