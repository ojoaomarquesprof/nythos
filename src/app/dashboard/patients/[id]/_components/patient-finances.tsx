"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { createSessionPackage, listPatientSessionPackages, pauseSessionPackage, reactivateSessionPackage, cancelSessionPackage, updateSessionPackage } from "@/app/actions/session-packages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/constants";
import {
  calculateSessionPackageUnitAmount,
  calculateSessionPackageUsagePercent,
  formatSessionPackageBalance,
  getSessionPackagePaymentStatusLabel,
  getSessionPackageStatusLabel,
  validateSessionPackageBasics,
} from "@/services/session-package-rules";
import type { CashFlow, SessionPackageManageStatus, SessionPackageWithBalance } from "@/types/database";

type GuardianOption = {
  id?: string | null;
  full_name?: string | null;
  is_financial_responsible?: boolean | null;
};

interface PatientFinancesProps {
  patientId: string;
  totalPatientIncome: number;
  pendingPatientIncome: number;
  patientCashFlow: CashFlow[];
  guardian?: GuardianOption | null;
  onPackagesChanged?: () => Promise<void> | void;
}

type PackageFormState = {
  name: string;
  total_sessions: string;
  total_amount: string;
  start_date: string;
  expires_at: string;
  guardian_id: string;
  allow_use_before_payment: boolean;
};

const emptyForm = (guardian?: GuardianOption | null): PackageFormState => ({
  name: "",
  total_sessions: "4",
  total_amount: "",
  start_date: new Date().toISOString().slice(0, 10),
  expires_at: "",
  guardian_id: guardian?.id ? guardian.id : "none",
  allow_use_before_payment: true,
});

const fieldClassName = "h-12 rounded-2xl border-slate-100 bg-slate-50 px-4 font-semibold text-slate-700 focus:bg-white";

function parseAmount(value: string): number {
  return Number(value.replace(",", "."));
}

function shortId(value?: string | null) {
  return value ? value.slice(0, 8) : null;
}

function statusBadgeClass(status?: string | null) {
  if (status === "active" || status === "paid") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "paused" || status === "pending" || status === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-700";
}

function billingStatusLabel(status?: string | null) {
  if (status === "confirmed") return "Confirmada";
  if (status === "pending") return "Pendente";
  if (status === "cancelled") return "Cancelada";
  return "Sem cobrança";
}

function PackageModal({
  open,
  onOpenChange,
  form,
  setForm,
  editingPackage,
  guardian,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: PackageFormState;
  setForm: React.Dispatch<React.SetStateAction<PackageFormState>>;
  editingPackage: SessionPackageWithBalance | null;
  guardian?: GuardianOption | null;
  submitting: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const totalSessions = Number.parseInt(form.total_sessions || "0", 10);
  const totalAmount = parseAmount(form.total_amount || "0");
  const calculatedUnit = Number.isFinite(totalAmount) && totalSessions > 0
    ? calculateSessionPackageUnitAmount(totalAmount, totalSessions)
    : 0;
  const canEditBilling = !editingPackage
    || (editingPackage.payment_status === "pending" && editingPackage.cash_flow_status === "pending");

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-0 bg-white p-0 shadow-2xl sm:max-w-2xl rounded-[32px]">
        <div className="bg-slate-950 p-7 text-white">
          <DialogHeader>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-teal-200">
              Pacotes de sessões
            </p>
            <DialogTitle className="text-2xl font-black tracking-tight">
              {editingPackage ? "Editar pacote" : "Criar pacote"}
            </DialogTitle>
          </DialogHeader>
          <p className="mt-2 text-sm font-medium text-slate-300">
            A cobrança do pacote será criada como pendente no financeiro.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6 p-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Nome do pacote
              </Label>
              <Input
                className={fieldClassName}
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ex: Pacote mensal"
                disabled={submitting}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Quantidade de sessões
              </Label>
              <Input
                className={fieldClassName}
                type="number"
                min={1}
                step={1}
                value={form.total_sessions}
                onChange={(event) => setForm((prev) => ({ ...prev, total_sessions: event.target.value }))}
                disabled={submitting || !canEditBilling}
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Valor total
              </Label>
              <Input
                className={fieldClassName}
                type="number"
                min={0.01}
                step={0.01}
                value={form.total_amount}
                onChange={(event) => setForm((prev) => ({ ...prev, total_amount: event.target.value }))}
                disabled={submitting || !canEditBilling}
                required
              />
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700/70">
                Valor por sessão
              </p>
              <p className="mt-1 text-xl font-black text-emerald-700">
                {formatCurrency(calculatedUnit || 0)}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Data de início
              </Label>
              <Input
                className={fieldClassName}
                type="date"
                value={form.start_date}
                onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
                disabled={submitting || !!editingPackage}
              />
            </div>

            <div className="space-y-2">
              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Validade opcional
              </Label>
              <Input
                className={fieldClassName}
                type="date"
                value={form.expires_at}
                onChange={(event) => setForm((prev) => ({ ...prev, expires_at: event.target.value }))}
                disabled={submitting}
              />
            </div>

            <div className="space-y-2">
              <Label className="ml-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Responsável financeiro
              </Label>
              <select
                className={cn("w-full", fieldClassName)}
                value={form.guardian_id}
                onChange={(event) => setForm((prev) => ({ ...prev, guardian_id: event.target.value }))}
                disabled={submitting}
              >
                <option value="none">Paciente</option>
                {guardian?.id && (
                  <option value={guardian.id}>
                    {guardian.full_name || "Responsável cadastrado"}
                  </option>
                )}
              </select>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <Checkbox
                id="allow_use_before_payment"
                checked={form.allow_use_before_payment}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, allow_use_before_payment: !!checked }))}
                disabled={submitting}
              />
              <Label htmlFor="allow_use_before_payment" className="cursor-pointer text-sm font-bold text-slate-700">
                Permitir uso antes do pagamento
              </Label>
            </div>
          </div>

          {editingPackage && !canEditBilling && (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              A cobrança deste pacote já foi baixada ou cancelada. Nome, validade, responsável e permissão de uso ainda podem ser ajustados.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              type="button"
              variant="ghost"
              className="rounded-2xl font-bold text-slate-500"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800" disabled={submitting}>
              {submitting ? "Salvando..." : editingPackage ? "Salvar alterações" : "Criar pacote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PatientFinances({
  patientId,
  totalPatientIncome,
  pendingPatientIncome,
  patientCashFlow,
  guardian,
  onPackagesChanged,
}: PatientFinancesProps) {
  const [packages, setPackages] = useState<SessionPackageWithBalance[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SessionPackageWithBalance | null>(null);
  const [form, setForm] = useState<PackageFormState>(() => emptyForm(guardian));
  const [submitting, setSubmitting] = useState(false);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);

  const activePackage = useMemo(
    () => packages.find((item) => item.status === "active") ?? null,
    [packages]
  );

  useEffect(() => {
    let mounted = true;

    async function loadPackages() {
      setPackagesLoading(true);
      setPackagesError(null);
      const result = await listPatientSessionPackages(patientId);
      if (!mounted) return;
      if (result.success) {
        setPackages(result.data || []);
      } else {
        setPackagesError(result.error || "Não foi possível carregar os pacotes.");
      }
      setPackagesLoading(false);
    }

    loadPackages();
    return () => {
      mounted = false;
    };
  }, [patientId]);

  function openCreateModal() {
    setEditingPackage(null);
    setForm(emptyForm(guardian));
    setModalOpen(true);
  }

  function openEditModal(sessionPackage: SessionPackageWithBalance) {
    setEditingPackage(sessionPackage);
    setForm({
      name: sessionPackage.name,
      total_sessions: String(sessionPackage.total_sessions),
      total_amount: String(Number(sessionPackage.total_amount)),
      start_date: sessionPackage.start_date || new Date().toISOString().slice(0, 10),
      expires_at: sessionPackage.expires_at || "",
      guardian_id: sessionPackage.guardian_id || "none",
      allow_use_before_payment: Boolean(sessionPackage.allow_use_before_payment),
    });
    setModalOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const totalSessions = Number.parseInt(form.total_sessions, 10);
    const totalAmount = parseAmount(form.total_amount);
    const startDate = form.start_date || new Date().toISOString().slice(0, 10);
    const expiresAt = form.expires_at || null;
    const validationError = validateSessionPackageBasics({
      name: form.name,
      totalSessions,
      totalAmount,
      startDate,
      expiresAt,
    });

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const guardianId = form.guardian_id === "none" ? null : form.guardian_id;
      const result = editingPackage
        ? await updateSessionPackage(editingPackage.id, {
            name: form.name,
            total_sessions: totalSessions,
            total_amount: totalAmount,
            expires_at: expiresAt,
            guardian_id: guardianId,
            allow_use_before_payment: form.allow_use_before_payment,
          })
        : await createSessionPackage({
            patient_id: patientId,
            name: form.name,
            total_sessions: totalSessions,
            total_amount: totalAmount,
            start_date: startDate,
            expires_at: expiresAt,
            guardian_id: guardianId,
            allow_use_before_payment: form.allow_use_before_payment,
          });

      if (!result.success || !result.data) {
        toast.error(result.error || "Não foi possível salvar o pacote.");
        return;
      }

      setPackages((prev) => {
        const exists = prev.some((item) => item.id === result.data!.id);
        if (exists) return prev.map((item) => (item.id === result.data!.id ? result.data! : item));
        return [result.data!, ...prev];
      });
      setModalOpen(false);
      toast.success(editingPackage ? "Pacote atualizado." : "Pacote criado e cobrança pendente registrada.");
      await onPackagesChanged?.();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(sessionPackage: SessionPackageWithBalance, status: SessionPackageManageStatus) {
    if (statusChangingId) return;
    if (status === "cancelled") {
      const confirmed = window.confirm("Cancelar este pacote? O pacote não será apagado. Se a cobrança estiver pendente, ela será cancelada junto.");
      if (!confirmed) return;
    }

    setStatusChangingId(sessionPackage.id);
    try {
      const result = status === "paused"
        ? await pauseSessionPackage(sessionPackage.id)
        : status === "active"
          ? await reactivateSessionPackage(sessionPackage.id)
          : await cancelSessionPackage(sessionPackage.id);

      if (!result.success || !result.data) {
        toast.error(result.error || "Não foi possível atualizar o pacote.");
        return;
      }

      setPackages((prev) => prev.map((item) => (item.id === result.data!.id ? result.data! : item)));
      if (status === "cancelled" && result.data.cash_flow_status === "cancelled") {
        toast.success("Pacote cancelado. A cobrança pendente vinculada foi cancelada.");
      } else if (result.data.warning === "package_billing_already_confirmed") {
        toast.warning("Pacote cancelado, mas a cobrança já estava confirmada e não foi cancelada.");
      } else {
        toast.success(status === "paused" ? "Pacote pausado." : status === "active" ? "Pacote reativado." : "Pacote cancelado.");
      }
      await onPackagesChanged?.();
    } finally {
      setStatusChangingId(null);
    }
  }

  return (
    <>
      <div className="flex flex-col justify-between gap-4 rounded-[32px] border border-white/40 bg-white/20 p-6 backdrop-blur-md md:flex-row md:items-center">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Financeiro do Paciente</h2>
          <p className="text-sm text-muted-foreground">Histórico de pagamentos, sessões faturadas, pacotes e pendências.</p>
        </div>
        <Button className="rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800" onClick={openCreateModal}>
          <Plus className="size-4" />
          Criar pacote
        </Button>
      </div>

      {activePackage && (
        <div className="rounded-[28px] border border-emerald-100 bg-emerald-50/80 p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="size-5" />
              </div>
              <div>
                <p className="text-sm font-black text-emerald-900">Pacote ativo: {activePackage.name}</p>
                <p className="text-xs font-semibold text-emerald-700">
                  {activePackage.remaining_sessions} sessões restantes · Pagamento {getSessionPackagePaymentStatusLabel(activePackage.payment_status).toLowerCase()}
                </p>
              </div>
            </div>
            {activePackage.payment_status === "pending" && (
              <Badge className="w-fit rounded-full border-amber-200 bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-800">
                Verificar pagamento do pacote
              </Badge>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="glass-panel overflow-hidden rounded-[32px] border-0 bg-emerald-50/20 shadow-lg">
          <CardContent className="p-8">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-100">
                <Wallet className="size-6 text-emerald-600" />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-emerald-700/60">Total Recebido</p>
                <p className="text-3xl font-black tracking-tight text-emerald-700">{formatCurrency(totalPatientIncome)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel overflow-hidden rounded-[32px] border-0 bg-amber-50/20 shadow-lg">
          <CardContent className="p-8">
            <div className="flex items-center gap-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-100">
                <AlertCircle className="size-6 text-amber-600" />
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-amber-700/60">Valor Pendente</p>
                <p className="text-3xl font-black tracking-tight text-amber-700">{formatCurrency(pendingPatientIncome)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="ml-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-2 rounded-full bg-primary" />
            <h3 className="text-sm font-black uppercase tracking-widest text-primary/40">Pacotes de sessões</h3>
          </div>
          {packages.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-2xl bg-white font-bold" onClick={openCreateModal}>
              <Plus className="size-4" />
              Novo
            </Button>
          )}
        </div>

        {packagesLoading ? (
          <Card className="rounded-[32px] border-0 bg-white/40 shadow-sm">
            <CardContent className="space-y-3 p-6">
              <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
              <div className="h-24 animate-pulse rounded-3xl bg-slate-100" />
            </CardContent>
          </Card>
        ) : packagesError ? (
          <Card className="rounded-[32px] border-0 bg-rose-50 shadow-sm">
            <CardContent className="p-6 text-sm font-semibold text-rose-700">{packagesError}</CardContent>
          </Card>
        ) : packages.length === 0 ? (
          <Card className="rounded-[32px] border border-dashed border-slate-200 bg-white/50 shadow-sm">
            <CardContent className="py-14 text-center">
              <Wallet className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-700">Nenhum pacote cadastrado para este paciente.</p>
              <Button className="mt-4 rounded-2xl bg-slate-950 font-black text-white hover:bg-slate-800" onClick={openCreateModal}>
                <Plus className="size-4" />
                Criar pacote
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {packages.map((sessionPackage) => {
              const usagePercent = calculateSessionPackageUsagePercent(
                sessionPackage.total_sessions,
                sessionPackage.used_sessions
              );
              const isCancelled = sessionPackage.status === "cancelled";
              const responsible = sessionPackage.guardian_id && guardian?.id === sessionPackage.guardian_id
                ? guardian.full_name || "Responsável cadastrado"
                : sessionPackage.guardian_id
                  ? "Responsável vinculado"
                  : "Paciente";
              const reservedSessions = Number(sessionPackage.reserved_sessions ?? 0);
              const reservableSessions = Number(sessionPackage.reservable_sessions ?? sessionPackage.remaining_sessions ?? 0);

              return (
                <Card key={sessionPackage.id} className="overflow-hidden rounded-[30px] border border-slate-100 bg-white/85 shadow-lg shadow-slate-200/50">
                  <CardContent className="space-y-5 p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest", statusBadgeClass(sessionPackage.status))}>
                            {getSessionPackageStatusLabel(sessionPackage.status)}
                          </Badge>
                          <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest", statusBadgeClass(sessionPackage.payment_status))}>
                            {getSessionPackagePaymentStatusLabel(sessionPackage.payment_status)}
                          </Badge>
                        </div>
                        <h4 className="truncate text-lg font-black text-slate-900">{sessionPackage.name}</h4>
                        <p className="text-xs font-semibold text-slate-500">
                          {formatSessionPackageBalance(sessionPackage.total_sessions, sessionPackage.used_sessions)}
                        </p>
                      </div>

                      <div className="text-left sm:text-right">
                        <p className="text-xl font-black text-emerald-700">{formatCurrency(Number(sessionPackage.total_amount))}</p>
                        <p className="text-xs font-bold text-slate-500">{formatCurrency(Number(sessionPackage.unit_amount))} por sessão</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
                        <span>Consumo</span>
                        <span>{usagePercent}%</span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all" style={{ width: `${usagePercent}%` }} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-lg font-black text-slate-900">{sessionPackage.total_sessions}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-lg font-black text-slate-900">{sessionPackage.used_sessions}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Usadas</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-lg font-black text-slate-900">{sessionPackage.remaining_sessions}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Restantes</p>
                        </div>
                        <div className="rounded-2xl bg-slate-50 p-3">
                          <p className="text-lg font-black text-slate-900">{reservableSessions}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Disponíveis</p>
                        </div>
                      </div>
                      {reservedSessions > 0 && (
                        <p className="text-xs font-semibold text-slate-500">
                          {reservedSessions} reservada(s) em sessões ainda não consumidas.
                        </p>
                      )}
                    </div>

                    <div className="grid gap-3 text-xs font-semibold text-slate-600 sm:grid-cols-2">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-slate-400" />
                        Início: {sessionPackage.start_date ? formatDate(sessionPackage.start_date) : "Não informado"}
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="size-4 text-slate-400" />
                        Validade: {sessionPackage.expires_at ? formatDate(sessionPackage.expires_at) : "Sem validade"}
                      </div>
                      <div className="flex items-center gap-2">
                        <Wallet className="size-4 text-slate-400" />
                        Responsável: {responsible}
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-slate-400" />
                        {sessionPackage.allow_use_before_payment ? "Uso antes do pagamento permitido" : "Exige pagamento antes do uso"}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cobrança vinculada</p>
                          <p className="mt-1 text-sm font-black text-slate-800">
                            {billingStatusLabel(sessionPackage.cash_flow_status)}
                            {sessionPackage.cash_flow_id ? ` · #${shortId(sessionPackage.cash_flow_id)}` : ""}
                          </p>
                          <p className="text-xs font-semibold text-slate-500">
                            Vencimento: {sessionPackage.cash_flow_due_date ? formatDate(sessionPackage.cash_flow_due_date) : "Não informado"}
                          </p>
                        </div>
                        <Button variant="outline" size="sm" className="rounded-2xl bg-white font-bold" onClick={() => window.location.assign("/dashboard/finances")}>
                          <ArrowUpRight className="size-4" />
                          Financeiro
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="rounded-2xl bg-white font-bold" onClick={() => openEditModal(sessionPackage)} disabled={isCancelled || statusChangingId === sessionPackage.id}>
                        <Edit3 className="size-4" />
                        Editar
                      </Button>
                      {sessionPackage.status === "active" && (
                        <Button variant="outline" size="sm" className="rounded-2xl bg-white font-bold text-amber-700" onClick={() => handleStatusChange(sessionPackage, "paused")} disabled={statusChangingId === sessionPackage.id}>
                          <Pause className="size-4" />
                          Pausar
                        </Button>
                      )}
                      {sessionPackage.status === "paused" && (
                        <Button variant="outline" size="sm" className="rounded-2xl bg-white font-bold text-emerald-700" onClick={() => handleStatusChange(sessionPackage, "active")} disabled={statusChangingId === sessionPackage.id}>
                          <Play className="size-4" />
                          Reativar
                        </Button>
                      )}
                      {!isCancelled && sessionPackage.status !== "completed" && (
                        <Button variant="outline" size="sm" className="rounded-2xl bg-white font-bold text-rose-700" onClick={() => handleStatusChange(sessionPackage, "cancelled")} disabled={statusChangingId === sessionPackage.id}>
                          <Ban className="size-4" />
                          Cancelar
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <div className="space-y-3">
        <div className="mb-4 ml-2 flex items-center gap-2">
          <div className="h-6 w-2 rounded-full bg-primary" />
          <h3 className="text-sm font-black uppercase tracking-widest text-primary/40">Últimos Lançamentos</h3>
        </div>

        {patientCashFlow.length === 0 ? (
          <Card className="glass-panel rounded-[32px] border-0 bg-white/10 shadow-md">
            <CardContent className="py-16 text-center">
              <Wallet className="mx-auto mb-3 size-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum lançamento financeiro para este paciente.</p>
            </CardContent>
          </Card>
        ) : (
          patientCashFlow.map((tx) => {
            const isPackage = tx.category === "package";

            return (
              <Card key={tx.id} className="glass-panel rounded-[24px] border border-white/20 bg-white/40 shadow-sm transition-all hover:bg-white/60">
                <CardContent className="flex items-center justify-between gap-3 p-5">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm",
                      tx.type === "income" ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                    )}>
                      {tx.type === "income" ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-bold text-slate-800">{tx.description}</p>
                        {isPackage && (
                          <Badge className="rounded-full border-0 bg-sky-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-sky-700">
                            Pacote
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {formatDate(tx.due_date ?? tx.created_at ?? new Date().toISOString())}
                        {isPackage && tx.package_id ? ` · pacote #${shortId(tx.package_id)}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={cn("text-lg font-black tracking-tight", tx.type === "income" ? "text-emerald-600" : "text-red-600")}>
                      {tx.type === "income" ? "+" : "-"} {formatCurrency(Number(tx.amount))}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "mt-1 border-0 px-2 text-[9px] font-black uppercase tracking-widest shadow-sm",
                        tx.status === "confirmed" ? "bg-emerald-100 text-emerald-700"
                          : tx.status === "pending" ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {tx.status === "confirmed" ? "Confirmado" : tx.status === "pending" ? "Pendente" : "Cancelado"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <PackageModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        form={form}
        setForm={setForm}
        editingPackage={editingPackage}
        guardian={guardian}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </>
  );
}
