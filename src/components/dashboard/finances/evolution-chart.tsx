"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/constants";

interface EvolutionChartProps {
  data: {
    month: string;
    income: number;
    expense: number;
  }[];
  loading?: boolean;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-100 shadow-xl space-y-1.5">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">{payload[0].payload.month}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold text-slate-600">Receitas:</span>
            <span className="text-xs font-black text-emerald-600">{formatCurrency(payload[0].value)}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="text-xs font-bold text-slate-600">Despesas:</span>
            <span className="text-xs font-black text-rose-600">{formatCurrency(payload[1].value)}</span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function FinancialEvolutionChart({ data, loading = false }: EvolutionChartProps) {
  return (
    <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-md rounded-[32px] overflow-hidden">
      <CardHeader className="pb-4 px-8 pt-8">
        <div>
          <CardTitle className="text-xl font-black text-slate-800">Evolução Financeira</CardTitle>
          <CardDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
            Comparativo de Receitas e Despesas dos últimos 6 meses
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-2">
        {loading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-4 border-teal-500/20 border-t-teal-500 animate-spin" />
              <p className="text-xs font-bold text-teal-600/60 uppercase tracking-widest">Carregando dados analíticos...</p>
            </div>
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{
                  top: 10,
                  right: 10,
                  left: -10,
                  bottom: 0,
                }}
              >
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: "bold" }}
                  tickFormatter={(val) => `R$ ${val}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#10b981"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorIncome)"
                  name="Receitas"
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#f43f5e"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorExpense)"
                  name="Despesas"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
