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
  X,
  Download,
  AlertCircle,
  FileText,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { SupabaseClient } from "@supabase/supabase-js";
import { cn } from "@/lib/utils";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import { useSubscription } from "@/hooks/use-subscription";
import {
  formatCurrency,
  formatDate,
  CASH_FLOW_CATEGORIES,
  PAYMENT_METHODS,
} from "@/lib/constants";
import type { Database, CashFlow, Profile } from "@/types/database";
import { usePdfExport } from "@/hooks/use-pdf-export";
import { getBase64ImageFromUrl } from "@/lib/pdf-generator";
import { BillingService } from "@/services/billing-service";
import { FinancialEvolutionChart } from "@/components/dashboard/finances/evolution-chart";
import { TransactionDetailsSheet } from "@/components/dashboard/finances/transaction-details-sheet";

export default function FinancesPage() {
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [transactions, setTransactions] = useState<CashFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState<CashFlow | null>(null);
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

  const handleConfirmPayment = async (id: string, method: string) => {
    const { error } = await BillingService.confirmPayment(id, method);
    if (!error) loadTransactions();
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

  const handleDeleteTransaction = async (id: string) => {
    const { error } = await BillingService.deleteTransaction(id);
    if (!error) {
      loadTransactions();
    } else {
      showError("Erro ao Excluir", error || "Não foi possível excluir a transação.");
    }
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
      CASH_FLOW_CATEGORIES[tx.category as keyof typeof CASH_FLOW_CATEGORIES]?.label || tx.category,
      tx.type === "income" ? "+" + formatCurrency(Number(tx.amount)) : "-" + formatCurrency(Number(tx.amount)),
      tx.status === "confirmed" ? "Confirmado" : "Pendente"
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

  const handleExportReceipt = async (tx: CashFlow) => {
    if (!profile) {
      showError("Perfil Necessário", "Configure seu perfil com nome completo e dados profissionais para emitir recibos.");
      return;
    }
    
    const docNumber = `${new Date(tx.created_at ?? new Date().toISOString()).getFullYear()}${String(new Date(tx.created_at ?? new Date().toISOString()).getMonth() + 1).padStart(2, '0')}${tx.id.split("-")[0].slice(-4).toUpperCase()}`;
    const patientName = tx.description.replace("Sessão - ", "").toUpperCase();
    const amountExtenso = Number(tx.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fullDate = tx.paid_at ? new Date(tx.paid_at!) : new Date(tx.created_at ?? new Date().toISOString());
    const dateStr = fullDate.toLocaleDateString("pt-BR", { day: '2-digit', month: 'long', year: 'numeric' });

    let sigImage: any = null;
    if (profile.signature_url) {
      try {
        const { getBase64ImageFromUrl } = await import('@/lib/pdf-generator');
        const sigBase64 = await getBase64ImageFromUrl(profile.signature_url);
        sigImage = { image: sigBase64, width: 150, alignment: 'center', margin: [0, 20, 0, 5] };
      } catch {
        console.error("[finances] Failed to load signature image for receipt export");
      }
    }

    await exportPdf({
      title: "Recibo de Pagamento",
      subtitle: `Nº do Recibo: ${docNumber}`,
      profile,
      fileName: `recibo_${patientName.replace(/\s+/g, '_')}.pdf`,
      content: [
        {
          columns: [
            { text: "RECIBO", fontSize: 24, bold: true, color: '#6d28d9', margin: [0, 20, 0, 0] },
            {
              table: {
                widths: ['*'],
                body: [
                  [{ text: formatCurrency(Number(tx.amount)), fontSize: 16, bold: true, color: '#6d28d9', alignment: 'center', fillColor: '#f5f3ff', margin: [10, 10] }]
                ]
              },
              layout: 'noBorders',
              width: 150
            }
          ]
        },
        {
          text: [
            `Recebemos de `, { text: patientName, bold: true }, `,\n\n`,
            `a importância supra de `, { text: `${formatCurrency(Number(tx.amount))} (${amountExtenso})`, bold: true }, `,\n\n`,
            `referente aos serviços profissionais de: Sessão de Atendimento.\n\n`,
            `Para maior clareza, firmamos o presente recibo.\n\n\n`,
            `Data do Pagamento: ${dateStr}`
          ],
          fontSize: 12,
          color: '#334155',
          margin: [0, 30, 0, 60]
        },
        sigImage,
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 250, y2: 0, lineWidth: 1, lineColor: '#cbd5e1' }], margin: [130, (sigImage ? 0 : 40), 0, 10] },
        { text: profile.full_name || "Assinatura do Profissional", alignment: 'center', fontSize: 12, bold: true, color: '#334155' },
        profile.crp ? { text: `CRP: ${profile.crp}`, alignment: 'center', fontSize: 10, color: '#64748b' } : null
      ].filter(Boolean)
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
                const isPending = tx.status === "pending";
                const isPackage = tx.category === "package";

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
                      <div className="flex items-center gap-3 mb-1">
                        <p className="text-base font-bold text-[#1e1b4b] truncate group-hover:text-teal-600 transition-colors">
                          {tx.description}
                        </p>
                        {isPending && (
                          <Badge className="text-[9px] h-5 px-2 font-black uppercase tracking-widest bg-amber-100 text-amber-700 border-0 rounded-full animate-pulse">
                            Aguardando
                          </Badge>
                        )}
                        {isPackage && (
                          <Badge className="text-[9px] h-5 px-2 font-black uppercase tracking-widest bg-sky-100 text-sky-700 border-0 rounded-full">
                            Pacote
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.15em] flex items-center gap-2">
                          <span>{formatDate(tx.due_date ?? tx.paid_at ?? tx.created_at ?? new Date().toISOString())}</span>
                          <span className="w-1 h-1 rounded-full bg-teal-500" />
                          <span className="text-teal-600/60">{category?.label || tx.category}</span>
                          {isPackage && tx.patient_id && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-teal-500" />
                              <span className="text-teal-600/60">Paciente vinculado</span>
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

                      {isPending && isIncome && (
                        <SubscriptionGate>
                          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {["pix", "cash", "credit_card"].map((method) => (
                              <button
                                key={method}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleConfirmPayment(tx.id, method);
                                }}
                                className="h-8 px-2.5 rounded-lg text-[10px] font-bold uppercase tracking-tighter bg-emerald-50 text-emerald-700 hover:bg-emerald-500 hover:text-white transition-all shadow-sm active:scale-95"
                                title={`Confirmar como ${PAYMENT_METHODS[method as keyof typeof PAYMENT_METHODS]?.label}`}
                              >
                                {method === "pix" ? "Pix" : method === "cash" ? "💵" : "💳"}
                              </button>
                            ))}
                          </div>
                        </SubscriptionGate>
                      )}

                      {tx.status === "confirmed" && (
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {isIncome && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportReceipt(tx);
                              }}
                              disabled={isExporting}
                            >
                              <FileText className="w-3 h-3 mr-1.5" />
                              Recibo
                            </Button>
                          )}
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
        onExportReceipt={handleExportReceipt}
        isExportingReceipt={isExporting}
        onDeleteTransaction={handleDeleteTransaction}
      />
    </div>
  );
}

