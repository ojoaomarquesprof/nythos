# Nythos — Gestão Clínica e Financeira para Psicólogos

> SaaS completo para profissionais de saúde mental. Prontuários criptografados, agenda, fluxo de caixa, área do paciente e pagamentos integrados — tudo em um único painel.

---

## Sumário

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Stack Tecnológica](#stack-tecnológica)
4. [Variáveis de Ambiente](#variáveis-de-ambiente)
5. [Setup Local](#setup-local)
   - [Pré-requisitos](#pré-requisitos)
   - [Instalação](#instalação)
   - [Supabase Local (CLI)](#supabase-local-cli)
   - [Configurando o Vault (Criptografia de Prontuários)](#configurando-o-vault-criptografia-de-prontuários)
6. [Scripts Disponíveis](#scripts-disponíveis)
7. [Deploy em Produção](#deploy-em-produção)

---

## Visão Geral

O **Nythos** é uma plataforma SaaS voltada a psicólogos e clínicas de psicologia. Ele centraliza:

| Módulo | Descrição |
|---|---|
| **Agenda** | Sessões recorrentes, reagendamentos, lembretes por Web Push |
| **Prontuários** | Notas de evolução e diagnósticos criptografados com AES via Supabase Vault |
| **Pacientes** | Cadastro completo, guardiões/responsáveis, anamnese digital |
| **Área do Paciente** | Magic Link / OTP — paciente acessa diário de emoções e tarefas sem senha |
| **Fluxo de Caixa** | Receitas, despesas, relatórios em PDF, integração com Asaas |
| **Equipe** | Terapeutas e secretárias com papéis (roles) e acesso controlado por RLS |
| **Assinatura** | Trial de 7 dias configurável via banco, planos pagos via Asaas |

### Modelo de Segurança

- **Criptografia de prontuários**: `SECURITY DEFINER` functions no PostgreSQL buscam a chave no Supabase Vault. Se a chave não estiver presente, a escrita é **abortada** (`SECURITY_FAULT`) — dados de saúde nunca são gravados em texto puro.
- **RLS (Row Level Security)**: habilitado em todas as tabelas. Terapeutas acessam apenas seus próprios dados; secretárias têm acesso delegado pelo empregador; pacientes acessam apenas seus registros via `auth.uid()`.
- **Provisionamento de pacientes**: criado server-side via `auth.admin.createUser` (service_role) — o paciente nunca consegue se auto-registrar. Um mesmo `auth_user_id` pode ser responsável por N pacientes (ex: mãe com dois filhos em terapia).

---

## Arquitetura

```
┌─────────────────────────────────────────────────────┐
│                   Browser / PWA                     │
│  Next.js App Router (React 19 · Tailwind CSS v4)   │
│  /dashboard  /patient  /public/anamnesis            │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────┐
│             Next.js Route Handlers (API)             │
│  /api/patients/create  (service_role — admin)        │
│  /api/team/invite      (service_role — admin)        │
│  /api/webhooks         (Asaas payment events)        │
│  /auth/patient/callback (Magic Link PKCE)            │
└────────────────────┬────────────────────────────────┘
                     │ Supabase JS SDK / @supabase/ssr
┌────────────────────▼────────────────────────────────┐
│                  Supabase (BaaS)                     │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ Auth        │  │ Postgres │  │ Storage        │ │
│  │ (Magic Link │  │ + RLS    │  │ (avatars/logos)│ │
│  │  OTP Email) │  │ + Vault  │  └────────────────┘ │
│  └─────────────┘  └──────────┘                      │
└─────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│                 Asaas (Gateway)                      │
│  Cobranças · Webhooks de pagamento                  │
└─────────────────────────────────────────────────────┘
```

### Estrutura de Diretórios

```
nythos-app/
├── src/
│   ├── app/
│   │   ├── dashboard/          # Painel do terapeuta
│   │   ├── patient/            # Área do paciente (login, dashboard)
│   │   ├── public/             # Anamnese pública (sem login)
│   │   ├── auth/               # Callbacks OAuth / Magic Link
│   │   └── api/                # Route Handlers server-side
│   ├── components/             # UI components
│   ├── hooks/                  # use-subscription, etc.
│   ├── lib/supabase/           # client.ts, admin.ts (service_role)
│   └── types/database.ts       # Tipos gerados do schema Supabase
├── supabase/
│   ├── schema.sql              # Schema completo (source of truth)
│   ├── seed_vault.sql          # Setup da chave de criptografia
│   └── migrations/             # Migrations incrementais
└── public/                     # Ícones PWA, manifest
```

---

## Stack Tecnológica

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js | 16.2.4 |
| UI | React | 19.2.4 |
| Estilo | Tailwind CSS | v4 |
| Componentes | shadcn/ui + Lucide React | — |
| Gráficos | Recharts | ^3.8 |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) | ^2.104 |
| Pagamentos | Asaas | REST API |
| Push Notifications | Web Push (VAPID) | ^3.6 |
| PDF | jsPDF + AutoTable | ^4.2 |
| Deploy | Vercel | — |

---

## Variáveis de Ambiente

Crie o arquivo `.env.local` na raiz de `nythos-app/` com o seguinte conteúdo:

```dotenv
# ── Supabase ─────────────────────────────────────────────────────────────────
# Encontre em: supabase.com → Project Settings → API

NEXT_PUBLIC_SUPABASE_URL=https://<SEU_PROJECT_REF>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>

# ⚠️  NUNCA exponha esta chave no browser. Use apenas em Route Handlers.
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>

# ── App ───────────────────────────────────────────────────────────────────────
# URL base usada nos Magic Links de pacientes (sem barra final)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Asaas (Gateway de Pagamento) ─────────────────────────────────────────────
# Sandbox: https://sandbox.asaas.com  |  Produção: https://asaas.com
ASAAS_API_KEY=<SUA_ASAAS_API_KEY>

# Token secreto para validar webhooks do Asaas (string aleatória sua)
ASAAS_WEBHOOK_TOKEN=<TOKEN_SECRETO_WEBHOOK>

# ── Web Push / PWA ────────────────────────────────────────────────────────────
# Gere com: npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<VAPID_PUBLIC_KEY>
VAPID_PRIVATE_KEY=<VAPID_PRIVATE_KEY>
VAPID_EMAIL=mailto:seu@email.com
```

> **Sobre o Vault:** A chave de criptografia de prontuários (`nythos_encryption_key`) **não é** uma variável de ambiente da aplicação Next.js. Ela vive exclusivamente dentro do Supabase Vault. Veja a seção [Configurando o Vault](#configurando-o-vault-criptografia-de-prontuários).

---

## Setup Local

### Pré-requisitos

| Ferramenta | Versão mínima | Instalação |
|---|---|---|
| Node.js | 20 LTS | [nodejs.org](https://nodejs.org) |
| npm | 10+ | Incluso com Node |
| Supabase CLI | 2.x | `npm i -g supabase` |
| Docker Desktop | qualquer | [docker.com](https://docker.com) — obrigatório para `supabase start` |

Verifique a instalação:

```bash
node --version      # v20.x.x
supabase --version  # 2.x.x
docker info         # deve responder sem erro
```

---

### Instalação

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/nythos.git
cd nythos/nythos-app

# 2. Instale as dependências
npm install

# 3. Copie o template de variáveis de ambiente
cp .env.local.example .env.local
# Preencha os valores conforme a seção anterior
```

---

### Supabase Local (CLI)

O Supabase CLI sobe uma instância completa do Supabase (PostgreSQL, Auth, Storage, Studio) via Docker, sem depender do projeto em nuvem durante o desenvolvimento.

#### 1. Iniciar o Supabase

```bash
supabase start
```

Aguarde o pull das imagens Docker na primeira execução (~2 min). Ao final, você verá algo como:

```
Started supabase local development setup.

         API URL: http://127.0.0.1:54321
     GraphQL URL: http://127.0.0.1:54321/graphql/v1
  S3 Storage URL: http://127.0.0.1:54321/storage/v1/s3
          DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
      Studio URL: http://127.0.0.1:54323
    Inbucket URL: http://127.0.0.1:54324   ← caixa de email fake (Magic Links!)
      JWT secret: super-secret-jwt-token-...
        anon key: eyJ...
service_role key: eyJ...
```

> 💡 **Inbucket** (`http://127.0.0.1:54324`) é a caixa de email local. Todos os Magic Links enviados pelo Auth local aparecem aqui — não precisam de SMTP real.

#### 2. Atualizar `.env.local` com as chaves locais

Substitua os valores do `.env.local` pelas chaves impressas pelo `supabase start`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key do output acima>
SUPABASE_SERVICE_ROLE_KEY=<service_role key do output acima>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### 3. Aplicar o schema e as migrations

```bash
# Aplica o schema completo (tabelas, funções, triggers, RLS)
supabase db reset

# Ou, se quiser aplicar apenas as migrations novas:
supabase migration up
```

O `db reset` executa automaticamente:
1. `supabase/schema.sql` — schema base
2. Todas as migrations em `supabase/migrations/` em ordem cronológica

Confirme que as tabelas foram criadas no Studio: `http://127.0.0.1:54323`

#### 4. Iniciar o servidor Next.js

```bash
npm run dev
```

Acesse `http://localhost:3000`.

#### 5. Parar o Supabase

```bash
supabase stop
# Para descartar todos os dados locais (reset completo):
supabase stop --backup
```

---

### Configurando o Vault (Criptografia de Prontuários)

> **Por que isso é necessário?**
> As funções `encrypt_sensitive_text` e `decrypt_sensitive_text` buscam a chave `nythos_encryption_key` no Supabase Vault. Sem ela, qualquer tentativa de salvar notas de evolução ou diagnósticos será **abortada com `SECURITY_FAULT`** — por design, para proteger dados clínicos sensíveis.

#### Passo 1 — Habilitar a extensão Vault (local)

No **Supabase Studio local** (`http://127.0.0.1:54323`), vá em:  
`Database → Extensions` e habilite **`supabase_vault`**.

Ou via SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

#### Passo 2 — Gerar uma chave segura

```bash
# macOS / Linux
openssl rand -base64 32

# Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))

# Node.js (qualquer OS)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Exemplo de saída: `K7gNU3sdo+OL0wNhqoVWhr7vHkXKBqFxHSKEF60XPKY=`

#### Passo 3 — Executar o seed do Vault

Abra `supabase/seed_vault.sql`, substitua `<SUA_CHAVE_AQUI>` pela chave gerada e execute no SQL Editor do Studio local:

```sql
-- Trecho relevante do seed_vault.sql:
DO $$
DECLARE
  v_encryption_key TEXT := 'K7gNU3sdo+OL0wNhqoVWhr7vHkXKBqFxHSKEF60XPKY='; -- ← sua chave
BEGIN
  PERFORM vault.create_secret(
    v_encryption_key,
    'nythos_encryption_key',
    'Chave AES para criptografia de prontuários clínicos no Nythos SaaS.'
  );
END;
$$;
```

Ou cole e execute o arquivo completo `supabase/seed_vault.sql` de uma vez — ele inclui validações e um smoke test automático.

#### Passo 4 — Verificar

Após executar o seed, o smoke test ao final do arquivo imprimirá:

```
NOTICE:  ✅ Smoke test PASSOU: criptografia AES funcionando corretamente.
```

> **Importante:** A chave do Vault é armazenada **dentro do banco de dados local** (não no `.env.local`). Ao fazer `supabase stop --backup` ou resetar o banco, você precisará executar o `seed_vault.sql` novamente.

---

## Scripts Disponíveis

```bash
npm run dev      # Servidor de desenvolvimento (hot reload)
npm run build    # Build de produção
npm run start    # Servidor de produção (após build)
npm run lint     # ESLint
```

```bash
supabase start         # Sobe instância local (Docker)
supabase stop          # Para instância local
supabase db reset      # Recria o banco local do zero (schema + migrations)
supabase migration new <nome>   # Cria nova migration com timestamp
supabase migration up           # Aplica migrations pendentes
supabase db diff                # Gera migration a partir de mudanças no schema
supabase status                 # Mostra URLs e status dos serviços locais
```

---

## Deploy em Produção

### Vercel (recomendado)

O Nythos é otimizado para deploy no Vercel com zero configuração adicional.

#### 1. Criar projeto no Vercel

```bash
npx vercel --prod
```

Ou conecte o repositório GitHub em [vercel.com/new](https://vercel.com/new).

#### 2. Configurar variáveis de ambiente no Vercel

No painel do Vercel → **Settings → Environment Variables**, adicione todas as variáveis do `.env.local`, substituindo os valores locais pelos de produção:

| Variável | Valor em Produção |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase (nuvem) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key do projeto (nuvem) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (**marcar como Secret**) |
| `NEXT_PUBLIC_APP_URL` | `https://seudominio.com` |
| `ASAAS_API_KEY` | Chave de produção (não sandbox) |
| `ASAAS_WEBHOOK_TOKEN` | Token secreto que você cadastrou no painel Asaas |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Chave VAPID pública |
| `VAPID_PRIVATE_KEY` | Chave VAPID privada (**marcar como Secret**) |
| `VAPID_EMAIL` | `mailto:contato@seudominio.com` |

#### 3. Aplicar o schema no Supabase de Produção

No **SQL Editor** do seu projeto Supabase (nuvem):

```sql
-- Execute o conteúdo de supabase/schema.sql completo
-- Depois execute cada migration em supabase/migrations/ em ordem
```

Ou, se estiver usando a Supabase CLI vinculada ao projeto remoto:

```bash
supabase link --project-ref <SEU_PROJECT_REF>
supabase db push
```

#### 4. Configurar o Vault em Produção

No **SQL Editor** do Supabase em nuvem, siga os mesmos passos da seção [Configurando o Vault](#configurando-o-vault-criptografia-de-prontuários), usando uma chave diferente da de desenvolvimento:

```bash
# Gere uma chave exclusiva para produção
openssl rand -base64 32
```

> ⚠️ **Nunca reutilize a chave de desenvolvimento em produção.** Guarde a chave de produção em um gerenciador de segredos (1Password, AWS Secrets Manager, etc.).

#### 5. Configurar Redirect URLs no Supabase Auth

No Supabase → **Authentication → URL Configuration**:

- **Site URL**: `https://seudominio.com`
- **Redirect URLs** (adicionar):
  - `https://seudominio.com/auth/callback`
  - `https://seudominio.com/auth/patient/callback`

#### 6. Configurar Webhook do Asaas

No painel do Asaas → **Configurações → Webhooks**, registre:

- **URL**: `https://seudominio.com/api/webhooks`
- **Token**: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
- **Eventos**: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`

---

## Licença

Proprietário — © 2026 Nythos. Todos os direitos reservados.
