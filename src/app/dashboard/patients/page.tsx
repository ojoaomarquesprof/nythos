"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, Search, Phone, Mail, MoreVertical, UserCircle } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { SubscriptionGate } from "@/components/auth/subscription-gate";
import type { Patient } from "@/types/database";

const statusConfig = {
  active: { label: "Ativo", color: "bg-green-100 text-green-700" },
  inactive: { label: "Inativo", color: "bg-yellow-100 text-yellow-700" },
  archived: { label: "Arquivado", color: "bg-gray-100 text-gray-500" },
};

const avatarColors = [
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-fuchsia-100 text-fuchsia-700",
  "bg-teal-100 text-teal-700",
  "bg-orange-100 text-orange-700",
];

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "archived">("all");
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    loadPatients();
  }, []);

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
    <div className="px-4 py-5 md:px-6 md:py-6 space-y-5 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Pacientes</h1>
          <p className="text-sm text-muted-foreground">
            {patients.length} paciente{patients.length !== 1 ? "s" : ""} cadastrado{patients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <SubscriptionGate>
          <Link href="/dashboard/patients/new">
            <Button className="gradient-primary text-white shadow-sm">
              <Plus className="w-4 h-4 mr-2" />
              <span className="hidden sm:inline">Novo Paciente</span>
              <span className="sm:hidden">Novo</span>
            </Button>
          </Link>
        </SubscriptionGate>
      </div>

      {/* Search & Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="pl-10 h-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
          {(["all", "active", "inactive", "archived"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1.5 rounded-md text-xs font-medium transition-all",
                filter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
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
        <div className="space-y-2">
          {filtered.map((patient, index) => {
            const status = statusConfig[patient.status];
            return (
              <Link
                key={patient.id}
                href={`/dashboard/patients/${patient.id}`}
              >
                <Card className="border-0 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer animate-fade-in">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="w-11 h-11 flex-shrink-0">
                        <AvatarFallback
                          className={cn(
                            "text-sm font-semibold",
                            avatarColors[index % avatarColors.length]
                          )}
                        >
                          {getInitials(patient.full_name)}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {patient.full_name}
                          </p>
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] h-5", status.color)}
                          >
                            {status.label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {patient.phone && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="w-3 h-3" />
                              {patient.phone}
                            </span>
                          )}
                          {patient.email && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                              <Mail className="w-3 h-3" />
                              {patient.email}
                            </span>
                          )}
                        </div>
                      </div>

                      <MoreVertical className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
