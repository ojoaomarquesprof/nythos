"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleDollarSign,
  Clock3,
  FileText,
  Info,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Unlink,
  UserRound,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatCurrency, formatTime } from "@/lib/constants";
import { cancelScheduleSession, completeScheduleSession, createScheduleSessions } from "@/app/actions/schedule-sessions";
import {
  SESSION_PACKAGE_SCHEDULE_BLOCK_MESSAGES,
  getSessionPackagePaymentStatusLabel,
  getSessionPackageScheduleBlockReason,
} from "@/services/session-package-rules";
import { useCalendarSync } from "./_hooks/use-calendar-sync";
import { useScheduleData } from "./_hooks/use-schedule-data";

const DAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
const MINI_DAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const TIMELINE_START_HOUR = 7;
const TIMELINE_END_HOUR = 21;
const SLOT_HEIGHT = 76;

const sessionTypeLabels: Record<string, string> = {
  individual: "Individual",
  couple: "Casal",
  group: "Grupo",
  online: "Online",
  initial_assessment: "Avaliação inicial",
};

const locationLabels: Record<string, string> = {
  office: "Presencial",
  online: "Online",
};

const statusStyles: Record<string, { card: string; badge: string; dot: string }> = {
  scheduled: {
    card: "border-violet-200 bg-violet-50/95 text-violet-950 shadow-violet-950/5",
    badge: "border-violet-200 bg-white/75 text-violet-700",
    dot: "bg-violet-500",
  },
  completed: {
    card: "border-emerald-200 bg-emerald-50/95 text-emerald-950 shadow-emerald-950/5",
    badge: "border-emerald-200 bg-white/75 text-emerald-700",
    dot: "bg-emerald-500",
  },
  missed: {
    card: "border-rose-200 bg-rose-50/95 text-rose-950 shadow-rose-950/5",
    badge: "border-rose-200 bg-white/75 text-rose-700",
    dot: "bg-rose-500",
  },
  rescheduled: {
    card: "border-amber-200 bg-amber-50/95 text-amber-950 shadow-amber-950/5",
    badge: "border-amber-200 bg-white/75 text-amber-700",
    dot: "bg-amber-500",
  },
};

type ScheduleItem = NonNullable<ReturnType<typeof useScheduleData>["selectedSessionDetails"]>;
type SchedulePatient = ReturnType<typeof useScheduleData>["patients"][number];

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function getPatientSecondaryInfo(patient: SchedulePatient) {
  const parts = [
    patient.email?.trim(),
    patient.phone?.trim(),
    patient.cpf?.trim() ? `CPF ${patient.cpf.trim()}` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.slice(0, 2).join(" · ");
}

function formatDateLong(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDateShort(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addSchedulePeriod(date: Date, period: string) {
  const next = new Date(date);
  if (period === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + 7);
  }
  return next;
}

function formatPackageDate(value?: string | null) {
  if (!value) return "Sem validade";
  const date = parseIsoDate(value);
  return date
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : value;
}

function formatWeekdayCompact(date: Date) {
  return date
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "")
    .slice(0, 3)
    .toUpperCase();
}

function getPeriodLabel(view: "day" | "week" | "month", currentDate: Date, visibleDays: Date[]) {
  if (view === "day") return formatDateLong(currentDate);
  if (view === "month") {
    return currentDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
  const first = visibleDays[0];
  const last = visibleDays[visibleDays.length - 1];
  return `${formatDateShort(first)} - ${formatDateShort(last)}`;
}

function getSessionTitle(session: ScheduleItem) {
  return session.is_external_google
    ? session.external_title || "Compromisso Google"
    : session.patient?.full_name || "Sessão clínica";
}

function getSessionSubtitle(session: ScheduleItem) {
  if (session.is_external_google) {
    return session.external_location || "Evento externo";
  }
  return locationLabels[session.location || ""] || session.location || "Local não informado";
}

function getSessionEnd(session: ScheduleItem) {
  const start = new Date(session.scheduled_at);
  const end = session.is_external_google && session.external_ends_at
    ? new Date(session.external_ends_at)
    : new Date(start.getTime() + (session.duration_minutes ?? 50) * 60000);
  return end;
}

function getSessionTimeRange(session: ScheduleItem) {
  return `${formatTime(session.scheduled_at)} - ${formatTime(getSessionEnd(session))}`;
}

function getStatusLabel(session: ScheduleItem) {
  return SESSION_STATUS[session.status as keyof typeof SESSION_STATUS]?.label ?? "Status nao informado";
}

function getSessionTypeLabel(type?: string | null) {
  return sessionTypeLabels[type || ""] || "Tipo nao informado";
}

function getSessionStyle(session: ScheduleItem) {
  if (session.is_external_google) {
    return {
      card: "border-teal-200 bg-teal-50/95 text-teal-950 shadow-teal-950/5",
      badge: "border-teal-200 bg-white/80 text-teal-700",
      dot: "bg-teal-500",
    };
  }

  return statusStyles[session.status] ?? statusStyles.scheduled;
}

function hasSessionEvolution(session: ScheduleItem) {
  if (session.is_external_google) return false;
  return Boolean(session.has_session_evolution || session.session_notes_encrypted);
}

function getEvolutionStatusLabel(session: ScheduleItem) {
  return hasSessionEvolution(session) ? "Evolução registrada" : "Evolução pendente";
}

function isCourtesySession(session: ScheduleItem) {
  if (session.is_external_google) return false;
  if (session.billing_mode === "package" || session.package_id) return false;
  if (session.billing_mode === "free") return true;
  if (session.session_price === null || session.session_price === undefined) return false;
  const amount = Number(session.session_price);
  return Number.isFinite(amount) && amount <= 0;
}

function isPackageSession(session: ScheduleItem) {
  if (session.is_external_google) return false;
  return session.billing_mode === "package" || Boolean(session.package_id);
}

function getBillingStatusLabel(status?: string | null) {
  if (status === "pending") return "Pendente";
  if (status === "confirmed") return "Confirmada";
  if (status === "cancelled") return "Cancelada";
  return null;
}

function FieldShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

function nativeSelectClassName(className?: string) {
  return cn(
    "h-10 w-full rounded-xl border border-border/70 bg-white/80 px-3 text-sm font-medium text-foreground shadow-sm outline-none transition-all",
    "hover:border-primary/20 focus:border-primary/40 focus:bg-white focus:ring-4 focus:ring-primary/10",
    className
  );
}

function PatientCombobox({
  patients,
  selectedPatient,
  value,
  onSelect,
  onCreatePatient,
}: {
  patients: SchedulePatient[];
  selectedPatient: SchedulePatient | null;
  value: string;
  onSelect: (patientId: string) => void;
  onCreatePatient: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();

  const indexedPatients = useMemo(
    () =>
      patients.map((patient) => ({
        patient,
        searchText: normalizeSearchValue(
          [patient.full_name, patient.email, patient.phone, patient.cpf].filter(Boolean).join(" ")
        ),
        digitsText: digitsOnly([patient.phone, patient.cpf].filter(Boolean).join(" ")),
      })),
    [patients]
  );

  const filteredPatients = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(search);
    const digitQuery = digitsOnly(search);

    if (!normalizedQuery && !digitQuery) {
      return patients;
    }

    return indexedPatients
      .filter(({ searchText, digitsText }) => {
        const matchesText = normalizedQuery ? searchText.includes(normalizedQuery) : false;
        const matchesDigits = digitQuery ? digitsText.includes(digitQuery) : false;
        return matchesText || matchesDigits;
      })
      .map(({ patient }) => patient);
  }, [indexedPatients, patients, search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setActiveIndex(0);
      return;
    }

    const selectedIndex = filteredPatients.findIndex((patient) => patient.id === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);

    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [filteredPatients, open, value]);

  function handleSelect(patientId: string) {
    onSelect(patientId);
    setOpen(false);
  }

  function handleTriggerKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSearch("");
      setOpen(true);
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      if (value) {
        event.preventDefault();
        onSelect("");
      }
      return;
    }

    if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      setSearch(event.key);
      setOpen(true);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!filteredPatients.length) return;
      setActiveIndex((current) => (current + 1) % filteredPatients.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!filteredPatients.length) return;
      setActiveIndex((current) => (current - 1 + filteredPatients.length) % filteredPatients.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const activePatient = filteredPatients[activeIndex];
      if (activePatient) {
        handleSelect(activePatient.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        aria-expanded={open}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-border/70 bg-white/80 px-3 py-2 text-left shadow-sm outline-none transition-all",
          "hover:border-primary/20 focus-visible:border-primary/40 focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-primary/10"
        )}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/8 text-primary">
            <Search className="size-4" />
          </span>
          <span className="min-w-0">
            {selectedPatient ? (
              <>
                <span className="block truncate text-sm font-medium text-foreground">{selectedPatient.full_name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {getPatientSecondaryInfo(selectedPatient) || "Paciente selecionado"}
                </span>
              </>
            ) : (
              <span className="block truncate text-sm text-muted-foreground">
                Buscar paciente por nome, e-mail ou telefone...
              </span>
            )}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[min(30rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border-border/70 bg-white/95 p-0 shadow-[0_24px_70px_rgba(41,31,67,0.18)]"
      >
        <div className="border-b border-border/60 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={handleInputKeyDown}
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-autocomplete="list"
              placeholder="Buscar paciente por nome, e-mail ou telefone..."
              className={cn(
                "h-9 w-full min-w-0 rounded-xl border border-input/90 bg-background/80 px-3 py-1.5 pl-9 text-base outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground",
                "focus-visible:border-ring focus-visible:bg-background focus-visible:ring-4 focus-visible:ring-ring/25 md:text-sm"
              )}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Busque por nome, e-mail, telefone ou CPF.</p>
        </div>

        <div id={listboxId} role="listbox" className="max-h-72 overflow-y-auto p-2">
          {filteredPatients.length ? (
            filteredPatients.map((patient, index) => {
              const isSelected = patient.id === value;
              const isActive = index === activeIndex;
              const secondaryInfo = getPatientSecondaryInfo(patient);

              return (
                <button
                  key={patient.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    isActive ? "bg-primary/10 ring-1 ring-primary/15" : "hover:bg-slate-50",
                    isSelected && "border border-primary/15"
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelect(patient.id)}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{patient.full_name}</span>
                      {patient.session_price != null && (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {formatCurrency(Number(patient.session_price))}
                        </span>
                      )}
                    </span>
                    <span className="mt-1 truncate text-xs text-muted-foreground">
                      {secondaryInfo || "Sem e-mail, telefone ou CPF cadastrado"}
                    </span>
                  </span>
                  {isSelected && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })
          ) : (
            <div className="flex flex-col items-start gap-3 px-3 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">Nenhum paciente encontrado.</p>
                <p className="text-xs text-muted-foreground">Tente buscar por nome, e-mail, telefone ou CPF.</p>
              </div>
              <button
                type="button"
                className="text-sm font-medium text-primary transition-colors hover:text-primary/80"
                onClick={() => {
                  setOpen(false);
                  onCreatePatient();
                }}
              >
                Cadastrar novo paciente
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function SchedulePage() {
  const router = useRouter();
  const schedule = useScheduleData();
  const calendar = useCalendarSync(schedule.loadData);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [cancellingSession, setCancellingSession] = useState(false);
  const [completingSession, setCompletingSession] = useState(false);

  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && schedule.view !== "month") {
      const now = new Date();
      const currentHour = now.getHours();

      if (currentHour >= TIMELINE_START_HOUR && currentHour <= TIMELINE_END_HOUR) {
        const offset = (currentHour - TIMELINE_START_HOUR) * SLOT_HEIGHT;
        setTimeout(() => {
          scrollRef.current?.scrollTo({
            top: Math.max(0, offset - scrollRef.current.clientHeight / 2),
            behavior: "smooth",
          });
        }, 300);
      }
    }
  }, [schedule.view, schedule.currentDate]);

  const monthYear = schedule.currentDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const hourLabels = Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, i) => TIMELINE_START_HOUR + i
  );

  const miniCalendarDays = useMemo(() => {
    const start = new Date(schedule.currentDate.getFullYear(), schedule.currentDate.getMonth(), 1);
    const dayOfWeek = start.getDay();
    const firstDay = new Date(start);
    firstDay.setDate(start.getDate() - dayOfWeek);
    return Array.from({ length: 35 }, (_, i) => {
      const d = new Date(firstDay);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [schedule.currentDate]);

  const weekDays = useMemo(() => {
    const start = new Date(schedule.currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [schedule.currentDate]);

  const visibleDays = schedule.view === "day" ? [schedule.currentDate] : weekDays;
  const calendarColumnClass = schedule.view === "day" ? "grid-cols-1" : "grid-cols-7";
  const periodLabel = getPeriodLabel(schedule.view, schedule.currentDate, visibleDays);
  const todaySessions = schedule.sessions.filter((session) => new Date(session.scheduled_at).toDateString() === new Date().toDateString());
  const externalBlocks = schedule.sessions.filter((session) => session.is_external_google).length;
  const clinicalSessions = schedule.sessions.filter((session) => !session.is_external_google).length;
  const selectedDaySessions = useMemo(
    () =>
      schedule.sessions.filter(
        (session) =>
          new Date(session.scheduled_at).toDateString() === schedule.currentDate.toDateString()
      ),
    [schedule.currentDate, schedule.sessions]
  );
  const mobileUpcomingSessions = useMemo(() => {
    const pivot = new Date(schedule.currentDate);
    pivot.setHours(0, 0, 0, 0);

    return schedule.sessions
      .filter((session) => getSessionEnd(session).getTime() >= pivot.getTime())
      .slice(0, 4);
  }, [schedule.currentDate, schedule.sessions]);

  const selectedItem = schedule.selectedSessionDetails as ScheduleItem | null;
  const selectedIsExternal = !!selectedItem?.is_external_google;
  const canCompleteSelectedSession =
    !!selectedItem && !selectedIsExternal && selectedItem.status === "scheduled";
  const selectedPatient = useMemo(
    () => schedule.patients.find((p) => p.id === schedule.newSession.patient_id) ?? null,
    [schedule.patients, schedule.newSession.patient_id]
  );
  const suggestedPrice = selectedPatient?.session_price ?? schedule.profile?.session_price_default ?? null;
  const billingMode = schedule.newSession.billing_mode ?? "single";
  const isPackageBilling = billingMode === "package";
  const sessionPriceValue =
    schedule.newSession.session_price?.trim() !== ""
      ? Number(schedule.newSession.session_price)
      : suggestedPrice;
  const isFreeSession = billingMode === "free";
  const chargeAmount = isFreeSession || isPackageBilling ? 0 : Number(sessionPriceValue ?? 0);
  const recurrenceCountValue = Math.max(
    1,
    Math.min(parseInt(schedule.newSession.recurrence_count, 10) || 1, 24)
  );
  const packageRequestedSessions = schedule.newSession.is_recurring ? recurrenceCountValue : 1;
  const packageReferenceDate = useMemo(() => {
    const baseDate = parseIsoDate(schedule.newSession.scheduled_at) ?? new Date();
    let cursor = baseDate;
    const steps = schedule.newSession.is_recurring && !schedule.newSession.is_indefinite
      ? packageRequestedSessions - 1
      : 0;

    for (let i = 0; i < steps; i++) {
      cursor = addSchedulePeriod(cursor, schedule.newSession.recurrence_period);
    }

    return formatIsoDate(cursor);
  }, [
    packageRequestedSessions,
    schedule.newSession.is_indefinite,
    schedule.newSession.is_recurring,
    schedule.newSession.recurrence_period,
    schedule.newSession.scheduled_at,
  ]);
  const activePackageOptions = useMemo(
    () => schedule.patientSessionPackages.filter((sessionPackage) => sessionPackage.status === "active"),
    [schedule.patientSessionPackages]
  );
  const packagesWithReservableBalance = useMemo(
    () =>
      activePackageOptions.filter((sessionPackage) => {
        const reservableSessions = Number(
          sessionPackage.reservable_sessions ?? sessionPackage.remaining_sessions ?? 0
        );
        return reservableSessions > 0 && !(sessionPackage.expires_at && sessionPackage.expires_at < packageReferenceDate);
      }),
    [activePackageOptions, packageReferenceDate]
  );
  const packageChoiceAvailable = packagesWithReservableBalance.length > 0;
  const selectedPackage = useMemo(
    () => activePackageOptions.find((sessionPackage) => sessionPackage.id === schedule.newSession.package_id) ?? null,
    [activePackageOptions, schedule.newSession.package_id]
  );
  const selectedPackageReservableSessions = selectedPackage
    ? Number(selectedPackage.reservable_sessions ?? selectedPackage.remaining_sessions ?? 0)
    : 0;
  const selectedPackageBlockReason = selectedPackage
    ? getSessionPackageScheduleBlockReason({
        status: selectedPackage.status,
        paymentStatus: selectedPackage.payment_status,
        allowUseBeforePayment: selectedPackage.allow_use_before_payment,
        expiresAt: selectedPackage.expires_at,
        referenceDate: packageReferenceDate,
        reservableSessions: selectedPackageReservableSessions,
        requestedSessions: packageRequestedSessions,
      })
    : null;
  const selectedPackageError = isPackageBilling
    ? schedule.newSession.is_recurring && schedule.newSession.is_indefinite
      ? "Recorrência sem data final não pode usar pacote nesta fase."
      : !selectedPackage
        ? "Selecione um pacote para esta sessão."
        : selectedPackageBlockReason === "package_without_balance" && schedule.newSession.is_recurring
          ? "O pacote selecionado não possui saldo suficiente para esta recorrência."
          : selectedPackageBlockReason
            ? SESSION_PACKAGE_SCHEDULE_BLOCK_MESSAGES[selectedPackageBlockReason]
            : null
    : null;

  function setBillingMode(nextMode: "single" | "free" | "package") {
    const fallbackPackage = selectedPackage ?? packagesWithReservableBalance[0] ?? activePackageOptions[0] ?? null;
    schedule.setNewSession({
      ...schedule.newSession,
      billing_mode: nextMode,
      package_id: nextMode === "package" ? fallbackPackage?.id ?? "" : "",
      session_price:
        nextMode === "free"
          ? "0"
          : nextMode === "package"
            ? fallbackPackage
              ? String(fallbackPackage.unit_amount)
              : ""
          : suggestedPrice != null
            ? String(suggestedPrice)
            : "",
      is_indefinite: nextMode === "package" ? false : schedule.newSession.is_indefinite,
    });
  }

  function applySelectedPatient(patientId: string) {
    const patient = schedule.patients.find((item) => item.id === patientId);
    const resolvedPrice = patient?.session_price ?? schedule.profile?.session_price_default ?? null;
    const nextBillingMode = schedule.newSession.billing_mode === "package" ? "single" : schedule.newSession.billing_mode;

    schedule.setNewSession({
      ...schedule.newSession,
      patient_id: patientId,
      package_id: "",
      billing_mode: nextBillingMode,
      session_price:
        nextBillingMode === "free"
          ? "0"
          : nextBillingMode === "single" && schedule.newSession.session_price?.trim() !== ""
            ? schedule.newSession.session_price
            : resolvedPrice != null
              ? String(resolvedPrice)
              : "",
    });
  }

  async function handleCreateSession() {
    if (!schedule.therapistId) {
      setScheduleError("Terapeuta não identificado.");
      return;
    }

    setScheduleError(null);
    schedule.setSaving(true);
    try {
      const duration = parseInt(schedule.newSession.duration_minutes, 10);
      const rawPrice = isFreeSession
        ? 0
        : isPackageBilling && selectedPackage
          ? Number(selectedPackage.unit_amount)
          : chargeAmount;

      if (isPackageBilling) {
        if (selectedPackageError) {
          setScheduleError(selectedPackageError);
          return;
        }
        if (!selectedPackage) {
          setScheduleError("Selecione um pacote para esta sessão.");
          return;
        }
      }

      if (!isFreeSession && !isPackageBilling && (!Number.isFinite(rawPrice) || rawPrice <= 0)) {
        setScheduleError("Sessão avulsa precisa ter valor maior que zero. Para não cobrar, selecione cortesia.");
        return;
      }

      const result = await createScheduleSessions({
        therapistId: schedule.therapistId,
        patientId: schedule.newSession.patient_id,
        scheduledDate: schedule.newSession.scheduled_at,
        scheduledTime: schedule.newSession.scheduled_time,
        durationMinutes: Number.isNaN(duration) ? 50 : duration,
        sessionType: schedule.newSession.session_type,
        sessionPrice: rawPrice,
        billingMode,
        packageId: isPackageBilling ? selectedPackage?.id ?? null : null,
        location: schedule.newSession.location,
        isRecurring: schedule.newSession.is_recurring,
        recurrencePeriod: schedule.newSession.recurrence_period as "weekly" | "monthly",
        recurrenceCount: parseInt(schedule.newSession.recurrence_count, 10),
        isIndefinite: schedule.newSession.is_indefinite,
      });

      if (!result.success) {
        throw new Error(result.error || "Falha ao agendar sessão.");
      }

      const createdCount = result.createdCount ?? 1;
      const googleCreatedCount = result.googleCreatedCount ?? 0;
      if (result.warning) {
        calendar.setSyncBanner({
          type: "info",
          message: `${createdCount} sessão(ões) criada(s). ${result.warning}`,
        });
      } else if (googleCreatedCount > 0) {
        calendar.setSyncBanner({
          type: "success",
          message: `${createdCount} sessão(ões) criada(s) e enviadas ao Google Calendar.`,
        });
      } else {
        calendar.setSyncBanner({
          type: "success",
          message: `${createdCount} sessão(ões) criada(s) com sucesso.`,
        });
      }

      schedule.setShowNewSession(false);
      schedule.setNewSession({
        patient_id: "",
        scheduled_at: "",
        scheduled_time: "14:00",
        duration_minutes: "50",
        session_type: "individual",
        session_price: "",
        billing_mode: "single",
        package_id: "",
        location: "office",
        is_recurring: false,
        recurrence_period: "weekly",
        recurrence_count: "4",
        is_indefinite: false,
        is_package: false,
        package_sessions: "10",
        discount_percentage: "0",
      });
      await schedule.loadData();
    } catch (err: any) {
      setScheduleError(err?.message ?? "Falha ao agendar sessão.");
    } finally {
      schedule.setSaving(false);
    }
  }

  async function handleCancelSession() {
    if (!selectedItem?.id || selectedIsExternal) return;

    setCancellingSession(true);
    try {
      const result = await cancelScheduleSession({ sessionId: selectedItem.id });
      if (!result.success) {
        throw new Error(result.error || "Falha ao cancelar sessão.");
      }

      if (result.warning) {
        calendar.setSyncBanner({ type: "info", message: result.warning });
      } else {
        calendar.setSyncBanner({ type: "success", message: "Sessão cancelada com sucesso." });
      }

      schedule.setShowSessionDetails(false);
      schedule.setSelectedSessionDetails(null);
      await schedule.loadData();
    } catch (err: any) {
      calendar.setSyncBanner({
        type: "error",
        message: err?.message ?? "Falha ao cancelar sessão.",
      });
    } finally {
      setCancellingSession(false);
    }
  }

  async function handleCompleteSession(allowFutureCompletion = false) {
    if (!selectedItem?.id || selectedIsExternal) return;

    const scheduledAt = new Date(selectedItem.scheduled_at);
    const isFuture = !Number.isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now();

    if (isFuture && !allowFutureCompletion) {
      const confirmed = window.confirm(
        "Esta sessão ainda está no futuro. Deseja marcar como realizada mesmo assim?"
      );
      if (!confirmed) return;
      return handleCompleteSession(true);
    }

    setCompletingSession(true);
    try {
      const result = await completeScheduleSession({
        sessionId: selectedItem.id,
        allowFutureCompletion,
      });

      if (result.requiresConfirmation) {
        const confirmed = window.confirm(
          "Esta sessão ainda está no futuro. Deseja marcar como realizada mesmo assim?"
        );
        if (!confirmed) return;
        return handleCompleteSession(true);
      }

      if (!result.success) {
        throw new Error(result.error || "Falha ao marcar sessão como realizada.");
      }

      if (result.packageCreditConsumed) {
        toast.success("Sessão realizada. 1 crédito do pacote foi consumido.");
      } else {
        toast.success("Sessão marcada como realizada.");
      }
      if (result.billingCreated) {
        toast.success("Cobrança pendente criada no financeiro.");
      } else if (result.packageCreditAlreadyConsumed) {
        toast.info("Crédito do pacote já estava consumido para esta sessão.");
      } else if (result.billingAlreadyExists) {
        toast.info("Já existe um lançamento financeiro vinculado a esta sessão.");
      } else if (result.billingSkippedReason === "courtesy_or_zero_value") {
        toast.info("Sessão cortesia ou sem valor: cobrança não criada.");
      }
      if (result.needsEvolution) {
        toast.info("Evolução ainda não registrada. Você pode registrar sem bloquear a finalização.");
      }

      schedule.setShowSessionDetails(false);
      schedule.setSelectedSessionDetails(null);
      await schedule.loadData();
      window.dispatchEvent(new CustomEvent("notifications:refresh"));
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao marcar sessão como realizada.");
    } finally {
      setCompletingSession(false);
    }
  }

  return (
    <div className="mx-auto flex h-auto min-h-0 w-full max-w-[1800px] flex-col gap-4 overflow-visible px-3 py-3 md:px-5 md:py-4 lg:h-[calc(100vh-84px)] lg:min-h-[640px] lg:overflow-hidden">
      {calendar.syncBanner && (
        <div
          className={cn(
            "fixed left-1/2 top-4 z-50 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-start gap-3 rounded-2xl border px-4 py-3 text-sm font-medium shadow-[0_18px_45px_rgba(41,31,67,0.16)] backdrop-blur-xl",
            calendar.syncBanner.type === "success" && "border-emerald-200 bg-emerald-50/95 text-emerald-800",
            calendar.syncBanner.type === "error" && "border-rose-200 bg-rose-50/95 text-rose-800",
            calendar.syncBanner.type === "info" && "border-sky-200 bg-sky-50/95 text-sky-800"
          )}
        >
          {calendar.syncBanner.type === "success" && <CheckCircle className="mt-0.5 size-4 shrink-0" />}
          {calendar.syncBanner.type === "error" && <AlertCircle className="mt-0.5 size-4 shrink-0" />}
          {calendar.syncBanner.type === "info" && <Info className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1 leading-5">{calendar.syncBanner.message}</span>
          <button
            type="button"
            onClick={() => calendar.setSyncBanner(null)}
            className="rounded-full p-1 opacity-60 transition hover:bg-white/70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/20"
            aria-label="Fechar aviso"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <section className="animate-fade-in overflow-hidden rounded-3xl border border-primary/10 bg-card/90 shadow-[0_18px_50px_rgba(41,31,67,0.08)] ring-1 ring-white/80">
        <div className="relative grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-52 bg-[radial-gradient(circle_at_22%_18%,rgba(124,58,237,0.18),transparent_42%),radial-gradient(circle_at_42%_88%,rgba(16,185,129,0.15),transparent_36%)]" />
          <div className="relative min-w-0 space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary/70">Agenda clínica</p>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">Agenda</h1>
              <p className="pb-1 text-sm font-medium capitalize text-muted-foreground">{periodLabel}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-100 bg-white/75 px-3 py-1 text-violet-700">
                <span className="size-1.5 rounded-full bg-violet-500" />
                {clinicalSessions} sessão(ões)
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-white/75 px-3 py-1 text-teal-700">
                <span className="size-1.5 rounded-full bg-teal-500" />
                {externalBlocks} bloqueio(s) Google
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-white/75 px-3 py-1">
                <Clock3 className="size-3.5" />
                {todaySessions.length} itens hoje
              </span>
            </div>
          </div>

          <div className="relative flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
            <Button
              variant="outline"
              className="h-10 w-full rounded-2xl bg-white/80 sm:w-auto"
              onClick={() => {
                schedule.setCurrentDate(new Date());
                schedule.setSelectedDate(new Date());
              }}
            >
              Hoje
            </Button>
            {calendar.googleConnected && (
              <Button
                variant="outline"
                className="h-10 w-full rounded-2xl border-teal-200 bg-white/80 text-teal-700 hover:bg-teal-50 sm:w-auto"
                onClick={calendar.handleGoogleSync}
                disabled={calendar.syncing}
              >
                <RefreshCw className={cn("size-4", calendar.syncing && "animate-spin")} />
                {calendar.syncing ? "Sincronizando" : "Sincronizar Google"}
              </Button>
            )}
            <SubscriptionGate>
              <Button onClick={() => schedule.setShowNewSession(true)} className="h-10 w-full rounded-2xl shadow-primary/20 sm:w-auto">
                <Plus className="size-4" />
                Agendar sessão
              </Button>
            </SubscriptionGate>
          </div>
        </div>
      </section>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <section className="space-y-4 lg:hidden">
          <div className="rounded-3xl border border-border/70 bg-white/90 p-4 shadow-[0_14px_35px_rgba(41,31,67,0.06)] ring-1 ring-white/80">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Agenda do dia
                </p>
                <h2 className="mt-1 text-lg font-semibold capitalize text-foreground">
                  {formatDateLong(schedule.currentDate)}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedDaySessions.length > 0
                    ? `${selectedDaySessions.length} item(ns) para este dia`
                    : "Sem compromissos para este dia"}
                </p>
              </div>
              <div className="flex items-center rounded-2xl border border-border/70 bg-muted/35 p-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-xl"
                  onClick={() => {
                    const previousDay = new Date(schedule.currentDate);
                    previousDay.setDate(previousDay.getDate() - 1);
                    schedule.setCurrentDate(previousDay);
                    schedule.setSelectedDate(previousDay);
                    schedule.setView("day");
                  }}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-xl"
                  onClick={() => {
                    const nextDay = new Date(schedule.currentDate);
                    nextDay.setDate(nextDay.getDate() + 1);
                    schedule.setCurrentDate(nextDay);
                    schedule.setSelectedDate(nextDay);
                    schedule.setView("day");
                  }}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {weekDays.map((day) => {
                const isSelected = day.toDateString() === schedule.currentDate.toDateString();
                const isToday = day.toDateString() === new Date().toDateString();
                const count = schedule.sessions.filter(
                  (session) => new Date(session.scheduled_at).toDateString() === day.toDateString()
                ).length;

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => {
                      schedule.setCurrentDate(day);
                      schedule.setSelectedDate(day);
                      schedule.setView("day");
                    }}
                    className={cn(
                      "flex min-w-[72px] shrink-0 flex-col items-center rounded-2xl border px-3 py-2 text-center transition-all",
                      isSelected
                        ? "border-primary/20 bg-primary/10 text-primary shadow-sm"
                        : "border-border/70 bg-white/75 text-muted-foreground"
                    )}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
                      {formatWeekdayCompact(day)}
                    </span>
                    <span
                      className={cn(
                        "mt-2 flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                        isSelected
                          ? "gradient-primary text-white"
                          : isToday
                            ? "bg-primary/10 text-primary"
                            : "text-foreground"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <span className="mt-2 text-[10px] font-medium">
                      {count > 0 ? `${count} item(ns)` : "Livre"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-white/90 shadow-[0_14px_35px_rgba(41,31,67,0.06)] ring-1 ring-white/80">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">SessÃµes do dia</h3>
                <p className="text-xs text-muted-foreground">Toque para abrir os detalhes.</p>
              </div>
              <Badge variant="outline" className="rounded-full border-border/70 bg-white px-2.5 py-1 text-[10px] font-semibold">
                {selectedDaySessions.length}
              </Badge>
            </div>

            <div className="space-y-3 p-4">
              {selectedDaySessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-slate-50/70 p-5 text-center">
                  <CalendarCheck2 className="mx-auto mb-2 size-5 text-muted-foreground/65" />
                  <p className="text-sm font-medium text-foreground">Nenhum item neste dia</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use o botÃ£o acima para agendar uma nova sessÃ£o.
                  </p>
                </div>
              ) : (
                selectedDaySessions.map((session) => {
                  const styles = getSessionStyle(session);

                  return (
                    <button
                      type="button"
                      key={session.id}
                      className={cn(
                        "flex w-full flex-col gap-3 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5",
                        styles.card
                      )}
                      onClick={() => {
                        schedule.setSelectedSessionDetails(session);
                        schedule.setShowSessionDetails(true);
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("size-2 rounded-full", styles.dot)} />
                            <p className="truncate text-sm font-semibold">{getSessionTitle(session)}</p>
                          </div>
                          <p className="mt-1 text-xs opacity-80">{getSessionSubtitle(session)}</p>
                        </div>
                        <Badge variant="outline" className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", styles.badge)}>
                          {session.is_external_google ? "Google" : getStatusLabel(session)}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold opacity-85">
                        <span>{getSessionTimeRange(session)}</span>
                        {!session.is_external_google && (
                          <>
                            <span className="size-1 rounded-full bg-current/35" />
                            <span>{getSessionTypeLabel(session.session_type)}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-white/90 shadow-[0_14px_35px_rgba(41,31,67,0.06)] ring-1 ring-white/80">
            <div className="border-b border-border/60 px-4 py-4">
              <h3 className="text-sm font-semibold text-foreground">PrÃ³ximos eventos</h3>
              <p className="text-xs text-muted-foreground">Resumo compacto para as prÃ³ximas datas carregadas.</p>
            </div>

            <div className="space-y-2 p-4">
              {mobileUpcomingSessions.length === 0 ? (
                <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-muted-foreground">
                  Nenhum prÃ³ximo evento encontrado nesta faixa da agenda.
                </p>
              ) : (
                mobileUpcomingSessions.map((session) => (
                  <button
                    type="button"
                    key={`upcoming-${session.id}`}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white/80 px-3 py-3 text-left transition hover:border-primary/20 hover:bg-primary/[0.03]"
                    onClick={() => {
                      schedule.setSelectedSessionDetails(session);
                      schedule.setShowSessionDetails(true);
                    }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{getSessionTitle(session)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateShort(new Date(session.scheduled_at))} · {getSessionTimeRange(session)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </div>
        </section>

        <aside className="hidden min-h-0 flex-col gap-4 lg:flex">
          <div className="rounded-3xl border border-border/70 bg-white/85 p-4 shadow-[0_14px_35px_rgba(41,31,67,0.06)] ring-1 ring-white/80">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold capitalize text-foreground">{monthYear}</h2>
              <div className="flex items-center gap-1 rounded-full border border-border/70 bg-muted/35 p-1">
                <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => schedule.navigate(-1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7 rounded-full" onClick={() => schedule.navigate(1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center">
              {MINI_DAY_LABELS.map((day, i) => (
                <span key={`${day}-${i}`} className="pb-2 text-[10px] font-semibold text-muted-foreground">
                  {day}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {miniCalendarDays.map((day, i) => {
                const isToday = day.toDateString() === new Date().toDateString();
                const isSelected = day.toDateString() === schedule.currentDate.toDateString();
                const isCurrentMonth = day.getMonth() === schedule.currentDate.getMonth();

                return (
                  <div key={i} className="flex h-8 items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        schedule.setCurrentDate(day);
                        schedule.setSelectedDate(day);
                        schedule.setView("day");
                      }}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full text-xs font-semibold transition-all hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10",
                        isSelected
                          ? "gradient-primary text-white shadow-md shadow-primary/20"
                          : isToday
                            ? "bg-primary/10 text-primary"
                            : isCurrentMonth
                              ? "text-foreground"
                              : "text-muted-foreground/35"
                      )}
                    >
                      {day.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl border border-border/70 bg-white/85 p-4 shadow-[0_14px_35px_rgba(41,31,67,0.06)] ring-1 ring-white/80">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Google Calendar</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {calendar.googleConnected ? "Eventos externos aparecem como bloqueios." : "Conecte para importar bloqueios da sua agenda."}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]",
                  calendar.googleConnected
                    ? "border-teal-200 bg-teal-50 text-teal-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                )}
              >
                {calendar.googleConnected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                {calendar.googleConnected ? "Conectado" : "Off"}
              </span>
            </div>

            {calendar.googleConnected ? (
              <div className="space-y-2">
                <Button
                  onClick={calendar.handleGoogleSync}
                  disabled={calendar.syncing}
                  className="h-10 w-full rounded-2xl bg-teal-600 text-white shadow-teal-600/20 hover:bg-teal-700"
                >
                  <RefreshCw className={cn("size-4", calendar.syncing && "animate-spin")} />
                  {calendar.syncing ? "Sincronizando" : "Sincronizar"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={calendar.handleGoogleDisconnect}
                  className="h-9 w-full rounded-2xl text-xs font-medium text-muted-foreground hover:bg-rose-50 hover:text-rose-600"
                >
                  <Unlink className="size-3.5" />
                  Desconectar Google
                </Button>
              </div>
            ) : (
              <Button
                onClick={calendar.handleGoogleConnect}
                disabled={calendar.connecting}
                variant="outline"
                className="h-10 w-full rounded-2xl border-teal-200 bg-white text-teal-700 hover:bg-teal-50"
              >
                {calendar.connecting ? "Conectando..." : "Conectar Google"}
              </Button>
            )}
          </div>

          <div className="rounded-3xl border border-border/70 bg-white/75 p-4 shadow-[0_14px_35px_rgba(41,31,67,0.05)] ring-1 ring-white/80">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Legenda</h3>
            <div className="space-y-2 text-sm font-medium">
              <div className="flex items-center gap-3 rounded-2xl bg-violet-50 px-3 py-2 text-violet-800">
                <span className="size-2.5 rounded-full bg-violet-500" />
                Sessões clínicas
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-teal-50 px-3 py-2 text-teal-800">
                <span className="size-2.5 rounded-full bg-teal-500" />
                Bloqueios Google
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-amber-50 px-3 py-2 text-amber-800">
                <span className="size-2.5 rounded-full bg-amber-500" />
                Atenção ou remarcação
              </div>
            </div>
          </div>
        </aside>

        <main className="hidden min-h-0 flex-col overflow-hidden rounded-3xl border border-border/70 bg-white/90 shadow-[0_18px_50px_rgba(41,31,67,0.08)] ring-1 ring-white/80 lg:flex">
          <header className="flex shrink-0 flex-col gap-3 border-b border-border/60 bg-white/85 px-3 py-3 backdrop-blur md:flex-row md:items-center md:justify-between md:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex items-center rounded-2xl border border-border/70 bg-muted/35 p-1">
                <Button variant="ghost" size="icon" className="size-8 rounded-xl" onClick={() => schedule.navigate(-1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8 rounded-xl" onClick={() => schedule.navigate(1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {schedule.view === "month" ? "Visão mensal" : schedule.view === "day" ? "Visão diária" : "Visão semanal"}
                </p>
                <h2 className="truncate text-base font-semibold capitalize text-foreground">{periodLabel}</h2>
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
              <div className="flex rounded-2xl border border-border/70 bg-muted/35 p-1">
                {(["week", "month", "day"] as const).map((view) => (
                  <Button
                    key={view}
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 rounded-xl px-4 text-xs font-semibold",
                      schedule.view === view ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => schedule.setView(view)}
                  >
                    {view === "week" ? "Semana" : view === "month" ? "Mês" : "Dia"}
                  </Button>
                ))}
              </div>
            </div>
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(255,255,255,0.96))]">
            {schedule.loading ? (
              <div className="flex h-full min-h-[360px] items-center justify-center p-8">
                <div className="rounded-3xl border border-border/70 bg-white/80 px-6 py-5 text-center shadow-[0_14px_35px_rgba(41,31,67,0.06)]">
                  <RefreshCw className="mx-auto mb-3 size-5 animate-spin text-primary" />
                  <p className="text-sm font-semibold text-foreground">Carregando agenda</p>
                  <p className="mt-1 text-xs text-muted-foreground">Organizando sessões e bloqueios.</p>
                </div>
              </div>
            ) : schedule.view !== "month" ? (
              <div className={cn("relative min-w-[880px]", schedule.view === "day" && "min-w-[520px]")}>
                <div className="sticky top-0 z-30 grid border-b border-border/60 bg-white/90 backdrop-blur-md grid-cols-[72px_1fr]">
                  <div className="sticky left-0 z-40 flex h-16 items-end justify-end bg-white/95 p-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">GMT-03</span>
                  </div>
                  <div className={cn("grid", calendarColumnClass)}>
                    {visibleDays.map((day) => {
                      const isToday = day.toDateString() === new Date().toDateString();
                      const dayCount = schedule.sessions.filter((session) => new Date(session.scheduled_at).toDateString() === day.toDateString()).length;

                      return (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "flex h-16 flex-col items-center justify-center border-l border-border/50",
                            isToday && "bg-primary/5"
                          )}
                        >
                          <span className={cn("text-[10px] font-bold uppercase tracking-[0.14em]", isToday ? "text-primary" : "text-muted-foreground")}>
                            {DAY_LABELS[day.getDay()]}
                          </span>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={cn("flex size-8 items-center justify-center rounded-full text-sm font-semibold", isToday ? "gradient-primary text-white shadow-md shadow-primary/20" : "text-foreground")}>
                              {day.getDate()}
                            </span>
                            {dayCount > 0 && (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {dayCount}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="grid grid-cols-[72px_1fr]"
                  style={{ height: (TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1) * SLOT_HEIGHT }}
                >
                  <div className="sticky left-0 z-20 border-r border-border/60 bg-white/95 shadow-[10px_0_18px_-14px_rgba(41,31,67,0.22)]">
                    {hourLabels.map((hour, idx) => (
                      <div key={hour} className="absolute right-3 -translate-y-1/2" style={{ top: idx * SLOT_HEIGHT }}>
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {hour === TIMELINE_START_HOUR ? "" : `${hour.toString().padStart(2, "0")}:00`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className={cn("relative grid", calendarColumnClass)}>
                    {visibleDays.map((day) => {
                      const daySessions = schedule.sessions.filter((session) => new Date(session.scheduled_at).toDateString() === day.toDateString());

                      return (
                        <div key={day.toISOString()} className="relative border-l border-border/50">
                          {hourLabels.map((_, idx) => (
                            <div key={idx} className="absolute left-0 right-0 border-t border-slate-200/70" style={{ top: idx * SLOT_HEIGHT }} />
                          ))}

                          {daySessions.length === 0 && (
                            <div className="absolute inset-x-3 top-8 rounded-2xl border border-dashed border-border/80 bg-white/55 px-3 py-4 text-center">
                              <CalendarCheck2 className="mx-auto mb-2 size-4 text-muted-foreground/65" />
                              <p className="text-xs font-medium text-muted-foreground">Sem itens neste dia</p>
                            </div>
                          )}

                          {daySessions.map((session) => {
                            const sessionDate = new Date(session.scheduled_at);
                            const minutesFromStart = (sessionDate.getHours() - TIMELINE_START_HOUR) * 60 + sessionDate.getMinutes();
                            const totalTimelineMinutes = (TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1) * 60;
                            const durationMinutes = session.duration_minutes ?? 50;
                            const clampedStart = Math.max(0, minutesFromStart);
                            const clampedEnd = Math.min(totalTimelineMinutes, minutesFromStart + durationMinutes);
                            if (clampedEnd <= 0 || clampedStart >= totalTimelineMinutes) return null;

                            const top = (clampedStart / 60) * SLOT_HEIGHT;
                            const height = Math.max(34, ((clampedEnd - clampedStart) / 60) * SLOT_HEIGHT);
                            const styles = getSessionStyle(session);
                            const compact = height < 58;
                            const dense = height < 72;

                            return (
                              <button
                                type="button"
                                key={session.id}
                                className="absolute left-1.5 right-1.5 z-10 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15"
                                style={{ top, height }}
                                onClick={() => {
                                  schedule.setSelectedSessionDetails(session);
                                  schedule.setShowSessionDetails(true);
                                }}
                              >
                                <div
                                  className={cn(
                                    "relative flex h-full flex-col overflow-hidden rounded-xl border p-2 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg",
                                    styles.card
                                  )}
                                >
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "absolute right-1.5 top-1.5 max-w-[72px] truncate rounded-full px-1.5 py-0 text-[9px] font-bold leading-4",
                                      styles.badge
                                    )}
                                  >
                                    {session.is_external_google ? "Google" : getStatusLabel(session)}
                                  </Badge>

                                  <div className="min-w-0 pr-[76px]">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      <span className={cn("size-1.5 shrink-0 rounded-full", styles.dot)} />
                                      <h4 className="min-w-0 truncate text-[11px] font-semibold leading-4">
                                        {getSessionTitle(session)}
                                      </h4>
                                    </div>
                                    {!compact && (
                                      <p className="mt-0.5 truncate text-[10px] font-medium leading-4 opacity-75">
                                        {getSessionSubtitle(session)}
                                      </p>
                                    )}
                                    {!compact && session.status === "completed" && !session.is_external_google && (
                                      <p
                                        className={cn(
                                          "mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.08em]",
                                          hasSessionEvolution(session) ? "text-emerald-700" : "text-amber-700"
                                        )}
                                      >
                                        {getEvolutionStatusLabel(session)}
                                      </p>
                                    )}
                                  </div>

                                  <div className={cn("mt-auto flex min-w-0 items-center gap-2 text-[10px] font-semibold leading-4 opacity-80", compact && "hidden")}>
                                    <span className="shrink-0">{getSessionTimeRange(session)}</span>
                                    {!session.is_external_google && !dense && (
                                      <span className="min-w-0 truncate text-right">{getSessionTypeLabel(session.session_type)}</span>
                                    )}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-w-[760px]">
                <div className="grid grid-cols-7 border-b border-border/60 bg-white/90">
                  {DAY_LABELS.map((day) => (
                    <div key={day} className="flex h-11 items-center justify-center border-r border-border/50 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {miniCalendarDays.map((day, i) => {
                    const daySessions = schedule.sessions.filter((session) => new Date(session.scheduled_at).toDateString() === day.toDateString());
                    const isToday = day.toDateString() === new Date().toDateString();
                    const isCurrentMonth = day.getMonth() === schedule.currentDate.getMonth();

                    return (
                      <div
                        key={i}
                        className={cn(
                          "min-h-[128px] border-b border-r border-border/50 bg-white/55 p-2 transition hover:bg-white/85",
                          !isCurrentMonth && "bg-slate-50/70 text-muted-foreground/45"
                        )}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span
                            className={cn(
                              "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                              isToday ? "gradient-primary text-white shadow-md shadow-primary/20" : "text-foreground"
                            )}
                          >
                            {day.getDate()}
                          </span>
                          {daySessions.length > 3 && (
                            <span className="text-[10px] font-semibold text-muted-foreground">+{daySessions.length - 3}</span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {daySessions.slice(0, 3).map((session) => {
                            const styles = getSessionStyle(session);
                            return (
                              <button
                                type="button"
                                key={session.id}
                                className={cn(
                                  "block w-full overflow-hidden rounded-xl border px-2 py-1.5 text-left text-[10px] font-semibold shadow-sm transition hover:-translate-y-0.5",
                                  styles.card
                                )}
                                onClick={() => {
                                  schedule.setSelectedSessionDetails(session);
                                  schedule.setShowSessionDetails(true);
                                }}
                              >
                                <span className="block truncate">{formatTime(session.scheduled_at)} {getSessionTitle(session)}</span>
                                {session.status === "completed" && !session.is_external_google && (
                                  <span
                                    className={cn(
                                      "mt-0.5 block truncate text-[9px] font-bold uppercase tracking-[0.08em]",
                                      hasSessionEvolution(session) ? "text-emerald-700" : "text-amber-700"
                                    )}
                                  >
                                    {getEvolutionStatusLabel(session)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <Dialog
        open={schedule.showNewSession}
        onOpenChange={(open) => {
          schedule.setShowNewSession(open);
          if (!open) setScheduleError(null);
        }}
      >
        <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1rem)] flex-col overflow-hidden border-primary/10 bg-white/95 p-0 shadow-[0_24px_70px_rgba(41,31,67,0.18)] sm:max-w-2xl">
          <div className="shrink-0 border-b border-border/60 bg-[linear-gradient(135deg,rgba(124,58,237,0.08),rgba(20,184,166,0.08))] px-4 py-4 sm:px-5 sm:py-5">
            <div className="flex items-start gap-3 pr-8">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <CalendarDays className="size-5" />
              </span>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">Agendar sessão</DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  Defina paciente, horário e recorrência mantendo a validação de conflitos da agenda.
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:space-y-5 sm:px-5 sm:py-5">
            <section className="rounded-2xl border border-border/70 bg-slate-50/60 p-4">
              <div className="mb-4 flex items-center gap-2">
                <UserRound className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Paciente</h3>
              </div>
              <FieldShell>
                <Label>Paciente</Label>
                <PatientCombobox
                  patients={schedule.patients}
                  selectedPatient={selectedPatient}
                  value={schedule.newSession.patient_id}
                  onSelect={(patientId) => {
                    setScheduleError(null);
                    applySelectedPatient(patientId);
                  }}
                  onCreatePatient={() => {
                    schedule.setShowNewSession(false);
                    router.push("/dashboard/patients/new");
                  }}
                />
              </FieldShell>
            </section>

            <section className="rounded-2xl border border-border/70 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <Clock3 className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Data e duração</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <FieldShell>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={schedule.newSession.scheduled_at}
                    onChange={(e) => schedule.setNewSession({ ...schedule.newSession, scheduled_at: e.target.value })}
                    className="rounded-xl bg-white"
                  />
                </FieldShell>
                <FieldShell>
                  <Label>Horário</Label>
                  <Input
                    type="time"
                    value={schedule.newSession.scheduled_time}
                    onChange={(e) => schedule.setNewSession({ ...schedule.newSession, scheduled_time: e.target.value })}
                    className="rounded-xl bg-white"
                  />
                </FieldShell>
                <FieldShell>
                  <Label>Duração (min)</Label>
                  <Input
                    type="number"
                    min={15}
                    step={5}
                    value={schedule.newSession.duration_minutes}
                    onChange={(e) => schedule.setNewSession({ ...schedule.newSession, duration_minutes: e.target.value })}
                    className="rounded-xl bg-white"
                  />
                </FieldShell>
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <MapPin className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Tipo e local</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldShell>
                  <Label>Tipo de sessão</Label>
                  <select
                    className={nativeSelectClassName()}
                    value={schedule.newSession.session_type}
                    onChange={(e) => schedule.setNewSession({ ...schedule.newSession, session_type: e.target.value })}
                  >
                    <option value="individual">Individual</option>
                    <option value="couple">Casal</option>
                    <option value="group">Grupo</option>
                    <option value="online">Online</option>
                    <option value="initial_assessment">Avaliação inicial</option>
                  </select>
                </FieldShell>
                <FieldShell>
                  <Label>Local</Label>
                  <select
                    className={nativeSelectClassName()}
                    value={schedule.newSession.location}
                    onChange={(e) => schedule.setNewSession({ ...schedule.newSession, location: e.target.value })}
                  >
                    <option value="office">Presencial</option>
                    <option value="online">Online</option>
                  </select>
                </FieldShell>
              </div>
            </section>

            <section className="rounded-2xl border border-primary/15 bg-white p-4 shadow-sm">
              <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <CircleDollarSign className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">Cobrança</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Gera pendência apenas quando a sessão for realizada.
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    "w-fit max-w-full justify-self-start whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] sm:justify-self-end",
                    isFreeSession
                      ? "border-slate-200 bg-slate-50 text-slate-600"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  )}
                >
                  {isFreeSession ? "Sem cobrança" : isPackageBilling ? "Pacote de sessões" : "Cobrança ao realizar"}
                </Badge>
              </div>

              <div className="grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)]">
                <div className="space-y-2">
                  <Label>Tipo de cobrança</Label>
                  <div className="grid gap-2 min-[520px]:grid-cols-3">
                    <Button
                      type="button"
                      variant={billingMode === "single" ? "default" : "outline"}
                      className={cn(
                        "h-auto min-h-14 w-full min-w-0 flex-col items-start gap-1 whitespace-normal rounded-2xl px-3 py-2 text-left",
                        billingMode === "single"
                          ? "bg-primary text-primary-foreground"
                          : "border-border/70 bg-white text-foreground hover:bg-primary/5"
                      )}
                      onClick={() => setBillingMode("single")}
                    >
                      <span className="w-full whitespace-normal text-sm font-semibold leading-4">Sessão avulsa</span>
                      <span className={cn("w-full whitespace-normal break-words text-[11px] leading-4", billingMode === "single" ? "text-primary-foreground/80" : "text-muted-foreground")}>
                        Gera pendência depois
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant={billingMode === "package" ? "default" : "outline"}
                      disabled={!selectedPatient || schedule.patientSessionPackagesLoading || !packageChoiceAvailable}
                      className={cn(
                        "h-auto min-h-14 w-full min-w-0 flex-col items-start gap-1 whitespace-normal rounded-2xl px-3 py-2 text-left",
                        billingMode === "package"
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "border-border/70 bg-white text-foreground hover:bg-emerald-50",
                        (!selectedPatient || schedule.patientSessionPackagesLoading || !packageChoiceAvailable) && "opacity-60"
                      )}
                      onClick={() => packageChoiceAvailable && setBillingMode("package")}
                    >
                      <span className="flex w-full items-center gap-1.5 whitespace-normal text-sm font-semibold leading-4">
                        <PackageCheck className="size-3.5 shrink-0" />
                        Usar pacote
                      </span>
                      <span className={cn("w-full whitespace-normal break-words text-[11px] leading-4", billingMode === "package" ? "text-white/85" : "text-muted-foreground")}>
                        {!selectedPatient
                          ? "Selecione paciente"
                          : schedule.patientSessionPackagesLoading
                            ? "Carregando pacotes"
                            : packageChoiceAvailable
                              ? `${Number(packagesWithReservableBalance[0].reservable_sessions ?? packagesWithReservableBalance[0].remaining_sessions ?? 0)} sessões restantes`
                              : "Nenhum pacote ativo"}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant={billingMode === "free" ? "default" : "outline"}
                      className={cn(
                        "h-auto min-h-14 w-full min-w-0 flex-col items-start gap-1 whitespace-normal rounded-2xl px-3 py-2 text-left",
                        billingMode === "free"
                          ? "bg-slate-800 text-white hover:bg-slate-800/90"
                          : "border-border/70 bg-white text-foreground hover:bg-slate-50"
                      )}
                      onClick={() => setBillingMode("free")}
                    >
                      <span className="w-full whitespace-normal text-sm font-semibold leading-4">Cortesia</span>
                      <span className={cn("w-full whitespace-normal break-words text-[11px] leading-4", billingMode === "free" ? "text-white/80" : "text-muted-foreground")}>
                        Sem lançamento financeiro
                      </span>
                    </Button>
                  </div>
                  {selectedPatient && !schedule.patientSessionPackagesLoading && !packageChoiceAvailable && (
                    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>Nenhum pacote ativo para este paciente.</span>
                      <button
                        type="button"
                        className="font-semibold text-primary transition-colors hover:text-primary/80"
                        onClick={() => router.push(`/dashboard/patients/${selectedPatient.id}?tab=finance`)}
                      >
                        Criar pacote
                      </button>
                    </div>
                  )}
                  {schedule.patientSessionPackagesError && (
                    <p className="text-xs font-medium text-rose-600">{schedule.patientSessionPackagesError}</p>
                  )}
                </div>

                {isPackageBilling ? (
                  <FieldShell>
                    <Label>Pacote</Label>
                    <select
                      className={nativeSelectClassName()}
                      value={schedule.newSession.package_id}
                      onChange={(event) => {
                        const nextPackage = activePackageOptions.find((sessionPackage) => sessionPackage.id === event.target.value) ?? null;
                        schedule.setNewSession({
                          ...schedule.newSession,
                          package_id: event.target.value,
                          session_price: nextPackage ? String(nextPackage.unit_amount) : "",
                          is_indefinite: false,
                        });
                      }}
                    >
                      <option value="">Selecionar pacote</option>
                      {activePackageOptions.map((sessionPackage) => {
                        const reservableSessions = Number(sessionPackage.reservable_sessions ?? sessionPackage.remaining_sessions ?? 0);
                        return (
                          <option key={sessionPackage.id} value={sessionPackage.id}>
                            {sessionPackage.name} - {reservableSessions} restantes
                          </option>
                        );
                      })}
                    </select>
                    {selectedPackage ? (
                      <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/55 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-emerald-950">{selectedPackage.name}</p>
                            <p className="text-[11px] font-medium text-emerald-800">
                              {selectedPackageReservableSessions} sessões reserváveis · {formatCurrency(Number(selectedPackage.unit_amount))} por sessão
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0 rounded-full border-emerald-200 bg-white/75 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                            {getSessionPackagePaymentStatusLabel(selectedPackage.payment_status)}
                          </Badge>
                        </div>
                        <p className="text-[11px] font-medium text-emerald-800">
                          Total {formatCurrency(Number(selectedPackage.total_amount))} · Validade {formatPackageDate(selectedPackage.expires_at)}
                        </p>
                        {selectedPackage.payment_status !== "paid" && (
                          <p className="text-[11px] font-semibold text-amber-700">
                            Pagamento {getSessionPackagePaymentStatusLabel(selectedPackage.payment_status).toLowerCase()}.
                          </p>
                        )}
                        {selectedPackage.payment_status !== "paid" && selectedPackage.allow_use_before_payment === false && (
                          <p className="text-[11px] font-semibold text-rose-700">
                            Este pacote não permite uso antes do pagamento.
                          </p>
                        )}
                        {selectedPackageError ? (
                          <p className="rounded-lg bg-white/80 px-2 py-1.5 text-[11px] font-semibold text-rose-700">
                            {selectedPackageError}
                          </p>
                        ) : (
                          <p className="text-[11px] font-medium text-muted-foreground">
                            O crédito será consumido apenas ao marcar a sessão como realizada.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] font-medium text-muted-foreground">
                        Selecione um pacote ativo para vincular esta sessão.
                      </p>
                    )}
                  </FieldShell>
                ) : (
                  <FieldShell>
                  <Label>Valor da sessão</Label>
                  <Input
                    type="number"
                    min={isFreeSession ? 0 : 0.01}
                    step={0.01}
                    placeholder={suggestedPrice != null ? `${suggestedPrice}` : "Padrão"}
                    value={schedule.newSession.session_price}
                    onChange={(e) =>
                      schedule.setNewSession({
                        ...schedule.newSession,
                        session_price: e.target.value,
                      })
                    }
                    disabled={isFreeSession}
                    className="rounded-xl bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-muted-foreground"
                  />
                  {isFreeSession ? (
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Cortesia salva com valor 0 e não gera cobrança ao realizar.
                    </p>
                  ) : suggestedPrice != null ? (
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Sugerido pelo paciente/perfil: {formatCurrency(Number(suggestedPrice))}
                    </p>
                  ) : (
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Informe um valor maior que zero para sessão avulsa.
                    </p>
                  )}
                  </FieldShell>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border/70 bg-slate-50/60 p-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Recorrência</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="is-recurring"
                    checked={schedule.newSession.is_recurring}
                    onCheckedChange={(checked) =>
                      schedule.setNewSession({ ...schedule.newSession, is_recurring: checked === true })
                    }
                  />
                  <Label htmlFor="is-recurring" className="text-sm font-medium">Sessão recorrente</Label>
                </div>
              </div>
              {schedule.newSession.is_recurring ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldShell>
                    <Label>Periodicidade</Label>
                    <select
                      className={nativeSelectClassName()}
                      value={schedule.newSession.recurrence_period}
                      onChange={(e) =>
                        schedule.setNewSession({ ...schedule.newSession, recurrence_period: e.target.value })
                      }
                    >
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensal</option>
                    </select>
                  </FieldShell>
                  <FieldShell>
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      disabled={schedule.newSession.is_indefinite}
                      value={schedule.newSession.recurrence_count}
                      onChange={(e) =>
                        schedule.setNewSession({ ...schedule.newSession, recurrence_count: e.target.value })
                      }
                      className="rounded-xl bg-white"
                    />
                  </FieldShell>
                  <div className="flex items-center gap-2 sm:col-span-2">
                    <Checkbox
                      id="is-indefinite"
                      checked={schedule.newSession.is_indefinite}
                      disabled={isPackageBilling}
                      onCheckedChange={(checked) =>
                        schedule.setNewSession({ ...schedule.newSession, is_indefinite: isPackageBilling ? false : checked === true })
                      }
                    />
                    <Label htmlFor="is-indefinite" className="text-sm font-medium">
                      Sem data final (cria 12 ocorrências iniciais)
                    </Label>
                  </div>
                  {isPackageBilling && (
                    <p className="text-xs font-medium text-muted-foreground sm:col-span-2">
                      Pacotes precisam de quantidade definida nesta fase.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Cria apenas uma sessão para o horário selecionado.</p>
              )}
            </section>

            {scheduleError && (
              <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{scheduleError}</p>
              </div>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 rounded-none border-t border-border/60 bg-slate-50/95 px-4 py-3 sm:px-5 sm:py-4">
            <Button variant="outline" className="rounded-2xl" onClick={() => schedule.setShowNewSession(false)} disabled={schedule.saving}>
              Cancelar
            </Button>
            <Button className="rounded-2xl" onClick={handleCreateSession} disabled={schedule.saving}>
              {schedule.saving ? "Salvando..." : "Salvar sessão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={schedule.showSessionDetails}
        onOpenChange={(open) => {
          schedule.setShowSessionDetails(open);
          if (!open) schedule.setSelectedSessionDetails(null);
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto border-primary/10 bg-white/95 p-0 shadow-[0_24px_70px_rgba(41,31,67,0.18)] sm:max-w-xl">
          <div
            className={cn(
              "border-b border-border/60 px-4 py-4 sm:px-5 sm:py-5",
              selectedIsExternal
                ? "bg-[linear-gradient(135deg,rgba(20,184,166,0.12),rgba(14,165,233,0.08))]"
                : "bg-[linear-gradient(135deg,rgba(124,58,237,0.10),rgba(255,255,255,0.75))]"
            )}
          >
            <div className="flex items-start gap-3 pr-8">
              <span
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-2xl",
                  selectedIsExternal ? "bg-teal-100 text-teal-700" : "bg-primary/10 text-primary"
                )}
              >
                {selectedIsExternal ? <ShieldCheck className="size-5" /> : <CalendarCheck2 className="size-5" />}
              </span>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight text-foreground">
                  {selectedIsExternal ? "Bloqueio Google" : "Detalhes da sessão"}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm">
                  {selectedIsExternal ? "Evento importado do Google Calendar, somente leitura." : "Informações principais da sessão clínica."}
                </DialogDescription>
              </div>
            </div>
          </div>

          {selectedItem && (
            <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
              <div className="rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {selectedIsExternal ? "Compromisso externo" : "Paciente"}
                    </p>
                    <h3 className="mt-1 truncate text-lg font-semibold text-foreground">{getSessionTitle(selectedItem)}</h3>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      selectedIsExternal ? "border-teal-200 bg-teal-50 text-teal-700" : getSessionStyle(selectedItem).badge
                    )}
                  >
                    {selectedIsExternal ? "Google" : getStatusLabel(selectedItem)}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border/70 bg-slate-50/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Clock3 className="size-4" />
                    Horário
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {new Date(selectedItem.scheduled_at).toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{getSessionTimeRange(selectedItem)}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-slate-50/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {selectedIsExternal ? <ShieldCheck className="size-4" /> : <Video className="size-4" />}
                    {selectedIsExternal ? "Origem" : "Modalidade"}
                  </div>
                  <p className="text-sm font-semibold text-foreground">
                    {selectedIsExternal ? "Google Calendar" : getSessionTypeLabel(selectedItem.session_type)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{getSessionSubtitle(selectedItem)}</p>
                </div>
                {!selectedIsExternal && (
                  <div className="rounded-2xl border border-border/70 bg-slate-50/60 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <CircleDollarSign className="size-4" />
                      Cobrança
                    </div>
                    <p className={cn("text-sm font-semibold", isCourtesySession(selectedItem) ? "text-slate-600" : "text-emerald-700")}>
                      {isPackageSession(selectedItem)
                        ? `Pacote de sessões${selectedItem.session_package?.name ? ` · ${selectedItem.session_package.name}` : ""}`
                        : isCourtesySession(selectedItem)
                          ? "Cortesia / sem cobrança"
                          : `Sessão avulsa${selectedItem.session_price != null ? ` · ${formatCurrency(Number(selectedItem.session_price))}` : ""}`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {isPackageSession(selectedItem)
                        ? `${selectedItem.session_price != null ? `Valor de referência: ${formatCurrency(Number(selectedItem.session_price))}. ` : ""}${
                            selectedItem.status === "completed"
                              ? selectedItem.package_credit_consumed
                                ? "Crédito consumido."
                                : "Crédito pendente de consumo."
                              : "Crédito será consumido ao marcar como realizada."
                          }`
                        : isCourtesySession(selectedItem)
                          ? "Não será gerada cobrança ao marcar como realizada."
                          : selectedItem.billing_status
                            ? `Financeiro: ${getBillingStatusLabel(selectedItem.billing_status) ?? selectedItem.billing_status}${
                                selectedItem.billing_amount != null ? ` · ${formatCurrency(Number(selectedItem.billing_amount))}` : ""
                              }`
                            : selectedItem.status === "completed"
                              ? "Sessão realizada. Confira o lançamento no financeiro."
                              : "A cobrança será gerada como pendente ao realizar."}
                    </p>
                  </div>
                )}
                {!selectedIsExternal && (
                  <div className="rounded-2xl border border-border/70 bg-slate-50/60 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <Building2 className="size-4" />
                      Google sync
                    </div>
                    <p className="text-sm font-semibold text-foreground">
                      {selectedItem.google_event_id ? "Sincronizada" : "Sem evento vinculado"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedItem.google_event_id ? "Evento vinculado ao Google Calendar." : "A sessão permanece no Nythos."}
                    </p>
                  </div>
                )}
                {!selectedIsExternal && selectedItem.status === "completed" && (
                  <div className="rounded-2xl border border-border/70 bg-slate-50/60 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      <FileText className="size-4" />
                      Prontuário
                    </div>
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        hasSessionEvolution(selectedItem) ? "text-emerald-700" : "text-amber-700"
                      )}
                    >
                      {getEvolutionStatusLabel(selectedItem)}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {hasSessionEvolution(selectedItem)
                        ? "Esta sessão já tem evolução vinculada."
                        : "Registre a evolução contextualizada desta sessão."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mx-0 mb-0 flex-col gap-2 rounded-none bg-slate-50/90 px-4 py-4 sm:flex-row sm:flex-wrap sm:px-5">
            {!selectedIsExternal && selectedItem?.patient_id && (
              <Button
                variant="outline"
                className="rounded-2xl bg-white"
                onClick={() => router.push(`/dashboard/patients/${selectedItem.patient_id}`)}
                disabled={cancellingSession || completingSession}
              >
                <UserRound className="size-4" />
                Ver paciente
              </Button>
            )}
            {!selectedIsExternal && selectedItem?.patient_id && selectedItem.status === "completed" && (
              <Button
                variant="outline"
                className="rounded-2xl border-primary/20 bg-white text-primary hover:bg-primary/5"
                onClick={() =>
                  router.push(
                    `/dashboard/patients/${selectedItem.patient_id}?tab=sessions&sessionId=${selectedItem.id}&evolution=1`
                  )
                }
                disabled={cancellingSession || completingSession}
              >
                <FileText className="size-4" />
                {hasSessionEvolution(selectedItem) ? "Editar evolução" : "Registrar evolução"}
              </Button>
            )}
            {canCompleteSelectedSession && (
              <Button
                className="rounded-2xl bg-emerald-600 text-white shadow-emerald-600/20 hover:bg-emerald-700"
                onClick={() => handleCompleteSession()}
                disabled={cancellingSession || completingSession}
              >
                <CheckCircle className="size-4" />
                {completingSession ? "Finalizando..." : "Marcar como realizada"}
              </Button>
            )}
            {!selectedIsExternal && selectedItem?.status === "scheduled" && (
              <Button
                variant="outline"
                className="rounded-2xl border-rose-200 bg-white text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                onClick={handleCancelSession}
                disabled={cancellingSession || completingSession}
              >
                {cancellingSession ? "Cancelando..." : "Cancelar sessão"}
              </Button>
            )}
            <Button className="rounded-2xl" onClick={() => schedule.setShowSessionDetails(false)} disabled={cancellingSession || completingSession}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
