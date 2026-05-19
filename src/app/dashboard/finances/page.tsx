"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Wallet,
  Plus,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  CalendarX,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Package,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import { useSubscription } from "@/hooks/use-subscription";
import {
  formatCurrency,
  formatDate,
  CASH_FLOW_CATEGORIES,
  PAYMENT_METHODS,
} from "@/lib/constants";
import type { Profile } from "@/types/database";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { getBase64ImageFromUrl } from "@/lib/pdf-generator";
import { toast } from "sonner";
import { confirmCashFlowPayment, cancelPendingCashFlow, recordReceiptGenerated } from "@/app/actions/financial-transactions";
import { BillingService, type FinancialTransaction } from "@/services/billing-service";
import {
  buildCashFlowReceiptPayload,
  canGenerateCashFlowReceipt,
  canConfirmCashFlowPayment,
  getCashFlowOrigin,
  getCashFlowCategoryLabel,
  getCashFlowOriginLabel,
  getCashFlowStatusLabel,
  getOverdueTransactions,
  groupPendingByPatient,
  isTransactionInMonth,
  MANUAL_PAYMENT_METHODS,
  summarizeCashFlow,
  type ManualPaymentMethod,
} from "@/services/financial-transaction-rules";
import { FinancialEvolutionChart } from "@/components/dashboard/finances/evolution-chart";
import { TransactionDetailsSheet } from "@/components/dashboard/finances/transaction-details-sheet";

type TypeFilter = "all" | "income" | "expense";
type StatusFilter = "all" | "pending" | "confirmed" | "cancelled";
type OriginFilter = "all" | "session" | "package" | "expense" | "other";
type PaymentMethodFilter = "all" | ManualPaymentMethod | "none";

function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "NÃ£o informado";
  return PAYMENT_METHODS[method as keyof typeof PAYMENT_METHODS]?.label ?? method;
}

function receiptFileSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "recibo";
}

function compactInternalCode(id: string | null): string {
  if (!id) return "NÃ£o informado";
  return id.replace(/-/g, "").slice(0, 10).toUpperCase();
}

function SummaryCard({
  title,
  value,
  detail,
  icon,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "emerald" | "amber" | "rose" | "violet" | "slate" | "teal";
}) {
  const toneClass = {
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700",
    amber: "border-amber-100 bg-amber-50/70 text-amber-700",
    rose: "border-rose-100 bg-rose-50/70 text-rose-700",
    violet: "border-violet-100 bg-violet-50/70 text-violet-700",
    slate: "border-slate-100 bg-slate-50/80 text-slate-700",
    teal: "border-teal-100 bg-teal-50/70 text-teal-700",
  }[tone];

  return (
    <Card className={cn("h-full min-h-[116px] overflow-hidden rounded-2xl border shadow-sm", toneClass)}>
      <CardContent className="h-full p-5">
        <div className="flex h-full items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{title}</p>
            <p className="mt-2 whitespace-nowrap text-2xl font-black leading-tight tracking-tight tabular-nums">{value}</p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-wider opacity-70">{detail}</p>
          </div>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/70">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FinancesPage() {
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<FinancialTransaction | null>(null);
  const [transactionActionId, setTransactionActionId] = useState<string | null>(null);
  const [showExpense, setShowExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const { exportPdf, isExporting } = usePdfExport();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [originFilter, setOriginFilter] = useState<OriginFilter>("all");
  const [patientFilter, setPatientFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethodFilter>("all");
  const [errorDialog, setErrorDialog] = useState({ open: false, title: "", message: "" });

  function showError(title: string, message: string) {
    setErrorDialog({ open: true, title, message });
  }

  const [expenseForm, setExpenseForm] = useState({
    description: "",
    amount: "",
    category: "rent",
    notes: "",
  });

  useEffect(() => {
    if (therapistId) {
      loadTransactions();
    }
  }, [therapistId]);

  async function loadTransactions() {
    if (!therapistId) return;
    setLoading(true);
    setChartLoading(true);
    
    // Load profile (of the therapist, for branding)
    const { data: profileData } = await supabase.from("profiles").select("*").eq("id", therapistId).single();
    if (profileData) setProfile(profileData);

    // Load transactions from BillingService
    const { data: txData } = await BillingService.getTransactions(therapistId);
    if (txData) setTransactions(txData);

    // Load 6-month financial evolution
    const { data: evoData } = await BillingService.getFinancialEvolution(therapistId);
    if (evoData) setChartData(evoData);

    setLoading(false);
    setChartLoading(false);
  }

  const handleConfirmPayment = async (
    id: string,
    method: ManualPaymentMethod,
    paidAt?: string | null
  ) => {
    setTransactionActionId(id);
    const result = await confirmCashFlowPayment(id, {
      payment_method: method,
      paid_at: paidAt || null,
    });

    if (result.success) {
      toast.success("Pagamento registrado.");
      setSelectedTransaction(null);
      await loadTransactions();
    } else {
      toast.error(result.error || "Não foi possível registrar o pagamento.");
    }
    setTransactionActionId(null);
  };

  const handleCancelTransaction = async (id: string) => {
    setTransactionActionId(id);
    const result = await cancelPendingCashFlow(id);

    if (result.success) {
      toast.success("Lançamento cancelado.");
      setSelectedTransaction(null);
      await loadTransactions();
    } else {
      toast.error(result.error || "Não foi possível cancelar o lançamento.");
    }
    setTransactionActionId(null);
  };

  const handleGenerateReceipt = async (transaction: FinancialTransaction) => {
    if (!profile) {
      showError(
        "Perfil nÃ£o encontrado",
        "Complete os dados da clÃ­nica/profissional para emitir um recibo mais completo."
      );
      return;
    }

    if (!canGenerateCashFlowReceipt(transaction)) {
      toast.error("Recibo disponÃ­vel apenas para receitas confirmadas de sessÃ£o ou pacote.");
      return;
    }

    const receipt = buildCashFlowReceiptPayload(transaction);
    if (!receipt) {
      toast.error("NÃ£o foi possÃ­vel preparar os dados do recibo.");
      return;
    }

    if (transaction.id) {
      void recordReceiptGenerated(transaction.id).catch(() => undefined);
    }

    const missingProfileData = !profile.full_name || !profile.clinic_name || !profile.crp;
    if (missingProfileData) {
      toast.warning("Complete os dados da clÃ­nica/profissional para emitir um recibo mais completo.");
    }

    let signatureBase64: string | null = null;
    if (profile.signature_url) {
      try {
        signatureBase64 = await getBase64ImageFromUrl(profile.signature_url);
      } catch {
        signatureBase64 = null;
      }
    }

    const serviceRows = receipt.origin === "package"
      ? [
          ["Origem", receipt.originLabel],
          ["Pacote", receipt.packageName || "Pacote de sessÃµes"],
          ["Quantidade de sessÃµes", receipt.packageTotalSessions ? String(receipt.packageTotalSessions) : "NÃ£o informado"],
          ["Valor por sessÃ£o", receipt.packageUnitAmount ? formatCurrency(receipt.packageUnitAmount) : "NÃ£o informado"],
          ["DescriÃ§Ã£o", receipt.description],
        ]
      : [
          ["Origem", receipt.originLabel],
          ["Data da sessÃ£o", receipt.sessionDate ? formatDate(receipt.sessionDate) : "NÃ£o informado"],
          ["DescriÃ§Ã£o", receipt.description],
        ];

    const receiverRows = [
      ["Profissional", profile.full_name || "NÃ£o informado"],
      ["ClÃ­nica", profile.clinic_name || "NÃ£o informado"],
      ["CRP", profile.crp || "NÃ£o informado"],
      ...(profile.cpf ? [["CPF", profile.cpf]] : []),
      ...(profile.phone ? [["Contato", profile.phone]] : []),
      ...(profile.address ? [["EndereÃ§o", profile.address]] : []),
    ];

    await exportPdf({
      title: "Recibo",
      subtitle: `Comprovante de pagamento - ${receipt.originLabel}`,
      profile,
      fileName: `recibo_${receiptFileSlug(receipt.patientName)}_${compactInternalCode(receipt.id).toLowerCase()}.pdf`,
      content: [
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "Recebemos de", fontSize: 9, bold: true, color: "#64748b", margin: [0, 0, 0, 4] },
                { text: receipt.patientName, fontSize: 15, bold: true, color: "#0f172a" },
                { text: "Pagador/paciente", fontSize: 9, color: "#64748b", margin: [0, 3, 0, 0] },
              ],
            },
            {
              width: 170,
              stack: [
                { text: "Valor pago", fontSize: 9, bold: true, color: "#047857", alignment: "right" },
                { text: formatCurrency(receipt.amount), fontSize: 22, bold: true, color: "#047857", alignment: "right" },
              ],
            },
          ],
          margin: [0, 0, 0, 22],
        },
        {
          table: {
            widths: [130, "*"],
            body: [
              [{ text: "Dados do pagamento", colSpan: 2, bold: true, color: "#0f172a", fillColor: "#f8fafc" }, {}],
              ["Data de pagamento", receipt.paidAt ? formatDate(receipt.paidAt) : "NÃ£o informado"],
              ["MÃ©todo", paymentMethodLabel(receipt.paymentMethod)],
              ["CÃ³digo interno", compactInternalCode(receipt.id)],
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 18],
        },
        {
          table: {
            widths: [130, "*"],
            body: [
              [{ text: "ServiÃ§o", colSpan: 2, bold: true, color: "#0f172a", fillColor: "#f8fafc" }, {}],
              ...serviceRows,
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 18],
        },
        {
          table: {
            widths: [130, "*"],
            body: [
              [{ text: "Recebedor", colSpan: 2, bold: true, color: "#0f172a", fillColor: "#f8fafc" }, {}],
              ...receiverRows,
            ],
          },
          layout: "lightHorizontalLines",
          margin: [0, 0, 0, 24],
        },
        { text: "Este documento e um comprovante interno de pagamento registrado no Nythos.", fontSize: 9, color: "#64748b", alignment: "center", margin: [0, 4, 0, 18] },
        signatureBase64
          ? { image: signatureBase64, width: 120, alignment: "center", margin: [0, 0, 0, 6] }
          : null,
        {
          canvas: [{ type: "line", x1: 160, y1: 0, x2: 355, y2: 0, lineWidth: 1, lineColor: "#cbd5e1" }],
          margin: [0, 0, 0, 6],
        },
        {
          text: profile.full_name || profile.clinic_name || "Profissional responsÃ¡vel",
          alignment: "center",
          bold: true,
          color: "#0f172a",
          fontSize: 10,
        },
        profile.crp
          ? { text: `CRP ${profile.crp}`, alignment: "center", color: "#64748b", fontSize: 9 }
          : null,
      ].filter(Boolean),
    }, "Recibo gerado com sucesso.");
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!therapistId) return;
    setSaving(true);

    const { error } = await BillingService.addExpense({
      user_id: therapistId,
      amount: parseFloat(expenseForm.amount),
      description: expenseForm.description,
      category: expenseForm.category,
      notes: expenseForm.notes || null,
    });

    if (!error) {
      setShowExpense(false);
      setExpenseForm({ description: "", amount: "", category: "rent", notes: "" });
      loadTransactions();
    }
    setSaving(false);
  };

  const selectedMonth = currentDate.getMonth();
  const selectedYear = currentDate.getFullYear();
  const today = useMemo(() => new Date(), []);
  const monthTransactions = useMemo(
    () => transactions.filter((transaction) => isTransactionInMonth(transaction, selectedMonth, selectedYear)),
    [transactions, selectedMonth, selectedYear]
  );
  const monthSummary = useMemo(
    () => summarizeCashFlow(monthTransactions, today),
    [monthTransactions, today]
  );
  const overdueTransactions = useMemo(
    () => getOverdueTransactions(transactions, today),
    [transactions, today]
  );
  const overdueSummary = useMemo(
    () => summarizeCashFlow(overdueTransactions, today),
    [overdueTransactions, today]
  );
  const pendingPatientGroups = useMemo(
    () => groupPendingByPatient(transactions).slice(0, 3),
    [transactions]
  );
  const pendingPackages = useMemo(
    () => transactions
      .filter((transaction) => transaction.status === "pending" && getCashFlowOrigin(transaction) === "package")
      .slice(0, 3),
    [transactions]
  );
  const patientOptions = useMemo(() => {
    const options = new Map<string, string>();
    transactions.forEach((transaction) => {
      const patientId = transaction.patient?.id || transaction.patient_id;
      if (!patientId) return;
      options.set(patientId, transaction.patient?.full_name || "Paciente vinculado");
    });
    return Array.from(options.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [transactions]);

  const filtered = monthTransactions.filter((transaction) => {
    const origin = getCashFlowOrigin(transaction);
    const patientId = transaction.patient?.id || transaction.patient_id || "none";

    if (filter !== "all" && transaction.type !== filter) return false;
    if (statusFilter !== "all" && transaction.status !== statusFilter) return false;
    if (originFilter !== "all" && origin !== originFilter) return false;
    if (patientFilter !== "all" && patientId !== patientFilter) return false;
    if (paymentMethodFilter === "none" && transaction.payment_method) return false;
    if (
      paymentMethodFilter !== "all"
      && paymentMethodFilter !== "none"
      && transaction.payment_method !== paymentMethodFilter
    ) {
      return false;
    }

    return true;
  });

  const handleExportPdf = async () => {
    if (!profile) {
      showError("Perfil Não Encontrado", "Configure seu perfil nas Configurações antes de gerar relatórios com identidade visual.");
      return;
    }
    
    const title = filter === "all" ? "Fluxo de Caixa Geral" : filter === "income" ? "Relatório de Receitas" : "Relatório de Despesas";

    const tableBody = filtered.map(tx => [
      new Date(tx.due_date ?? tx.paid_at ?? tx.created_at ?? new Date().toISOString()).toLocaleDateString("pt-BR"),
      tx.description,
      getCashFlowCategoryLabel(tx.category),
      tx.type === "income" ? "+" + formatCurrency(Number(tx.amount)) : "-" + formatCurrency(Number(tx.amount)),
      getCashFlowStatusLabel(tx.status)
    ]);

    await exportPdf({
      title,
      subtitle: `Período selecionado (Filtro: ${title})\nGerado em: ${new Date().toLocaleDateString("pt-BR")}`,
      profile,
      fileName: `financeiro_${filter}.pdf`,
      content: [
        {
          table: {
            headerRows: 1,
            widths: ['auto', '*', 'auto', 'auto', 'auto'],
            body: [
              [
                { text: 'Data', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Descrição', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Categoria', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Valor', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Status', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] }
              ],
              ...tableBody.map((row: any[]) => row.map((cell: any) => ({ text: cell, margin: [5, 5] })))
            ]
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return (rowIndex % 2 === 0 && rowIndex > 0) ? '#f8fafc' : null;
            },
            hLineColor: '#e2e8f0',
            vLineColor: '#e2e8f0'
          }
        }
      ]
    });
  };

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800">Financeiro</h1>
          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shrink-0"
              onClick={() => {
                setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
              }}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <p className="text-sm font-bold text-slate-700 capitalize min-w-[130px] text-center">
              {currentDate.toLocaleDateString("pt-BR", {
                month: "long",
                year: "numeric",
              })}
            </p>
            <Button
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shrink-0"
              onClick={() => {
                setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
              }}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <SubscriptionGate>
          <Button
            className="gradient-primary text-white shadow-sm"
            onClick={() => setShowExpense(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Nova Despesa</span>
            <span className="sm:hidden">Despesa</span>
          </Button>
        </SubscriptionGate>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <SummaryCard
          title="Recebido"
          value={formatCurrency(monthSummary.receivedTotal)}
          detail="no mês"
          tone="emerald"
          icon={<ArrowUpRight className="size-4" />}
        />
        <SummaryCard
          title="Pendente"
          value={formatCurrency(monthSummary.pendingTotal)}
          detail={`${monthSummary.pendingCount} em aberto`}
          tone="amber"
          icon={<Clock className="size-4" />}
        />
        <SummaryCard
          title="Atrasado"
          value={formatCurrency(overdueSummary.overdueTotal)}
          detail={`${overdueSummary.overdueCount} vencido(s)`}
          tone="rose"
          icon={<CalendarX className="size-4" />}
        />
        <SummaryCard
          title="Saldo"
          value={formatCurrency(monthSummary.balanceTotal)}
          detail="recebido - despesas"
          tone={monthSummary.balanceTotal >= 0 ? "slate" : "rose"}
          icon={monthSummary.balanceTotal >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        />
        <SummaryCard
          title="Pacotes"
          value={formatCurrency(monthSummary.packagePendingTotal)}
          detail={`${monthSummary.packagePendingCount} pendente(s)`}
          tone="violet"
          icon={<Package className="size-4" />}
        />
        <SummaryCard
          title="Avulsas"
          value={formatCurrency(monthSummary.sessionPendingTotal)}
          detail={`${monthSummary.sessionPendingCount} pendente(s)`}
          tone="teal"
          icon={<Wallet className="size-4" />}
        />
        <SummaryCard
          title="Despesas"
          value={formatCurrency(monthSummary.expensesTotal)}
          detail={`${monthSummary.expensesCount} no mês`}
          tone="rose"
          icon={<ArrowDownRight className="size-4" />}
        />
      </div>

      <Card className="rounded-3xl border-0 bg-white/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-black text-slate-800">Pendências principais</CardTitle>
          <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
            Maiores valores em aberto, pacotes pendentes e vencidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-amber-800">
              <Users className="size-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Pacientes</p>
            </div>
            {pendingPatientGroups.length === 0 ? (
              <p className="text-xs font-semibold text-amber-900/60">Sem pacientes com pendência.</p>
            ) : pendingPatientGroups.map((group) => (
              <div key={group.patientId || "unlinked"} className="flex items-center justify-between gap-3 py-1.5 text-xs font-bold text-amber-950">
                <span className="truncate">{group.patientName}</span>
                <span className="shrink-0">{formatCurrency(group.total)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-violet-800">
              <Package className="size-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Pacotes</p>
            </div>
            {pendingPackages.length === 0 ? (
              <p className="text-xs font-semibold text-violet-900/60">Nenhum pacote pendente.</p>
            ) : pendingPackages.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-3 py-1.5 text-xs font-bold text-violet-950">
                <span className="truncate">{transaction.session_package?.name || transaction.description}</span>
                <span className="shrink-0">{formatCurrency(Number(transaction.amount))}</span>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
            <div className="mb-3 flex items-center gap-2 text-rose-800">
              <CalendarX className="size-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">Vencidos</p>
            </div>
            {overdueTransactions.length === 0 ? (
              <p className="text-xs font-semibold text-rose-900/60">Sem lançamentos vencidos.</p>
            ) : overdueTransactions.slice(0, 3).map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between gap-3 py-1.5 text-xs font-bold text-rose-950">
                <span className="truncate">{transaction.patient?.full_name || transaction.description}</span>
                <span className="shrink-0">{formatCurrency(Number(transaction.amount))}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Financial Evolution Chart */}
      <FinancialEvolutionChart data={chartData} loading={chartLoading} />

      {/* Transactions */}
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
        <CardHeader className="pb-4 px-6 pt-6 border-b border-teal-500">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-black text-slate-800">Histórico de Fluxo</CardTitle>
              <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">Controle total de entradas e saídas</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              <SubscriptionGate>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportPdf}
                  disabled={isExporting || filtered.length === 0}
                  className="h-10 rounded-xl font-bold border-teal-200 hover:bg-teal-50 text-teal-600 transition-all"
                >
                  <Download className="w-4 h-4 mr-2" />
                  PDF
                </Button>
              </SubscriptionGate>
              <div className="flex gap-1 bg-teal-500/50 rounded-xl p-1 border border-teal-500/50">
                {(["all", "income", "expense"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-4 py-1.5 rounded-lg text-xs font-bold transition-all uppercase tracking-tighter",
                      filter === f
                        ? "bg-white text-primary shadow-sm"
                        : "text-muted-foreground hover:text-primary/60"
                    )}
                  >
                    {f === "all" ? "Todas" : f === "income" ? "Receitas" : "Despesas"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <select
              className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-300"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="confirmed">Pago</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <select
              className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-300"
              value={originFilter}
              onChange={(event) => setOriginFilter(event.target.value as OriginFilter)}
            >
              <option value="all">Todas as origens</option>
              <option value="session">Sessão avulsa</option>
              <option value="package">Pacote</option>
              <option value="expense">Despesa</option>
              <option value="other">Outro</option>
            </select>
            <select
              className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-300"
              value={patientFilter}
              onChange={(event) => setPatientFilter(event.target.value)}
            >
              <option value="all">Todos os pacientes</option>
              <option value="none">Sem paciente</option>
              {patientOptions.map(([patientId, patientName]) => (
                <option key={patientId} value={patientId}>{patientName}</option>
              ))}
            </select>
            <select
              className="h-10 rounded-xl border border-slate-100 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-teal-300"
              value={paymentMethodFilter}
              onChange={(event) => setPaymentMethodFilter(event.target.value as PaymentMethodFilter)}
            >
              <option value="all">Todos os métodos</option>
              <option value="none">Sem método</option>
              {MANUAL_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHODS[method]?.label ?? method}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-xl bg-white text-xs font-black uppercase tracking-widest text-slate-600"
              onClick={() => {
                setFilter("all");
                setStatusFilter("all");
                setOriginFilter("all");
                setPatientFilter("all");
                setPaymentMethodFilter("all");
              }}
            >
              Limpar filtros
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-6 pt-2">
          {loading ? (
            <div className="space-y-4 py-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4 py-4 border-b border-teal-500/50 last:border-0">
                  <div className="w-12 h-12 rounded-2xl bg-teal-500" />
                  <div className="flex-1 space-y-2">
                    <div className="w-48 h-5 bg-teal-500 rounded" />
                    <div className="w-32 h-3 bg-teal-500 rounded" />
                  </div>
                  <div className="w-24 h-6 bg-teal-500 rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 bg-teal-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-10 h-10 text-teal-600" />
              </div>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                Sem transações registradas
              </p>
            </div>
          ) : (
            <div className="divide-y divide-teal-500">
              {filtered.map((tx) => {
                const category = CASH_FLOW_CATEGORIES[tx.category as keyof typeof CASH_FLOW_CATEGORIES];
                const isIncome = tx.type === "income";
                const isPackage = tx.category === "package";
                const originLabel = getCashFlowOriginLabel(tx);
                const categoryLabel = getCashFlowCategoryLabel(tx.category);
                const patientName = tx.patient?.full_name;
                const packageName = tx.session_package?.name;
                const canRegisterPayment = canConfirmCashFlowPayment(tx);
                const statusClassName = tx.status === "confirmed"
                  ? "bg-emerald-100 text-emerald-700"
                  : tx.status === "pending"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-100 text-slate-500";

                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTransaction(tx)}
                    className="flex items-center gap-4 py-6 group hover:bg-teal-500/10 cursor-pointer transition-all px-4 -mx-4 rounded-[24px] relative overflow-hidden border border-transparent hover:border-teal-500/50"
                  >
                    {/* Icon Container */}
                    <div
                      className={cn(
                        "w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-lg transition-all group-hover:scale-110 group-hover:rotate-3",
                        isIncome ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-rose-500 text-white shadow-rose-500/20"
                      )}
                    >
                      {category?.icon || (isIncome ? "💰" : "💸")}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-base font-bold text-[#1e1b4b] truncate group-hover:text-teal-600 transition-colors">
                          {tx.description}
                        </p>
                        <Badge className={cn("text-[9px] h-5 px-2 font-black uppercase tracking-widest border-0 rounded-full", statusClassName)}>
                          {getCashFlowStatusLabel(tx.status)}
                        </Badge>
                        {isPackage && (
                          <Badge className="text-[9px] h-5 px-2 font-black uppercase tracking-widest bg-sky-100 text-sky-700 border-0 rounded-full">
                            Pacote
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.15em] flex flex-wrap items-center gap-2">
                          <span>Vence {tx.due_date ? formatDate(tx.due_date) : "sem data"}</span>
                          {tx.paid_at && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-teal-500" />
                              <span>Pago em {formatDate(tx.paid_at)}</span>
                            </>
                          )}
                          <span className="w-1 h-1 rounded-full bg-teal-500" />
                          <span className="text-teal-600/60">{originLabel}</span>
                          <span className="w-1 h-1 rounded-full bg-teal-500" />
                          <span className="text-teal-600/60">{categoryLabel}</span>
                          {patientName && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-teal-500" />
                              <span className="text-teal-600/60">{patientName}</span>
                            </>
                          )}
                          {isPackage && packageName && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-teal-500" />
                              <span className="text-teal-600/60">{packageName}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Amount + Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <span
                        className={cn(
                          "text-base font-bold tracking-tight",
                          isIncome ? "text-emerald-600" : "text-rose-600"
                        )}
                      >
                        {isIncome ? "+" : "-"} {formatCurrency(Number(tx.amount))}
                      </span>

                      {canRegisterPayment && (
                        <SubscriptionGate>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-xl bg-emerald-50 px-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:bg-emerald-500 hover:text-white"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTransaction(tx);
                            }}
                          >
                            Dar baixa
                          </Button>
                        </SubscriptionGate>
                      )}

                      {tx.status === "confirmed" && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Expense Dialog */}
      <Dialog open={showExpense} onOpenChange={setShowExpense}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0 rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="bg-rose-500 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/5 rounded-full -ml-12 -mb-12 blur-xl" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md border border-white/30">
                <ArrowDownRight className="w-6 h-6 text-white" />
              </div>
              <DialogTitle className="text-3xl font-black tracking-tight">Nova Despesa</DialogTitle>
              <p className="text-rose-100 text-[10px] font-black uppercase tracking-[0.2em] mt-1 opacity-80">Registro de Saída de Caixa</p>
            </div>
          </div>

          <form onSubmit={handleAddExpense} className="p-8 space-y-6 bg-white">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Descrição do Gasto</Label>
              <Input
                placeholder="Ex: Aluguel, Materiais, etc"
                className="h-14 px-5 rounded-2xl bg-slate-50 border-slate-100 focus:bg-white focus:border-rose-200 transition-all font-bold text-slate-700"
                value={expenseForm.description}
                onChange={(e) =>
                  setExpenseForm((p) => ({
                    ...p,
                    description: e.target.value,
                  }))
                }
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Valor Total</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">R$</span>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0,00"
                    className="h-14 pl-10 rounded-2xl bg-slate-50 border-slate-100 focus:bg-white focus:border-rose-200 transition-all font-black text-slate-700 text-lg"
                    value={expenseForm.amount}
                    onChange={(e) =>
                      setExpenseForm((p) => ({ ...p, amount: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Categoria</Label>
                <select
                  className="flex h-14 w-full rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 text-sm font-bold focus:bg-white focus:border-rose-200 focus:outline-none transition-all appearance-none cursor-pointer"
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm((p) => ({
                      ...p,
                      category: e.target.value,
                    }))
                  }
                >
                  <option value="rent">🏠 Aluguel</option>
                  <option value="supplies">📎 Materiais</option>
                  <option value="marketing">📣 Marketing</option>
                  <option value="education">📚 Formação</option>
                  <option value="software">💻 Software</option>
                  <option value="taxes">🏛️ Impostos</option>
                  <option value="other_expense">💸 Outra Despesa</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Notas Internas</Label>
              <Textarea
                placeholder="Detalhes adicionais..."
                className="min-h-[100px] rounded-2xl bg-slate-50 border-slate-100 focus:bg-white focus:border-rose-200 transition-all font-medium text-slate-600 p-4 resize-none"
                value={expenseForm.notes}
                onChange={(e) =>
                  setExpenseForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1 h-12 rounded-xl font-bold text-slate-400 hover:text-slate-600"
                onClick={() => setShowExpense(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-[1.5] h-12 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black shadow-lg shadow-rose-200 active:scale-95 transition-all"
                disabled={saving}
              >
                {saving ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "REGISTRAR GASTO"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-0 rounded-[32px] shadow-2xl">
          <div className="bg-rose-50 p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-8 h-8 text-rose-600" />
            </div>
            <DialogTitle className="text-xl font-black text-slate-800 tracking-tight">Ops! Algo deu errado</DialogTitle>
            <p className="text-sm font-bold text-slate-500 mt-2 leading-relaxed">
              {errorDialog.message}
            </p>
          </div>
          <div className="p-6 bg-white flex justify-center">
            <Button 
              className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-black transition-all active:scale-95"
              onClick={() => setErrorDialog((prev) => ({ ...prev, open: false }))}
            >
              ENTENDI
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Transaction Details Sheet */}
      <TransactionDetailsSheet
        open={selectedTransaction !== null}
        onOpenChange={(open) => !open && setSelectedTransaction(null)}
        transaction={selectedTransaction}
        onConfirmPayment={handleConfirmPayment}
        onCancelTransaction={handleCancelTransaction}
        onGenerateReceipt={handleGenerateReceipt}
        actionPending={transactionActionId === selectedTransaction?.id}
        receiptPending={isExporting}
      />
    </div>
  );
}

