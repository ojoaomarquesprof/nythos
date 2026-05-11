"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileText, ListTodo } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import type { AnamnesisResponse, Patient, PatientTask } from "@/types/database";

type WorkItem = {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  meta: string;
  tone: "task" | "anamnesis";
  date?: string | null;
};

function formatShortDate(date?: string | null) {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  }).format(new Date(date));
}

export function DashboardWorklist() {
  const { therapistId } = useSubscription();
  const supabase = createClient();
  const [tasks, setTasks] = useState<PatientTask[]>([]);
  const [anamnesis, setAnamnesis] = useState<AnamnesisResponse[]>([]);
  const [patients, setPatients] = useState<Array<Pick<Patient, "id" | "full_name">>>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (therapistId) {
      loadWorklist();
    }
  }, [therapistId]);

  async function loadWorklist() {
    setLoading(true);
    setHasError(false);

    try {
      const [tasksRes, anamnesisRes] = await Promise.all([
        supabase
          .from("patient_tasks")
          .select("*")
          .not("status", "in", '("completed","cancelled")')
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("anamnesis_responses")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (tasksRes.error || anamnesisRes.error) {
        throw new Error("Failed to load worklist");
      }

      const taskRows = tasksRes.data || [];
      const anamnesisRows = anamnesisRes.data || [];
      const patientIds = [
        ...new Set([
          ...taskRows.map((task) => task.patient_id),
          ...anamnesisRows.map((response) => response.patient_id),
        ]),
      ];

      let patientRows: Array<Pick<Patient, "id" | "full_name">> = [];
      if (patientIds.length > 0) {
        const { data, error } = await supabase
          .from("patients")
          .select("id, full_name")
          .in("id", patientIds);

        if (error) throw error;
        patientRows = data || [];
      }

      setTasks(taskRows);
      setAnamnesis(anamnesisRows);
      setPatients(patientRows);
    } catch {
      console.error("[dashboard-worklist] Failed to load worklist");
      setHasError(true);
      setTasks([]);
      setAnamnesis([]);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }

  const patientNameById = useMemo(() => {
    return new Map(patients.map((patient) => [patient.id, patient.full_name]));
  }, [patients]);

  const items: WorkItem[] = useMemo(() => {
    const taskItems = tasks.map((task) => ({
      id: `task-${task.id}`,
      patientId: task.patient_id,
      patientName: patientNameById.get(task.patient_id) || "Paciente",
      title: task.title,
      meta: task.due_date ? `Prazo ${formatShortDate(task.due_date)}` : "Tarefa pendente",
      tone: "task" as const,
      date: task.due_date || task.created_at,
    }));

    const anamnesisItems = anamnesis.map((response) => ({
      id: `anamnesis-${response.id}`,
      patientId: response.patient_id,
      patientName: patientNameById.get(response.patient_id) || "Paciente",
      title: "Anamnese aguardando resposta",
      meta: response.created_at ? `Enviada ${formatShortDate(response.created_at)}` : "Solicitação pendente",
      tone: "anamnesis" as const,
      date: response.created_at,
    }));

    return [...taskItems, ...anamnesisItems]
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
      .slice(0, 5);
  }, [anamnesis, patientNameById, tasks]);

  return (
    <Card className="animate-fade-in border-border/70 bg-card/95 py-0 shadow-[0_16px_42px_rgba(41,31,67,0.08)]">
      <CardHeader className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Atenção clínica
            </CardTitle>
            <p className="text-sm text-muted-foreground">Tarefas e anamneses pendentes.</p>
          </div>
          <div className="flex size-9 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
            <ClipboardCheck className="size-4" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl border border-border/50 p-3">
                <div className="size-9 animate-pulse rounded-xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : hasError ? (
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 text-sm text-muted-foreground">
            Não foi possível carregar pendências agora.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/40 p-5 text-center">
            <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
              <ClipboardCheck className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Nenhuma pendência clínica</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tarefas e anamneses estão em dia.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = item.tone === "task" ? ListTodo : FileText;

              return (
                <Link
                  key={item.id}
                  href={`/dashboard/patients/${item.patientId}`}
                  className="flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all hover:border-emerald-200 hover:bg-emerald-50/35"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl ring-1",
                      item.tone === "task"
                        ? "bg-primary/10 text-primary ring-primary/15"
                        : "bg-emerald-50 text-emerald-700 ring-emerald-100"
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{item.patientName}</p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="hidden shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground sm:inline-flex"
                  >
                    {item.meta}
                  </Badge>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
