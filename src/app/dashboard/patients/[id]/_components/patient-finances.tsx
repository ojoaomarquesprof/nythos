import React from "react";
import { Wallet, AlertCircle, ChevronUp, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/constants";
import type { CashFlow } from "@/types/database";

interface PatientFinancesProps {
  totalPatientIncome: number;
  pendingPatientIncome: number;
  patientCashFlow: CashFlow[];
}

export function PatientFinances({
  totalPatientIncome,
  pendingPatientIncome,
  patientCashFlow,
}: PatientFinancesProps) {
  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Financeiro do Paciente</h2>
          <p className="text-sm text-muted-foreground">Histórico de pagamentos, sessões faturadas e pendências.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden bg-emerald-50/20">
          <CardContent className="p-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Wallet className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-700/60 uppercase tracking-widest mb-0.5">Total Recebido</p>
                <p className="text-3xl font-black text-emerald-700 tracking-tight">{formatCurrency(totalPatientIncome)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-0 shadow-lg rounded-[32px] overflow-hidden bg-amber-50/20">
          <CardContent className="p-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-amber-700/60 uppercase tracking-widest mb-0.5">Valor Pendente</p>
                <p className="text-3xl font-black text-amber-700 tracking-tight">{formatCurrency(pendingPatientIncome)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-4 ml-2">
          <div className="w-2 h-6 bg-primary rounded-full" />
          <h3 className="text-sm font-black text-primary/40 uppercase tracking-widest">Últimos Lançamentos</h3>
        </div>

        {patientCashFlow.length === 0 ? (
          <Card className="glass-panel border-0 shadow-md rounded-[32px] bg-white/10">
            <CardContent className="py-16 text-center">
              <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-medium">Nenhum lançamento financeiro para este paciente.</p>
            </CardContent>
          </Card>
        ) : (
          patientCashFlow.map((tx) => (
            <Card key={tx.id} className="glass-panel border-0 shadow-sm rounded-[24px] bg-white/40 hover:bg-white/60 transition-all border border-white/20">
              <CardContent className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                    tx.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                  )}>
                    {tx.type === "income" ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{tx.description}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{formatDate(tx.created_at ?? new Date().toISOString())}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn("text-lg font-black tracking-tight", tx.type === "income" ? "text-emerald-600" : "text-red-600")}>
                    {tx.type === "income" ? "+" : "-"} {formatCurrency(Number(tx.amount))}
                  </p>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[9px] font-black uppercase tracking-widest px-2 border-0 shadow-sm mt-1",
                      tx.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : 
                      tx.status === "pending" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {tx.status === "confirmed" ? "Confirmado" : tx.status === "pending" ? "Pendente" : "Cancelado"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
