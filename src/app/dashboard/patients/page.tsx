"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Users, 
  Plus, 
  Search, 
  Phone, 
  Mail, 
  MoreVertical, 
  UserCircle,
  FileText,
  CalendarPlus,
  Trash2,
  ExternalLink
} from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import { useSubscription } from "@/hooks/use-subscription";
import type { Patient } from "@/types/database";

const statusConfig = {
  active: { label: "Ativo", color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  inactive: { label: "Inativo", color: "bg-amber-50 text-amber-700 border-amber-100" },
  archived: { label: "Arquivado", color: "bg-slate-100 text-slate-500 border-slate-200" },
};

const avatarColors = [
  "bg-teal- text-teal-",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

export default function PatientsPage() {
  const router = useRouter();
  const { therapistId } = useSubscription();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "archived">("all");
  const [loading, setLoading] = useState(true);
  const supabase = createClient() as any;

  useEffect(() => {
    if (therapistId) {
      loadPatients();
    }
  }, [therapistId]);

  async function loadPatients() {
    setLoading(true);
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setPatients(data);
    }
    setLoading(false);
  }

  const filtered = patients.filter((p) => {
    const matchSearch =
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.phone?.includes(search);
    const matchFilter = filter === "all" || p.status === filter;
    return matchSearch && matchFilter;
  });

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="px-4 py-6 md:px-8 md:py-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Pacientes</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">
              {patients.length} paciente{patients.length !== 1 ? "s" : ""} na base
            </p>
          </div>
        </div>
        <SubscriptionGate>
          <Link href="/dashboard/patients/new">
            <Button className="gradient-primary text-white shadow-lg hover:shadow-primary/20 hover:scale-105 active:scale-95 transition-all rounded-xl h-11 px-6 font-bold">
              <Plus className="w-5 h-5 mr-2" />
              <span className="hidden sm:inline">Novo Paciente</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </Link>
        </SubscriptionGate>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="pl-12 h-12 bg-white/80 backdrop-blur-sm border-teal- rounded-2xl shadow-sm focus-visible:ring-primary focus-visible:border-primary transition-all text-sm font-medium"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-teal-/50 rounded-2xl p-1 border border-teal-/50 self-start sm:self-center">
          {(["all", "active", "inactive", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-4 py-2 rounded-xl text-[10px] font-black transition-all uppercase tracking-widest",
                filter === f
                  ? "bg-white text-primary shadow-sm"
                  : "text-muted-foreground hover:text-primary/60"
              )}
            >
              {f === "all" ? "Todos" : statusConfig[f].label}
            </button>
          ))}
        </div>
      </div>

      {/* Patient List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-0 shadow-sm animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="w-40 h-4 bg-muted rounded" />
                    <div className="w-28 h-3 bg-muted rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-lg mb-2">
              {search
                ? "Nenhum paciente encontrado"
                : "Nenhum paciente cadastrado"}
            </CardTitle>
            <p className="text-sm text-muted-foreground max-w-xs">
              {search
                ? "Tente buscar com outros termos."
                : "Comece cadastrando seu primeiro paciente."}
            </p>
            {!search && (
              <SubscriptionGate>
                <Link href="/dashboard/patients/new">
                  <Button className="mt-6 gradient-primary text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Cadastrar Primeiro Paciente
                  </Button>
                </Link>
              </SubscriptionGate>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="bg-white/80 backdrop-blur-md rounded-[32px] border border-teal- shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-teal- bg-teal-/30">
                  <th className="px-6 py-4 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Paciente</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Status</th>
                  <th className="px-6 py-4 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Contato</th>
                  <th className="px-6 py-4 text-right text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-teal-">
                {filtered.map((patient, index) => {
                  const status = statusConfig[patient.status];
                  return (
                    <tr 
                      key={patient.id} 
                      className="group hover:bg-teal-/50 transition-colors cursor-pointer"
                      onClick={() => router.push(`/dashboard/patients/${patient.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-10 h-10 flex-shrink-0 rounded-xl shadow-sm border-2 border-white">
                            <AvatarFallback className={cn("text-sm font-black", avatarColors[index % avatarColors.length])}>
                              {getInitials(patient.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-black text-slate-800 tracking-tight">
                            {patient.full_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={cn("text-[9px] h-5 font-black uppercase tracking-tighter border-0", status.color)}>
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          {patient.phone && (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/80">
                              <Phone className="w-3 h-3 text-primary/40" />
                              {patient.phone}
                            </span>
                          )}
                          {patient.email && (
                            <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground/60">
                              <Mail className="w-3 h-3 text-primary/40" />
                              {patient.email}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger 
                              className="w-9 h-9 rounded-xl hover:bg-teal- flex items-center justify-center text-slate-400 hover:text-primary transition-all active:scale-90 outline-none border-none bg-transparent cursor-pointer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-5 h-5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 rounded-2xl border-teal- shadow-xl p-1.5 animate-slide-up">
                              <DropdownMenuItem 
                                className="rounded-xl flex items-center gap-2 font-bold text-xs py-2.5 cursor-pointer text-slate-700 hover:text-primary focus:bg-teal- transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/dashboard/patients/${patient.id}`);
                                }}
                              >
                                <FileText className="w-4 h-4 text-primary/40" />
                                Ver Prontuário
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="rounded-xl flex items-center gap-2 font-bold text-xs py-2.5 cursor-pointer text-slate-700 hover:text-primary focus:bg-teal- transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/dashboard/schedule?patient=${patient.id}`);
                                }}
                              >
                                <CalendarPlus className="w-4 h-4 text-primary/40" />
                                Agendar Sessão
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="bg-teal- my-1" />
                              <DropdownMenuItem 
                                className="rounded-xl flex items-center gap-2 font-bold text-xs py-2.5 cursor-pointer text-rose-600 focus:text-rose-700 focus:bg-rose-50 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Lógica de arquivar
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                                Arquivar Paciente
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
