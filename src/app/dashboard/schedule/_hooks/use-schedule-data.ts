import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { SESSION_STATUS } from "@/lib/constants";
import { listPatientSessionPackages } from "@/app/actions/session-packages";
import type { ExternalCalendarEvent, Patient, Profile, Session, SessionPackageWithBalance } from "@/types/database";

type ScheduleItem = (Session & { patient?: Patient }) & {
  has_session_evolution?: boolean;
  billing_status?: string | null;
  billing_amount?: number | string | null;
  financial_entry_id?: string | null;
  package_credit_consumed?: boolean;
  session_package_usage_id?: string | null;
  session_package?: {
    id: string;
    name: string;
    total_amount: number | string;
    unit_amount: number | string;
    payment_status: string;
  } | null;
  is_external_google?: boolean;
  external_title?: string | null;
  external_description?: string | null;
  external_location?: string | null;
  external_ends_at?: string | null;
  external_is_all_day?: boolean;
};
type ExternalCalendarRangeEvent = Pick<ExternalCalendarEvent, "id" | "starts_at" | "ends_at">;
type ExternalCalendarScheduleEvent = Pick<
  ExternalCalendarEvent,
  "id" | "user_id" | "google_event_id" | "title" | "description" | "location" | "starts_at" | "ends_at" | "is_all_day" | "created_at" | "updated_at"
>;

const getWeekStart = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonthStart = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
};

export function useScheduleData() {
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [sessions, setSessions] = useState<ScheduleItem[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [showNewSession, setShowNewSession] = useState(false);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [newSession, setNewSession] = useState({
    patient_id: "",
    scheduled_at: "",
    scheduled_time: "14:00",
    duration_minutes: "50",
    session_type: "individual",
    session_price: "",
    billing_mode: "single" as "single" | "free" | "package",
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

  const [selectedSessionDetails, setSelectedSessionDetails] = useState<
    ScheduleItem | null
  >(null);
  const [patientSessionPackages, setPatientSessionPackages] = useState<SessionPackageWithBalance[]>([]);
  const [patientSessionPackagesLoading, setPatientSessionPackagesLoading] = useState(false);
  const [patientSessionPackagesError, setPatientSessionPackagesError] = useState<string | null>(null);

  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  const [showSessionManager, setShowSessionManager] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [moodHappySad, setMoodHappySad] = useState(5);
  const [moodAnxiousCalm, setMoodAnxiousCalm] = useState(5);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [seriesActionType, setSeriesActionType] = useState<'delete' | 'reschedule' | null>(null);

  const [rescheduleWeekOffset, setRescheduleWeekOffset] = useState(0);
  const [therapistSessionsForReschedule, setTherapistSessionsForReschedule] = useState<
    Array<{ id: string; scheduled_at: string; duration_minutes: number | null; patient?: { full_name?: string } | null }>
  >([]);

  const rescheduleWeekDays = useMemo(() => {
    const start = getWeekStart(new Date());
    start.setDate(start.getDate() + (rescheduleWeekOffset * 7));
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [rescheduleWeekOffset]);

  useEffect(() => {
    async function fetchAgendaForReschedule() {
      if (!therapistId || !isRescheduling) return;
      
      const startRange = rescheduleWeekDays[0];
      const endRange = new Date(rescheduleWeekDays[5]);
      endRange.setHours(23, 59, 59, 999);

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, patient:patients(full_name)")
        .eq("user_id", therapistId)
        .gte("scheduled_at", startRange.toISOString())
        .lte("scheduled_at", endRange.toISOString())
        .not("status", "eq", "cancelled");

      if (sessionError) return;

      const { data: externalData, error: externalError } = await supabase
        .from("external_calendar_events")
        .select("id, starts_at, ends_at")
        .eq("user_id", therapistId)
        .lt("starts_at", endRange.toISOString())
        .gt("ends_at", startRange.toISOString());

      if (externalError) return;

      const externalAsSessions = (externalData ?? []).map((event: ExternalCalendarRangeEvent) => ({
        id: `external:${event.id}`,
        scheduled_at: event.starts_at,
        duration_minutes: Math.max(
          15,
          Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60000) || 50
        ),
        patient: null,
      }));

      setTherapistSessionsForReschedule([...(sessionData ?? []), ...externalAsSessions]);
    }
    fetchAgendaForReschedule();
  }, [rescheduleWeekOffset, isRescheduling, therapistId, rescheduleWeekDays]);

  useEffect(() => {
    let cancelled = false;

    async function fetchPatientPackages() {
      if (!newSession.patient_id) {
        setPatientSessionPackages([]);
        setPatientSessionPackagesError(null);
        setPatientSessionPackagesLoading(false);
        return;
      }

      setPatientSessionPackagesLoading(true);
      setPatientSessionPackagesError(null);
      const result = await listPatientSessionPackages(newSession.patient_id);

      if (cancelled) return;

      if (result.success) {
        setPatientSessionPackages(result.data ?? []);
      } else {
        setPatientSessionPackages([]);
        setPatientSessionPackagesError(result.error ?? "Não foi possível carregar os pacotes deste paciente.");
      }
      setPatientSessionPackagesLoading(false);
    }

    fetchPatientPackages();

    return () => {
      cancelled = true;
    };
  }, [newSession.patient_id]);

  const loadData = useCallback(async () => {
    if (!therapistId) return;
    setLoading(true);
    let start: Date;
    let end: Date;

    if (view === 'week') {
      start = getWeekStart(currentDate);
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    } else if (view === 'day') {
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else {
      start = getMonthStart(currentDate);
      start.setDate(start.getDate() - 7);
      end = new Date(start);
      end.setDate(end.getDate() + 42);
    }

    const [sessionsRes, externalEventsRes, patientsRes, profileRes] = await Promise.all([
      supabase.rpc("get_schedule_sessions_with_evolution_status", {
        p_therapist_id: therapistId,
        p_starts_at: start.toISOString(),
        p_ends_at: end.toISOString(),
      }),
      supabase
        .from("external_calendar_events")
        .select("id, user_id, google_event_id, title, description, location, starts_at, ends_at, is_all_day, created_at, updated_at")
        .eq("user_id", therapistId)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: true }),
      supabase
        .from("patients")
        .select("id, user_id, full_name, email, phone, cpf, date_of_birth, status, session_price, created_at, updated_at, auth_user_id")
        .eq("user_id", therapistId),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", therapistId)
        .single()
    ]);

    if (!sessionsRes.error && !externalEventsRes.error) {
      const sessionItems: ScheduleItem[] = (sessionsRes.data ?? []) as ScheduleItem[];
      const packageIds = Array.from(new Set(
        sessionItems
          .map((session) => session.package_id)
          .filter((packageId): packageId is string => Boolean(packageId))
      ));
      const packageSessionIds = sessionItems
        .filter((session) => session.billing_mode === "package" || Boolean(session.package_id))
        .map((session) => session.id);
      const packagesById = new Map<string, NonNullable<ScheduleItem["session_package"]>>();
      const packageUsageBySessionId = new Map<string, string>();

      if (packageIds.length > 0) {
        const { data: packageRows, error: packageRowsError } = await supabase
          .from("session_packages")
          .select("id, name, total_amount, unit_amount, payment_status")
          .in("id", packageIds);

        if (!packageRowsError) {
          for (const sessionPackage of packageRows ?? []) {
            packagesById.set(sessionPackage.id, sessionPackage);
          }
        }
      }

      if (packageSessionIds.length > 0) {
        const { data: packageUsageRows, error: packageUsageRowsError } = await supabase
          .from("session_package_usages")
          .select("id, session_id")
          .in("session_id", packageSessionIds)
          .eq("status", "active");

        if (!packageUsageRowsError) {
          for (const usage of packageUsageRows ?? []) {
            if (usage.session_id) {
              packageUsageBySessionId.set(usage.session_id, usage.id);
            }
          }
        }
      }

      const decoratedSessionItems = sessionItems.map((session) => ({
        ...session,
        session_package: session.package_id ? packagesById.get(session.package_id) ?? null : null,
        package_credit_consumed: packageUsageBySessionId.has(session.id),
        session_package_usage_id: packageUsageBySessionId.get(session.id) ?? null,
      }));
      const externalItems: ScheduleItem[] = (externalEventsRes.data ?? []).map((event: ExternalCalendarScheduleEvent) => {
        const start = new Date(event.starts_at);
        const end = new Date(event.ends_at);
        const durationMinutes = Math.max(
          15,
          Math.round((end.getTime() - start.getTime()) / 60000) || 50
        );

        return {
          id: `external:${event.id}`,
          user_id: event.user_id,
          patient_id: "",
          scheduled_at: event.starts_at,
          duration_minutes: durationMinutes,
          status: "scheduled",
          completed_at: null,
          session_type: "online",
          session_notes_encrypted: null,
          has_session_evolution: false,
          billing_status: null,
          billing_amount: null,
          financial_entry_id: null,
          session_price: null,
          billing_mode: "single",
          package_id: null,
          package_credit_consumed: false,
          session_package_usage_id: null,
          session_package: null,
          location: event.location ? "office" : "online",
          is_recurring: false,
          recurrence_rule: null,
          reminder_sent: false,
          google_event_id: event.google_event_id,
          created_at: event.created_at,
          updated_at: event.updated_at,
          is_external_google: true,
          external_title: event.title,
          external_description: event.description,
          external_location: event.location,
          external_ends_at: event.ends_at,
          external_is_all_day: event.is_all_day,
        };
      });

      const merged = [...decoratedSessionItems, ...externalItems].sort(
        (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
      setSessions(merged);
    }
    if (!patientsRes.error) setPatients(patientsRes.data);
    if (!profileRes.error) {
      setProfile(profileRes.data);
      const defaultDuration = profileRes.data?.session_duration_default;
      const defaultPrice = profileRes.data?.session_price_default;
      setNewSession((prev) => ({
        ...prev,
        duration_minutes:
          prev.duration_minutes === "50" && defaultDuration
            ? String(defaultDuration)
            : prev.duration_minutes,
        session_price:
          prev.session_price === "" && defaultPrice != null
            ? String(defaultPrice)
            : prev.session_price,
      }));
    }
    setLoading(false);
  }, [currentDate, therapistId, view]);

  useEffect(() => {
    if (therapistId) {
      loadData();
    }
  }, [currentDate, therapistId, view, loadData]);

  const navigate = (amount: number) => {
    const nextDate = new Date(currentDate);
    if (view === 'week') {
      nextDate.setDate(nextDate.getDate() + amount * 7);
    } else if (view === 'day') {
      nextDate.setDate(nextDate.getDate() + amount);
    } else {
      nextDate.setMonth(nextDate.getMonth() + amount);
    }
    setCurrentDate(nextDate);
  };

  const handleSlotClickReschedule = (day: Date, hour: number, minutes: number = 0) => {
    const dateStr = day.toISOString().split('T')[0];
    const timeStr = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    setRescheduleDate(dateStr);
    setRescheduleTime(timeStr);
  };

  return {
    therapistId,
    supabase,
    sessions,
    setSessions,
    patients,
    setPatients,
    loading,
    setLoading,
    currentDate,
    setCurrentDate,
    selectedDate,
    setSelectedDate,
    view,
    setView,
    showNewSession,
    setShowNewSession,
    showSessionDetails,
    setShowSessionDetails,
    saving,
    setSaving,
    profile,
    setProfile,
    newSession,
    setNewSession,
    patientSessionPackages,
    setPatientSessionPackages,
    patientSessionPackagesLoading,
    patientSessionPackagesError,
    selectedSessionDetails,
    setSelectedSessionDetails,
    isRescheduling,
    setIsRescheduling,
    rescheduleDate,
    setRescheduleDate,
    rescheduleTime,
    setRescheduleTime,
    showSessionManager,
    setShowSessionManager,
    sessionNotes,
    setSessionNotes,
    moodHappySad,
    setMoodHappySad,
    moodAnxiousCalm,
    setMoodAnxiousCalm,
    sessionStartTime,
    setSessionStartTime,
    showSeriesDialog,
    setShowSeriesDialog,
    seriesActionType,
    setSeriesActionType,
    rescheduleWeekOffset,
    setRescheduleWeekOffset,
    therapistSessionsForReschedule,
    setTherapistSessionsForReschedule,
    rescheduleWeekDays,
    loadData,
    navigate,
    handleSlotClickReschedule,
  };
}
