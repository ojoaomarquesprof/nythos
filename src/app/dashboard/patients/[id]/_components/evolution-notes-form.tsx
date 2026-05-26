import React from "react";
import { FileText, Download, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime } from "@/lib/constants";
import type { Patient, Session } from "@/types/database";

interface EvolutionNotesFormProps {
  patient: Patient;
  sessions: Session[];
  isExportingPdf: boolean;
  handleExportFullRecord: () => Promise<void>;
  handleExportNotes: () => Promise<void>;
  newNote: string;
  setNewNote: (note: string) => void;
  savingNote: boolean;
  handleAddNote: () => Promise<void>;
}

type SessionWithEvolutionFlag = Session & {
  has_session_evolution?: boolean | null;
};

type EvolutionPayload = {
  notes?: string | null;
  mood_happy_sad?: number | string | null;
};

function parseEvolutionPayload(raw?: string | null): EvolutionPayload {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as EvolutionPayload;
    if (typeof parsed === "string") return { notes: parsed };
  } catch {
    return { notes: raw };
  }

  return { notes: raw };
}

function hasSessionEvolution(session: Session) {
  return Boolean((session as SessionWithEvolutionFlag).has_session_evolution || session.session_notes_encrypted);
}

export function EvolutionNotesForm({
  patient,
  sessions,
  isExportingPdf,
  handleExportFullRecord,
  handleExportNotes,
  newNote,
  setNewNote,
  savingNote,
  handleAddNote,
}: EvolutionNotesFormProps) {
  const completedSessions = sessions.filter((session) => session.status === "completed");
  const completedWithoutEvolution = completedSessions.filter((session) => !hasSessionEvolution(session));
  const sessionEvolutions = sessions.filter(
    (session) => session.status === "completed" && hasSessionEvolution(session)
  );
  const hasPendingSessionEvolution = completedWithoutEvolution.length > 0;

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-white/75 p-4 shadow-sm md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Prontuário e Evolução</h2>
          <p className="text-sm text-muted-foreground">
            Espaço seguro para observações clínicas sensíveis, evolução por sessão e histórico do caso.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            className="h-9 w-full justify-center rounded-2xl border-primary/20 bg-white/80 text-xs font-semibold text-primary hover:bg-primary/5 sm:w-auto"
            onClick={handleExportFullRecord}
            disabled={isExportingPdf}
          >
            <FileText className="w-4 h-4 mr-2 shrink-0" />
            Relatório Completo
          </Button>
          <Button
            variant="outline"
            className="h-9 w-full justify-center rounded-2xl border-primary/20 bg-white/80 text-xs font-semibold text-primary hover:bg-primary/5 sm:w-auto"
            onClick={handleExportNotes}
            disabled={isExportingPdf || !patient.notes_encrypted}
          >
            <Download className="w-4 h-4 mr-2 shrink-0" />
            Exportar Notas
          </Button>
        </div>
      </div>

      <div
        className={
          hasPendingSessionEvolution
            ? "rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 shadow-sm"
            : "rounded-2xl border border-emerald-200/70 bg-emerald-50/60 p-4 shadow-sm"
        }
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
            <FileText className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {hasPendingSessionEvolution
                ? `${completedWithoutEvolution.length} sessão(ões) concluída(s) aguardando evolução`
                : "Prontuário preparado para registros clínicos"}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {hasPendingSessionEvolution
                ? "Abra a sessão correspondente para registrar a evolução com data, contexto e vínculo correto ao atendimento."
                : "Depois de cada atendimento, registre aqui os dados clínicos sensíveis que precisam permanecer no histórico protegido do paciente."}
            </p>
          </div>
        </div>
      </div>

      <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-white/70 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <FileText className="w-5 h-5" />
            Nota geral do paciente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <Textarea
            placeholder="Registre uma nota geral do prontuário. Para evolução de uma sessão específica, abra a sessão concluída e registre com o vínculo correto..."
            className="min-h-[150px] resize-none rounded-2xl border-border/70 bg-white/80 p-4 text-sm leading-relaxed transition-all focus:bg-white"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
          />
          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-[11px] font-bold uppercase tracking-widest">Criptografia de ponta-a-ponta ativa</p>
            </div>
            <Button
              className="h-10 rounded-2xl px-6 font-semibold shadow-primary/20"
              disabled={!newNote.trim() || savingNote}
              onClick={handleAddNote}
            >
              {savingNote ? "Salvando..." : "ADICIONAR NOTA"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-6">
            <History className="w-5 h-5 text-primary/40" />
            <h3 className="text-sm font-black text-primary/40 uppercase tracking-widest">Linha do Tempo de Evolução</h3>
          </div>
          
          <div className="space-y-6">
            {/* Notas Manuais */}
            {patient.notes_encrypted && (
              <div className="space-y-2">
                <p className="ml-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-teal-700">Observações gerais</p>
                <pre className="whitespace-pre-wrap rounded-2xl border border-border/70 bg-white/80 p-5 font-sans text-sm font-medium leading-relaxed text-slate-700">
                  {patient.notes_encrypted}
                </pre>
              </div>
            )}

            {/* Evoluções de Sessão */}
            {sessionEvolutions.map(session => {
              const evolution = parseEvolutionPayload(session.session_notes_encrypted);
              const evolutionText = evolution.notes || session.session_notes_encrypted || "";

              return (
                <div key={session.id} className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between ml-4">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                      Sessão em {formatDate(session.scheduled_at)} às {formatTime(session.scheduled_at)}
                    </p>
                    {evolution.mood_happy_sad && (
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 text-[9px] font-black uppercase">
                          Humor: {evolution.mood_happy_sad}/10
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-white/80 p-5 shadow-sm">
                    <p className="text-sm leading-relaxed font-medium text-slate-700">
                      {evolutionText}
                    </p>
                  </div>
                </div>
              );
            })}

            {!patient.notes_encrypted && sessionEvolutions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border/70 bg-white/70 px-5 py-10 text-center">
                <FileText className="mx-auto mb-3 size-9 text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">
                  {hasPendingSessionEvolution ? "Sessão concluída aguardando evolução." : "Nenhuma evolução registrada ainda."}
                </p>
                <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
                  {hasPendingSessionEvolution
                    ? "Use a sessão concluída como ponto de partida para registrar observações clínicas com segurança e contexto."
                    : "Após a primeira sessão, use este espaço para registrar a evolução clínica com segurança e contexto."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
