"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCheck,
  CircleDollarSign,
  FileText,
  Loader2,
  Search,
  UserRound,
  Wallet,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCurrency, formatDate, formatTime, getGreeting, SESSION_STATUS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import type { CashFlow, Patient, Profile, Session } from "@/types/database";

type SupabaseBrowserClient = ReturnType<typeof createClient>;
type NotificationChannel = ReturnType<SupabaseBrowserClient["channel"]>;

type HeaderAnamnesisNotification = {
  id: string;
  patient_id: string;
  patients?: {
    full_name?: string | null;
  } | null;
  anamnesis_templates?: {
    title?: string | null;
  } | null;
};

type HeaderPaymentNotification = {
  id: string;
};

type HeaderSearchVariant = "desktop" | "compact";

type HeaderSearchPatient = Pick<Patient, "id" | "full_name" | "email" | "phone" | "status">;

type HeaderSearchSession = Pick<
  Session,
  "id" | "patient_id" | "scheduled_at" | "duration_minutes" | "status" | "session_type"
> & {
  patient?: {
    full_name?: string | null;
  } | null;
};

type HeaderSearchFinance = Pick<
  CashFlow,
  | "id"
  | "patient_id"
  | "session_id"
  | "type"
  | "amount"
  | "description"
  | "category"
  | "status"
  | "due_date"
  | "paid_at"
  | "created_at"
> & {
  patient?: {
    id?: string | null;
    full_name?: string | null;
  } | null;
};

type HeaderSearchResults = {
  patients: HeaderSearchPatient[];
  sessions: HeaderSearchSession[];
  finances: HeaderSearchFinance[];
};

const HEADER_SEARCH_LIMIT = 5;
const HEADER_SEARCH_MIN_CHARS = 2;
const HEADER_SEARCH_DEBOUNCE_MS = 300;
const EMPTY_HEADER_SEARCH_RESULTS: HeaderSearchResults = {
  patients: [],
  sessions: [],
  finances: [],
};

const sessionTypeLabels: Record<string, string> = {
  individual: "Individual",
  couple: "Casal",
  group: "Grupo",
  online: "Online",
  initial_assessment: "Avaliação inicial",
};

const cashFlowStatusLabels: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
};

const cashFlowTypeLabels: Record<string, string> = {
  income: "Receita",
  expense: "Despesa",
};

const patientStatusLabels: Record<string, string> = {
  active: "Ativo",
  inactive: "Inativo",
  archived: "Arquivado",
};

function getPatientStatusLabel(status: string | null | undefined) {
  return status ? patientStatusLabels[status] || status : null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function getSafeLikeTerm(value: string) {
  return value
    .trim()
    .replace(/[%_]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function getSearchDateRange(value: string) {
  const normalized = normalizeSearchText(value);
  const relativeDate = new Date();

  if (normalized === "hoje") {
    relativeDate.setHours(0, 0, 0, 0);
    const end = new Date(relativeDate);
    end.setDate(end.getDate() + 1);
    return { start: relativeDate, end };
  }

  if (normalized === "amanha" || normalized === "amanhã") {
    relativeDate.setDate(relativeDate.getDate() + 1);
    relativeDate.setHours(0, 0, 0, 0);
    const end = new Date(relativeDate);
    end.setDate(end.getDate() + 1);
    return { start: relativeDate, end };
  }

  if (normalized === "ontem") {
    relativeDate.setDate(relativeDate.getDate() - 1);
    relativeDate.setHours(0, 0, 0, 0);
    const end = new Date(relativeDate);
    end.setDate(end.getDate() + 1);
    return { start: relativeDate, end };
  }

  const isoMatch = value.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  const brMatch = value.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/);
  const now = new Date();
  let year: number;
  let month: number;
  let day: number;

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (brMatch) {
    day = Number(brMatch[1]);
    month = Number(brMatch[2]);
    const parsedYear = brMatch[3] ? Number(brMatch[3]) : now.getFullYear();
    year = parsedYear < 100 ? 2000 + parsedYear : parsedYear;
  } else {
    return null;
  }

  const start = new Date(year, month - 1, day);
  if (
    Number.isNaN(start.getTime()) ||
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== day
  ) {
    return null;
  }

  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function getSessionStatusMatches(value: string) {
  const normalized = normalizeSearchText(value);
  const matches: string[] = [];

  if (normalized.includes("agend") || normalized.includes("marcad")) matches.push("scheduled");
  if (normalized.includes("realiz") || normalized.includes("conclu")) matches.push("completed");
  if (normalized.includes("falt")) matches.push("missed");
  if (normalized.includes("cancel")) matches.push("cancelled");

  return matches;
}

function getSessionTypeMatches(value: string) {
  const normalized = normalizeSearchText(value);
  const matches: string[] = [];

  if (normalized.includes("individual")) matches.push("individual");
  if (normalized.includes("casal")) matches.push("couple");
  if (normalized.includes("grupo")) matches.push("group");
  if (normalized.includes("online")) matches.push("online");
  if (normalized.includes("avali")) matches.push("initial_assessment");

  return matches;
}

function getCashFlowStatusMatches(value: string) {
  const normalized = normalizeSearchText(value);
  const matches: string[] = [];

  if (normalized.includes("pend") || normalized.includes("abert") || normalized.includes("vencid")) {
    matches.push("pending");
  }
  if (normalized.includes("confirm") || normalized.includes("pag") || normalized.includes("recebid")) {
    matches.push("confirmed");
  }
  if (normalized.includes("cancel")) matches.push("cancelled");

  return matches;
}

function getCashFlowTypeMatches(value: string) {
  const normalized = normalizeSearchText(value);
  const matches: string[] = [];

  if (normalized.includes("receita") || normalized.includes("entrada") || normalized.includes("receb")) {
    matches.push("income");
  }
  if (normalized.includes("despesa") || normalized.includes("saida") || normalized.includes("saída")) {
    matches.push("expense");
  }

  return matches;
}

function getPatientSubtitle(patient: HeaderSearchPatient) {
  return [patient.email, patient.phone].filter(Boolean).join(" · ") || "Abrir prontuário";
}

function getSessionTitle(session: HeaderSearchSession) {
  return session.patient?.full_name || "Sessão clínica";
}

function getSessionMeta(session: HeaderSearchSession) {
  const statusLabel =
    SESSION_STATUS[session.status as keyof typeof SESSION_STATUS]?.label || session.status || "Status não informado";
  const sessionType = session.session_type ? sessionTypeLabels[session.session_type] || session.session_type : null;
  const parts = [`${formatDate(session.scheduled_at, { year: "numeric" })} às ${formatTime(session.scheduled_at)}`];

  if (sessionType) parts.push(sessionType);
  parts.push(statusLabel);

  return parts.join(" · ");
}

function getFinanceTitle(transaction: HeaderSearchFinance) {
  return transaction.description || "Lançamento financeiro";
}

function getFinanceMeta(transaction: HeaderSearchFinance) {
  const status = cashFlowStatusLabels[transaction.status] || transaction.status;
  const type = cashFlowTypeLabels[transaction.type] || transaction.type;
  const dateLabel = transaction.due_date
    ? `Vence ${formatDate(transaction.due_date, { year: "numeric" })}`
    : transaction.paid_at
      ? `Pago em ${formatDate(transaction.paid_at, { year: "numeric" })}`
      : "Sem data";
  const patientName = transaction.patient?.full_name;

  return [type, status, dateLabel, patientName].filter(Boolean).join(" · ");
}

async function searchHeaderPatients(
  supabase: SupabaseBrowserClient,
  ownerUserId: string,
  term: string
): Promise<HeaderSearchPatient[]> {
  const safeTerm = getSafeLikeTerm(term);
  const safePattern = safeTerm ? `%${safeTerm}%` : null;
  const digits = digitsOnly(term).slice(0, 20);
  const digitPattern = digits.length >= HEADER_SEARCH_MIN_CHARS ? `%${digits.split("").join("%")}%` : null;
  const patientSelect = "id, full_name, email, phone, status";
  const patientQueries = [
    ...(safePattern
      ? [
          supabase
            .from("patients")
            .select(patientSelect)
            .eq("user_id", ownerUserId)
            .ilike("full_name", safePattern)
            .order("full_name", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
          supabase
            .from("patients")
            .select(patientSelect)
            .eq("user_id", ownerUserId)
            .ilike("email", safePattern)
            .order("full_name", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
          supabase
            .from("patients")
            .select(patientSelect)
            .eq("user_id", ownerUserId)
            .ilike("phone", safePattern)
            .order("full_name", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
    ...(digitPattern
      ? [
          supabase
            .from("patients")
            .select(patientSelect)
            .eq("user_id", ownerUserId)
            .ilike("phone", digitPattern)
            .order("full_name", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
  ];

  if (patientQueries.length === 0) return [];

  const responses = await Promise.all(patientQueries);
  const firstError = responses.find((response) => response.error)?.error;
  if (firstError) throw firstError;

  return uniqueById(
    responses.flatMap((response) => (response.data ?? []) as HeaderSearchPatient[])
  ).slice(0, HEADER_SEARCH_LIMIT);
}

async function searchHeaderSessions(
  supabase: SupabaseBrowserClient,
  ownerUserId: string,
  term: string,
  patientIds: string[]
): Promise<HeaderSearchSession[]> {
  const dateRange = getSearchDateRange(term);
  const statusMatches = getSessionStatusMatches(term);
  const typeMatches = getSessionTypeMatches(term);
  const now = new Date();
  const recentStart = new Date(now);
  recentStart.setDate(recentStart.getDate() - 30);
  const statusStart = statusMatches.some((status) => status === "completed" || status === "missed" || status === "cancelled")
    ? recentStart
    : now;
  const sessionSelect = "id, patient_id, scheduled_at, duration_minutes, status, session_type, patient:patients(full_name)";
  const sessionQueries = [
    ...(patientIds.length
      ? [
          supabase
            .from("sessions")
            .select(sessionSelect)
            .eq("user_id", ownerUserId)
            .in("patient_id", patientIds)
            .gte("scheduled_at", now.toISOString())
            .not("status", "eq", "cancelled")
            .order("scheduled_at", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
    ...(dateRange
      ? [
          supabase
            .from("sessions")
            .select(sessionSelect)
            .eq("user_id", ownerUserId)
            .gte("scheduled_at", dateRange.start.toISOString())
            .lt("scheduled_at", dateRange.end.toISOString())
            .not("status", "eq", "cancelled")
            .order("scheduled_at", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
    ...(statusMatches.length
      ? [
          supabase
            .from("sessions")
            .select(sessionSelect)
            .eq("user_id", ownerUserId)
            .in("status", statusMatches)
            .gte("scheduled_at", statusStart.toISOString())
            .order("scheduled_at", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
    ...(typeMatches.length
      ? [
          supabase
            .from("sessions")
            .select(sessionSelect)
            .eq("user_id", ownerUserId)
            .in("session_type", typeMatches)
            .gte("scheduled_at", now.toISOString())
            .not("status", "eq", "cancelled")
            .order("scheduled_at", { ascending: true })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
  ];

  if (sessionQueries.length === 0) return [];

  const responses = await Promise.all(sessionQueries);
  const firstError = responses.find((response) => response.error)?.error;
  if (firstError) throw firstError;

  return uniqueById(
    responses.flatMap((response) => (response.data ?? []) as HeaderSearchSession[])
  )
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, HEADER_SEARCH_LIMIT);
}

async function searchHeaderFinances(
  supabase: SupabaseBrowserClient,
  ownerUserId: string,
  term: string,
  patientIds: string[]
): Promise<HeaderSearchFinance[]> {
  const safeTerm = getSafeLikeTerm(term);
  const safePattern = safeTerm ? `%${safeTerm}%` : null;
  const statusMatches = getCashFlowStatusMatches(term);
  const typeMatches = getCashFlowTypeMatches(term);
  const financeSelect = `
    id,
    patient_id,
    session_id,
    type,
    amount,
    description,
    category,
    status,
    due_date,
    paid_at,
    created_at,
    patient:patients(id, full_name)
  `;
  const financeQueries = [
    ...(safePattern
      ? [
          supabase
            .from("cash_flow")
            .select(financeSelect)
            .eq("user_id", ownerUserId)
            .ilike("description", safePattern)
            .order("created_at", { ascending: false })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
    ...(patientIds.length
      ? [
          supabase
            .from("cash_flow")
            .select(financeSelect)
            .eq("user_id", ownerUserId)
            .in("patient_id", patientIds)
            .order("created_at", { ascending: false })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
    ...(statusMatches.length
      ? [
          supabase
            .from("cash_flow")
            .select(financeSelect)
            .eq("user_id", ownerUserId)
            .in("status", statusMatches)
            .order("created_at", { ascending: false })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
    ...(typeMatches.length
      ? [
          supabase
            .from("cash_flow")
            .select(financeSelect)
            .eq("user_id", ownerUserId)
            .in("type", typeMatches)
            .order("created_at", { ascending: false })
            .limit(HEADER_SEARCH_LIMIT),
        ]
      : []),
  ];

  if (financeQueries.length === 0) return [];

  const responses = await Promise.all(financeQueries);
  const firstError = responses.find((response) => response.error)?.error;
  if (firstError) throw firstError;

  return uniqueById(
    responses.flatMap((response) => (response.data ?? []) as HeaderSearchFinance[])
  )
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, HEADER_SEARCH_LIMIT);
}

async function runHeaderSearch(
  supabase: SupabaseBrowserClient,
  ownerUserId: string,
  term: string
): Promise<HeaderSearchResults> {
  const patients = await searchHeaderPatients(supabase, ownerUserId, term);
  const patientIds = patients.map((patient) => patient.id);
  const [sessions, finances] = await Promise.all([
    searchHeaderSessions(supabase, ownerUserId, term, patientIds),
    searchHeaderFinances(supabase, ownerUserId, term, patientIds),
  ]);

  return { patients, sessions, finances };
}

function readDismissedNotifications() {
  try {
    const saved = localStorage.getItem("dismissed_notifications");
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function HeaderSearchMessage({
  icon,
  title,
  description,
  tone = "muted",
}: {
  icon: ReactNode;
  title: string;
  description: string;
  tone?: "muted" | "error";
}) {
  return (
    <div className="px-5 py-10 text-center">
      <div
        className={cn(
          "mx-auto flex h-12 w-12 items-center justify-center rounded-2xl",
          tone === "error" ? "bg-rose-50 text-rose-600" : "bg-primary/10 text-primary"
        )}
      >
        {icon}
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function HeaderSearchSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-3 rounded-2xl px-3 py-2.5">
          <div className="h-10 w-10 rounded-2xl bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/2 rounded-full bg-muted" />
            <div className="h-3 w-2/3 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HeaderSearchGroup({
  title,
  count,
  icon,
  children,
}: {
  title: string;
  count: number;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1">
      <div className="flex items-center justify-between px-3 pb-1 pt-3">
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          {icon}
          {title}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
          {count}
        </span>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function HeaderSearchResultLink({
  href,
  icon,
  title,
  meta,
  badge,
  amount,
  onSelect,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  meta: string;
  badge?: string | null;
  amount?: string | null;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      className="group flex items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-all duration-200 hover:border-border/70 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-sm ring-1 ring-border/70">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {badge && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>
      </div>
      {amount ? (
        <span className="hidden shrink-0 text-xs font-bold text-foreground sm:block">{amount}</span>
      ) : (
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
      )}
    </Link>
  );
}

function HeaderGlobalSearch({
  supabase,
  ownerUserId,
  variant,
}: {
  supabase: SupabaseBrowserClient;
  ownerUserId: string | null;
  variant: HeaderSearchVariant;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<HeaderSearchResults>(EMPTY_HEADER_SEARCH_RESULTS);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const trimmedQuery = query.trim();
  const canSearch = trimmedQuery.length >= HEADER_SEARCH_MIN_CHARS;
  const waitingForAccess = canSearch && !ownerUserId;
  const totalResults = results.patients.length + results.sessions.length + results.finances.length;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) requestRef.current += 1;
    setOpen(nextOpen);
  };

  const handleQueryChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextQuery = event.target.value;
    const nextCanSearch = nextQuery.trim().length >= HEADER_SEARCH_MIN_CHARS;

    requestRef.current += 1;
    setQuery(nextQuery);
    setError(null);

    if (!nextCanSearch) {
      setLoading(false);
      setResults(EMPTY_HEADER_SEARCH_RESULTS);
      return;
    }

    if (ownerUserId && open) {
      setLoading(true);
    }
  };

  useEffect(() => {
    if (!open) {
      requestRef.current += 1;
      return;
    }

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open || !canSearch || !ownerUserId) {
      requestRef.current += 1;
      let cancelled = false;

      queueMicrotask(() => {
        if (cancelled) return;
        setLoading(false);
        setError(null);
        if (!canSearch) setResults(EMPTY_HEADER_SEARCH_RESULTS);
      });

      return () => {
        cancelled = true;
      };
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);

      void runHeaderSearch(supabase, ownerUserId, trimmedQuery)
        .then((nextResults) => {
          if (requestRef.current !== requestId) return;
          setResults(nextResults);
          setLoading(false);
        })
        .catch(() => {
          if (requestRef.current !== requestId) return;
          setResults(EMPTY_HEADER_SEARCH_RESULTS);
          setError("Não foi possível concluir a busca agora.");
          setLoading(false);
        });
    }, HEADER_SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [canSearch, open, ownerUserId, supabase, trimmedQuery]);

  const handleSelectResult = () => {
    handleOpenChange(false);
  };

  const triggerClassName =
    variant === "desktop"
      ? "group flex h-11 w-full max-w-xl items-center gap-3 rounded-2xl border border-border/70 bg-white/65 px-4 text-left text-sm text-muted-foreground shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-primary/15 hover:bg-white/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
      : "group inline-flex rounded-2xl border border-white/70 bg-white/70 p-2.5 text-muted-foreground shadow-[var(--shadow-sm)] transition-all duration-200 hover:border-primary/15 hover:bg-white/90 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 active:scale-[0.98] lg:hidden";

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button"
        aria-label="Abrir busca global"
        title="Buscar no Nythos"
        className={triggerClassName}
      >
        {variant === "desktop" ? (
          <>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
              <Search className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">Buscar pacientes, sessões e finanças</span>
            <span className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              Buscar
            </span>
          </>
        ) : (
          <Search className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
        )}
      </PopoverTrigger>
      <PopoverContent
        align={variant === "desktop" ? "center" : "end"}
        sideOffset={10}
        className="w-[min(35rem,calc(100vw-1rem))] overflow-hidden rounded-[26px] border-border/70 bg-popover/95 p-0 shadow-[0_24px_70px_rgba(41,31,67,0.16)]"
      >
        <div className="border-b border-border/60 bg-muted/20 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={handleQueryChange}
              placeholder="Busque por paciente, telefone, data ou financeiro..."
              aria-label="Termo da busca global"
              autoComplete="off"
              className="h-11 rounded-2xl border-border/70 bg-white/85 pl-10 pr-4 font-medium shadow-sm"
            />
          </div>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-muted-foreground">
            Resultados limitados por categoria e filtrados pela conta profissional atual.
          </p>
        </div>

        <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-2">
          {!canSearch ? (
            <HeaderSearchMessage
              icon={<Search className="h-5 w-5" />}
              title="Digite para buscar"
              description={`Use pelo menos ${HEADER_SEARCH_MIN_CHARS} caracteres para encontrar pacientes, sessões e lançamentos.`}
            />
          ) : waitingForAccess ? (
            <HeaderSearchMessage
              icon={<Loader2 className="h-5 w-5 animate-spin" />}
              title="Carregando acesso"
              description="A busca começa assim que a sessão profissional estiver pronta."
            />
          ) : loading ? (
            <HeaderSearchSkeleton />
          ) : error ? (
            <HeaderSearchMessage
              icon={<AlertCircle className="h-5 w-5" />}
              title="Busca indisponível"
              description={error}
              tone="error"
            />
          ) : totalResults === 0 ? (
            <HeaderSearchMessage
              icon={<Search className="h-5 w-5" />}
              title="Nenhum resultado encontrado"
              description="Tente outro nome, e-mail, telefone, data ou termo financeiro."
            />
          ) : (
            <div className="space-y-2 pb-2">
              {results.patients.length > 0 && (
                <HeaderSearchGroup
                  title="Pacientes"
                  count={results.patients.length}
                  icon={<UserRound className="h-3.5 w-3.5" />}
                >
                  {results.patients.map((patient) => (
                    <HeaderSearchResultLink
                      key={patient.id}
                      href={`/dashboard/patients/${patient.id}`}
                      icon={<UserRound className="h-5 w-5" />}
                      title={patient.full_name}
                      meta={getPatientSubtitle(patient)}
                      badge={getPatientStatusLabel(patient.status)}
                      onSelect={handleSelectResult}
                    />
                  ))}
                </HeaderSearchGroup>
              )}

              {results.sessions.length > 0 && (
                <HeaderSearchGroup
                  title="Sessões"
                  count={results.sessions.length}
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                >
                  {results.sessions.map((session) => (
                    <HeaderSearchResultLink
                      key={session.id}
                      href={`/dashboard/patients/${session.patient_id}?tab=sessions&sessionId=${session.id}`}
                      icon={<CalendarDays className="h-5 w-5" />}
                      title={getSessionTitle(session)}
                      meta={getSessionMeta(session)}
                      badge={session.duration_minutes ? `${session.duration_minutes} min` : null}
                      onSelect={handleSelectResult}
                    />
                  ))}
                </HeaderSearchGroup>
              )}

              {results.finances.length > 0 && (
                <HeaderSearchGroup
                  title="Financeiro"
                  count={results.finances.length}
                  icon={<CircleDollarSign className="h-3.5 w-3.5" />}
                >
                  {results.finances.map((transaction) => (
                    <HeaderSearchResultLink
                      key={transaction.id}
                      href="/dashboard/finances"
                      icon={<Wallet className="h-5 w-5" />}
                      title={getFinanceTitle(transaction)}
                      meta={getFinanceMeta(transaction)}
                      badge={cashFlowStatusLabels[transaction.status] || transaction.status}
                      amount={formatCurrency(Number(transaction.amount || 0))}
                      onSelect={handleSelectResult}
                    />
                  ))}
                </HeaderSearchGroup>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Header() {
  const { therapistId } = useSubscription();
  const [greeting, setGreeting] = useState("Olá");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionsTodayCount, setSessionsTodayCount] = useState(0);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);
  const [newAnamnesis, setNewAnamnesis] = useState<HeaderAnamnesisNotification[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const [supabase] = useState(() => createClient());
  const channelRef = useRef<NotificationChannel | null>(null);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;
      setGreeting(getGreeting());
      setDismissedNotifications(readDismissedNotifications());
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const saveDismissed = (ids: string[]) => {
    localStorage.setItem("dismissed_notifications", JSON.stringify(ids));
    setDismissedNotifications(ids);
  };

  const loadNotificationData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      if (!profile) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        setProfile(profileData);
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const [sessionsRes, paymentsRes, anamnesisRes] = await Promise.all([
        supabase
          .from("sessions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("scheduled_at", todayStart.toISOString())
          .lte("scheduled_at", todayEnd.toISOString()),
        supabase
          .from("cash_flow")
          .select("*")
          .eq("user_id", user.id)
          .eq("type", "income")
          .eq("status", "pending"),
        supabase
          .from("anamnesis_responses")
          .select("*, patients(full_name), anamnesis_templates!inner(title, user_id)")
          .eq("anamnesis_templates.user_id", user.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      setSessionsTodayCount(sessionsRes.count || 0);

      const savedDismissed = readDismissedNotifications();
      const anamnesisData = ((anamnesisRes.data || []) as HeaderAnamnesisNotification[]).filter(
        (item) => !savedDismissed.includes(`anamnesis-${item.id}`)
      );
      const paymentsData = ((paymentsRes.data || []) as HeaderPaymentNotification[]).filter(
        (item) => !savedDismissed.includes(`payment-${item.id}`)
      );

      setPendingPaymentsCount(paymentsData.length);
      setNewAnamnesis(anamnesisData);
    } catch {
      console.error("[header] Failed to load notifications");
    }
  }, [supabase, profile]);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      void loadNotificationData();

      if (!channelRef.current) {
        const channelName = `header-notifications-${user.id}`;
        channelRef.current = supabase
          .channel(channelName)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "sessions", filter: `user_id=eq.${user.id}` },
            () => loadNotificationData()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "cash_flow", filter: `user_id=eq.${user.id}` },
            () => loadNotificationData()
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "anamnesis_responses" },
            () => loadNotificationData()
          )
          .subscribe();
      }
    };

    init();

    const handleManualRefresh = () => {
      void loadNotificationData();
    };

    window.addEventListener("notifications:refresh", handleManualRefresh);

    return () => {
      window.removeEventListener("notifications:refresh", handleManualRefresh);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [loadNotificationData, supabase]);

  const handleMarkAsRead = () => {
    const newDismissed = [...dismissedNotifications];
    newAnamnesis.forEach((item) => newDismissed.push(`anamnesis-${item.id}`));
    saveDismissed(newDismissed);
    setNewAnamnesis([]);
    setPendingPaymentsCount(0);
  };

  const userName = profile?.full_name || "Psicóloga";
  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const profileMeta = profile?.crp ? `CRP ${profile.crp}` : "Painel profissional";
  const totalNotifications =
    (sessionsTodayCount > 0 ? 1 : 0) +
    (pendingPaymentsCount > 0 ? 1 : 0) +
    newAnamnesis.length;

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/75 shadow-[0_10px_28px_rgba(41,31,67,0.05)] supports-backdrop-filter:backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-2.5 md:gap-3 md:px-6 md:py-4">
        <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/65 shadow-[var(--shadow-sm)] md:hidden">
            <Image
              src="/logo-icon.png"
              alt="Nythos Logo"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase leading-none tracking-[0.16em] text-primary/55 md:text-[11px] md:tracking-[0.2em]">
                {greeting}
              </span>
              <span className="hidden h-2 w-2 rounded-full bg-accent shadow-[0_0_0_6px_rgba(134,181,160,0.12)] sm:inline-flex" />
            </div>
            <h2 className="mt-1 truncate text-base font-bold leading-tight tracking-tight text-foreground sm:text-lg md:text-xl">
              {userName}
            </h2>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Seu espaço clínico com visão clara do dia.
            </p>
          </div>
        </div>

        <div className="hidden flex-1 items-center justify-center px-2 lg:flex">
          <HeaderGlobalSearch supabase={supabase} ownerUserId={therapistId} variant="desktop" />
        </div>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <HeaderGlobalSearch supabase={supabase} ownerUserId={therapistId} variant="compact" />

          <Popover>
            <PopoverTrigger className="group relative cursor-pointer rounded-2xl border border-white/70 bg-white/70 p-2.5 text-muted-foreground shadow-[var(--shadow-sm)] outline-none transition-all duration-200 hover:border-primary/15 hover:bg-white/90 hover:text-primary focus-visible:ring-4 focus-visible:ring-ring/20 active:scale-[0.98]">
              <Bell className="h-5 w-5 transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110" />
              {totalNotifications > 0 && (
                <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-white bg-primary px-0 text-[9px] font-black text-white shadow-[var(--shadow-sm)]">
                  {totalNotifications}
                </Badge>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={10}
              className="w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-[26px] border-border/70 bg-popover/95 p-0"
            >
              <PopoverHeader className="flex flex-row items-center justify-between border-b border-border/60 bg-muted/25 px-4 py-3">
                <div>
                  <PopoverTitle className="text-sm font-semibold">Notificações</PopoverTitle>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Alertas importantes do seu dia.
                  </p>
                </div>
                {totalNotifications > 0 && (
                  <button
                    onClick={handleMarkAsRead}
                    className="flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/10 hover:text-primary/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  >
                    <CheckCheck className="h-3 w-3" />
                    Limpar
                  </button>
                )}
              </PopoverHeader>

              <div className="max-h-[420px] space-y-1 overflow-y-auto p-2">
                {totalNotifications === 0 ? (
                  <div className="space-y-2 py-10 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground/40">
                      <Bell className="h-6 w-6" />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">
                      Nenhuma nova notificação
                    </p>
                    <p className="text-[11px] text-muted-foreground/75">
                      Tudo em dia por aqui.
                    </p>
                  </div>
                ) : (
                  <>
                    {sessionsTodayCount > 0 && (
                      <Link
                        href="/dashboard/schedule"
                        className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all duration-200 hover:border-border/60 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                          <CalendarDays className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">Sessões de Hoje</p>
                          <p className="text-[11px] text-muted-foreground">
                            Você tem {sessionsTodayCount}{" "}
                            {sessionsTodayCount === 1
                              ? "sessão agendada"
                              : "sessões agendadas"}{" "}
                            para hoje.
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    )}

                    {newAnamnesis.map((item) => (
                      <Link
                        key={item.id}
                        href={`/dashboard/patients/${item.patient_id}?tab=anamnesis`}
                        className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all duration-200 hover:border-border/60 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/30 text-accent-foreground">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">Anamnese Preenchida</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {item.patients?.full_name} preencheu: {item.anamnesis_templates?.title}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    ))}

                    {pendingPaymentsCount > 0 && (
                      <Link
                        href="/dashboard/finances"
                        className="group flex items-center gap-3 rounded-2xl border border-transparent p-3 transition-all duration-200 hover:border-border/60 hover:bg-muted/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-warning/40 text-warning-foreground">
                          <Wallet className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold">Pagamentos Pendentes</p>
                          <p className="text-[11px] text-muted-foreground">
                            {pendingPaymentsCount}{" "}
                            {pendingPaymentsCount === 1
                              ? "recebimento pendente"
                              : "recebimentos pendentes"}{" "}
                            a confirmar.
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                      </Link>
                    )}
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <div className="hidden items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-2 shadow-[var(--shadow-sm)] md:flex">
            <Avatar className="h-10 w-10 ring-2 ring-primary/10">
              {profile?.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />
              )}
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold text-foreground">{userName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{profileMeta}</p>
            </div>
          </div>

          <Avatar className="h-9 w-9 ring-2 ring-primary/20 md:hidden">
            {profile?.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={profile.full_name || ""} />
            )}
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
