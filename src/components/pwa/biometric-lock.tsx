"use client";

import { useState } from "react";
import { Brain, Fingerprint, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBiometric } from "@/hooks/use-biometric";
import { cn } from "@/lib/utils";

interface BiometricLockProps {
  onUnlock: () => void;
}

export function BiometricLock({ onUnlock }: BiometricLockProps) {
  const { isSupported, isLoading, error, authenticate } = useBiometric();
  const [showFallback, setShowFallback] = useState(false);
  const [pin, setPin] = useState("");

  const handleBiometricAuth = async () => {
    const success = await authenticate();
    if (success) {
      onUnlock();
    }
  };

  const handlePinAuth = () => {
    // Fallback PIN auth — simplified for MVP
    if (pin.length >= 4) {
      onUnlock();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background">
      {/* Background gradient */}
      <div className="absolute inset-0 gradient-hero opacity-50" />

      <div className="relative z-10 flex flex-col items-center gap-6 px-8 max-w-sm w-full animate-fade-in">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center shadow-xl">
          <Brain className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-xl font-bold">Nythos</h1>
        <p className="text-sm text-muted-foreground text-center">
          Desbloqueie para acessar seus dados
        </p>

        {!showFallback ? (
          <>
            {/* Biometric button */}
            <button
              onClick={handleBiometricAuth}
              disabled={isLoading || !isSupported}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300",
                "bg-primary/10 hover:bg-primary/20 active:scale-95",
                isLoading && "animate-pulse"
              )}
            >
              <Fingerprint
                className={cn(
                  "w-10 h-10 text-primary transition-all",
                  isLoading && "animate-pulse"
                )}
              />
            </button>
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? "Verificando..."
                : isSupported
                ? "Toque para desbloquear com biometria"
                : "Biometria não disponível neste dispositivo"}
            </p>

            {error && (
              <p className="text-xs text-destructive text-center">{error}</p>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFallback(true)}
              className="text-muted-foreground"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              Usar PIN
            </Button>
          </>
        ) : (
          <>
            {/* PIN fallback */}
            <div className="w-full space-y-4">
              <Input
                type="password"
                placeholder="Digite seu PIN"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="text-center text-2xl tracking-[0.5em] h-14"
                autoFocus
              />
              <Button
                onClick={handlePinAuth}
                disabled={pin.length < 4}
                className="w-full h-11 gradient-primary text-white"
              >
                Desbloquear
              </Button>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFallback(false)}
              className="text-muted-foreground"
            >
              <Fingerprint className="w-4 h-4 mr-2" />
              Usar Biometria
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
