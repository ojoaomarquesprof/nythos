"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

interface MonthData {
  month: string;
  income: number;
  expenses: number;
}

export function CashFlowChart() {
  const { therapistId } = useSubscription();
  const supabase = createClient() as any;
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [currentMonth, setCurrentMonth] = useState({ income: 0, expenses: 0 });

  useEffect(() => {
    if (therapistId) {
      loadData();
    }
  }, [therapistId]);

  async function loadData() {
    const now = new Date();
    const months: MonthData[] = [];

    for (let i = 3; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthName = start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

      const { data } = await supabase
        .from("cash_flow")
        .select("type, amount, status")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .in("status", ["confirmed", "pending"]);

      const income = (data || [])
        .filter((t: { type: string; amount: number }) => t.type === "income")
        .reduce((sum: number, t: { amount: number }) => sum + Number(t.amount), 0);
      const expenses = (data || [])
        .filter((t: { type: string; amount: number }) => t.type === "expense")
        .reduce((sum: number, t: { amount: number }) => sum + Number(t.amount), 0);

      months.push({ month: monthName.charAt(0).toUpperCase() + monthName.slice(1), income, expenses });
    }

    setMonthlyData(months);
    if (months.length > 0) {
      const last = months[months.length - 1];
      setCurrentMonth({ income: last.income, expenses: last.expenses });
    }
  }

  const maxValue = Math.max(
    ...monthlyData.flatMap((d) => [d.income, d.expenses]),
    1
  );
  const profit = currentMonth.income - currentMonth.expenses;

  return (
    <Card className="border-0 shadow-sm animate-fade-in delay-500">
      <CardHeader className="pb-2 px-4 md:px-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Fluxo de Caixa
          </CardTitle>
          <Link
            href="/dashboard/finances"
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Detalhes →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-4 md:px-6 pb-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="text-center p-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
            <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">
              Receita
            </p>
            <p className="text-sm font-bold text-emerald-700 mt-0.5">
              {formatCurrency(currentMonth.income)}
            </p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-red-50 border border-red-100">
            <p className="text-[10px] text-red-600 font-medium uppercase tracking-wider">
              Despesas
            </p>
            <p className="text-sm font-bold text-red-700 mt-0.5">
              {formatCurrency(currentMonth.expenses)}
            </p>
          </div>
          <div className="text-center p-2.5 rounded-xl bg-violet-50 border border-violet-100">
            <p className="text-[10px] text-violet-600 font-medium uppercase tracking-wider">
              Lucro
            </p>
            <p className="text-sm font-bold text-violet-700 mt-0.5">
              {formatCurrency(profit)}
            </p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-2 h-28">
          {monthlyData.map((data, index) => {
            const incomeHeight = (data.income / maxValue) * 100;
            const expenseHeight = (data.expenses / maxValue) * 100;
            const isLast = index === monthlyData.length - 1;

            return (
              <div
                key={data.month}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <div className="flex items-end gap-0.5 w-full h-24">
                  <div className="flex-1 flex flex-col justify-end h-full">
                    <div
                      className={cn(
                        "w-full rounded-t-sm transition-all duration-500 ease-out hover:opacity-80 cursor-default",
                        isLast ? "bg-emerald-500" : "bg-emerald-300"
                      )}
                      style={{ height: `${Math.max(incomeHeight, 3)}%` }}
                      title={`Receita: ${formatCurrency(data.income)}`}
                    />
                  </div>
                  <div className="flex-1 flex flex-col justify-end h-full">
                    <div
                      className={cn(
                        "w-full rounded-t-sm transition-all duration-500 ease-out hover:opacity-80 cursor-default",
                        isLast ? "bg-red-400" : "bg-red-200"
                      )}
                      style={{ height: `${Math.max(expenseHeight, 3)}%` }}
                      title={`Despesa: ${formatCurrency(data.expenses)}`}
                    />
                  </div>
                </div>
                <span
                  className={cn(
                    "text-[10px]",
                    isLast
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {data.month}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
            <span className="text-[11px] text-muted-foreground">Receitas</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-red-300" />
            <span className="text-[11px] text-muted-foreground">Despesas</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
