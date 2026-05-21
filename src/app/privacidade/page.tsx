import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Politica de Privacidade | Nythos",
  description:
    "Politica de Privacidade do Nythos para tratamento de dados pessoais e dados sensiveis na plataforma.",
  openGraph: {
    title: "Politica de Privacidade | Nythos",
    description:
      "Politica de Privacidade do Nythos para tratamento de dados pessoais e dados sensiveis na plataforma.",
    siteName: "Nythos",
    type: "website",
  },
};

const sections: LegalSection[] = [
  {
    id: "introducao",
    title: "1. Introducao",
    body: [
      "Esta Politica de Privacidade explica, em linguagem direta, como o Nythos pode tratar dados pessoais e dados sensiveis no contexto da plataforma de gestao clinica para psicologos.",
      "O Nythos pode lidar com informacoes de profissionais, pacientes e usuarios do portal do paciente. Por isso, privacidade, seguranca e responsabilidade sao aspectos centrais do produto.",
    ],
  },
  {
    id: "dados-tratados",
    title: "2. Dados que podem ser tratados",
    body: [
      "Dados do profissional podem incluir nome, e-mail, CRP, CPF ou CNPJ, dados de clinica, configuracoes, identidade visual, assinatura, preferências e dados de acesso.",
      "Dados de pacientes inseridos pelo profissional podem incluir identificacao, contato, sessoes, agenda, prontuario, evolucao, documentos, consentimentos, plano terapeutico, tarefas, check-ins, anamneses e informacoes relacionadas ao acompanhamento.",
      "Dados financeiros podem incluir cobrancas, pagamentos, pacotes, pendencias, recibos e historico administrativo.",
      "Dados tecnicos podem incluir logs, eventos de auditoria, dados de uso, informacoes de dispositivo, cookies de sessao e armazenamento local usado para preferencias, quando aplicavel.",
    ],
  },
  {
    id: "finalidades",
    title: "3. Finalidades do tratamento",
    body: [
      "Os dados podem ser tratados para operar a plataforma, autenticar usuarios, organizar agenda e pacientes, permitir registros clinicos, controlar financeiro, emitir recibos, disponibilizar o portal do paciente, armazenar documentos e consentimentos, prestar suporte e manter seguranca.",
      "Tambem podem ser tratados para registrar acoes criticas em audit log, prevenir acessos indevidos, investigar incidentes, melhorar a experiencia do produto e cumprir obrigacoes legais ou regulatórias quando aplicavel.",
    ],
  },
  {
    id: "bases-legais",
    title: "4. Bases legais",
    body: [
      "Conforme o contexto e a legislacao aplicavel, o tratamento pode se basear em execucao de contrato, procedimentos preliminares relacionados a contrato, cumprimento de obrigacao legal ou regulatoria, legitimo interesse, consentimento, protecao da saude e outras bases previstas na LGPD.",
      "Nao existe uma base legal unica para todos os tratamentos. A base aplicavel depende do tipo de dado, da finalidade, do papel de cada parte e do contexto do atendimento.",
      "Quando o profissional inserir dados de pacientes, ele deve avaliar suas proprias bases legais, consentimentos, deveres de informacao e obrigacoes eticas.",
    ],
  },
  {
    id: "papeis",
    title: "5. Papel do Nythos e do profissional",
    body: [
      "Em muitos cenarios, o psicologo ou a clinica atua como controlador dos dados dos pacientes, decidindo quais dados registrar, por quanto tempo mante-los e como utiliza-los no atendimento.",
      "O Nythos pode atuar como fornecedor da plataforma e, conforme o contexto, como operador de dados pessoais tratados em nome do profissional ou da clinica.",
      "A definicao exata dos papeis pode depender de contratos, configuracoes, funcionalidades utilizadas e relacao entre as partes.",
    ],
  },
  {
    id: "compartilhamento",
    title: "6. Compartilhamento de dados",
    body: [
      "Dados podem ser compartilhados com prestadores de infraestrutura, autenticacao, armazenamento, seguranca, suporte e outros fornecedores necessarios para operar a plataforma.",
      "Quando o usuario autorizar uma integracao, como Google Calendar, dados necessarios podem ser compartilhados ou acessados por esse servico conforme a finalidade da integracao.",
      "Dados tambem podem ser compartilhados quando exigido por lei, decisao de autoridade competente, defesa de direitos ou protecao da seguranca da plataforma.",
      "O Nythos nao vende dados pessoais.",
    ],
  },
  {
    id: "seguranca",
    title: "7. Seguranca",
    body: [
      "O Nythos adota boas praticas e medidas tecnicas e organizacionais voltadas a proteger dados pessoais e sensiveis, incluindo controles de acesso, registros de auditoria, armazenamento privado de documentos e outras medidas aplicaveis ao produto.",
      "Alguns dados podem usar criptografia ou outras protecoes tecnicas, conforme o recurso e a arquitetura da plataforma.",
      "Nenhum sistema elimina todos os riscos. O Nythos busca reduzi-los, mas o usuario tambem deve manter credenciais protegidas, controlar acessos e seguir boas praticas de seguranca.",
    ],
  },
  {
    id: "retencao",
    title: "8. Retencao e exclusao",
    body: [
      "Os dados podem ser mantidos enquanto forem necessarios para a prestacao do servico, cumprimento de obrigacoes legais ou regulatórias, preservacao de direitos, seguranca, auditoria ou conforme instrucoes do controlador dos dados.",
      "Backups, logs e registros de seguranca podem permanecer por periodos adicionais quando necessario e proporcional.",
      "Pedidos de exclusao podem depender do tipo de dado, da relacao entre profissional e paciente, de obrigacoes legais ou de necessidades de preservacao de registros.",
    ],
  },
  {
    id: "direitos",
    title: "9. Direitos dos titulares",
    body: [
      "Titulares de dados podem ter direitos previstos na LGPD, como confirmacao de tratamento, acesso, correcao, anonimização, bloqueio, eliminacao, portabilidade, informacao sobre compartilhamento, revogacao de consentimento e oposicao, conforme aplicavel.",
      "Quando os dados forem de pacientes inseridos por um profissional ou clinica, o pedido pode precisar ser direcionado ao proprio profissional ou clinica, que normalmente define as finalidades do tratamento.",
      "O Nythos podera apoiar a analise e execucao de solicitacoes conforme seu papel, capacidade tecnica e obrigacoes aplicaveis.",
    ],
  },
  {
    id: "cookies",
    title: "10. Cookies e tecnologias locais",
    body: [
      "A plataforma pode usar cookies, tokens de sessao e tecnologias similares para autenticacao, seguranca, manutencao da sessao e funcionamento adequado do produto.",
      "Tambem pode usar armazenamento local, como localStorage, para preferencias de interface, onboarding e estados de experiencia do usuario.",
      "Controles adicionais de preferencias poderao ser disponibilizados conforme a evolucao da plataforma.",
    ],
  },
  {
    id: "transferencias",
    title: "11. Transferencias internacionais",
    body: [
      "Como a plataforma pode utilizar provedores globais de infraestrutura, autenticacao, armazenamento ou seguranca, dados podem ser processados ou armazenados fora do Brasil.",
      "Quando isso ocorrer, o Nythos buscara utilizar fornecedores e mecanismos compativeis com boas praticas de protecao de dados, conforme aplicavel.",
    ],
  },
  {
    id: "menores",
    title: "12. Criancas e adolescentes",
    body: [
      "Psicologos podem atender criancas e adolescentes, e dados de menores exigem cuidado adicional.",
      "O profissional e responsavel por avaliar consentimentos, autorizacoes de responsaveis, bases legais, deveres eticos e requisitos aplicaveis ao atendimento de menores.",
      "O Nythos nao substitui essa avaliacao profissional e juridica.",
    ],
  },
  {
    id: "atualizacoes",
    title: "13. Atualizacoes desta politica",
    body: [
      "Esta Politica de Privacidade pode ser atualizada para refletir mudancas no produto, na legislacao, nos fornecedores, nas medidas de seguranca ou na forma de tratamento de dados.",
      "A data de ultima atualizacao sera indicada nesta pagina. Recomenda-se revisar periodicamente a versao vigente.",
    ],
  },
  {
    id: "contato",
    title: "14. Contato",
    body: [
      "Duvidas sobre esta Politica de Privacidade devem ser encaminhadas pelo canal oficial informado na plataforma ou por outro meio divulgado pelo Nythos.",
      "Quando a solicitacao envolver dados de pacientes, o titular tambem pode precisar procurar o profissional ou a clinica responsavel pelo atendimento.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Politica de Privacidade"
      title="Politica de Privacidade do Nythos"
      description="Como o Nythos trata dados pessoais, dados sensiveis e informacoes operacionais da rotina clinica."
      updatedAt="21 de maio de 2026"
      sections={sections}
      variant="privacy"
    />
  );
}
