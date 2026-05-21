import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/public/legal-page";

export const metadata: Metadata = {
  title: "Termos de Uso | Nythos",
  description:
    "Termos de Uso do Nythos, plataforma de gestao clinica para psicologos.",
  openGraph: {
    title: "Termos de Uso | Nythos",
    description:
      "Termos de Uso do Nythos, plataforma de gestao clinica para psicologos.",
    siteName: "Nythos",
    type: "website",
  },
};

const sections: LegalSection[] = [
  {
    id: "introducao",
    title: "1. Introducao",
    body: [
      "Estes Termos de Uso regulam o acesso e a utilizacao do Nythos, uma plataforma de gestao clinica voltada a psicologos e profissionais autorizados.",
      "Ao criar uma conta ou utilizar o Nythos, o usuario declara que leu, compreendeu e concorda com estes termos. Caso nao concorde, nao deve utilizar a plataforma.",
      "Esta e uma versao inicial dos termos e pode precisar de revisao juridica antes do uso comercial final.",
    ],
  },
  {
    id: "servico",
    title: "2. Sobre o servico",
    body: [
      "O Nythos oferece recursos para apoiar a organizacao da rotina clinica, incluindo agenda, cadastro de pacientes, prontuario e evolucao, financeiro, pacotes de sessoes, documentos, consentimentos, portal do paciente, recibos e registros de auditoria.",
      "A plataforma tem finalidade administrativa, operacional e de apoio a organizacao profissional. Novas funcionalidades podem ser adicionadas, alteradas ou removidas conforme evolucao do produto.",
    ],
  },
  {
    id: "responsabilidade-profissional",
    title: "3. Responsabilidade profissional",
    body: [
      "O Nythos e uma ferramenta de gestao e nao substitui o julgamento profissional, a responsabilidade tecnica, os deveres eticos ou as obrigacoes legais aplicaveis ao psicologo.",
      "O profissional e responsavel pelo conteudo que registra, pela forma como utiliza a plataforma e pela observancia das normas do seu conselho profissional, contratos, consentimentos e legislacao aplicavel.",
      "O Nythos nao promete resultado clinico, financeiro ou terapeutico.",
    ],
  },
  {
    id: "cadastro",
    title: "4. Cadastro e conta",
    body: [
      "Para usar a plataforma, o usuario pode precisar criar uma conta e fornecer dados corretos, completos e atualizados, como nome, e-mail, CRP e dados profissionais.",
      "O usuario e responsavel por manter suas credenciais seguras, proteger o acesso a sua conta e informar o Nythos caso suspeite de uso indevido.",
      "Atividades realizadas pela conta podem ser atribuiveis ao titular da conta, salvo demonstracao de falha ou acesso indevido.",
    ],
  },
  {
    id: "uso-aceitavel",
    title: "5. Uso aceitavel",
    body: [
      "O usuario nao deve utilizar o Nythos para fins ilegais, abusivos, fraudulentos ou incompatíveis com a finalidade da plataforma.",
      "E vedado tentar acessar contas, dados, sistemas ou areas sem autorizacao; compartilhar acesso indevidamente; violar sigilo profissional; inserir codigo malicioso; ou usar a plataforma para armazenar conteudo ilicito ou nao autorizado.",
      "O Nythos pode adotar medidas proporcionais para proteger a plataforma, os usuarios e os dados tratados, incluindo suspensao de acessos em caso de risco relevante ou violacao destes termos.",
    ],
  },
  {
    id: "dados-conteudo",
    title: "6. Dados e conteudo do usuario",
    body: [
      "O profissional permanece responsavel pelos dados, registros, documentos e informacoes que inserir na plataforma.",
      "O Nythos processa dados para viabilizar a prestacao do servico, manter a seguranca, registrar acoes relevantes, prestar suporte e cumprir obrigacoes aplicaveis.",
      "O usuario deve avaliar quais informacoes sao adequadas para registro e garantir que possui autorizacao, base legal ou consentimento quando necessario.",
    ],
  },
  {
    id: "dados-sensiveis",
    title: "7. Saude e dados sensiveis",
    body: [
      "A plataforma pode armazenar dados pessoais e dados sensiveis relacionados a saude, atendimento psicologico, evolucoes, documentos, consentimentos, tarefas, check-ins e anamneses.",
      "O uso desses recursos deve observar a legislacao aplicavel, a LGPD, normas eticas e profissionais, deveres de sigilo e consentimentos ou autorizacoes necessarias.",
      "O uso do Nythos nao garante, por si so, conformidade automatica com todas as obrigacoes legais ou regulatórias do profissional.",
    ],
  },
  {
    id: "financeiro",
    title: "8. Recursos financeiros",
    body: [
      "Recursos de financeiro, pacotes, pagamentos, pendencias e recibos sao ferramentas administrativas de apoio a gestao do consultorio ou clinica.",
      "Recibos emitidos pela plataforma nao equivalem necessariamente a nota fiscal. O usuario e responsavel por suas obrigacoes fiscais, contabeis, tributarias e profissionais.",
      "O Nythos nao presta consultoria contabil, fiscal ou tributaria.",
    ],
  },
  {
    id: "integracoes",
    title: "9. Integracoes e terceiros",
    body: [
      "Alguns recursos podem depender de servicos de terceiros, como Google Calendar, provedores de infraestrutura, autenticacao, armazenamento ou outras integracoes autorizadas pelo usuario.",
      "Servicos de terceiros podem estar sujeitos a termos, politicas e disponibilidade proprios. Falhas, alteracoes ou indisponibilidades desses servicos podem afetar funcionalidades do Nythos.",
    ],
  },
  {
    id: "disponibilidade",
    title: "10. Disponibilidade e atualizacoes",
    body: [
      "O Nythos emprega esforcos razoaveis para manter a plataforma disponivel e segura, mas nao garante disponibilidade ininterrupta, ausencia completa de erros ou funcionamento permanente de todos os recursos.",
      "Podem ocorrer manutencoes, atualizacoes, instabilidades, ajustes tecnicos ou interrupcoes necessarias para evolucao e seguranca da plataforma.",
    ],
  },
  {
    id: "responsabilidade",
    title: "11. Limitacao de responsabilidade",
    body: [
      "Na maxima medida permitida pela lei aplicavel, o Nythos nao se responsabiliza por perdas decorrentes de uso inadequado da plataforma, registros incorretos feitos pelo usuario, descumprimento de obrigacoes profissionais ou indisponibilidade de servicos de terceiros.",
      "Nada nestes termos limita responsabilidades que nao possam ser limitadas por lei.",
    ],
  },
  {
    id: "alteracoes",
    title: "12. Alteracoes nos termos",
    body: [
      "Estes termos podem ser atualizados para refletir mudancas no produto, exigencias legais, melhorias de seguranca ou ajustes operacionais.",
      "A data de ultima atualizacao sera indicada nesta pagina. O uso continuo da plataforma apos alteracoes pode representar concordancia com a versao vigente.",
    ],
  },
  {
    id: "contato",
    title: "13. Contato",
    body: [
      "Como nao ha dados oficiais de empresa, CNPJ, endereco ou e-mail publico definidos no projeto, este texto nao inventa essas informacoes.",
      "Duvidas sobre estes termos devem ser encaminhadas pelo canal oficial informado na plataforma ou por outro meio que venha a ser divulgado pelo Nythos.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Termos de Uso"
      title="Termos de Uso do Nythos"
      description="Uma base clara sobre o uso da plataforma, responsabilidades do profissional e limites do servico."
      updatedAt="21 de maio de 2026"
      sections={sections}
      variant="terms"
    />
  );
}
