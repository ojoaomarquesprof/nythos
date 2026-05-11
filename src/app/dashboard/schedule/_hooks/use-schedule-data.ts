import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { SESSION_STATUS } from "@/lib/constants";
import type { ExternalCalendarEvent, Patient, Profile, Session } from "@/types/database";

type ScheduleItem = (Session & { patient?: Patient }) & {
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
      supabase
        .from("sessions")
        .select("id, user_id, patient_id, scheduled_at, duration_minutes, status, session_type, session_price, location, is_recurring, recurrence_rule, reminder_sent, google_event_id, created_at, updated_at, patient:patients(id, full_name, email, phone, session_price, status)")
        .eq("user_id", therapistId)
        .neq("status", "cancelled")
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("external_calendar_events")
        .select("id, user_id, google_event_id, title, description, location, starts_at, ends_at, is_all_day, created_at, updated_at")
        .eq("user_id", therapistId)
        .gte("starts_at", start.toISOString())
        .lt("starts_at", end.toISOString())
        .order("starts_at", { ascending: true }),
      supabase
        .from("patients")
        .select("id, user_id, full_name, email, phone, cpf, date_of_birth, status, session_price, created_at, updated_at, access_token, auth_user_id")
        .eq("user_id", therapistId),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", therapistId)
        .single()
    ]);

    if (!sessionsRes.error && !externalEventsRes.error) {
      const sessionItems: ScheduleItem[] = (sessionsRes.data ?? []) as ScheduleItem[];
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
          session_type: "online",
          session_notes_encrypted: null,
          session_price: null,
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

      const merged = [...sessionItems, ...externalItems].sort(
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
