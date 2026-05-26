import React from "react";
import { Calendar, CheckCircle2, ChevronRight, Clock, Download, FileText, Undo2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate, formatTime, SESSION_STATUS, SESSION_TYPES } from "@/lib/constants";
import type { Session } from "@/types/database";

interface SessionListProps {
  sessions: Session[];
  isExportingPdf: boolean;
  isSaving: boolean;
  handleExportSessions: () => Promise<void>;
  handleCompleteSession: (session: Session) => Promise<boolean>;
  handleReverseCompletedSession: (session: Session) => Promise<boolean>;
  onViewSession: (session: Session) => void;
  setRescheduleSession: (session: Session | null) => void;
  setRescheduleDate: (date: string) => void;
  setRescheduleTime: (time: string) => void;
  setShowRescheduleModal: (show: boolean) => void;
  setCancellingSession: (session: Session | null) => void;
  setShowCancelSeriesModal: (show: boolean) => void;
}

type SessionWithEvolutionFlag = Session & {
  has_session_evolution?: boolean | null;
};

export function SessionList({
  sessions,
  isExportingPdf,
  isSaving,
  handleExportSessions,
  handleCompleteSession,
  handleReverseCompletedSession,
  onViewSession,
  setRescheduleSession,
  setRescheduleDate,
  setRescheduleTime,
  setShowRescheduleModal,
  setCancellingSession,
  setShowCancelSeriesModal,
}: SessionListProps) {
  return (
    <>
      <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-white/75 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Sessões</h2>
          <p className="text-sm text-muted-foreground">
            Atendimentos agendados, realizados e históricos deste paciente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-9 rounded-2xl bg-white/80"
          onClick={handleExportSessions}
          disabled={isExportingPdf || sessions.length === 0}
        >
          <Download className="size-4" />
          Exportar PDF
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card className="rounded-3xl border border-dashed border-border/80 bg-white/70 shadow-none">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Clock className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhuma sessão registrada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Agende a primeira sessão para conectar agenda, evolução e financeiro deste caso.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {sessions.map((session: Session) => {
            const statusCfg = SESSION_STATUS[session.status as keyof typeof SESSION_STATUS] || SESSION_STATUS.scheduled;
            const canManageScheduledSession = session.status === "scheduled";
            const canReverseCompletedSession = session.status === "completed";
            const hasEvolution = Boolean(
              (session as SessionWithEvolutionFlag).has_session_evolution || session.session_notes_encrypted
            );
            return (
              <Card key={session.id} className="rounded-2xl border border-border/70 bg-white/85 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">
                          {formatDate(session.scheduled_at, {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          })}
                        </p>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
                          <Clock className="size-3.5" />
                          {formatTime(session.scheduled_at)}
                        </span>
                        <Badge className={cn("h-5 rounded-full text-[10px] font-semibold", statusCfg.color)}>
                          <span className={cn("mr-1 size-1.5 rounded-full", statusCfg.dot)} />
                          {statusCfg.label}
                        </Badge>
                        {session.status === "completed" && (
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 rounded-full text-[10px] font-semibold",
                              hasEvolution
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            )}
                          >
                            {hasEvolution ? "Evolução registrada" : "Evolução pendente"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {session.duration_minutes} min · {SESSION_TYPES[session.session_type as keyof typeof SESSION_TYPES]?.label || "Tipo nao informado"}
                        {session.session_price != null && ` · ${formatCurrency(session.session_price)}`}
                      </p>
                      {session.status === "completed" && (
                        <div
                          className={cn(
                            "mt-3 flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-relaxed",
                            hasEvolution
                              ? "border-emerald-200/80 bg-emerald-50/70 text-emerald-800"
                              : "border-amber-200/80 bg-amber-50/70 text-amber-800"
                          )}
                        >
                          <FileText className="mt-0.5 size-3.5 shrink-0" />
                          <p>
                            <span className="font-semibold">
                              {hasEvolution ? "Evolução em ordem." : "Evolução clínica pendente."}
                            </span>{" "}
                            {hasEvolution
                              ? "Este atendimento já tem registro vinculado ao prontuário."
                              : "Registre a evolução no prontuário para manter o histórico clínico completo."}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:flex-nowrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl border-border/70 bg-white text-xs text-foreground hover:bg-slate-50"
                        onClick={() => onViewSession(session)}
                      >
                        <ChevronRight className="size-3.5" />
                        Detalhes
                      </Button>
                      {canManageScheduledSession && (
                        <Button
                          size="sm"
                          className="h-8 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                          onClick={() => handleCompleteSession(session)}
                          disabled={isSaving}
                        >
                          <CheckCircle2 className="size-3.5" />
                          Concluir sessão
                        </Button>
                      )}
                      {canReverseCompletedSession && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-xl border-amber-200 bg-white text-xs text-amber-700 hover:bg-amber-50"
                          onClick={() => handleReverseCompletedSession(session)}
                          disabled={isSaving}
                        >
                          <Undo2 className="size-3.5" />
                          Desfazer
                        </Button>
                      )}
                      {canManageScheduledSession && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl border-primary/20 bg-white text-xs text-primary hover:bg-primary/5"
                        onClick={() => {
                          setRescheduleSession(session);
                          const date = new Date(session.scheduled_at);
                          setRescheduleDate(date.toISOString().split("T")[0]);
                          setRescheduleTime(date.toTimeString().slice(0, 5));
                          setShowRescheduleModal(true);
                        }}
                        disabled={isSaving}
                      >
                        <Calendar className="size-3.5" />
                        Remarcar
                      </Button>
                      )}
                      {canManageScheduledSession && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-xl border-rose-200 bg-white text-xs text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          setCancellingSession(session);
                          setShowCancelSeriesModal(true);
                        }}
                        disabled={isSaving}
                      >
                        <X className="size-3.5" />
                        Cancelar
                      </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
