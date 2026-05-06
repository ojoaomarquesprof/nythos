"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  Trash2, 
  Calendar, 
  Tag, 
  CreditCard, 
  FileCheck,
  Edit3,
  Info
} from "lucide-react";
import { 
  formatCurrency, 
  formatDate, 
  CASH_FLOW_CATEGORIES, 
  PAYMENT_METHODS 
} from "@/lib/constants";
import type { CashFlow } from "@/types/database";

interface TransactionDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: CashFlow | null;
  onExportReceipt: (tx: CashFlow) => void;
  isExportingReceipt: boolean;
  onDeleteTransaction: (id: string) => Promise<void>;
}

export function TransactionDetailsSheet({
  open,
  onOpenChange,
  transaction,
  onExportReceipt,
  isExportingReceipt,
  onDeleteTransaction,
}: TransactionDetailsSheetProps) {
  const [deleting, setDeleting] = useState(false);

  if (!transaction) return null;

  const isIncome = transaction.type === "income";
  const isPending = transaction.status === "pending";
  const categoryInfo = CASH_FLOW_CATEGORIES[transaction.category as keyof typeof CASH_FLOW_CATEGORIES];
  const paymentMethodInfo = PAYMENT_METHODS[transaction.payment_method as keyof typeof PAYMENT_METHODS];

  const handleDelete = async () => {
    if (window.confirm("Tem certeza de que deseja excluir esta transação?")) {
      setDeleting(true);
      await onDeleteTransaction(transaction.id);
      setDeleting(false);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-white border-l border-slate-100 flex flex-col p-0">
        <SheetHeader className="p-8 pb-6 border-b border-slate-50 bg-slate-50/50">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Detalhes da Operação</p>
          <div className="flex items-center justify-between gap-4 mt-4">
            <h2 className={`text-3xl font-black tracking-tight ${isIncome ? "text-emerald-600" : "text-rose-600"}`}>
              {isIncome ? "+" : "-"} {formatCurrency(Number(transaction.amount))}
            </h2>
            <Badge 
              variant="outline"
              className={`text-[9px] h-6 px-3 font-black uppercase tracking-widest rounded-full border-0 ${
                isPending 
                  ? "bg-amber-100 text-amber-700 animate-pulse" 
                  : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {isPending ? "Aguardando" : "Confirmado"}
            </Badge>
          </div>
          <SheetDescription className="text-slate-600 font-bold text-sm mt-2 truncate">
            {transaction.description}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-8 space-y-8">
          {/* Main Info Blocks */}
          <div className="space-y-5">
            {isIncome ? (
              <>
                {/* Receitas View */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <FileCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Origem / Descrição</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">{transaction.description}</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data de Vencimento / Sessão</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">
                      {formatDate(transaction.due_date || transaction.created_at)}
                    </p>
                  </div>
                </div>

                {!isPending && (
                  <>
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Método de Recebimento</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">
                          {paymentMethodInfo?.label || "Lançamento Manual"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data de Pagamento</p>
                        <p className="text-sm font-bold text-slate-700 mt-0.5">
                          {transaction.paid_at ? formatDate(transaction.paid_at) : "Confirmado"}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Despesas View */}
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoria da Despesa</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">
                      {categoryInfo?.label || transaction.category}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data de Vencimento</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">
                      {formatDate(transaction.due_date || transaction.created_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Data de Pagamento</p>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">
                      {transaction.paid_at ? formatDate(transaction.paid_at) : "Registrado"}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Observations Box */}
          {transaction.notes && (
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100/50 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-400">
                <Info className="w-4 h-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Observações Internas</p>
              </div>
              <p className="text-xs font-medium text-slate-600 leading-relaxed italic">
                "{transaction.notes}"
              </p>
            </div>
          )}

          {/* Action Button: Recibo */}
          {isIncome && !isPending && (
            <Button
              className="w-full h-12 bg-primary hover:bg-primary-hover text-white font-black rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
              onClick={() => onExportReceipt(transaction)}
              disabled={isExportingReceipt}
            >
              {isExportingReceipt ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  BAIXAR RECIBO (PDF)
                </>
              )}
            </Button>
          )}
        </div>

        <SheetFooter className="p-8 border-t border-slate-50 bg-slate-50/50 flex flex-row gap-3 mt-auto">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl font-bold border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-2"
            disabled
          >
            <Edit3 className="w-4 h-4" />
            Editar
          </Button>
          <Button
            variant="destructive"
            className="flex-1 h-12 rounded-xl font-black bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 shadow-lg shadow-rose-200 active:scale-95 transition-all"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                Excluir
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
