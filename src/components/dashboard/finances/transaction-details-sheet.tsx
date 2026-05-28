"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowUpRight,
  Ban,
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  FileCheck,
  Info,
  Package,
  Tag,
  User,
  X,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  PAYMENT_METHODS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { FinancialTransaction } from "@/services/billing-service";
import {
  MANUAL_PAYMENT_METHODS,
  canCancelCashFlow,
  canConfirmCashFlowPayment,
  canGenerateCashFlowReceipt,
  getCashFlowOrigin,
  getCashFlowCategoryLabel,
  getCashFlowOriginLabel,
  getCashFlowStatusLabel,
  isManualPaymentMethod,
  type ManualPaymentMethod,
} from "@/services/financial-transaction-rules";

interface TransactionDetailsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: FinancialTransaction | null;
  onConfirmPayment: (
    id: string,
    method: ManualPaymentMethod,
    paidAt?: string | null
  ) => Promise<void>;
  onCancelTransaction: (id: string) => Promise<void>;
  onGenerateReceipt: (transaction: FinancialTransaction) => Promise<void>;
  actionPending?: boolean;
  receiptPending?: boolean;
  professionalProfileIncomplete?: boolean;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function paymentMethodLabel(method: string | null | undefined): string {
  if (!isManualPaymentMethod(method)) return "Não informado";
  return PAYMENT_METHODS[method]?.label ?? "Outro";
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
        <div className="mt-0.5 text-sm font-bold text-slate-700">{value}</div>
      </div>
    </div>
  );
}

export function TransactionDetailsSheet({
  open,
  onOpenChange,
  transaction,
  onConfirmPayment,
  onCancelTransaction,
  onGenerateReceipt,
  actionPending = false,
  receiptPending = false,
  professionalProfileIncomplete = false,
}: TransactionDetailsSheetProps) {
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>("pix");
  const [paidAt, setPaidAt] = useState(todayIsoDate());

  useEffect(() => {
    if (!transaction) return;
    const timer = window.setTimeout(() => {
      setPaymentMethod(isManualPaymentMethod(transaction.payment_method) ? transaction.payment_method : "pix");
      setPaidAt(transaction.paid_at ? transaction.paid_at.slice(0, 10) : todayIsoDate());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [transaction]);

  if (!transaction) return null;

  const isIncome = transaction.type === "income";
  const canConfirm = canConfirmCashFlowPayment(transaction);
  const canCancel = canCancelCashFlow(transaction);
  const canGenerateReceipt = canGenerateCashFlowReceipt(transaction);
  const origin = getCashFlowOrigin(transaction);
  const originLabel = getCashFlowOriginLabel(transaction);
  const categoryLabel = getCashFlowCategoryLabel(transaction.category);
  const statusLabel = getCashFlowStatusLabel(transaction.status);
  const transactionId = transaction.id;
  const patientName = transaction.patient?.full_name || (transaction.patient_id ? "Paciente vinculado" : "Não vinculado");
  const packageName = transaction.session_package?.name || (transaction.package_id ? "Pacote de sessões" : null);
  const sessionDate = transaction.session?.scheduled_at || transaction.due_date || null;
  const patientId = transaction.patient?.id || transaction.patient_id;
  const patientHref = patientId ? `/dashboard/patients/${patientId}` : null;
  const sessionHref = patientId && transaction.session_id
    ? `/dashboard/patients/${patientId}?tab=sessions&sessionId=${transaction.session_id}`
    : null;
  const contextMessage = origin === "package"
    ? "Pacote aparece como cobrança única. As sessões vinculadas consomem crédito quando são concluídas."
    : origin === "session"
      ? "Sessão avulsa concluída pode gerar pendência; confirme o recebimento quando o pagamento acontecer."
      : transaction.type === "expense"
        ? "Despesa manual registrada para manter o saldo operacional atualizado."
        : "Lançamento manual ou complementar do histórico financeiro.";
  const statusClassName = transaction.status === "confirmed"
    ? "bg-emerald-100 text-emerald-700"
    : transaction.status === "pending"
      ? "bg-amber-100 text-amber-700"
      : "bg-slate-100 text-slate-500";

  async function handleConfirm() {
    if (!canConfirm || actionPending) return;
    await onConfirmPayment(transactionId, paymentMethod, paidAt || null);
  }

  async function handleCancel() {
    if (!canCancel || actionPending) return;
    const confirmed = window.confirm("Cancelar este lançamento pendente? O histórico financeiro será preservado.");
    if (!confirmed) return;
    await onCancelTransaction(transactionId);
  }

  async function handleGenerateReceipt() {
    if (!transaction || !canGenerateReceipt || actionPending || receiptPending) return;
    await onGenerateReceipt(transaction);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-hidden border-l border-slate-100 bg-white p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-slate-100 bg-slate-50/70 p-6 sm:p-8">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Detalhes do lançamento</p>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className={cn("text-3xl font-black tracking-tight", isIncome ? "text-emerald-600" : "text-rose-600")}>
                {isIncome ? "+" : "-"} {formatCurrency(Number(transaction.amount))}
              </SheetTitle>
              <SheetDescription className="mt-2 truncate text-sm font-bold text-slate-600">
                {transaction.description}
              </SheetDescription>
            </div>
            <Badge className={cn("shrink-0 rounded-full border-0 px-3 py-1 text-[9px] font-black uppercase tracking-widest", statusClassName)}>
              {statusLabel}
            </Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-8 overflow-y-auto p-6 sm:p-8">
          <div className="space-y-5">
            <DetailRow
              icon={<FileCheck className="h-5 w-5" />}
              label="Origem"
              value={originLabel}
            />
            <DetailRow
              icon={<Tag className="h-5 w-5" />}
              label="Categoria"
              value={categoryLabel}
            />
            {transaction.patient_id && (
              <DetailRow
                icon={<User className="h-5 w-5" />}
                label="Paciente"
                value={patientName}
              />
            )}
            {packageName && (
              <DetailRow
                icon={<Package className="h-5 w-5" />}
                label="Pacote"
                value={packageName}
              />
            )}
            {transaction.session_id && (
              <DetailRow
                icon={<Calendar className="h-5 w-5" />}
                label="Sessão"
                value={sessionDate ? formatDate(sessionDate) : "Sessão vinculada"}
              />
            )}
            <DetailRow
              icon={<Calendar className="h-5 w-5" />}
              label="Vencimento"
              value={transaction.due_date ? formatDate(transaction.due_date) : "Não informado"}
            />
            <DetailRow
              icon={<CreditCard className="h-5 w-5" />}
              label="Método de pagamento"
              value={paymentMethodLabel(transaction.payment_method)}
            />
            <DetailRow
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="Data de pagamento"
              value={transaction.paid_at ? formatDate(transaction.paid_at) : "Não baixado"}
            />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 size-4 shrink-0 text-slate-500" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Leitura clínica do financeiro</p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{contextMessage}</p>
              </div>
            </div>
          </div>

          {canGenerateReceipt && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
              <div className="flex items-start gap-3">
                <FileCheck className="mt-0.5 size-4 shrink-0 text-emerald-700" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700/70">Recibo profissional</p>
                  <p className="mt-1 text-xs font-semibold leading-relaxed text-emerald-900/70">
                    O PDF usa os dados do perfil profissional, incluindo nome, clinica, CRP, logo e assinatura quando preenchidos. Gerar o recibo nao altera valor, status ou origem do lancamento.
                  </p>
                  {professionalProfileIncomplete && (
                    <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
                      Complete nome profissional, clinica e CRP antes de entregar o recibo ao paciente.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {transaction.notes && (
            <div className="space-y-1.5 rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-slate-400">
                <Info className="h-4 w-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Observações internas</p>
              </div>
              <p className="text-xs font-medium leading-relaxed text-slate-600">{transaction.notes}</p>
            </div>
          )}

          {canConfirm && (
            <div className="space-y-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700/70">Baixa manual</p>
                <p className="mt-1 text-xs font-semibold text-emerald-900/70">
                  Registra o pagamento neste lançamento sem alterar valor, categoria ou origem.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-emerald-800/60">
                    Método
                  </Label>
                  <select
                    className="h-11 w-full rounded-xl border border-emerald-100 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-emerald-300"
                    value={paymentMethod}
                    onChange={(event) => {
                      const nextMethod = event.target.value;
                      if (isManualPaymentMethod(nextMethod)) setPaymentMethod(nextMethod);
                    }}
                    disabled={actionPending}
                  >
                    {MANUAL_PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {PAYMENT_METHODS[method]?.label ?? method}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-emerald-800/60">
                    Data
                  </Label>
                  <Input
                    type="date"
                    className="h-11 rounded-xl border-emerald-100 bg-white font-bold text-slate-700 focus:border-emerald-300"
                    value={paidAt}
                    onChange={(event) => setPaidAt(event.target.value)}
                    disabled={actionPending}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <SheetFooter className="mt-auto flex-col gap-2 border-t border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:p-6">
          <Button
            variant="outline"
            className="h-11 flex-1 rounded-xl bg-white font-bold text-slate-600"
            onClick={() => onOpenChange(false)}
            disabled={actionPending || receiptPending}
          >
            <X className="h-4 w-4" />
            Fechar
          </Button>
          {sessionHref && (
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl bg-white font-black text-primary hover:bg-primary/5"
              onClick={() => window.location.assign(sessionHref)}
              disabled={actionPending || receiptPending}
            >
              <ArrowUpRight className="h-4 w-4" />
              Revisar sessão
            </Button>
          )}
          {!sessionHref && patientHref && (
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl bg-white font-black text-primary hover:bg-primary/5"
              onClick={() => window.location.assign(patientHref)}
              disabled={actionPending || receiptPending}
            >
              <ArrowUpRight className="h-4 w-4" />
              Ver paciente
            </Button>
          )}
          {canGenerateReceipt && professionalProfileIncomplete && (
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl bg-white font-black text-amber-700 hover:bg-amber-50"
              onClick={() => window.location.assign("/dashboard/settings")}
              disabled={actionPending || receiptPending}
            >
              <ArrowUpRight className="h-4 w-4" />
              Revisar dados profissionais
            </Button>
          )}
          {canCancel && (
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl bg-white font-black text-rose-700 hover:bg-rose-50"
              onClick={handleCancel}
              disabled={actionPending || receiptPending}
            >
              <Ban className="h-4 w-4" />
              Cancelar lançamento
            </Button>
          )}
          {canGenerateReceipt && (
            <Button
              variant="outline"
              className="h-11 flex-1 rounded-xl bg-white font-black text-emerald-700 hover:bg-emerald-50"
              onClick={handleGenerateReceipt}
              disabled={actionPending || receiptPending}
            >
              <Download className="h-4 w-4" />
              {receiptPending ? "Gerando recibo..." : "Gerar recibo"}
            </Button>
          )}
          {canConfirm && (
            <Button
              className="h-11 flex-1 rounded-xl bg-emerald-600 font-black text-white hover:bg-emerald-700"
              onClick={handleConfirm}
              disabled={actionPending || receiptPending}
            >
              {actionPending ? "Registrando..." : "Confirmar recebimento"}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
