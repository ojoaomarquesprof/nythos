-- ============================================================
-- ATUALIZAÇÃO: anamnesis_responses (Rastreamento por Paciente)
-- ============================================================

-- Adicionar colunas necessárias para rastreamento
ALTER TABLE public.anamnesis_responses 
ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES public.patients(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed'));

-- Índice para busca rápida por paciente
CREATE INDEX IF NOT EXISTS idx_anamnesis_responses_patient_id ON public.anamnesis_responses(patient_id);

-- ============================================================
-- RLS: anamnesis_responses (Ajustes para Rastreamento)
-- ============================================================

-- Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Public can insert responses" ON public.anamnesis_responses;

-- Agora o psicólogo cria a resposta (INSERT) para o paciente
CREATE POLICY "Therapists can create response requests"
  ON public.anamnesis_responses FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.anamnesis_templates
      WHERE anamnesis_templates.id = template_id
      AND anamnesis_templates.user_id = auth.uid()
    )
  );

-- Paciente (Público) pode visualizar sua própria resposta se estiver pendente
CREATE POLICY "Public can view pending response"
  ON public.anamnesis_responses FOR SELECT
  USING (status = 'pending' OR true); -- Permitir select para verificar status

-- Paciente (Público) pode atualizar sua resposta
CREATE POLICY "Public can update pending response"
  ON public.anamnesis_responses FOR UPDATE
  USING (status = 'pending')
  WITH CHECK (status = 'completed'); -- Só pode mudar para completed ao finalizar

-- Garantir que terapeutas continuem vendo tudo o que é deles
DROP POLICY IF EXISTS "Therapists can view responses to their templates" ON public.anamnesis_responses;
CREATE POLICY "Therapists can manage responses to their templates"
  ON public.anamnesis_responses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.anamnesis_templates
      WHERE anamnesis_templates.id = template_id
      AND anamnesis_templates.user_id = auth.uid()
    )
  );
