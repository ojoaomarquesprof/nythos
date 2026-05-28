# Runbook do Piloto Fechado Nythos

Este documento orienta a preparacao, liberacao e acompanhamento do piloto fechado do Nythos. Ele nao substitui a revisao tecnica antes de cada deploy.

## Objetivo

Validar a jornada principal do Nythos em uso real controlado, com foco em:

- estabilidade do fluxo profissional;
- clareza da experiencia de cadastro, agenda, prontuario, financeiro e PDFs;
- seguranca operacional no tratamento de dados clinicos;
- qualidade do feedback antes de abrir para um grupo maior.

## Publico Recomendado

Comece com 2 a 5 psicologos de confianca, preferencialmente com perfis diferentes de rotina:

- atendimento individual;
- uso de pacotes de sessoes;
- uso recorrente de recibos;
- atendimento com responsavel/guardiao;
- uso mobile ocasional.

Evite abrir o piloto para clinicas grandes ou operacao multi-equipe intensa antes de estabilizar feedback inicial.

## Pre-Requisitos de Ambiente

- Deploy em ambiente separado ou claramente identificado como piloto.
- Projeto Supabase correto, com schema e migrations aplicados.
- RLS habilitada nas tabelas sensiveis.
- Vault configurado com `nythos_encryption_key`.
- Bucket `brand` criado e publico para leitura.
- Endpoint `/api/brand-assets/upload` disponivel para upload server-side.
- Dominio final configurado em `NEXT_PUBLIC_APP_URL`.
- Redirect URLs do Supabase Auth configuradas para o dominio final.
- CI verde no commit que sera liberado.

## Variaveis Obrigatorias

Configure no provedor de deploy, nunca em arquivos versionados:

| Variavel | Obrigatoria | Observacao |
|---|---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Sim | URL publica do projeto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sim | Chave publica anon; depende de RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Apenas server-side. Nunca usar `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_APP_URL` | Sim | URL publica sem barra final. |
| `PATIENT_SESSION_SECRET` | Sim | Segredo HMAC forte, gerado com valor aleatorio longo. |
| `STRIPE_CHECKOUT_ENABLED` | Sim | Deve permanecer `false` no piloto fechado. |
| `ASAAS_CHECKOUT_ENABLED` | Sim | Deve permanecer `false` no piloto fechado. |
| `STRIPE_ENVIRONMENT` | Sim | Use `test` se as variaveis existirem. |
| `ASAAS_ENVIRONMENT` | Sim | Use `sandbox` se as variaveis existirem. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Opcional | Apenas se push notifications forem testadas. |
| `VAPID_PRIVATE_KEY` | Opcional | Secret server-side para push. |
| `VAPID_EMAIL` | Opcional | E-mail de contato do VAPID. |

## Pagamentos em Standby

Durante o piloto fechado:

- nao cobrar assinatura real dentro do Nythos;
- manter Stripe e Asaas com checkout desativado;
- nao configurar webhooks de billing real;
- nao usar chaves live de pagamento;
- nao prometer emissao fiscal automatica;
- tratar recibos como comprovantes gerados a partir do lancamento financeiro confirmado.

## Checklist Antes de Liberar Acesso

- [ ] `git diff --check` passou.
- [ ] `npx tsc --noEmit --pretty false` passou.
- [ ] `npm run test` passou.
- [ ] `npm run build` passou.
- [ ] Deploy publicado a partir do commit correto.
- [ ] Supabase Auth com Site URL e Redirect URLs corretas.
- [ ] `.env.local` nao esta versionado.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` esta apenas em ambiente server-side.
- [ ] `PATIENT_SESSION_SECRET` e forte e exclusivo do ambiente.
- [ ] `STRIPE_CHECKOUT_ENABLED=false`.
- [ ] `ASAAS_CHECKOUT_ENABLED=false`.
- [ ] Vault configurado e testado com escrita/leitura de evolucao.
- [ ] Bucket `brand` publico para leitura.
- [ ] Upload de foto, logo e assinatura passa pelo endpoint server-side.
- [ ] Documentos clinicos usam fluxo autorizado de anexos/download.
- [ ] Conta profissional inicial criada e acesso validado.
- [ ] Pelo menos um paciente de teste criado.
- [ ] Link `/p/[token]` testado em aba anonima.

## Checklist Durante o Piloto

Revise diariamente nos primeiros dias:

- [ ] erros de deploy/runtime no provedor;
- [ ] erros de API no console/logs;
- [ ] falhas de login ou magic link;
- [ ] falhas de upload de imagem ou documento;
- [ ] falhas ao concluir sessao e gerar financeiro;
- [ ] PDFs gerados com dados esperados e sem textos internos;
- [ ] feedback de clareza da interface;
- [ ] qualquer relato envolvendo privacidade, acesso indevido ou dados ausentes.

Revise semanalmente:

- [ ] volume de pacientes, sessoes e lancamentos por piloto;
- [ ] principais duvidas recorrentes;
- [ ] bugs classificados por severidade;
- [ ] melhorias que bloqueiam continuidade do piloto;
- [ ] decisoes para ampliar, pausar ou encerrar o ciclo.

## Plano de Rollback Basico

Se houver bug critico:

1. Pausar convite de novos pilotos.
2. Avisar usuarios afetados com linguagem objetiva.
3. Reverter o deploy para a versao anterior estavel no provedor.
4. Confirmar que login, dashboard e dados existentes carregam.
5. Se a falha envolveu dados, preservar logs e exportar evidencias antes de qualquer correcao manual.
6. Abrir issue com impacto, passos de reproducao, horario e usuario afetado.
7. Corrigir em branch separada, validar e redeployar.

Se houver suspeita de acesso indevido ou vazamento:

1. Pausar o piloto imediatamente.
2. Revogar sessoes ou tokens afetados.
3. Rotacionar segredos se houver possibilidade de exposicao.
4. Preservar logs relevantes.
5. Revisar RLS, endpoints server-side e trilhas de auditoria antes de reabrir.

## Registro de Bugs e Feedback

Use um registro unico por item, com:

- titulo curto;
- data e horario;
- usuario/piloto afetado;
- ambiente e navegador;
- passos para reproduzir;
- resultado esperado;
- resultado observado;
- severidade: critica, alta, media ou baixa;
- evidencias: prints, video curto ou logs sem segredos;
- decisao: corrigir agora, corrigir depois, descartar ou investigar.

Classificacao sugerida:

- Critica: risco de dados, login quebrado, perda de informacao, app indisponivel.
- Alta: fluxo principal bloqueado sem alternativa clara.
- Media: fluxo funciona com workaround.
- Baixa: texto, layout, polimento ou sugestao.

## O Que Nao Testar Ainda

No piloto fechado, evite:

- cobranca real de assinatura;
- checkout Stripe/Asaas em live mode;
- webhooks de pagamento reais;
- migracoes manuais fora do processo combinado;
- importacao em massa de pacientes;
- uso por clinicas grandes com muitos profissionais;
- promessas de validade fiscal ou juridica dos recibos;
- automacoes clinicas que substituam julgamento profissional.

## Encerramento do Ciclo

Ao final do piloto, consolidar:

- problemas corrigidos;
- problemas pendentes;
- feedback de valor percebido;
- riscos operacionais ainda abertos;
- decisoes sobre preco, onboarding, suporte e proximo grupo de usuarios.
