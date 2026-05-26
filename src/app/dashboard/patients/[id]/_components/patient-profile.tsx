import React from "react";
import { User, Plus, Wallet, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDate, formatCurrency } from "@/lib/constants";
import type { Patient } from "@/types/database";

interface PatientEditForm {
  [key: string]: string | number | boolean | null | undefined;
  full_name?: string | null;
  date_of_birth?: string | null;
  cpf?: string | null;
  gender?: string | null;
  address?: string | null;
  session_price?: string | number | null;
  has_guardian?: boolean;
  guardian_name?: string | null;
  guardian_cpf?: string | null;
  guardian_phone?: string | null;
  guardian_email?: string | null;
  guardian_relationship?: string | null;
  guardian_is_financial?: boolean;
}

interface GuardianInfo {
  full_name?: string | null;
  cpf?: string | null;
  phone?: string | null;
  email?: string | null;
  relationship?: string | null;
  is_financial_responsible?: boolean | null;
}

interface PatientProfileProps {
  patient: Patient;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  editForm: PatientEditForm | null;
  setEditForm: React.Dispatch<React.SetStateAction<PatientEditForm | null>>;
  handleEditChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  guardian: GuardianInfo | null;
  isSaving: boolean;
  handleUpdatePatient: () => Promise<void>;
  loadData: () => Promise<void>;
}

export function PatientProfile({
  patient,
  isEditing,
  setIsEditing,
  editForm,
  setEditForm,
  handleEditChange,
  guardian,
  isSaving,
  handleUpdatePatient,
  loadData,
}: PatientProfileProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/20 p-6 rounded-[32px] border border-white/40 backdrop-blur-md">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-primary">Perfil do Paciente</h2>
          <p className="text-sm text-muted-foreground">Dados cadastrais e informações gerais do paciente.</p>
        </div>
        {!isEditing && (
          <Button 
            onClick={() => setIsEditing(true)} 
            className="rounded-full gradient-primary text-white font-bold px-8 shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all"
          >
            <User className="w-4 h-4 mr-2" />
            Editar Perfil
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-lg">
        <div className="space-y-1.5">
          <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Nome Completo:</Label>
          <Input 
            readOnly={!isEditing} 
            className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
            value={isEditing ? (editForm?.full_name || "") : (patient.full_name || "—")} 
            name="full_name"
            onChange={handleEditChange}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Data de Nascimento:</Label>
          <Input 
            type={isEditing ? "date" : "text"}
            readOnly={!isEditing} 
            className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
            value={isEditing ? (editForm?.date_of_birth || "") : (patient.date_of_birth ? formatDate(patient.date_of_birth) : "—")} 
            name="date_of_birth"
            onChange={handleEditChange}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">CPF:</Label>
          <Input 
            readOnly={!isEditing} 
            className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
            value={isEditing ? (editForm?.cpf || "") : (patient.cpf || "—")} 
            name="cpf"
            onChange={handleEditChange}
          />
        </div>
      </div>

      {/* Responsável Legal Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between ml-2">
          <h3 className="text-xl font-bold text-primary flex items-center gap-2">
            <div className="w-2 h-8 bg-primary/20 rounded-full" />
            Responsável Legal
          </h3>
          {isEditing && editForm && (
            <div className="flex items-center gap-2 bg-white/40 px-4 py-2 rounded-full border border-white/60 shadow-sm">
              <Checkbox 
                id="has_guardian" 
                checked={editForm.has_guardian} 
                onCheckedChange={(checked) => setEditForm((prev) => ({ ...(prev ?? {}), has_guardian: checked === true }))}
              />
              <Label htmlFor="has_guardian" className="text-xs font-bold text-primary cursor-pointer">Possui responsável legal?</Label>
            </div>
          )}
        </div>

        {(editForm?.has_guardian || (!isEditing && guardian)) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Nome do Responsável:</Label>
              <Input 
                readOnly={!isEditing} 
                className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                value={isEditing ? (editForm?.guardian_name || "") : (guardian?.full_name || "—")} 
                name="guardian_name"
                onChange={handleEditChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">CPF do Responsável:</Label>
              <Input 
                readOnly={!isEditing} 
                className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                value={isEditing ? (editForm?.guardian_cpf || "") : (guardian?.cpf || "—")} 
                name="guardian_cpf"
                onChange={handleEditChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Telefone:</Label>
              <Input 
                readOnly={!isEditing} 
                className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                value={isEditing ? (editForm?.guardian_phone || "") : (guardian?.phone || "—")} 
                name="guardian_phone"
                onChange={handleEditChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Email:</Label>
              <Input 
                readOnly={!isEditing} 
                className={cn("glass-input-field h-14 text-base font-bold px-6", !isEditing && "cursor-default")} 
                value={isEditing ? (editForm?.guardian_email || "") : (guardian?.email || "—")} 
                name="guardian_email"
                onChange={handleEditChange}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-black text-primary/60 uppercase ml-4 tracking-widest">Parentesco:</Label>
              {isEditing ? (
                <select
                  name="guardian_relationship"
                  className="flex h-14 w-full rounded-full border border-white/40 bg-white/50 px-6 py-2 text-base font-bold focus:ring-primary/20"
                  value={editForm?.guardian_relationship ?? ""}
                  onChange={handleEditChange}
                >
                  <option value="mother">Mãe</option>
                  <option value="father">Pai</option>
                  <option value="grandfather">Avô/Avó</option>
                  <option value="uncle">Tio/Tia</option>
                  <option value="guardian">Tutor Legal</option>
                  <option value="other">Outro</option>
                </select>
              ) : (
                <Input readOnly className="glass-input-field h-14 text-base font-bold cursor-default px-6" value={
                  guardian?.relationship === "mother" ? "Mãe" :
                  guardian?.relationship === "father" ? "Pai" :
                  guardian?.relationship === "grandfather" ? "Avô/Avó" :
                  guardian?.relationship === "uncle" ? "Tio/Tia" :
                  guardian?.relationship === "guardian" ? "Tutor Legal" :
                  guardian?.relationship === "other" ? "Outro" : "—"
                } />
              )}
            </div>
            <div className="flex flex-col justify-end pb-2">
              <div className={cn(
                "flex items-center gap-3 px-6 h-14 rounded-full border transition-all",
                editForm?.guardian_is_financial ? "bg-emerald-50 border-emerald-200" : "bg-white/40 border-white/60"
              )}>
                <Checkbox 
                  id="guardian_is_financial" 
                  disabled={!isEditing}
                  checked={editForm?.guardian_is_financial} 
                  onCheckedChange={(checked) => setEditForm((prev) => ({ ...(prev ?? {}), guardian_is_financial: checked === true }))}
                />
                <Label htmlFor="guardian_is_financial" className="text-sm font-bold text-primary cursor-pointer">Responsável Financeiro?</Label>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/20 p-8 rounded-[32px] border border-white/40 border-dashed text-center">
            <p className="text-sm text-muted-foreground italic">Este paciente não possui um responsável legal cadastrado.</p>
          </div>
        )}
      </div>

      {/* General Info Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
          <div className="w-2 h-8 bg-primary rounded-full" />
          Informações Gerais
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md">
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Início do Tratamento:</p>
            <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value={formatDate(patient.created_at ?? new Date().toISOString())} />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Gênero:</p>
            {isEditing ? (
              <select
                name="gender"
                className="flex h-12 w-full rounded-full border border-white/40 bg-white/50 px-5 py-2 text-sm font-bold focus:ring-primary/20"
                value={editForm?.gender ?? "prefer_not_to_say"}
                onChange={handleEditChange}
              >
                <option value="prefer_not_to_say">Não informado</option>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
                <option value="other">Outro</option>
              </select>
            ) : (
              <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value={patient.gender === "female" ? "Feminino" : patient.gender === "male" ? "Masculino" : patient.gender === "other" ? "Outro" : "Não informado"} />
            )}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Status:</p>
            <div className="h-12 flex items-center px-5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold text-sm">
              Ativo
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">País de residência:</p>
            <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value="Brasil" />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Endereço:</p>
            <Input 
              readOnly={!isEditing} 
              className={cn("glass-input-field h-12 text-sm font-bold px-5", !isEditing && "cursor-default")} 
              value={isEditing ? (editForm?.address || "") : (patient.address || "—")} 
              name="address"
              onChange={handleEditChange}
            />
          </div>
        </div>
      </div>

      {/* Finance Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
          <div className="w-2 h-8 bg-emerald-400 rounded-full" />
          Financeiro
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.5fr] gap-6 bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md items-end">
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Moeda:</p>
            <Input readOnly className="glass-input-field h-12 text-sm font-bold cursor-default px-5" value="BRL - Real brasileiro" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-black text-muted-foreground uppercase ml-2 tracking-widest">Valor da sessão:</p>
            <Input 
              readOnly={!isEditing} 
              className={cn("glass-input-field h-12 text-sm font-black px-5 text-emerald-600", !isEditing && "cursor-default")} 
              value={isEditing ? (editForm?.session_price || "") : (patient.session_price ? formatCurrency(patient.session_price) : "—")} 
              name="session_price"
              type={isEditing ? "number" : "text"}
              onChange={handleEditChange}
            />
          </div>
          <Button variant="ghost" className="h-12 rounded-full gradient-primary text-white font-black text-xs shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all">
            <Wallet className="w-4 h-4 mr-2" />
            ACESSAR DASHBOARD FINANCEIRO
          </Button>

          {((isEditing && editForm?.guardian_is_financial && editForm?.has_guardian) || (!isEditing && guardian?.is_financial_responsible)) && (
            <div className="md:col-span-3 mt-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3 animate-fade-in">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <User className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">Pagador Responsável</p>
                <p className="text-sm font-bold text-slate-800">{isEditing ? editForm?.guardian_name : guardian?.full_name}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Emergency Contacts */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
          <div className="w-2 h-8 bg-red-400 rounded-full" />
          Contatos de Emergência
        </h3>
        <div className="bg-white/30 p-8 rounded-[32px] border border-white/40 shadow-md flex flex-col md:flex-row gap-6 items-center justify-between">
          {patient.emergency_contact_name ? (
            <div className="flex items-center gap-4 p-4 rounded-[24px] bg-white/40 border border-white/50 flex-1 w-full">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center font-black text-lg shadow-sm">
                {patient.emergency_contact_name[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-black text-slate-800 leading-none mb-1">{patient.emergency_contact_name}</p>
                <p className="text-xs font-bold text-muted-foreground">{patient.emergency_contact_phone || "Sem telefone"}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic flex-1">Nenhum contato de emergência cadastrado.</p>
          )}
          <Button variant="ghost" className="h-12 rounded-full gradient-primary text-white font-black text-xs px-8 shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all">
            <Plus className="w-4 h-4 mr-2" />
            ADICIONAR CONTATO
          </Button>
        </div>
      </div>

      {/* Health and Treatment Placeholder */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-primary ml-2 flex items-center gap-2">
          <div className="w-2 h-8 bg-blue-400 rounded-full" />
          Saúde e Tratamento
        </h3>
        <div className="bg-white/30 p-12 rounded-[32px] border border-white/40 shadow-md border-dashed text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Heart className="w-8 h-8 text-blue-400 opacity-60" />
          </div>
          <p className="text-sm text-muted-foreground italic font-medium">Informações de saúde, alergias e histórico médico do paciente...</p>
        </div>
      </div>
      
      {isEditing && (
        <div className="flex justify-end gap-3 pt-6 pb-12">
          <Button variant="ghost" className="rounded-full px-10 h-12 font-bold" onClick={() => { setIsEditing(false); loadData(); }}>
            Cancelar
          </Button>
          <Button className="gradient-primary text-white rounded-full px-16 h-12 font-black shadow-lg shadow-primary/20 hover:shadow-primary/40 active:scale-95 transition-all" onClick={handleUpdatePatient} disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      )}
    </div>
  );
}
