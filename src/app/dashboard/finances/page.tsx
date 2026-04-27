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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { CashFlow, Profile } from "@/types/database";
import { createPdfDocument, addPdfFooter, addTableToPdf } from "@/lib/pdf-generator";

export default function FinancesPage() {
  const { therapistId } = useSubscription();
  const supabase = createClient();
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
    const { error } = await supabase
      .from("cash_flow")
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
        payment_method: method as CashFlow["payment_method"],
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

    const { error } = await supabase.from("cash_flow").insert({
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
    const d = new Date(t.created_at);
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
        new Date(tx.created_at).toLocaleDateString("pt-BR"),
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Receita
              </p>
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-emerald-600">
              {formatCurrency(totalIncome)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Despesas
              </p>
              <ArrowDownRight className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-lg font-bold text-red-600">
              {formatCurrency(totalExpenses)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Lucro Líquido
              </p>
              {netProfit >= 0 ? (
                <TrendingUp className="w-4 h-4 text-violet-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
            </div>
            <p
              className={cn(
                "text-lg font-bold",
                netProfit >= 0 ? "text-violet-600" : "text-red-600"
              )}
            >
              {formatCurrency(netProfit)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Pendente
              </p>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-lg font-bold text-amber-600">
              {formatCurrency(pendingIncome)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {pendingCount} pagamento{pendingCount !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3 px-4 md:px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Transações</CardTitle>
            <div className="flex gap-2 items-center">
              <SubscriptionGate>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportPdf}
                  disabled={isExporting || filtered.length === 0}
                  className="h-8"
                >
                  <Download className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Exportar PDF</span>
                </Button>
              </SubscriptionGate>
              <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
                {(["all", "income", "expense"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                      filter === f
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {f === "all"
                      ? "Todas"
                      : f === "income"
                      ? "Receitas"
                      : "Despesas"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 md:px-6 pb-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-3 py-3">
                  <div className="w-9 h-9 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="w-36 h-4 bg-muted rounded" />
                    <div className="w-24 h-3 bg-muted rounded" />
                  </div>
                  <div className="w-20 h-4 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhuma transação encontrada.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((tx) => {
                const category =
                  CASH_FLOW_CATEGORIES[
                    tx.category as keyof typeof CASH_FLOW_CATEGORIES
                  ];
                const isIncome = tx.type === "income";
                const isPending = tx.status === "pending";

                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    {/* Icon */}
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0",
                        isIncome ? "bg-emerald-100" : "bg-red-100"
                      )}
                    >
                      {category?.icon || (isIncome ? "💰" : "💸")}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {tx.description}
                        </p>
                        {isPending && (
                          <Badge
                            variant="outline"
                            className="text-[9px] h-4 px-1 text-amber-600 border-amber-200"
                          >
                            Pendente
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(tx.created_at)} · {category?.label || tx.category}
                      </p>
                    </div>

                    {/* Amount + Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          isIncome ? "text-emerald-600" : "text-red-600"
                        )}
                      >
                        {isIncome ? "+" : "-"}
                        {formatCurrency(Number(tx.amount))}
                      </span>

                      {isPending && isIncome && (
                        <SubscriptionGate>
                          <div className="flex gap-1">
                            {["pix", "cash", "credit_card"].map((method) => (
                              <button
                                key={method}
                                onClick={() =>
                                  handleConfirmPayment(tx.id, method)
                                }
                                className="h-6 px-2 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                                title={`Confirmar como ${PAYMENT_METHODS[method as keyof typeof PAYMENT_METHODS]?.label}`}
                              >
                                {method === "pix"
                                  ? "⚡ Pix"
                                  : method === "cash"
                                  ? "💵"
                                  : "💳"}
                              </button>
                            ))}
                          </div>
                        </SubscriptionGate>
                      )}

                      {tx.status === "confirmed" && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Despesa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddExpense} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input
                placeholder="Ex: Aluguel do consultório"
                className="h-10"
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="h-10"
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm((p) => ({ ...p, amount: e.target.value }))
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações opcionais..."
                className="min-h-[80px] resize-none"
                value={expenseForm.notes}
                onChange={(e) =>
                  setExpenseForm((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowExpense(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="flex-1 gradient-primary text-white"
                disabled={saving}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  "Registrar"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog((prev) => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{errorDialog.message}</p>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setErrorDialog((prev) => ({ ...prev, open: false }))}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
