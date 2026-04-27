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
    <Card className="border-0 shadow-xl shadow-slate-200/40 bg-white/80 backdrop-blur-md rounded-[32px] overflow-hidden animate-fade-in delay-500">
      <CardHeader className="pb-4 px-8 pt-8 border-b border-indigo-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-[11px] font-black text-indigo-600/40 uppercase tracking-[0.2em]">
            Fluxo de Caixa
          </CardTitle>
          <Link
            href="/dashboard/finances"
            className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 transition-colors uppercase tracking-widest bg-indigo-50 px-4 py-2 rounded-full border border-indigo-100/50 shadow-sm active:scale-95 transition-all"
          >
            Ver Detalhes
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-8">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="text-center p-4 rounded-[24px] bg-emerald-50 border border-emerald-100/50 shadow-sm">
            <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest">
              Receita
            </p>
            <p className="text-sm font-bold text-emerald-700 mt-1">
              {formatCurrency(currentMonth.income)}
            </p>
          </div>
          <div className="text-center p-4 rounded-[24px] bg-rose-50 border border-rose-100/50 shadow-sm">
            <p className="text-[9px] text-rose-600 font-black uppercase tracking-widest">
              Despesas
            </p>
            <p className="text-sm font-bold text-rose-700 mt-1">
              {formatCurrency(currentMonth.expenses)}
            </p>
          </div>
          <div className="text-center p-4 rounded-[24px] bg-indigo-50 border border-indigo-100/50 shadow-sm">
            <p className="text-[9px] text-indigo-600 font-black uppercase tracking-widest">
              Lucro
            </p>
            <p className="text-sm font-bold text-indigo-700 mt-1">
              {formatCurrency(profit)}
            </p>
          </div>
        </div>

        {/* Bar chart */}
        <div className="flex items-end gap-3 h-32">
          {monthlyData.map((data, index) => {
            const incomeHeight = (data.income / maxValue) * 100;
            const expenseHeight = (data.expenses / maxValue) * 100;
            const isLast = index === monthlyData.length - 1;

            return (
              <div
                key={data.month}
                className="flex-1 flex flex-col items-center gap-2 group"
              >
                <div className="flex items-end gap-1 w-full h-24">
                  <div className="flex-1 flex flex-col justify-end h-full">
                    <div
                      className={cn(
                        "w-full rounded-t-xl transition-all duration-500 ease-out cursor-default",
                        isLast ? "bg-emerald-500 shadow-lg shadow-emerald-500/20" : "bg-emerald-200/60"
                      )}
                      style={{ height: `${Math.max(incomeHeight, 5)}%` }}
                      title={`Receita: ${formatCurrency(data.income)}`}
                    />
                  </div>
                  <div className="flex-1 flex flex-col justify-end h-full">
                    <div
                      className={cn(
                        "w-full rounded-t-xl transition-all duration-500 ease-out cursor-default",
                        isLast ? "bg-rose-400 shadow-lg shadow-rose-400/20" : "bg-rose-200/60"
                      )}
                      style={{ height: `${Math.max(expenseHeight, 5)}%` }}
                      title={`Despesa: ${formatCurrency(data.expenses)}`}
                    />
                  </div>
                </div>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase tracking-widest",
                    isLast
                      ? "text-indigo-600"
                      : "text-slate-300"
                  )}
                >
                  {data.month}
                </span>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-6">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Receitas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-rose-300" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Despesas</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
