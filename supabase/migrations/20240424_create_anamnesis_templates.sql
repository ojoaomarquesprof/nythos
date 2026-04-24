-- ============================================================
-- TABELA: anamnesis_templates (Modelos de Anamnese)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.anamnesis_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de objetos {id, label, type, required, options}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_anamnesis_templates_user_id ON public.anamnesis_templates(user_id);

ALTER TABLE public.anamnesis_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Therapists can view own anamnesis_templates"
  ON public.anamnesis_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can insert own anamnesis_templates"
  ON public.anamnesis_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Therapists can update own anamnesis_templates"
  ON public.anamnesis_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Therapists can delete own anamnesis_templates"
  ON public.anamnesis_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_anamnesis_templates_updated_at
  BEFORE UPDATE ON public.anamnesis_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
