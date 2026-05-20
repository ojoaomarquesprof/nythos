"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  BookHeart,
  Check,
  Copy,
  ListChecks,
  Loader2,
  Mail,
  RefreshCw,
  Smile,
  TrendingUp,
  UserCheck,
  UserX,
} from "lucide-react";
import { getPatientEngagement } from "@/app/actions/patient-engagement";
import { auditPatientLinkEvent } from "@/app/actions/clinical-audit";
import type { PatientEngagementStats } from "@/app/actions/patient-engagement";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PatientService } from "@/services/patient-service";

interface PatientEngagementCardProps {
  patientId: string;
  patientEmail: string | null;
  authUserId: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: string | null;
  accessTokenRevokedAt: string | null;
  dateOfBirth: string | null;
  onAccessLinkChanged?: () => Promise<void> | void;
}

type AccessState = "active" | "revoked" | "expired" | "missing";

function formatRelDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `ha ${diffDays} dias`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function getAccessState(
  accessToken: string | null,
  accessTokenExpiresAt: string | null,
  accessTokenRevokedAt: string | null
): AccessState {
  if (!accessToken) return "missing";
  if (accessTokenRevokedAt) return "revoked";
  if (accessTokenExpiresAt && new Date(accessTokenExpiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

export function PatientEngagementCard({
  patientId,
  patientEmail,
  authUserId,
  accessToken,
  accessTokenExpiresAt,
  accessTokenRevokedAt,
  dateOfBirth,
  onAccessLinkChanged,
}: PatientEngagementCardProps) {
  const [stats, setStats] = useState<PatientEngagementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [tasksDialogOpen, setTasksDialogOpen] = useState(false);
  const [tasksFilter, setTasksFilter] = useState<"all" | "pending" | "completed">("all");
  const [diaryDialogOpen, setDiaryDialogOpen] = useState(false);
  const [selectedDiaryMonth, setSelectedDiaryMonth] = useState<string>("all");
  const [accessActionPending, setAccessActionPending] = useState<"revoke" | "regenerate" | null>(
    null
  );

  const accessState = getAccessState(accessToken, accessTokenExpiresAt, accessTokenRevokedAt);
  const accessUrl =
    typeof window !== "undefined"
      ? accessToken
        ? `${window.location.origin}/p/${accessToken}`
        : null
      : accessToken
      ? `https://app.nythos.com.br/p/${accessToken}`
      : null;

  const dobFormatted = dateOfBirth
    ? new Date(`${dateOfBirth}T12:00:00`).toLocaleDateString("pt-BR")
    : null;

  const loadStats = useCallback(async () => {
    setLoading(true);
    const result = await getPatientEngagement(patientId);
    if (result.success && result.data) {
      setStats(result.data);
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleCopy = async () => {
    if (!accessUrl || accessState !== "active") return;
    try {
      await navigator.clipboard.writeText(accessUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // no-op
    }
  };

  const refreshAccessData = async () => {
    await onAccessLinkChanged?.();
  };

  const handleRevokeAccess = async () => {
    if (!patientId || accessState !== "active") return;
    if (!window.confirm("Revogar este link agora? O link atual e sessoes abertas deixarao de funcionar.")) {
      return;
    }

    setAccessActionPending("revoke");
    const result = await PatientService.revokeAccessLink(patientId);
    if (result.error) {
      window.alert(result.error);
    } else {
      await auditPatientLinkEvent({
        patientId,
        actionType: "revoke",
        expiresAt: result.data?.access_token_expires_at ?? null,
        linkStatus: "revoked",
        tokenRotated: false,
      });
      await refreshAccessData();
    }
    setAccessActionPending(null);
  };

  const handleRegenerateAccess = async () => {
    if (!patientId) return;
    if (
      !window.confirm(
        "Gerar um novo link de acesso? O link anterior sera invalidado imediatamente."
      )
    ) {
      return;
    }

    setAccessActionPending("regenerate");
    const result = await PatientService.regenerateAccessLink(patientId);
    if (result.error) {
      window.alert(result.error);
    } else {
      await auditPatientLinkEvent({
        patientId,
        actionType: accessToken ? "regenerate" : "generate",
        expiresAt: result.data?.access_token_expires_at ?? null,
        linkStatus: "active",
        tokenRotated: Boolean(accessToken),
      });
      setCopied(false);
      await refreshAccessData();
    }
    setAccessActionPending(null);
  };

  const completionRate =
    stats && stats.totalTasks > 0
      ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
      : 0;

  const availableMonths = Array.from(
    new Set(
      stats?.diaryList?.map((entry) => {
        const date = new Date(entry.created_at ?? new Date().toISOString());
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      }) || []
    )
  ).sort().reverse();

  const formatMonthYear = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    const date = new Date(Number(year), Number(month) - 1, 15);
    const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const filteredDiary =
    stats?.diaryList?.filter((entry) => {
      if (selectedDiaryMonth === "all") return true;
      const date = new Date(entry.created_at ?? new Date().toISOString());
      const entryMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      return entryMonth === selectedDiaryMonth;
    }) || [];

  const accessBadgeClass =
    accessState === "active"
      ? "bg-emerald-100 text-emerald-700"
      : accessState === "revoked"
      ? "bg-rose-100 text-rose-700"
      : accessState === "expired"
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-600";

  const accessBadgeLabel =
    accessState === "active"
      ? "Ativo"
      : accessState === "revoked"
      ? "Revogado"
      : accessState === "expired"
      ? "Expirado"
      : "Indisponivel";

  return (
    <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-[32px] overflow-hidden">
      <CardHeader className="px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-500" />
              Acesso e Engajamento
            </CardTitle>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mt-0.5">
              Portal do Paciente · Monitoramento
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-full text-muted-foreground hover:bg-slate-100"
            onClick={loadStats}
            disabled={loading}
            title="Atualizar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="px-6 pb-6 space-y-5">
        <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="flex items-center gap-3">
            {accessState === "active" ? (
              <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                <UserX className="w-4 h-4 text-amber-600" />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-slate-700">
                {accessState === "active"
                  ? "Link de acesso ativo"
                  : accessState === "revoked"
                  ? "Acesso revogado"
                  : accessState === "expired"
                  ? "Link expirado"
                  : "Sem link de acesso"}
              </p>
              <p className="text-[10px] text-muted-foreground font-medium">
                {accessState === "active"
                  ? "Paciente pode acessar via link + data de nascimento"
                  : accessState === "revoked"
                  ? "Abra um novo link para restaurar o acesso"
                  : accessState === "expired"
                  ? "Regere um novo link para reativar o acesso"
                  : "Defina um access_token no cadastro do paciente"}
              </p>
            </div>
          </div>
          <Badge className={`text-[9px] font-black uppercase tracking-widest px-2 h-5 border-0 ${accessBadgeClass}`}>
            {accessBadgeLabel}
          </Badge>
        </div>

        {dobFormatted && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600/70">
                Senha do Link (Data de Nascimento)
              </p>
              <p className="text-sm font-bold text-amber-800">{dobFormatted}</p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
            Link de Acesso do Paciente
          </p>

          {accessToken ? (
            <div
              className={`flex items-center gap-2 p-3 rounded-2xl overflow-hidden border ${
                accessState === "active"
                  ? "bg-violet-50 border-violet-100"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <Mail
                className={`w-4 h-4 shrink-0 ${
                  accessState === "active" ? "text-violet-500" : "text-slate-400"
                }`}
              />
              <p
                className={`text-xs font-bold flex-1 truncate ${
                  accessState === "active" ? "text-violet-700" : "text-slate-500"
                }`}
              >
                /p/{accessToken.slice(0, 12)}...
              </p>
            </div>
          ) : patientEmail ? (
            <div className="flex items-center gap-2 p-3 rounded-2xl bg-violet-50 border border-violet-100">
              <Mail className="w-4 h-4 text-violet-500 shrink-0" />
              <p className="text-xs font-bold text-violet-700 flex-1 truncate">{patientEmail}</p>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-slate-50 border border-dashed border-slate-200">
              <p className="text-xs text-muted-foreground text-center">Sem token de acesso cadastrado</p>
            </div>
          )}

          {accessTokenExpiresAt && (
            <p className="text-[11px] text-muted-foreground">
              Expira em{" "}
              {new Date(accessTokenExpiresAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}

          {accessUrl && accessState === "active" && (
            <Button
              className={`w-full h-10 rounded-xl font-bold text-sm transition-all ${
                copied
                  ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                  : "bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-200"
              }`}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Link Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar Link de Acesso
                </>
              )}
            </Button>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={handleRegenerateAccess}
              disabled={accessActionPending !== null}
            >
              {accessActionPending === "regenerate" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Regenerar link
            </Button>
            <Button
              variant="outline"
              className="rounded-xl border-rose-200 text-rose-700 hover:bg-rose-50"
              onClick={handleRevokeAccess}
              disabled={accessState !== "active" || accessActionPending !== null}
            >
              {accessActionPending === "revoke" ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <UserX className="w-4 h-4 mr-2" />
              )}
              Revogar acesso
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" />
              Tarefas
            </p>
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground">
                {stats?.completedTasks ?? 0}/{stats?.totalTasks ?? 0} concluidas
              </span>
            )}
          </div>

          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-emerald-500 transition-all duration-700"
              style={{ width: loading ? "0%" : `${completionRate}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              {
                label: "Total",
                filter: "all" as const,
                value: loading ? "—" : String(stats?.totalTasks ?? 0),
                color: "text-slate-700",
                bg: "bg-slate-50 hover:bg-slate-100/80 border border-slate-100",
              },
              {
                label: "Pendentes",
                filter: "pending" as const,
                value: loading ? "—" : String(stats?.pendingTasks ?? 0),
                color: "text-amber-600",
                bg: "bg-amber-50 hover:bg-amber-100/80 border border-amber-100/60",
              },
              {
                label: "Feitas",
                filter: "completed" as const,
                value: loading ? "—" : String(stats?.completedTasks ?? 0),
                color: "text-emerald-600",
                bg: "bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-100/60",
              },
            ].map((summary) => (
              <button
                key={summary.label}
                disabled={loading || stats?.totalTasks === 0}
                onClick={() => {
                  setTasksFilter(summary.filter);
                  setTasksDialogOpen(true);
                }}
                className={`${summary.bg} rounded-2xl p-3 text-center transition-all duration-200 focus:outline-none hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:hover:scale-100 disabled:cursor-not-allowed`}
              >
                <p className={`text-xl font-black ${summary.color}`}>{summary.value}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                  {summary.label}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 flex items-center gap-1.5">
            <BookHeart className="w-3.5 h-3.5" />
            Diario de Emocoes
          </p>

          {loading ? (
            <div className="h-12 rounded-xl bg-slate-50 animate-pulse" />
          ) : stats?.diaryEntriesCount === 0 ? (
            <div className="p-3 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center">
              <p className="text-xs text-muted-foreground">Nenhum registro no diario ainda.</p>
            </div>
          ) : (
            <button
              onClick={() => setDiaryDialogOpen(true)}
              className="w-full text-left p-4 rounded-3xl bg-violet-50/80 hover:bg-violet-100/80 border border-violet-100/60 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] space-y-2 group focus:outline-none"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-violet-700 group-hover:text-violet-800">
                  {stats?.diaryEntriesCount} registro
                  {(stats?.diaryEntriesCount ?? 0) !== 1 ? "s" : ""} no diario
                </p>
                {stats?.lastEmotionDate && (
                  <p className="text-[10px] text-violet-500 font-medium">
                    Ultimo: {formatRelDate(stats.lastEmotionDate)}
                  </p>
                )}
              </div>

              {stats?.diaryList && stats.diaryList[0] && (() => {
                const latestEmotion = getDisplayEmotionAndNotes(stats.diaryList[0]);
                return (
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <p className="text-[10px] text-violet-600/70 uppercase tracking-wide font-bold mb-1">
                        Ultima emocao registrada
                      </p>
                      <p className="text-sm font-bold text-violet-800 capitalize flex items-center gap-1.5">
                        <span className="text-base">{latestEmotion.icon}</span>
                        {latestEmotion.label}
                      </p>
                    </div>
                    {stats.lastEmotionIntensity !== null && (
                      <div className="text-center">
                        <p
                          className={`text-2xl font-black ${
                            stats.lastEmotionIntensity <= 3
                              ? "text-emerald-600"
                              : stats.lastEmotionIntensity <= 6
                              ? "text-amber-600"
                              : "text-rose-600"
                          }`}
                        >
                          {stats.lastEmotionIntensity}
                        </p>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">/10</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <p className="text-[9px] text-violet-500 font-bold uppercase tracking-wider text-center pt-1.5 border-t border-violet-200/50 group-hover:text-violet-600">
                Clique para abrir historico completo
              </p>
            </button>
          )}
        </div>
      </CardContent>

      <Dialog open={tasksDialogOpen} onOpenChange={setTasksDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden rounded-[32px] border border-slate-100 bg-white p-4 shadow-2xl sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-violet-500" />
              {tasksFilter === "all" && "Todas as Tarefas"}
              {tasksFilter === "pending" && "Tarefas Pendentes"}
              {tasksFilter === "completed" && "Tarefas Concluidas"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Lista de atividades do paciente para acompanhamento.
            </p>
          </DialogHeader>

          <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {(stats?.tasksList?.filter((task) => {
              if (tasksFilter === "pending") return task.status !== "completed";
              if (tasksFilter === "completed") return task.status === "completed";
              return true;
            }) || []).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold">Nenhuma tarefa nesta categoria.</p>
              </div>
            ) : (
              (stats?.tasksList?.filter((task) => {
                if (tasksFilter === "pending") return task.status !== "completed";
                if (tasksFilter === "completed") return task.status === "completed";
                return true;
              }) || []).map((task) => {
                const categoryKey = (task.category ?? "general") as keyof typeof CATEGORY_META;
                const meta = CATEGORY_META[categoryKey] ?? CATEGORY_META.general;
                const priority = PRIORITY_META[task.priority as keyof typeof PRIORITY_META] ?? {
                  label: "Normal",
                  color: "text-slate-600",
                  bg: "bg-slate-100",
                };
                const isCompleted = task.status === "completed";

                return (
                  <div
                    key={task.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isCompleted ? "bg-slate-50 border-slate-100" : "bg-white border-slate-200 shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-bold text-sm leading-snug ${
                            isCompleted ? "line-through text-slate-400" : "text-slate-800"
                          }`}
                        >
                          {task.title}
                        </p>
                        {task.description && (
                          <p
                            className={`text-xs mt-1 leading-relaxed ${
                              isCompleted ? "text-slate-400" : "text-slate-500"
                            }`}
                          >
                            {task.description}
                          </p>
                        )}
                      </div>
                      <Badge
                        className={`text-[9px] font-black uppercase shrink-0 px-1.5 h-4.5 border-0 ${
                          isCompleted ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {isCompleted ? "Concluida" : "Pendente"}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color} flex items-center gap-1`}
                      >
                        <span className="text-xs">{meta.icon}</span> {meta.label}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${priority.bg} ${priority.color}`}>
                        Prio: {priority.label}
                      </span>
                      {task.completed_at && (
                        <span className="text-[10px] text-slate-400 font-medium flex items-center gap-0.5 ml-auto">
                          <Check className="w-3 h-3 text-emerald-500" /> Feita:{" "}
                          {new Date(task.completed_at!).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={diaryDialogOpen} onOpenChange={setDiaryDialogOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden rounded-[32px] border border-slate-100 bg-white p-4 shadow-2xl sm:max-w-md sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-800 flex items-center gap-2">
              <BookHeart className="w-5 h-5 text-violet-500" />
              Diario de Emocoes
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Registros e anotacoes de sentimentos preenchidos pelo paciente.
            </p>
          </DialogHeader>

          {availableMonths.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none mt-4 -mx-2 px-2">
              <button
                onClick={() => setSelectedDiaryMonth("all")}
                className={`text-[10px] font-extrabold uppercase tracking-wider px-3.5 py-1.5 rounded-full border transition-all shrink-0 ${
                  selectedDiaryMonth === "all"
                    ? "bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-100"
                    : "bg-slate-50 border-slate-200/80 text-slate-500 hover:bg-slate-100"
                }`}
              >
                Todos
              </button>
              {availableMonths.map((month) => (
                <button
                  key={month}
                  onClick={() => setSelectedDiaryMonth(month)}
                  className={`text-[10px] font-extrabold uppercase tracking-wider px-3.5 py-1.5 rounded-full border transition-all shrink-0 ${
                    selectedDiaryMonth === month
                      ? "bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-100"
                      : "bg-slate-50 border-slate-200/80 text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {formatMonthYear(month)}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {filteredDiary.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Smile className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold">Nenhum registro para este mes.</p>
              </div>
            ) : (
              filteredDiary.map((entry) => {
                const emotion = getDisplayEmotionAndNotes(entry);
                const dateStr = new Date(entry.created_at ?? new Date().toISOString()).toLocaleDateString(
                  "pt-BR",
                  {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }
                );

                return (
                  <div
                    key={entry.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-3 shadow-sm hover:border-violet-200 transition-all"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{emotion.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-slate-800 capitalize">{emotion.label}</p>
                          <p className="text-[10px] text-muted-foreground font-medium">{dateStr}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-lg font-black ${
                            entry.intensity <= 3
                              ? "text-emerald-600"
                              : entry.intensity <= 6
                              ? "text-amber-600"
                              : "text-rose-600"
                          }`}
                        >
                          {entry.intensity}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold">/10</span>
                        <p className="text-[8px] uppercase tracking-wider font-extrabold text-slate-400">
                          Intensidade
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {entry.context && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">
                          Contexto: {entry.context}
                        </span>
                      )}
                      {entry.triggers && (
                        <span className="text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          Gatilho: {entry.triggers}
                        </span>
                      )}
                    </div>

                    {entry.coping_strategy && (
                      <p className="text-xs text-slate-600 bg-emerald-50 border border-emerald-100/50 p-2 rounded-xl">
                        <strong className="text-emerald-800">Estrategia usada:</strong>{" "}
                        {entry.coping_strategy}
                      </p>
                    )}

                    {emotion.notes && (
                      <div className="text-xs text-slate-600 bg-white border border-slate-100 p-2.5 rounded-xl italic leading-relaxed">
                        {emotion.notes}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

const EMOTION_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  happy: { label: "Feliz / Alegre", icon: "🙂", color: "text-emerald-600", bg: "bg-emerald-50" },
  sad: { label: "Triste / Chateado", icon: "😢", color: "text-blue-600", bg: "bg-blue-50" },
  anxious: { label: "Ansioso / Tenso", icon: "😰", color: "text-violet-600", bg: "bg-violet-50" },
  angry: { label: "Com Raiva / Bravo", icon: "😠", color: "text-rose-600", bg: "bg-rose-50" },
  fearful: { label: "Com Medo / Assustado", icon: "😨", color: "text-slate-600", bg: "bg-slate-50" },
  surprised: { label: "Surpreso / Chocado", icon: "😲", color: "text-amber-600", bg: "bg-amber-50" },
  disgusted: { label: "Nojo / Revoltado", icon: "🤢", color: "text-emerald-800", bg: "bg-emerald-100" },
  calm: { label: "Calmo / Relaxado", icon: "😌", color: "text-cyan-600", bg: "bg-cyan-50" },
  confused: { label: "Confuso / Perdido", icon: "😕", color: "text-zinc-600", bg: "bg-zinc-50" },
  hopeful: { label: "Esperancoso", icon: "🌱", color: "text-emerald-700", bg: "bg-emerald-50" },
  grateful: { label: "Grato / Gratidao", icon: "🙏", color: "text-amber-700", bg: "bg-amber-50" },
  lonely: { label: "Solitario / So", icon: "👤", color: "text-indigo-600", bg: "bg-indigo-50" },
  frustrated: { label: "Frustrado", icon: "😞", color: "text-orange-600", bg: "bg-orange-50" },
  overwhelmed: {
    label: "Sobrecarregado / Exausto",
    icon: "😫",
    color: "text-pink-600",
    bg: "bg-pink-50",
  },
  content: { label: "Satisfeito", icon: "😋", color: "text-teal-600", bg: "bg-teal-50" },
  other: { label: "Outro", icon: "💭", color: "text-purple-600", bg: "bg-purple-50" },
};

function getDisplayEmotionAndNotes(entry: { emotion: string; notes: string | null }) {
  const emotion = EMOTION_META[entry.emotion] ?? EMOTION_META.other;

  let displayLabel = emotion.label;
  let cleanNotes = entry.notes;

  if (entry.emotion === "other" && entry.notes) {
    const bracketMatch = entry.notes.match(/^\[Sentimento original:\s*([^\]]+)\]\s*(.*)$/i);
    if (bracketMatch) {
      displayLabel = bracketMatch[1];
      cleanNotes = bracketMatch[2].trim() || null;
    } else {
      const plainMatch = entry.notes.match(/^Sentimento original:\s*(.*)$/i);
      if (plainMatch) {
        displayLabel = plainMatch[1];
        cleanNotes = null;
      }
    }
  }

  return {
    label: displayLabel,
    icon: emotion.icon,
    color: emotion.color,
    bg: emotion.bg,
    notes: cleanNotes,
  };
}

const CATEGORY_META: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  general: { label: "Geral", icon: "📋", color: "text-violet-600", bg: "bg-violet-50" },
  homework: { label: "Tarefa", icon: "📝", color: "text-blue-600", bg: "bg-blue-50" },
  reading: { label: "Leitura", icon: "📖", color: "text-cyan-600", bg: "bg-cyan-50" },
  exercise: { label: "Exercicio", icon: "🏃", color: "text-emerald-600", bg: "bg-emerald-50" },
  reflection: { label: "Reflexao", icon: "💭", color: "text-pink-600", bg: "bg-pink-50" },
  behavior_tracking: {
    label: "Automonitoramento",
    icon: "📊",
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
};

const PRIORITY_META = {
  low: { label: "Baixa", color: "text-slate-600", bg: "bg-slate-100" },
  medium: { label: "Media", color: "text-amber-700", bg: "bg-amber-100" },
  high: { label: "Alta", color: "text-rose-700", bg: "bg-rose-100" },
};
