````md
# Nythos — SaaS para Gestão Clínica e Financeira

> Plataforma SaaS para profissionais de saúde mental, com agenda, pacientes, prontuários, fluxo financeiro, área do paciente, equipe e segurança aplicada a dados sensíveis.

<p align="left">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=nextdotjs" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=3ECF8E" alt="Supabase" />
  <img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
</p>

---

## Visão geral

O **Nythos** é uma aplicação SaaS desenvolvida para centralizar a rotina de psicólogos e clínicas de psicologia em um único painel.

O sistema reúne módulos essenciais para gestão clínica e administrativa, incluindo agenda, pacientes, prontuários, área do paciente, equipe, financeiro e recursos de segurança para lidar com informações sensíveis.

O projeto foi desenvolvido como um produto real, com foco em:

- organização operacional;
- experiência do usuário;
- segurança de dados;
- controle de acesso;
- arquitetura modular;
- evolução contínua como plataforma SaaS.

---

## Problema que o projeto resolve

Clínicas e profissionais da psicologia geralmente precisam lidar com diferentes ferramentas para organizar agenda, pacientes, registros clínicos, pagamentos, tarefas e comunicação com pacientes.

O Nythos propõe centralizar essa rotina em uma única plataforma, reduzindo a fragmentação de informações e tornando a operação mais clara, segura e eficiente.

---

## Principais funcionalidades

| Módulo | Descrição |
|---|---|
| **Dashboard** | Visão geral da operação, atalhos e indicadores principais |
| **Agenda** | Sessões, reagendamentos, organização de horários e atendimentos |
| **Pacientes** | Cadastro completo, responsáveis, histórico e informações de acompanhamento |
| **Prontuários** | Registros clínicos com estrutura voltada à privacidade e proteção de dados |
| **Área do Paciente** | Acesso simplificado para paciente, com recursos de acompanhamento |
| **Financeiro** | Receitas, despesas, relatórios e controle financeiro clínico |
| **Equipe** | Gestão de terapeutas, secretárias, papéis e permissões |
| **Notificações** | Estrutura preparada para lembretes e comunicação com usuários |
| **Assinatura** | Estrutura preparada para evolução de cobrança e planos SaaS |

---

## Destaques técnicos

- Arquitetura full stack com **Next.js App Router**
- Interface construída com **React**, **TypeScript** e **Tailwind CSS**
- Backend integrado com **Supabase**
- Banco de dados relacional com **PostgreSQL**
- Autenticação com Supabase Auth
- Controle de permissões com **RLS — Row Level Security**
- Estrutura de criptografia para dados sensíveis usando **Supabase Vault**
- Route Handlers server-side para operações administrativas
- Organização modular por áreas do sistema
- Estrutura preparada para deploy na **Vercel**
- Fluxos pensados para uso real em ambiente clínico
- Separação entre dados públicos, privados e administrativos

---

## Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js |
| UI | React |
| Linguagem | TypeScript |
| Estilização | Tailwind CSS |
| Componentes | shadcn/ui + Lucide React |
| Gráficos | Recharts |
| Backend/BaaS | Supabase |
| Banco de dados | PostgreSQL |
| Autenticação | Supabase Auth |
| Segurança | RLS + Supabase Vault |
| Storage | Supabase Storage |
| Notificações | Web Push |
| PDF | jsPDF + AutoTable |
| Deploy | Vercel |

---

## Arquitetura

```txt
┌─────────────────────────────────────────────────────┐
│                   Browser / PWA                     │
│  Next.js App Router · React · Tailwind CSS          │
│  /dashboard  /patient  /public/anamnesis            │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS
┌────────────────────▼────────────────────────────────┐
│             Next.js Route Handlers                  │
│  Operações server-side, autenticação e integrações   │
└────────────────────┬────────────────────────────────┘
                     │ Supabase JS SDK / SSR
┌────────────────────▼────────────────────────────────┐
│                  Supabase                           │
│  Auth · PostgreSQL · RLS · Vault · Storage          │
└─────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│             Integrações externas                     │
│  Pagamentos, notificações e serviços auxiliares      │
└─────────────────────────────────────────────────────┘
```

---

## Modelo de segurança

Por se tratar de uma aplicação voltada à saúde mental, o projeto considera boas práticas de segurança, privacidade e controle de acesso.

### Medidas aplicadas

- **RLS — Row Level Security** habilitado nas tabelas sensíveis.
- Usuários acessam apenas os dados relacionados ao seu perfil e permissões.
- Operações administrativas sensíveis são executadas server-side.
- Chaves privadas e credenciais não devem ser expostas no cliente.
- Dados clínicos sensíveis contam com estrutura de criptografia via Supabase Vault.
- O projeto utiliza variáveis de ambiente para configurações sensíveis.
- O repositório não deve conter dados reais de pacientes, prontuários, documentos, tokens ou credenciais.

### Prontuários e dados sensíveis

O sistema foi estruturado para evitar gravação indevida de informações clínicas em texto puro.

A camada de banco utiliza funções controladas e integração com o Vault para lidar com dados sensíveis, garantindo que informações críticas dependam de configuração segura antes de serem persistidas.

> Este repositório é apresentado como case técnico. Não devem ser versionados dados reais, credenciais, documentos, informações pessoais ou dados clínicos de pacientes.

---

## Estrutura de diretórios

```txt
nythos-app/
├── src/
│   ├── app/
│   │   ├── dashboard/          # Painel do profissional
│   │   ├── patient/            # Área do paciente
│   │   ├── public/             # Fluxos públicos
│   │   ├── auth/               # Callbacks e autenticação
│   │   └── api/                # Route Handlers server-side
│   ├── components/             # Componentes de interface
│   ├── hooks/                  # Hooks reutilizáveis
│   ├── lib/                    # Clientes, helpers e integrações
│   └── types/                  # Tipagens do projeto
├── supabase/
│   ├── schema.sql              # Schema principal
│   ├── seed_vault.sql          # Setup do Vault
│   └── migrations/             # Migrations incrementais
├── docs/                       # Documentação operacional
└── public/                     # Arquivos públicos e PWA
```

---

## Pré-requisitos

| Ferramenta | Versão recomendada |
|---|---|
| Node.js | 20 LTS ou superior |
| npm | 10 ou superior |
| Supabase CLI | 2.x |
| Docker Desktop | Necessário para Supabase local |

Verifique a instalação:

```bash
node --version
npm --version
supabase --version
docker info
```

---

## Configuração local

Clone o repositório:

```bash
git clone https://github.com/ojoaomarquesprof/nythos.git
```

Acesse a pasta do projeto:

```bash
cd nythos/nythos-app
```

Instale as dependências:

```bash
npm install
```

Crie o arquivo de ambiente local:

```bash
cp .env.example .env.local
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Acesse:

```txt
http://localhost:3000
```

---

## Variáveis de ambiente

Use o arquivo `.env.example` como referência e crie um `.env.local` na raiz da aplicação.

Exemplo de estrutura:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=
PATIENT_SESSION_SECRET=

# Pagamentos
STRIPE_ENVIRONMENT=
STRIPE_CHECKOUT_ENABLED=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

ASAAS_ENVIRONMENT=
ASAAS_CHECKOUT_ENABLED=
ASAAS_BASE_URL=
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=

# Web Push / PWA
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=
```

> Nunca envie `.env.local`, chaves privadas, tokens, service role key ou segredos reais para o repositório.

---

## Supabase local

O Supabase CLI permite executar uma instância local completa via Docker, incluindo banco, autenticação, storage e Studio.

Inicie o Supabase local:

```bash
supabase start
```

Após iniciar, o CLI exibirá URLs e chaves locais, incluindo:

```txt
API URL
DB URL
Studio URL
Inbucket URL
anon key
service_role key
```

Atualize o `.env.local` com os valores locais exibidos pelo CLI:

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Aplique o schema e as migrations:

```bash
supabase db reset
```

Ou aplique migrations pendentes:

```bash
supabase migration up
```

Acesse o Supabase Studio local:

```txt
http://127.0.0.1:54323
```

Para parar o ambiente local:

```bash
supabase stop
```

---

## Configurando o Vault

O projeto utiliza o Supabase Vault para armazenamento seguro de segredos relacionados à criptografia de dados sensíveis.

### 1. Habilitar a extensão

No Supabase Studio, acesse:

```txt
Database → Extensions
```

Habilite:

```txt
supabase_vault
```

Ou execute via SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

### 2. Gerar uma chave segura

Exemplo com Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Exemplo com OpenSSL:

```bash
openssl rand -base64 32
```

### 3. Executar o seed do Vault

Use o arquivo:

```txt
supabase/seed_vault.sql
```

Substitua o placeholder pela chave gerada e execute no SQL Editor do Supabase.

> A chave do Vault não deve ser adicionada ao `.env.local` nem versionada no GitHub.

---

## Scripts disponíveis

### Aplicação

```bash
npm run dev
npm run build
npm run start
npm run lint
```

### Supabase

```bash
supabase start
supabase stop
supabase db reset
supabase migration new <nome>
supabase migration up
supabase db diff
supabase status
```

---

## Documentação operacional

O projeto possui documentação auxiliar para operação, testes manuais e configuração de recursos específicos.

```txt
docs/
├── PILOT_RUNBOOK.md
├── MANUAL_QA.md
└── SUPABASE_STORAGE_BRAND_POLICIES.md
```

---

## Deploy

### Vercel

O projeto é compatível com deploy na Vercel.

Execute:

```bash
npx vercel --prod
```

Ou conecte o repositório diretamente pelo painel da Vercel.

### Variáveis em produção

No painel da Vercel, configure as variáveis necessárias:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL
PATIENT_SESSION_SECRET
NEXT_PUBLIC_VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_EMAIL
```

Chaves privadas devem ser tratadas como segredos de produção.

### Supabase em produção

Para aplicar o banco em produção, vincule o projeto remoto:

```bash
supabase link --project-ref <SEU_PROJECT_REF>
```

Depois envie as migrations:

```bash
supabase db push
```

Também é necessário configurar as URLs de autenticação no Supabase:

```txt
Authentication → URL Configuration
```

Exemplos:

```txt
https://seudominio.com/auth/callback
https://seudominio.com/auth/patient/callback
```

---

## Checklist de segurança antes de publicar

Antes de divulgar o projeto publicamente, conferir:

- [ ] `.env.local` não está versionado.
- [ ] Nenhuma chave real foi enviada ao repositório.
- [ ] Nenhum CPF real está em seed, migration, print ou documentação.
- [ ] Nenhum dado real de paciente está no projeto.
- [ ] Nenhum prontuário real está no banco, print ou arquivo.
- [ ] Nenhum token privado foi commitado.
- [ ] Service role key não aparece no frontend.
- [ ] As políticas de RLS estão ativas nas tabelas sensíveis.
- [ ] O Vault foi configurado corretamente no ambiente de produção.
- [ ] Prints públicos não expõem dados pessoais ou clínicos.

---

## Status do projeto

Projeto em desenvolvimento contínuo.

O Nythos está estruturado como uma plataforma SaaS com potencial de evolução para novos módulos, melhorias de segurança, refinamento da experiência do usuário, ampliação de relatórios e integração com recursos externos.

---

## Próximas melhorias

- Refinamento dos fluxos de autenticação
- Melhorias na área do paciente
- Expansão dos relatórios financeiros
- Evolução do módulo de equipe
- Melhorias de usabilidade no dashboard
- Ampliação de testes e validações
- Otimização de performance
- Melhoria da documentação técnica
- Preparação de ambiente de demonstração com dados fictícios

---

## Observação

Este projeto é apresentado como case de desenvolvimento full stack e produto SaaS.

O objetivo do repositório é demonstrar arquitetura, organização de código, domínio de tecnologias modernas e capacidade de desenvolver aplicações reais com foco em produto, usabilidade, segurança e gestão de dados.

---

## Licença

Proprietário — © 2026 Nythos. Todos os direitos reservados.

---

## Autor

Desenvolvido por **João Marques**.

- GitHub: [@ojoaomarquesprof](https://github.com/ojoaomarquesprof)
- LinkedIn: [João Marques](https://www.linkedin.com/in/jo%C3%A3o-marques-332709417/)
````
