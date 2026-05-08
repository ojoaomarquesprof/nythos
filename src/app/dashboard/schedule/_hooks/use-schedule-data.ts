import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { SESSION_STATUS } from "@/lib/constants";
import type { Session, Patient } from "@/types/database";

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
  const [sessions, setSessions] = useState<(Session & { patient?: Patient })[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState<'day' | 'week' | 'month'>('week');
  const [showNewSession, setShowNewSession] = useState(false);
  const [showSessionDetails, setShowSessionDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);

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
    (Session & { patient?: Patient }) | null
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
  const [therapistSessionsForReschedule, setTherapistSessionsForReschedule] = useState<Session[]>([]);

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

      const { data, error } = await supabase
        .from("sessions")
        .select("id, scheduled_at, duration_minutes, patient:patients(full_name)")
        .eq("user_id", therapistId)
        .gte("scheduled_at", startRange.toISOString())
        .lte("scheduled_at", endRange.toISOString())
        .not("status", "eq", "cancelled");

      if (!error && data) {
        setTherapistSessionsForReschedule(data);
      }
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

    const [sessionsRes, patientsRes, profileRes] = await Promise.all([
      supabase
        .from("sessions")
        .select("*, patient:patients(*)")
        .eq("user_id", therapistId)
        .gte("scheduled_at", start.toISOString())
        .lt("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true }),
      supabase
        .from("patients")
        .select("*")
        .eq("user_id", therapistId),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", therapistId)
        .single()
    ]);

    if (!sessionsRes.error) setSessions(sessionsRes.data);
    if (!patientsRes.error) setPatients(patientsRes.data);
    if (!profileRes.error) setProfile(profileRes.data);
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
