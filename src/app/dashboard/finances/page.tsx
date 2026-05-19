"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  Plus,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
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
} from "@/lib/constants";
import type { Profile } from "@/types/database";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { toast } from "sonner";
import { confirmCashFlowPayment, cancelPendingCashFlow } from "@/app/actions/financial-transactions";
import { BillingService, type FinancialTransaction } from "@/services/billing-service";
import {
  canConfirmCashFlowPayment,
  getCashFlowCategoryLabel,
  getCashFlowOriginLabel,
  getCashFlowStatusLabel,
  type ManualPaymentMethod,
} from "@/services/financial-transaction-rules";
import { FinancialEvolutionChart } from "@/components/dashboard/finances/evolution-chart";
import { TransactionDetailsSheet } from "@/components/dashboard/finances/transaction-details-sheet";

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
  const [filter, setFilter] = useState<"all" | "income" | "expense">("all");
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

  // Calculations (Time Travel!)
  const selectedMonth = currentDate.getMonth();
  const selectedYear = currentDate.getFullYear();
  const monthTransactions = transactions.filter((t) => {
    const d = new Date(t.due_date ?? t.paid_at ?? t.created_at ?? new Date().toISOString());
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  });

  const totalIncome = monthTransactions
    .filter((t) => t.type === "income" && t.status === "confirmed")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalExpenses = monthTransactions
    .filter((t) => t.type === "expense" && t.status === "confirmed")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const pendingIncome = monthTransactions
    .filter((t) => t.type === "income" && t.status === "pending")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const netProfit = totalIncome - totalExpenses;
  const pendingCount = monthTransactions.filter(
    (t) => t.type === "income" && t.status === "pending"
  ).length;

  const filtered = transactions.filter(
    (t) => filter === "all" || t.type === filter
  );

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-lg shadow-emerald-500/5 bg-white overflow-hidden relative group hover:-translate-y-2 transition-all duration-300 rounded-[32px] border-b-4 border-emerald-500/20">
          <CardContent className="p-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <div className="w-12 h-12 shrink-0 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                  <ArrowUpRight className="w-6 h-6" />
                </div>
                <p className="text-[9px] md:text-[10px] font-black text-emerald-600/40 uppercase tracking-[0.2em] text-right leading-tight">Receita Bruta</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600 tracking-tight leading-none mb-2">
                  {formatCurrency(totalIncome)}
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Fluxo Confirmado</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg shadow-rose-500/5 bg-white overflow-hidden relative group hover:-translate-y-2 transition-all duration-300 rounded-[32px] border-b-4 border-rose-500/20">
          <CardContent className="p-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <div className="w-12 h-12 shrink-0 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20 group-hover:scale-110 transition-transform">
                  <ArrowDownRight className="w-6 h-6" />
                </div>
                <p className="text-[9px] md:text-[10px] font-black text-rose-600/40 uppercase tracking-[0.2em] text-right leading-tight">Total Despesas</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-rose-600 tracking-tight leading-none mb-2">
                  {formatCurrency(totalExpenses)}
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" />
                  <span className="text-[9px] font-black text-rose-600 uppercase tracking-widest">Saídas do Mês</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg shadow-teal-500/5 bg-white overflow-hidden relative group hover:-translate-y-2 transition-all duration-300 rounded-[32px] border-b-4 border-teal-500/20">
          <CardContent className="p-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <div className="w-12 h-12 shrink-0 rounded-2xl bg-teal-500 text-white flex items-center justify-center shadow-lg shadow-teal-500/20 group-hover:scale-110 transition-transform">
                  {netProfit >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                </div>
                <p className="text-[9px] md:text-[10px] font-black text-teal-600/40 uppercase tracking-[0.2em] text-right leading-tight">Lucro Líquido</p>
              </div>
              <div>
                <p className={cn(
                  "text-2xl font-bold tracking-tight leading-none mb-2",
                  netProfit >= 0 ? "text-teal-600" : "text-rose-600"
                )}>
                  {formatCurrency(netProfit)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-teal-600/60 uppercase tracking-widest">Resultado Real</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg shadow-amber-500/5 bg-white overflow-hidden relative group hover:-translate-y-2 transition-all duration-300 rounded-[32px] border-b-4 border-amber-500/20">
          <CardContent className="p-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <div className="w-12 h-12 shrink-0 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6" />
                </div>
                <p className="text-[9px] md:text-[10px] font-black text-amber-600/40 uppercase tracking-[0.2em] text-right leading-tight">A Receber</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600 tracking-tight leading-none mb-2">
                  {formatCurrency(pendingIncome)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">
                    {pendingCount} lançamento{pendingCount !== 1 ? "s" : ""} pendente{pendingCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
                          <span>{formatDate(tx.due_date ?? tx.paid_at ?? tx.created_at ?? new Date().toISOString())}</span>
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
        actionPending={transactionActionId === selectedTransaction?.id}
      />
    </div>
  );
}

