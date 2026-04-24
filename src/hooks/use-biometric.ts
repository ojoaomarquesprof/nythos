"use client";

import { useState, useCallback, useEffect } from "react";

interface BiometricState {
  isSupported: boolean;
  isRegistered: boolean;
  isLocked: boolean;
  isLoading: boolean;
  error: string | null;
}

const CREDENTIAL_ID_KEY = "nythos_biometric_credential_id";
const BIOMETRIC_ENABLED_KEY = "nythos_biometric_enabled";

export function useBiometric() {
  const [state, setState] = useState<BiometricState>({
    isSupported: false,
    isRegistered: false,
    isLocked: false,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    // Check WebAuthn support
    const isSupported =
      typeof window !== "undefined" &&
      window.PublicKeyCredential !== undefined &&
      typeof window.PublicKeyCredential === "function";

    const isRegistered = !!localStorage.getItem(CREDENTIAL_ID_KEY);
    const isEnabled = localStorage.getItem(BIOMETRIC_ENABLED_KEY) === "true";

    setState((prev) => ({
      ...prev,
      isSupported,
      isRegistered,
      isLocked: isEnabled && isRegistered,
    }));
  }, []);

  // Register biometric credential
  const register = useCallback(async (userId: string) => {
    if (!state.isSupported) return false;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userIdBuffer = new TextEncoder().encode(userId);

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: "Nythos",
            id: window.location.hostname,
          },
          user: {
            id: userIdBuffer,
            name: userId,
            displayName: "Psicóloga",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" },   // ES256
            { alg: -257, type: "public-key" },  // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform", // Force biometric (platform authenticator)
            userVerification: "required",
          },
          timeout: 60000,
        },
      }) as PublicKeyCredential | null;

      if (credential) {
        const credentialId = btoa(
          String.fromCharCode(...new Uint8Array(credential.rawId))
        );
        localStorage.setItem(CREDENTIAL_ID_KEY, credentialId);
        localStorage.setItem(BIOMETRIC_ENABLED_KEY, "true");

        setState((prev) => ({
          ...prev,
          isRegistered: true,
          isLocked: false,
          isLoading: false,
        }));
        return true;
      }

      setState((prev) => ({ ...prev, isLoading: false }));
      return false;
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erro ao registrar biometria",
      }));
      return false;
    }
  }, [state.isSupported]);

  // Authenticate with biometric
  const authenticate = useCallback(async () => {
    const credentialId = localStorage.getItem(CREDENTIAL_ID_KEY);
    if (!state.isSupported || !credentialId) return false;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const rawId = Uint8Array.from(atob(credentialId), (c) => c.charCodeAt(0));

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials: [
            {
              type: "public-key",
              id: rawId,
              transports: ["internal"],
            },
          ],
          userVerification: "required",
          timeout: 60000,
        },
      });

      if (assertion) {
        setState((prev) => ({
          ...prev,
          isLocked: false,
          isLoading: false,
        }));
        return true;
      }

      setState((prev) => ({ ...prev, isLoading: false }));
      return false;
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error.message || "Erro na autenticação biométrica",
      }));
      return false;
    }
  }, [state.isSupported]);

  // Disable biometric lock
  const disable = useCallback(() => {
    localStorage.removeItem(CREDENTIAL_ID_KEY);
    localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    setState((prev) => ({
      ...prev,
      isRegistered: false,
      isLocked: false,
    }));
  }, []);

  return {
    ...state,
    register,
    authenticate,
    disable,
  };
}
