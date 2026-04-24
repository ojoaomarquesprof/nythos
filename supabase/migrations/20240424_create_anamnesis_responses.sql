-- ============================================================
-- TABELA: anamnesis_responses (Respostas de Anamnese)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.anamnesis_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES public.anamnesis_templates(id) ON DELETE CASCADE,
  responses JSONB NOT NULL DEFAULT '{}'::jsonb, -- Objeto {field_id: value}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RLS: anamnesis_templates (Acesso Público para Leitura)
-- ============================================================

-- Remover política antiga para recriar com acesso público controlado
DROP POLICY IF EXISTS "Therapists can view own anamnesis_templates" ON public.anamnesis_templates;

-- Qualquer um pode visualizar a estrutura de um template se tiver o ID
CREATE POLICY "Public can view template structure"
  ON public.anamnesis_templates FOR SELECT
  USING (true);

-- ============================================================
-- RLS: anamnesis_responses
-- ============================================================

ALTER TABLE public.anamnesis_responses ENABLE ROW LEVEL SECURITY;

-- Público pode inserir respostas
CREATE POLICY "Public can insert responses"
  ON public.anamnesis_responses FOR INSERT
  WITH CHECK (true);

-- Apenas o criador do template pode ver as respostas
CREATE POLICY "Therapists can view responses to their templates"
  ON public.anamnesis_responses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.anamnesis_templates
      WHERE anamnesis_templates.id = anamnesis_responses.template_id
      AND anamnesis_templates.user_id = auth.uid()
    )
  );

-- Trigger para updated_at (se necessário no futuro, mas por enquanto respostas são imutáveis)
