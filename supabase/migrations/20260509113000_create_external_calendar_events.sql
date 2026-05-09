-- ============================================================
-- Nythos - External Calendar Events (Google blockers)
-- Stores non-clinical calendar events as availability blocks.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.external_calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_event_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  title TEXT,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
  html_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT external_calendar_events_time_check CHECK (ends_at > starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS external_calendar_events_user_google_event_uidx
  ON public.external_calendar_events (user_id, google_event_id);

CREATE INDEX IF NOT EXISTS external_calendar_events_user_starts_idx
  ON public.external_calendar_events (user_id, starts_at);

CREATE INDEX IF NOT EXISTS external_calendar_events_user_ends_idx
  ON public.external_calendar_events (user_id, ends_at);

ALTER TABLE public.external_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view relevant external calendar events"
  ON public.external_calendar_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND employer_id = external_calendar_events.user_id
    )
  );

CREATE POLICY "Users can insert relevant external calendar events"
  ON public.external_calendar_events FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND employer_id = external_calendar_events.user_id
    )
  );

CREATE POLICY "Users can update relevant external calendar events"
  ON public.external_calendar_events FOR UPDATE
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND employer_id = external_calendar_events.user_id
    )
  );

CREATE POLICY "Therapists can delete own external calendar events"
  ON public.external_calendar_events FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_external_calendar_events_updated_at ON public.external_calendar_events;
CREATE TRIGGER update_external_calendar_events_updated_at
  BEFORE UPDATE ON public.external_calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
