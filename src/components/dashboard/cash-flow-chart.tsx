"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

interface MonthData {
  month: string;
  income: number;
  expenses: number;
}

type CashFlowChartRow = {
  type: string;
  amount: number;
  status: string;
};

export function CashFlowChart() {
  const { therapistId } = useSubscription();
  const supabase = createClient();
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [currentMonth, setCurrentMonth] = useState({ income: 0, expenses: 0 });
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (therapistId) {
      loadData();
    }
  }, [therapistId]);

  async function loadData() {
    setLoading(true);
    setHasError(false);

    try {
      const now = new Date();
      const months: MonthData[] = [];

      for (let i = 3; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
        const monthName = start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

        const { data, error } = await supabase
          .from("cash_flow")
          .select("type, amount, status")
          .gte("created_at", start.toISOString())
          .lte("created_at", end.toISOString())
          .in("status", ["confirmed", "pending"]);

        if (error) throw error;

        const rows = (data || []) as CashFlowChartRow[];
        const income = rows
          .filter((transaction) => transaction.type === "income")
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
        const expenses = rows
          .filter((transaction) => transaction.type === "expense")
          .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

        months.push({
          month: monthName.charAt(0).toUpperCase() + monthName.slice(1),
          income,
          expenses,
        });
      }

      setMonthlyData(months);
      const last = months[months.length - 1];
      setCurrentMonth(last ? { income: last.income, expenses: last.expenses } : { income: 0, expenses: 0 });
    } catch {
      console.error("[cash-flow-chart] Failed to load cash flow");
      setHasError(true);
      setMonthlyData([]);
      setCurrentMonth({ income: 0, expenses: 0 });
    } finally {
      setLoading(false);
    }
  }

  const maxValue = Math.max(...monthlyData.flatMap((data) => [data.income, data.expenses]), 1);
  const balance = currentMonth.income - currentMonth.expenses;
  const hasFinancialData = monthlyData.some((data) => data.income > 0 || data.expenses > 0);

  return (
    <Card className="animate-fade-in border-border/70 bg-card/95 py-0 shadow-[0_16px_42px_rgba(41,31,67,0.08)]">
      <CardHeader className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-foreground">
              Financeiro
            </CardTitle>
            <p className="text-sm text-muted-foreground">Entradas e saídas dos últimos meses.</p>
          </div>
          <Link
            href="/dashboard/finances"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-xl bg-white/80")}
          >
            Detalhes
            <ChevronRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-5">
        {loading ? (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-16 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
            <div className="h-28 animate-pulse rounded-2xl bg-muted" />
          </div>
        ) : hasError ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-border/60 bg-muted/30 p-5 text-center">
            <Wallet className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Resumo financeiro indisponível</p>
            <p className="mt-1 text-sm text-muted-foreground">Tente novamente em instantes.</p>
          </div>
        ) : !hasFinancialData ? (
          <div className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-primary/20 bg-primary/[0.03] p-5 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-white text-primary shadow-sm">
              <Wallet className="size-5" />
            </div>
            <p className="text-sm font-medium text-foreground">Sem lançamentos financeiros</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Quando houver entradas ou saídas, o resumo aparece aqui.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
                <p className="text-xs font-medium text-emerald-700">Entradas</p>
                <p className="mt-1 truncate text-sm font-semibold text-emerald-800">
                  {formatCurrency(currentMonth.income)}
                </p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
                <p className="text-xs font-medium text-rose-700">Saídas</p>
                <p className="mt-1 truncate text-sm font-semibold text-rose-800">
                  {formatCurrency(currentMonth.expenses)}
                </p>
              </div>
              <div className="rounded-2xl border border-primary/10 bg-primary/[0.06] p-3">
                <p className="text-xs font-medium text-primary">Saldo</p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">
                  {formatCurrency(balance)}
                </p>
              </div>
            </div>

            <div className="mt-5 flex h-28 items-end gap-3">
              {monthlyData.map((data, index) => {
                const incomeHeight = (data.income / maxValue) * 100;
                const expenseHeight = (data.expenses / maxValue) * 100;
                const isLast = index === monthlyData.length - 1;

                return (
                  <div key={data.month} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex h-20 w-full items-end gap-1">
                      <div className="flex h-full flex-1 items-end">
                        <div
                          className={cn(
                            "w-full rounded-t-lg transition-all duration-500",
                            isLast ? "bg-emerald-500" : "bg-emerald-200"
                          )}
                          style={{ height: `${Math.max(incomeHeight, data.income > 0 ? 6 : 0)}%` }}
                          title={`Entradas: ${formatCurrency(data.income)}`}
                        />
                      </div>
                      <div className="flex h-full flex-1 items-end">
                        <div
                          className={cn(
                            "w-full rounded-t-lg transition-all duration-500",
                            isLast ? "bg-rose-400" : "bg-rose-200"
                          )}
                          style={{ height: `${Math.max(expenseHeight, data.expenses > 0 ? 6 : 0)}%` }}
                          title={`Saídas: ${formatCurrency(data.expenses)}`}
                        />
                      </div>
                    </div>
                    <span className={cn("text-xs font-medium", isLast ? "text-foreground" : "text-muted-foreground")}>
                      {data.month}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-center gap-5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-400" />
                Entradas
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-rose-300" />
                Saídas
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
