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
  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-white/75 p-4 shadow-sm md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Prontuário e Evolução</h2>
          <p className="text-sm text-muted-foreground">Registro de notas de evolução e histórico clínico do paciente.</p>
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

      <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden">
        <CardHeader className="border-b border-border/60 bg-white/70 pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
            <FileText className="w-5 h-5" />
            Nova Nota de Evolução
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <Textarea
            placeholder="Registre a evolução do paciente nesta sessão..."
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
            {sessions.filter(s => s.status === "completed" && s.session_notes_encrypted).map(session => {
              let evolution: any = null;
              try {
                evolution = JSON.parse(session.session_notes_encrypted || "{}");
              } catch (e) {
                evolution = { notes: session.session_notes_encrypted };
              }

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
                      {evolution.notes || evolution}
                    </p>
                  </div>
                </div>
              );
            })}

            {!patient.notes_encrypted && sessions.filter(s => s.status === "completed" && s.session_notes_encrypted).length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-10">Nenhum registro de evolução encontrado.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
