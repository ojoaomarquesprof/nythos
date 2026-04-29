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
import { createPdfDocument, addPdfFooter, addTableToPdf, getBase64ImageFromUrl } from "@/lib/pdf-generator";

export default function FinancesPage() {
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [transactions, setTransactions] = useState<CashFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showExpense, setShowExpense] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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
    setLoading(true);
    
    // Load profile (of the therapist, for branding)
    const targetId = therapistId;
    if (targetId) {
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", targetId).single();
      if (profileData) setProfile(profileData);
    }

    const { data } = await supabase
      .from("cash_flow")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) setTransactions(data);
    setLoading(false);
  }

  const handleConfirmPayment = async (id: string, method: string) => {
    const { error } = await (supabase.from("cash_flow") as any)
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
        payment_method: method,
      })
      .eq("id", id);

    if (!error) loadTransactions();
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const { error } = await (supabase.from("cash_flow") as any).insert({
      user_id: therapistId || user.id,
      type: "expense",
      amount: parseFloat(expenseForm.amount),
      description: expenseForm.description,
      category: expenseForm.category,
      status: "confirmed",
      paid_at: new Date().toISOString(),
      notes: expenseForm.notes || null,
    });

    if (!error) {
      setShowExpense(false);
      setExpenseForm({ description: "", amount: "", category: "rent", notes: "" });
      loadTransactions();
    }
    setSaving(false);
  };

  // Calculations
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const monthTransactions = transactions.filter((t) => {
    const d = new Date(t.due_date || t.paid_at || t.created_at);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
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
    setIsExporting(true);
    
    try {
      const title = filter === "all" ? "Fluxo de Caixa Geral" : filter === "income" ? "Relatório de Receitas" : "Relatório de Despesas";
      const { doc } = await createPdfDocument({
        title,
        subtitle: `Período selecionado (Filtro: ${title})\nGerado em: ${new Date().toLocaleDateString("pt-BR")}`,
        profile
      });

      const tableData = filtered.map(tx => [
        new Date(tx.due_date || tx.paid_at || tx.created_at).toLocaleDateString("pt-BR"),
        tx.description,
        CASH_FLOW_CATEGORIES[tx.category as keyof typeof CASH_FLOW_CATEGORIES]?.label || tx.category,
        tx.type === "income" ? "+" + formatCurrency(Number(tx.amount)) : "-" + formatCurrency(Number(tx.amount)),
        tx.status === "confirmed" ? "Confirmado" : "Pendente"
      ]);

      addTableToPdf(doc, {
        startY: 65,
        head: [['Data', 'Descrição', 'Categoria', 'Valor', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [139, 92, 246] }, // Primary violet color
      });

      addPdfFooter(doc);
      doc.save(`financeiro_${filter}.pdf`);
    } catch (e) {
      showError("Erro na Exportação", "Ocorreu um erro ao gerar o PDF financeiro.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportReceipt = async (tx: CashFlow) => {
    if (!profile) {
      showError("Perfil Necessário", "Configure seu perfil com nome completo e dados profissionais para emitir recibos.");
      return;
    }
    setIsExporting(true);
    
    try {
      const docNumber = `${new Date(tx.created_at).getFullYear()}${String(new Date(tx.created_at).getMonth() + 1).padStart(2, '0')}${tx.id.split("-")[0].slice(-4).toUpperCase()}`;
      const { doc, startY } = await createPdfDocument({
        title: "Recibo de Pagamento",
        subtitle: `Nº do Recibo: ${docNumber}`,
        profile
      });

      let currentY = startY + 5;

      // 1. Box de Valor (Destaque Superior Direito)
      doc.setFillColor(245, 243, 255); // Light violet bg
      doc.roundedRect(140, currentY, 55, 15, 2, 2, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(109, 40, 217); // Indigo-700
      doc.text(formatCurrency(Number(tx.amount)), 167.5, currentY + 10, { align: "center" });
      
      currentY += 25;

      // 2. Título Centralizado com linha decorativa
      doc.setFontSize(18);
      doc.text("RECIBO", 105, currentY, { align: "center" });
      doc.setDrawColor(109, 40, 217);
      doc.setLineWidth(0.5);
      doc.line(90, currentY + 2, 120, currentY + 2);
      
      currentY += 20;

      // 3. Texto Formal
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85); // Slate-700
      
      const patientName = tx.description.replace("Sessão - ", "").toUpperCase();
      const amountExtenso = Number(tx.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const fullDate = tx.paid_at ? new Date(tx.paid_at) : new Date(tx.created_at);
      const dateStr = fullDate.toLocaleDateString("pt-BR", { day: '2-digit', month: 'long', year: 'numeric' });
      
      const lines = [
        `Recebemos de ${patientName},`,
        `a importância supra de ${formatCurrency(Number(tx.amount))} (${amountExtenso}),`,
        `referente aos serviços profissionais de: Sessão de Atendimento.`,
        "",
        `Para maior clareza, firmamos o presente recibo.`,
        "",
        `Data do Pagamento: ${dateStr}`
      ];

      lines.forEach(line => {
        if (line) {
          doc.text(line, 20, currentY);
          currentY += 8;
        } else {
          currentY += 4;
        }
      });

      currentY += 35;

      // 4. Área de Assinatura Premium
      if (profile.signature_url) {
        try {
          const sigBase64 = await getBase64ImageFromUrl(profile.signature_url);
          doc.addImage(sigBase64, 'PNG', 80, currentY - 28, 50, 25);
        } catch (e) {
          console.error("Erro ao carregar imagem da assinatura:", e);
        }
      }

      doc.setDrawColor(203, 213, 225); // Slate-300
      doc.setLineWidth(0.2);
      doc.line(60, currentY, 150, currentY);
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(profile.full_name.toUpperCase(), 105, currentY + 6, { align: "center" });
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(profile.crp || "Registro Profissional", 105, currentY + 11, { align: "center" });

      // 5. Rodapé decorativo
      doc.setFillColor(109, 40, 217);
      doc.rect(10, 285, 190, 2, 'F');

      addPdfFooter(doc);
      doc.save(`recibo_${patientName.replace(/\s+/g, '_')}.pdf`);
    } catch (e) {
      console.error(e);
      showError("Erro no Recibo", "Ocorreu um erro ao gerar o arquivo do recibo.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
            })}
          </p>
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
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-110 transition-transform">
                  <ArrowUpRight className="w-6 h-6" />
                </div>
                <p className="text-[10px] font-black text-emerald-600/40 uppercase tracking-[0.2em]">Receita Bruta</p>
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
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-lg shadow-rose-500/20 group-hover:scale-110 transition-transform">
                  <ArrowDownRight className="w-6 h-6" />
                </div>
                <p className="text-[10px] font-black text-rose-600/40 uppercase tracking-[0.2em]">Total Despesas</p>
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

        <Card className="border-0 shadow-lg shadow-teal-/5 bg-white overflow-hidden relative group hover:-translate-y-2 transition-all duration-300 rounded-[32px] border-b-4 border-teal-/20">
          <CardContent className="p-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-teal- text-white flex items-center justify-center shadow-lg shadow-teal-/20 group-hover:scale-110 transition-transform">
                  {netProfit >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                </div>
                <p className="text-[10px] font-black text-teal-/40 uppercase tracking-[0.2em]">Lucro Líquido</p>
              </div>
              <div>
                <p className={cn(
                  "text-2xl font-bold tracking-tight leading-none mb-2",
                  netProfit >= 0 ? "text-teal-" : "text-rose-600"
                )}>
                  {formatCurrency(netProfit)}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-teal-/60 uppercase tracking-widest">Resultado Real</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg shadow-amber-500/5 bg-white overflow-hidden relative group hover:-translate-y-2 transition-all duration-300 rounded-[32px] border-b-4 border-amber-500/20">
          <CardContent className="p-7">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6" />
                </div>
                <p className="text-[10px] font-black text-amber-600/40 uppercase tracking-[0.2em]">A Receber</p>
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

      {/* Transactions */}
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-3xl overflow-hidden">
        <CardHeader className="pb-4 px-6 pt-6 border-b border-teal-">
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
                  className="h-10 rounded-xl font-bold border-teal- hover:bg-teal- text-teal- transition-all"
                >
                  <Download className="w-4 h-4 mr-2" />
                  PDF
                </Button>
              </SubscriptionGate>
              <div className="flex gap-1 bg-teal-/50 rounded-xl p-1 border border-teal-/50">
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
                <div key={i} className="animate-pulse flex items-center gap-4 py-4 border-b border-teal-/50 last:border-0">
                  <div className="w-12 h-12 rounded-2xl bg-teal-" />
                  <div className="flex-1 space-y-2">
                    <div className="w-48 h-5 bg-teal- rounded" />
                    <div className="w-32 h-3 bg-teal- rounded" />
                  </div>
                  <div className="w-24 h-6 bg-teal- rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 bg-teal- rounded-full flex items-center justify-center mx-auto mb-4">
                <Wallet className="w-10 h-10 text-teal-" />
              </div>
              <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                Sem transações registradas
              </p>
            </div>
          ) : (
            <div className="divide-y divide-teal-">
              {filtered.map((tx) => {
                const category = CASH_FLOW_CATEGORIES[tx.category as keyof typeof CASH_FLOW_CATEGORIES];
                const isIncome = tx.type === "income";
                const isPending = tx.status === "pending";

                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-4 py-6 group hover:bg-teal-/40 transition-all px-4 -mx-4 rounded-[24px] relative overflow-hidden border border-transparent hover:border-teal-/50"
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
                        <p className="text-base font-bold text-[#1e1b4b] truncate group-hover:text-teal- transition-colors">
                          {tx.description}
                        </p>
                        {isPending && (
                          <Badge className="text-[9px] h-5 px-2 font-black uppercase tracking-widest bg-amber-100 text-amber-700 border-0 rounded-full animate-pulse">
                            Aguardando
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[10px] font-black text-teal- uppercase tracking-[0.15em] flex items-center gap-2">
                          <span>{formatDate(tx.due_date || tx.paid_at || tx.created_at)}</span>
                          <span className="w-1 h-1 rounded-full bg-teal-" />
                          <span className="text-teal-/60">{category?.label || tx.category}</span>
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
                          <div className="flex gap-1.5">
                            {["pix", "cash", "credit_card"].map((method) => (
                              <button
                                key={method}
                                onClick={() => handleConfirmPayment(tx.id, method)}
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
                        <div className="flex items-center gap-2">
                          {isIncome && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-3 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                              onClick={() => handleExportReceipt(tx)}
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
    </div>
  );
}
