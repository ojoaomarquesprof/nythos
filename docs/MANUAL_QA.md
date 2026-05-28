# QA Manual do Piloto Fechado Nythos

Use este checklist antes de liberar o piloto e depois de qualquer deploy relevante. Execute com uma conta profissional de teste, um paciente de teste e, quando possivel, em desktop e mobile.

## Como Registrar o Resultado

Para cada cenario, registre:

- status: passou, falhou ou nao testado;
- ambiente: local, preview ou producao;
- navegador e dispositivo;
- usuario usado;
- observacoes e evidencias.

## Checklist de Seguranca Operacional

- [ ] `.env.local` nao esta versionado.
- [ ] Nenhum segredo real foi escrito em README, docs, issues ou prints.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` existe apenas no ambiente server-side.
- [ ] Nao existe variavel `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- [ ] `PATIENT_SESSION_SECRET` e forte, longo e exclusivo do ambiente.
- [ ] `STRIPE_CHECKOUT_ENABLED=false`.
- [ ] `ASAAS_CHECKOUT_ENABLED=false`.
- [ ] Bucket `brand` e publico para leitura, mas upload de foto/logo/assinatura passa por `/api/brand-assets/upload`.
- [ ] Documentos clinicos usam o fluxo autorizado de anexos/download.
- [ ] PDFs finais nao exibem mensagens internas de orientacao do sistema.

## Cenarios Manuais

### 1. Login Profissional

Passos:

1. Acesse `/login`.
2. Entre com uma conta profissional valida.
3. Aguarde o redirecionamento.

Resultado esperado:

- Usuario chega ao dashboard.
- Header/sidebar exibem dados do perfil quando disponiveis.
- Nao ha erro de sessao ou loop de redirect.

Observacoes de risco:

- Se o usuario for paciente, nao deve acessar `/dashboard`.
- Erros de auth nao devem expor tokens, cookies ou stack trace.

### 2. Dashboard

Passos:

1. Acesse `/dashboard` logado.
2. Confira cards, agenda do dia e proximas acoes.
3. Atualize a pagina.

Resultado esperado:

- Dashboard carrega sem erro.
- Dados pertencem ao usuario logado.
- Estados vazios sao claros quando nao ha dados.

Observacoes de risco:

- Verificar se nao aparecem dados de outro profissional.
- Se houver lentidao, registrar volume de dados da conta.

### 3. Onboarding

Passos:

1. Acesse configuracoes e dashboard com perfil incompleto.
2. Preencha nome profissional, CRP e clinica.
3. Salve os dados.

Resultado esperado:

- Alertas de pendencia somem ou reduzem conforme campos preenchidos.
- Dados salvos persistem apos recarregar.

Observacoes de risco:

- Nao inserir dados sensiveis reais em campos de teste.
- Confirmar que mensagens sao orientativas e nao bloqueiam indevidamente.

### 4. Cadastro de Paciente

Passos:

1. Acesse `/dashboard/patients/new`.
2. Preencha dados minimos de um paciente de teste.
3. Salve.

Resultado esperado:

- Paciente e criado e aparece na lista.
- Pagina do paciente abre corretamente.
- Nenhum dado clinico sensivel e exigido no cadastro basico.

Observacoes de risco:

- Evitar usar dados pessoais reais sem consentimento.
- Confirmar que dados administrativos nao viram evolucao clinica.

### 5. Cadastro com E-mail Ja Existente

Passos:

1. Cadastre um paciente/responsavel com e-mail ja usado em outro paciente de teste.
2. Salve.
3. Verifique se o sistema reutiliza ou orienta corretamente.

Resultado esperado:

- Fluxo nao quebra.
- Mensagem e clara quando o e-mail ja existe.
- Nao cria duplicidade indevida de auth quando a regra local preve reutilizacao.

Observacoes de risco:

- Nao testar com e-mail real de usuario fora do piloto.
- Se houver erro, registrar e-mail mascarado nas evidencias.

### 6. Upload de Foto, Logo e Assinatura

Passos:

1. Acesse `/dashboard/settings`.
2. Envie uma foto profissional JPG/PNG/WebP/GIF menor que 15MB.
3. Envie um logo menor que 15MB.
4. Envie uma assinatura menor que 15MB.
5. Recarregue a pagina.
6. Tente enviar um arquivo nao imagem.
7. Tente enviar uma imagem maior que 15MB, se houver arquivo de teste seguro.

Resultado esperado:

- Imagens validas aparecem no preview e persistem.
- Upload usa `/api/brand-assets/upload`.
- Arquivo nao imagem e recusado com mensagem amigavel.
- Arquivo maior que 15MB e recusado.

Observacoes de risco:

- O browser nao deve fazer upload direto via `supabase.storage`.
- O usuario nao deve conseguir escolher bucket, path, user id ou coluna arbitraria.
- Nao usar imagens com dados pessoais reais em ambiente compartilhado.

### 7. Pagina do Paciente no Dashboard

Passos:

1. Abra um paciente existente.
2. Navegue por abas de perfil, sessoes, prontuario, financeiro, documentos e rede de apoio.
3. Recarregue a pagina em uma aba especifica.

Resultado esperado:

- Dados carregam corretamente.
- Navegacao entre abas e estavel.
- Estados vazios sao compreensiveis.

Observacoes de risco:

- Confirmar que conteudo clinico aparece apenas para usuario autorizado.
- Registrar qualquer erro de descriptografia.

### 8. Agendar Sessao

Passos:

1. Abra agenda ou pagina do paciente.
2. Crie uma sessao futura.
3. Defina data, hora, tipo e duracao.
4. Salve.

Resultado esperado:

- Sessao aparece na agenda e na pagina do paciente.
- Horario e duracao ficam corretos.
- Nao cria cobranca antes da regra esperada do fluxo.

Observacoes de risco:

- Verificar fuso horario e data em mobile.
- Repetir com horarios proximos ao fim do dia se houver suspeita de bug.

### 9. Concluir Sessao

Passos:

1. Abra uma sessao agendada.
2. Marque como concluida.
3. Confirme o fluxo.

Resultado esperado:

- Sessao muda para concluida.
- Financeiro e atualizado conforme regra de sessao avulsa, pacote ou cortesia.
- Historico fica consistente.

Observacoes de risco:

- Nao alterar manualmente valores para "corrigir" teste.
- Se houver pacote, confirmar consumo de credito.

### 10. Registrar Evolucao

Passos:

1. Abra uma sessao concluida.
2. Registre evolucao clinica de teste.
3. Salve.
4. Reabra a sessao.

Resultado esperado:

- Evolucao salva e reaparece.
- Conteudo clinico nao aparece em campos administrativos.
- Nao ha erro de Vault/criptografia.

Observacoes de risco:

- Usar conteudo ficticio.
- Se aparecer `SECURITY_FAULT`, pausar piloto ate revisar Vault.

### 11. Financeiro

Passos:

1. Acesse `/dashboard/finances`.
2. Verifique lancamentos gerados por sessao/pacote.
3. Confirme um recebimento pendente.
4. Aplique filtros por status, origem e paciente.

Resultado esperado:

- Valores e status batem com o fluxo testado.
- Confirmar recebimento nao muda valor, origem ou categoria.
- Filtros retornam resultados coerentes.

Observacoes de risco:

- Nao testar checkout real.
- Nao alterar regras financeiras durante o QA manual.

### 12. Gerar Recibo/PDF

Passos:

1. No financeiro, gere recibo de um recebimento confirmado.
2. Baixe relatorio financeiro em PDF.
3. Na pagina do paciente, baixe PDF clinico quando houver conteudo.
4. Abra os PDFs gerados.

Resultado esperado:

- Recibo contem titulo, paciente/pagador, valor, pagamento, servico, recebedor e assinatura/logo quando existirem.
- PDFs clinicos contem identificacao, datas e conteudo clinico necessario.
- Nenhum PDF exibe instrucoes internas, mensagens de debug ou avisos operacionais do sistema.

Observacoes de risco:

- Recibo nao deve prometer validade fiscal/legal alem do que o sistema garante.
- Conteudo clinico salvo nao deve ser removido ou alterado pela exportacao.

### 13. Area do Paciente via `/p/[token]`

Passos:

1. Gere ou copie um link de acesso do paciente.
2. Abra `/p/[token]` em janela anonima.
3. Complete a verificacao solicitada.
4. Acesse o dashboard do paciente.

Resultado esperado:

- Token valido permite acesso ao paciente correto.
- Token invalido, expirado ou revogado falha com mensagem segura.
- Cookie de paciente permite acessar `/patient/dashboard`.

Observacoes de risco:

- Paciente nao deve acessar dashboard profissional.
- Nao compartilhar token real em prints ou issues.

### 14. Busca Global

Passos:

1. Use a busca global no header.
2. Pesquise por nome de paciente de teste.
3. Pesquise por termo inexistente.
4. Acesse um resultado.

Resultado esperado:

- Resultados relevantes aparecem rapidamente.
- Termo inexistente exibe estado vazio.
- Clique abre o destino correto.

Observacoes de risco:

- Busca nao deve revelar dados de outro profissional.
- Evitar testar com nomes reais fora do piloto.

### 15. Logout

Passos:

1. Abra o menu de usuario.
2. Clique em sair.
3. Tente acessar `/dashboard` novamente.

Resultado esperado:

- Usuario sai da sessao.
- `/dashboard` redireciona para login.
- Area do paciente segue separada do login profissional.

Observacoes de risco:

- Se houver cache visual de dados apos logout, registrar imediatamente.

### 16. Responsividade Mobile Basica

Passos:

1. Abra o app em largura mobile ou em dispositivo real.
2. Teste login, dashboard, lista de pacientes, pagina do paciente, agenda e financeiro.
3. Abra modais/sheets principais.

Resultado esperado:

- Navegacao principal funciona.
- Textos e botoes nao se sobrepoem.
- Acoes essenciais continuam acessiveis.

Observacoes de risco:

- Priorizar iOS Safari e Android Chrome se houver usuarios reais nesses dispositivos.
- Registrar prints de qualquer quebra visual.

## Encerramento do QA

Antes de marcar o deploy como liberado:

- [ ] todos os cenarios criticos passaram;
- [ ] falhas conhecidas estao registradas com severidade;
- [ ] nao ha bug aberto de seguranca, login, dados clinicos ou financeiro;
- [ ] runbook do piloto foi revisado;
- [ ] usuarios piloto receberam orientacoes de suporte e feedback.
