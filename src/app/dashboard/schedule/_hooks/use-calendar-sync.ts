import { useState, useEffect } from "react";
import {
  syncGoogleCalendar,
  linkGoogleCalendar,
  disconnectGoogleCalendar,
  getCalendarStatus,
  type CalendarSyncResult,
} from "@/app/actions/calendar-sync";

export function useCalendarSync(onSyncSuccess?: () => void) {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncResult, setSyncResult] = useState<CalendarSyncResult | null>(null);
  const [syncBanner, setSyncBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  useEffect(() => {
    async function checkGoogleStatus() {
      const status = await getCalendarStatus();
      setGoogleConnected(status.connected);
    }
    checkGoogleStatus();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("google_auth");
    if (authResult === "success") {
      setGoogleConnected(true);
      setSyncBanner({ type: 'success', message: 'Google Calendar conectado com sucesso! Clique em "Sincronizar" para importar seus eventos.' });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (authResult === "error") {
      setSyncBanner({ type: 'error', message: 'Falha ao conectar o Google Calendar. Tente novamente.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!syncBanner) return;
    const timer = setTimeout(() => setSyncBanner(null), 6000);
    return () => clearTimeout(timer);
  }, [syncBanner]);

  const handleGoogleConnect = async () => {
    setConnecting(true);
    try {
      const result = await linkGoogleCalendar();
      if (result.url) {
        window.location.href = result.url;
      } else {
        setSyncBanner({ type: 'error', message: result.error ?? 'Erro ao iniciar conexão.' });
      }
    } catch (err) {
      setSyncBanner({ type: 'error', message: 'Erro inesperado ao conectar o Google.' });
    } finally {
      setConnecting(false);
    }
  };

  const handleGoogleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncGoogleCalendar(30);
      setSyncResult(result);
      if (result.needsAuth) {
        setGoogleConnected(false);
        setSyncBanner({ type: 'error', message: 'Sua sessão com o Google expirou. Reconecte sua conta.' });
      } else if (result.success) {
        const externalImported = result.externalImported ?? 0;
        const totalImported = result.imported + externalImported;
        setSyncBanner({
          type: 'success',
          message: totalImported > 0
            ? `✅ ${result.imported} sessão(ões) e ${externalImported} bloqueio(s) do Google sincronizados.`
            : '✅ Agenda atualizada — nenhum evento novo encontrado.',
        });
        if (onSyncSuccess) onSyncSuccess();
      } else {
        setSyncBanner({ type: 'error', message: result.error ?? 'Erro ao sincronizar.' });
      }
    } catch (err: unknown) {
      setSyncBanner({ type: 'error', message: (err instanceof Error ? err.message : undefined) ?? 'Erro inesperado na sincronização.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    if (!confirm('Deseja realmente desconectar o Google Calendar?')) return;
    const result = await disconnectGoogleCalendar();
    if (result.success) {
      setGoogleConnected(false);
      setSyncBanner({ type: 'info', message: 'Google Calendar desconectado.' });
    } else {
      setSyncBanner({ type: 'error', message: result.error ?? 'Erro ao desconectar.' });
    }
  };

  return {
    googleConnected,
    syncing,
    connecting,
    syncResult,
    syncBanner,
    setSyncBanner,
    handleGoogleConnect,
    handleGoogleSync,
    handleGoogleDisconnect,
  };
}
