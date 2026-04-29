-- ============================================================
-- NYTHOS — Seed do Supabase Vault
-- Script de Setup da Chave de Criptografia
-- ============================================================
-- OBJETIVO:
--   Registrar a chave 'nythos_encryption_key' no Supabase Vault
--   para habilitar a criptografia AES de dados sensíveis dos pacientes
--   (notas clínicas, diagnósticos e evolução de sessões).
--
-- QUANDO EXECUTAR:
--   1. Novo deploy (ambiente de produção ou staging)
--   2. Reset de banco local via Supabase CLI
--   3. Qualquer ambiente onde a chave ainda não estiver no Vault
--
-- PRÉ-REQUISITO:
--   A extensão 'supabase_vault' deve estar habilitada no projeto.
--   Verifique em: Dashboard → Database → Extensions → supabase_vault
--
-- SEGURANÇA:
--   • Nunca commite este arquivo com a chave real preenchida no repositório.
--   • Em produção, gere a chave via variável de ambiente ou secret manager
--     e execute este script via CI/CD com a chave injetada.
--   • Substitua <SUA_CHAVE_AQUI> por uma string aleatória de 32+ caracteres
--     (ex: gerada com `openssl rand -base64 32`).
-- ============================================================

-- ============================================================
-- PASSO 1: Habilitar a extensão do Vault (se ainda não estiver ativa)
-- ============================================================
-- Execute no SQL Editor do Dashboard com permissão de superusuário:
--
--   CREATE EXTENSION IF NOT EXISTS supabase_vault;
--
-- Ou via Supabase CLI (supabase db diff detectará a mudança):
--   Adicione ao schema.sql:  CREATE EXTENSION IF NOT EXISTS "supabase_vault";

-- ============================================================
-- PASSO 2: Inserir ou atualizar a chave de criptografia no Vault
-- ============================================================
-- IMPORTANTE: Substitua '<SUA_CHAVE_AQUI>' pela sua chave real antes de executar.
-- A chave deve ter no mínimo 32 bytes para AES-256.
-- Exemplo de geração segura no terminal:
--   openssl rand -base64 32
--   python3 -c "import secrets; print(secrets.token_urlsafe(32))"

DO $$
DECLARE
  v_existing_id UUID;
  v_encryption_key TEXT := '<SUA_CHAVE_AQUI>'; -- ← Substitua esta chave!
BEGIN
  -- Validação mínima: garante que o placeholder foi substituído
  IF v_encryption_key = '<SUA_CHAVE_AQUI>' OR length(v_encryption_key) < 16 THEN
    RAISE EXCEPTION
      'ERRO DE SETUP: Substitua <SUA_CHAVE_AQUI> por uma chave real de 32+ caracteres antes de executar este script.'
      USING HINT = 'Gere uma chave com: openssl rand -base64 32';
  END IF;

  -- Verificar se a chave já existe no Vault
  SELECT id INTO v_existing_id
  FROM vault.secrets
  WHERE name = 'nythos_encryption_key'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Atualizar chave existente (ex: rotação de chave)
    PERFORM vault.update_secret(
      v_existing_id,
      v_encryption_key,                           -- novo valor do secret
      'nythos_encryption_key',                    -- nome (mantém igual)
      'Chave AES para criptografia de prontuários clínicos no Nythos SaaS. Gerada em: ' || NOW()::TEXT
    );
    RAISE NOTICE 'VAULT: Chave nythos_encryption_key atualizada com sucesso (id: %).', v_existing_id;
  ELSE
    -- Inserir chave nova
    PERFORM vault.create_secret(
      v_encryption_key,                           -- valor do secret
      'nythos_encryption_key',                    -- nome único no Vault
      'Chave AES para criptografia de prontuários clínicos no Nythos SaaS. Criada em: ' || NOW()::TEXT
    );
    RAISE NOTICE 'VAULT: Chave nythos_encryption_key criada com sucesso.';
  END IF;
END;
$$;

-- ============================================================
-- PASSO 3: Verificar se a chave foi registrada corretamente
-- ============================================================
-- Execute esta query para confirmar (NÃO expõe o valor da chave):
SELECT
  id,
  name,
  description,
  created_at,
  updated_at,
  -- Confirma que o valor existe sem revelar a chave completa:
  left(secret, 4) || repeat('*', greatest(length(secret) - 4, 0)) AS secret_preview
FROM vault.decrypted_secrets
WHERE name = 'nythos_encryption_key';

-- ============================================================
-- PASSO 4: Smoke Test — Validar criptografia end-to-end
-- ============================================================
-- Execute após o Passo 3 para confirmar que encrypt/decrypt funcionam:
DO $$
DECLARE
  v_original   TEXT := 'Teste de criptografia Nythos 🔐';
  v_encrypted  TEXT;
  v_decrypted  TEXT;
BEGIN
  v_encrypted := encrypt_sensitive_text(v_original);
  v_decrypted := decrypt_sensitive_text(v_encrypted);

  -- Verificar se a criptografia funcionou corretamente
  IF v_encrypted LIKE 'ENC::%' AND v_decrypted = v_original THEN
    RAISE NOTICE '✅ Smoke test PASSOU: criptografia AES funcionando corretamente.';
    RAISE NOTICE '   Original:     %', v_original;
    RAISE NOTICE '   Criptografado: % ... (truncado)', left(v_encrypted, 20);
    RAISE NOTICE '   Descriptografado: %', v_decrypted;
  ELSIF v_encrypted LIKE 'PLAIN::%' THEN
    RAISE WARNING '⚠️  Smoke test PARCIAL: Vault sem chave configurada. Dados armazenados como PLAIN::.';
    RAISE WARNING '   Execute os Passos 1-3 deste script para ativar a criptografia.';
  ELSE
    RAISE EXCEPTION '❌ Smoke test FALHOU: resultado inesperado.';
  END IF;
END;
$$;

-- ============================================================
-- REFERÊNCIA RÁPIDA: Variáveis de Ambiente para CI/CD
-- ============================================================
-- Em pipelines de CI/CD (GitHub Actions, Vercel, etc.), injete a chave
-- como secret e execute este script com substituição de variável:
--
--   # Exemplo com psql e variável de ambiente:
--   PGPASSWORD=$DB_PASSWORD psql \
--     -h $DB_HOST -U $DB_USER -d $DB_NAME \
--     -c "DO \$\$ BEGIN PERFORM vault.create_secret('$NYTHOS_ENCRYPTION_KEY', 'nythos_encryption_key', 'Chave AES Nythos'); END \$\$;"
--
--   # Ou usando sed para substituição no script:
--   sed "s/<SUA_CHAVE_AQUI>/$NYTHOS_ENCRYPTION_KEY/g" supabase/seed_vault.sql | psql ...
--
-- Variáveis de ambiente recomendadas:
--   NYTHOS_ENCRYPTION_KEY  → valor gerado por `openssl rand -base64 32`
--
-- ============================================================
-- FIM DO SEED_VAULT.SQL
-- ============================================================
