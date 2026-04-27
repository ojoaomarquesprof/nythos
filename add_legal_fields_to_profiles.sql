-- Script para adicionar campos jurídicos ao perfil do terapeuta
-- Execute este script no SQL Editor do seu painel Supabase

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS rg TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.profiles.cpf IS 'CPF do profissional para geração de contratos';
COMMENT ON COLUMN public.profiles.rg IS 'RG do profissional para geração de contratos';
COMMENT ON COLUMN public.profiles.address IS 'Endereço profissional/residencial para geração de contratos';
