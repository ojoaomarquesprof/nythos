"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  Calendar,
  MapPin,
  Shield,
  FileText,
  Clock,
  Edit,
  Trash2,
  Plus,
  User,
  Heart,
  AlertCircle,
  Download,
  Users,
  Activity,
  ClipboardList,
  Wallet,
  Bell,
  Archive,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  ChevronLeft,
  Check,
  History,
  Smile,
  Frown,
  Zap,
  Waves,
  ListChecks,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger, 
  DialogClose,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SESSION_STATUS, formatCurrency, formatDate, formatTime } from "@/lib/constants";
import { CareNetworkCard } from "@/components/dashboard/patients/care-network-card";
import { ProtocolTrackerCard } from "@/components/dashboard/patients/protocol-tracker-card";
import { AbcRecordCard } from "@/components/dashboard/patients/abc-record-card";
import { AnamnesisRequestCard } from "@/components/dashboard/patients/anamnesis-request-card";
import { PatientEngagementCard } from "@/components/dashboard/patients/patient-engagement-card";
import { PatientTasksManager } from "@/components/dashboard/patients/patient-tasks-manager";

import type { Session, Patient } from "@/types/database";

import { usePatientData } from "./_hooks/use-patient-data";
import { PatientProfile } from "./_components/patient-profile";
import { SessionList } from "./_components/session-list";
import { EvolutionNotesForm } from "./_components/evolution-notes-form";
import { PatientFinances } from "./_components/patient-finances";

export default function PatientDetailPage() {
  const {
    id,
    router,
    isSecretary,
    patient,
    sessions,
    patientCashFlow,
    patientTasks,
    profile,
    loading,
    newNote,
    setNewNote,
    savingNote,
    isArchiving,
    isEditing,
    setIsEditing,
    isSaving,
    guardian,
    editForm,
    setEditForm,
    errorDialog,
    setErrorDialog,
    viewingSession,
    setViewingSession,
    showSessionModal,
    setShowSessionModal,
    isEditingSession,
    setIsEditingSession,
    sessionEditForm,
    setSessionEditForm,
    rescheduleSession,
    setRescheduleSession,
    rescheduleDate,
    setRescheduleDate,
    rescheduleTime,
    setRescheduleTime,
    showRescheduleModal,
    setShowRescheduleModal,
    rescheduleWeekOffset,
    setRescheduleWeekOffset,
    therapistSessions,
    showCancelSeriesModal,
    setShowCancelSeriesModal,
    cancellingSession,
    setCancellingSession,
    rescheduleWeekDays,
    handleAddNote,
    handleStatusChange,
    handleStartEditingSession,
    handleSaveSessionEdit,
    handleCancelSession,
    handleReschedule,
    handleSlotClick,
    handleArchive,
    handleUpdatePatient,
    exportPdf,
    isExportingPdf,
  } = usePatientData();

  const TABS = [
    { value: "info", label: "Perfil do Paciente", shortLabel: "Perfil", icon: User },
    { value: "sessions", label: "Sessões Agendadas", shortLabel: "Sessões", icon: Clock },
    { value: "finance", label: "Financeiro do Paciente", shortLabel: "Finanças", icon: Wallet },
    { value: "notes", label: "Prontuário Geral", shortLabel: "Prontuário", icon: FileText },
    { value: "behavior", label: "Comportamento (ABC)", shortLabel: "ABC", icon: Activity },
    { value: "team", label: "Equipe Multidisciplinar", shortLabel: "Equipe", icon: Users },
    { value: "protocols", label: "Protocolos e Rastreadores", shortLabel: "Protocolos", icon: ClipboardList },
    { value: "anamnesis", label: "Anamnese e Formulários", shortLabel: "Anamnese", icon: Shield },
    { value: "archive", label: "Arquivo de Sessões", shortLabel: "Arquivo", icon: Archive },
    { value: "alerts", label: "Interações e Tarefas", shortLabel: "Interações", icon: ListChecks },
  ];

  const [isMobile, setIsMobile] = useState(false);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("vertical");
  const [activeTab, setActiveTab] = useState("info");

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      setOrientation(mobile ? "horizontal" : "vertical");
    };
    
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  if (loading) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-7xl mx-auto w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded-xl" />
          <div className="h-64 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="px-4 py-5 md:px-6 md:py-6 max-w-7xl mx-auto w-full text-center py-20">
        <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <h2 className="text-lg font-semibold">Paciente não encontrado</h2>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const scheduledOnlySessions = sessions.filter((s) => s.status === "scheduled");
  const archivedSessions = sessions.filter((s) => s.status !== "scheduled");
  const totalPatientIncome = patientCashFlow
    .filter((f) => f.type === "income")
    .reduce((sum, f) => sum + Number(f.amount), 0);
  const pendingPatientIncome = patientCashFlow
    .filter((f) => f.type === "income" && f.status === "pending")
    .reduce((sum, f) => sum + Number(f.amount), 0);

  const activeTabInfo = TABS.find(t => t.value === activeTab) || TABS[0];
  const ActiveIcon = activeTabInfo.icon;

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleExportSessions = async () => {
    if (!profile) return;
    const tableBody = sessions.map(s => [
      new Date(s.scheduled_at).toLocaleDateString("pt-BR"),
      formatTime(s.scheduled_at),
      `${s.duration_minutes} min`,
      s.session_type === "online" ? "Online" : "Presencial",
      SESSION_STATUS[s.status as keyof typeof SESSION_STATUS]?.label || ""
    ]);

    await exportPdf({
      title: "Relatório de Sessões",
      subtitle: `Paciente: ${patient.full_name}\nData de Geração: ${new Date().toLocaleDateString("pt-BR")}`,
      profile,
      fileName: `sessoes_${patient.full_name.replace(/\s+/g, '_')}.pdf`,
      content: [
        {
          table: {
            headerRows: 1,
            widths: ['auto', 'auto', 'auto', '*', 'auto'],
            body: [
              [
                { text: 'Data', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Hora', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Duração', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Tipo', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] },
                { text: 'Status', bold: true, fillColor: '#8b5cf6', color: 'white', margin: [5, 5] }
              ],
              ...tableBody.map(row => row.map(cell => ({ text: cell, margin: [5, 5] })))
            ]
          },
          layout: {
            fillColor: function (rowIndex: number) {
              return (rowIndex % 2 === 0 && rowIndex > 0) ? '#f8fafc' : null;
            },
            hLineColor: '#e2e8f0',
            vLineColor: '#e2e8f0'
          }
        }
      ]
    });
  };

  const handleExportNotes = async () => {
    if (!profile || !patient.notes_encrypted) return;
    const completedSessions = sessions.filter(s => s.status === "completed" && s.session_notes_encrypted);
    const contentBody: any[] = [];
    if (patient.notes_encrypted) {
      contentBody.push({ text: "Notas Gerais", style: "header" });
      contentBody.push({ text: patient.notes_encrypted, style: "normalText", margin: [0, 0, 0, 20] });
    }

    if (completedSessions.length > 0) {
      contentBody.push({ text: "Evoluções por Sessão", style: "header", margin: [0, 10, 0, 10] });
      completedSessions.forEach(session => {
        let evolution: any = null;
        try {
          evolution = JSON.parse(session.session_notes_encrypted || "{}");
        } catch (e) {
          evolution = { notes: session.session_notes_encrypted };
        }
        const dateStr = `${new Date(session.scheduled_at).toLocaleDateString("pt-BR")}`;
        const moodStr = evolution.mood_happy_sad ? ` (Humor: ${evolution.mood_happy_sad}/10)` : "";
        contentBody.push({ text: `${dateStr}${moodStr}`, style: "subheader" });
        contentBody.push({ text: evolution.notes || evolution || "", style: "normalText", margin: [0, 0, 0, 10] });
      });
    }

    await exportPdf({
      title: "Prontuário de Evolução",
      subtitle: `Paciente: ${patient.full_name}\nData: ${new Date().toLocaleDateString("pt-BR")}`,
      profile,
      fileName: `prontuario_evolucao_${patient.full_name.replace(/\s+/g, '_')}.pdf`,
      content: contentBody
    });
  };

  const handleExportFullRecord = async () => {
    // Keep placeholder or existing export
    handleExportNotes();
  };

  const handleExportSingleSession = async (session: Session) => {
    if (!profile) return;
    let evolution: any = null;
    try {
      evolution = JSON.parse(session.session_notes_encrypted || "{}");
    } catch (e) {
      evolution = { notes: session.session_notes_encrypted };
    }

    await exportPdf({
      title: "Relatório de Atendimento Individual",
      subtitle: `Paciente: ${patient.full_name} | Data: ${formatDate(session.scheduled_at)}`,
      profile,
      fileName: `sessao_${patient.full_name.replace(/\s+/g, '_')}_${formatDate(session.scheduled_at).replace(/\//g, '-')}.pdf`,
      content: [
        { text: "Evolução Clínica", style: "header", color: '#4f46e5', margin: [0, 10, 0, 10] },
        { text: evolution.notes || session.session_notes_encrypted || "Nenhuma nota registrada.", style: "normalText" }
      ]
    });
  };

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-7xl mx-auto w-full space-y-5">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard/patients")}
          className="text-muted-foreground hover:bg-white/40 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Voltar para Pacientes
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} orientation={orientation} className="w-full">
        <div className={cn(
          "w-full rounded-[24px] lg:rounded-[32px] glass-panel overflow-hidden flex flex-col lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:h-[calc(100vh-9rem)]",
          !isMobile && "min-h-[600px]"
        )}>
          {/* Mobile Selector */}
          <div className="lg:hidden flex items-center justify-between p-4 bg-white/40 backdrop-blur-md border-b border-white/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl gradient-primary flex items-center justify-center text-white shadow-lg shadow-primary/20">
                <ActiveIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter leading-none mb-1">Seção atual</p>
                <h2 className="text-sm font-bold text-foreground leading-none">{activeTabInfo.label}</h2>
              </div>
            </div>
            
            <Dialog>
              <DialogTrigger render={
                <Button variant="ghost" size="sm" className="rounded-full bg-white/60 border border-white/80 shadow-sm text-primary font-bold text-[11px] h-9 px-4 hover:bg-white transition-all">
                  Mudar Seção
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-60" />
                </Button>
              } />
              <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-[32px] border-none glass-panel">
                <div className="p-6 bg-gradient-to-br from-primary/10 to-transparent">
                  <h3 className="text-xl font-bold text-primary mb-1">Navegação</h3>
                  <p className="text-xs text-muted-foreground mb-6">Selecione uma seção para visualizar os detalhes.</p>
                  <div className="grid grid-cols-2 gap-3">
                    {TABS.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.value;
                      return (
                        <DialogClose
                          key={tab.value}
                          render={
                            <Button
                              variant="ghost"
                              onClick={() => setActiveTab(tab.value)}
                              className={cn(
                                "flex flex-col items-start gap-2 h-auto p-4 rounded-2xl border transition-all text-left",
                                isActive 
                                  ? "bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-[1.02]" 
                                  : "bg-white/40 border-white/60 hover:bg-white/60 text-foreground"
                              )}
                            >
                              <Icon className={cn("w-5 h-5", isActive ? "text-white" : "text-primary")} />
                              <span className="text-[11px] font-bold leading-tight">{tab.label}</span>
                            </Button>
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <div className="bg-white/30 p-2 lg:p-5 overflow-x-auto lg:overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/20 scrollbar-hide hidden lg:block">
            <div className="hidden lg:flex items-center gap-3 mb-8 p-2 rounded-2xl bg-white/40 border border-white/50 shadow-sm">
              <Avatar className="w-10 h-10 ring-2 ring-primary/20">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                  {patient.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter">Paciente em foco</p>
                <p className="text-sm font-bold truncate text-foreground">{patient.full_name}</p>
              </div>
            </div>

            <TabsList className="w-fit lg:w-full h-fit bg-transparent p-1 flex flex-row flex-nowrap lg:flex-col gap-2 pr-10 lg:pr-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={tab.value} value={tab.value} className="glass-pill whitespace-nowrap px-4 lg:px-4 py-3 lg:py-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="p-4 lg:p-6 overflow-y-auto min-w-0 w-full flex-1">
            <TabsContent value="sessions" className="mt-0 space-y-3 w-full">
              <SessionList
                sessions={sessions}
                scheduledOnlySessions={scheduledOnlySessions}
                isExportingPdf={isExportingPdf}
                handleExportSessions={handleExportSessions}
                setRescheduleSession={setRescheduleSession}
                setRescheduleDate={setRescheduleDate}
                setRescheduleTime={setRescheduleTime}
                setShowRescheduleModal={setShowRescheduleModal}
                setCancellingSession={setCancellingSession}
                setShowCancelSeriesModal={setShowCancelSeriesModal}
              />
            </TabsContent>

            <TabsContent value="info" className="mt-0 space-y-6 animate-fade-in w-full">
              <PatientProfile
                patient={patient}
                isEditing={isEditing}
                setIsEditing={setIsEditing}
                editForm={editForm}
                setEditForm={setEditForm}
                handleEditChange={handleEditChange}
                guardian={guardian}
                isSaving={isSaving}
                handleUpdatePatient={handleUpdatePatient}
                loadData={usePatientData().loadData}
              />
            </TabsContent>

            <TabsContent value="notes" className="mt-0 space-y-6 w-full animate-fade-in">
              <EvolutionNotesForm
                patient={patient}
                sessions={sessions}
                isExportingPdf={isExportingPdf}
                handleExportFullRecord={handleExportFullRecord}
                handleExportNotes={handleExportNotes}
                newNote={newNote}
                setNewNote={setNewNote}
                savingNote={savingNote}
                handleAddNote={handleAddNote}
              />
            </TabsContent>

            <TabsContent value="team" className="mt-0 space-y-6 w-full animate-fade-in">
              <CareNetworkCard patientId={id as string} patient={patient} profile={profile} />
            </TabsContent>

            <TabsContent value="protocols" className="mt-0 space-y-6 w-full animate-fade-in">
              <ProtocolTrackerCard patientId={id as string} patient={patient} profile={profile} />
            </TabsContent>

            <TabsContent value="behavior" className="mt-0 space-y-6 w-full animate-fade-in">
              <AbcRecordCard patientId={id as string} patient={patient} profile={profile} />
            </TabsContent>

            <TabsContent value="finance" className="mt-0 space-y-6 w-full animate-fade-in">
              <PatientFinances
                totalPatientIncome={totalPatientIncome}
                pendingPatientIncome={pendingPatientIncome}
                patientCashFlow={patientCashFlow}
              />
            </TabsContent>

            <TabsContent value="archive" className="mt-0 space-y-6 w-full animate-fade-in">
              <div className="space-y-3">
                {archivedSessions.length === 0 ? (
                  <Card className="glass-panel border-0 shadow-md rounded-[32px] bg-white/10">
                    <CardContent className="py-16 text-center">
                      <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground font-medium">Nenhuma sessão arquivada.</p>
                    </CardContent>
                  </Card>
                ) : (
                  archivedSessions.map((session) => {
                    const statusCfg = SESSION_STATUS[session.status as keyof typeof SESSION_STATUS] || SESSION_STATUS.scheduled;
                    return (
                      <Card key={session.id} className="glass-panel border-0 shadow-sm rounded-[24px] bg-white/40 hover:bg-white/60 transition-all border border-white/20">
                        <CardContent className="p-5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-2xl bg-primary/5 flex flex-col items-center justify-center border border-primary/10">
                                <span className="text-[10px] font-black text-primary leading-none uppercase">{new Date(session.scheduled_at).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                                <span className="text-lg font-black text-primary leading-none mt-0.5">{new Date(session.scheduled_at).getDate()}</span>
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-bold text-slate-800">{formatTime(session.scheduled_at)}</p>
                                  <Badge className={cn("text-[9px] font-black uppercase tracking-widest h-5 px-2 border-0 shadow-sm", statusCfg.color)}>{statusCfg.label}</Badge>
                                </div>
                                <p className="text-xs font-medium text-slate-500 mt-0.5">
                                  {session.duration_minutes} MIN · {session.session_type}
                                </p>
                              </div>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="rounded-full text-primary hover:bg-primary/10 transition-all active:scale-95"
                              onClick={() => {
                                setViewingSession(session);
                                setIsEditingSession(false);
                                setShowSessionModal(true);
                              }}
                            >
                              <ChevronRight className="w-5 h-5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="anamnesis" className="mt-0 space-y-6 w-full animate-fade-in">
              <AnamnesisRequestCard patientId={patient.id} />
            </TabsContent>

            <TabsContent value="alerts" className="mt-0 space-y-6 w-full animate-fade-in">
              <PatientEngagementCard
                patientId={patient.id}
                patientEmail={patient.email}
                authUserId={patient.auth_user_id}
                accessToken={(patient as any).access_token ?? null}
                dateOfBirth={patient.date_of_birth ?? null}
              />
              <PatientTasksManager
                patientId={patient.id}
                initialTasks={patientTasks}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>

      {/* Reschedule Modal */}
      <Dialog open={showRescheduleModal} onOpenChange={setShowRescheduleModal}>
        <DialogContent className="sm:max-w-[850px] rounded-[32px] glass-panel border-none shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
          <div className="p-6 border-b border-white/20 bg-white/40 flex items-center justify-between shrink-0">
            <div>
              <DialogTitle className="text-xl font-black text-primary uppercase tracking-tight">Remarcar Sessão</DialogTitle>
              <DialogDescription className="text-xs font-bold text-muted-foreground/60 mt-1 uppercase tracking-widest">
                Selecione um novo horário livre na sua agenda
              </DialogDescription>
            </div>
            <div className="flex items-center bg-white/60 rounded-full border border-white/80 p-1 shadow-sm">
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setRescheduleWeekOffset(p => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-[10px] font-black px-3 uppercase tracking-widest text-primary/60">
                {rescheduleWeekDays[0].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })} - {rescheduleWeekDays[5].toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
              </span>
              <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={() => setRescheduleWeekOffset(p => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-4 bg-white/10">
            <div className="grid grid-cols-[60px_repeat(6,1fr)] min-w-[800px] gap-px bg-white/40 border border-primary/20 rounded-2xl overflow-hidden shadow-sm relative">
              <div className="bg-white/60 h-12 border-b border-primary/20 sticky left-0 z-30 shadow-[2px_0_5px_rgba(0,0,0,0.05)]"></div>
              {rescheduleWeekDays.map((day, i) => (
                <div key={i} className={cn(
                  "bg-white/60 h-12 border-b border-primary/20 flex flex-col items-center justify-center",
                  day.toDateString() === new Date().toDateString() && "bg-primary/5"
                )}>
                  <span className="text-[8px] font-black text-primary/40 uppercase tracking-widest">{["SEG", "TER", "QUA", "QUI", "SEX", "SÁB"][i]}</span>
                  <span className="text-sm font-black text-primary">{day.getDate()}</span>
                </div>
              ))}

              {Array.from({ length: 13 }, (_, i) => 8 + i).map((hour) => (
                <React.Fragment key={hour}>
                  <div className="bg-white/60 h-16 flex items-center justify-center border-r border-primary/10 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">
                    <span className="text-[10px] font-black text-primary/30">{hour}:00</span>
                  </div>
                  {rescheduleWeekDays.map((day, dayIdx) => {
                    const isOccupied = therapistSessions.some(s => {
                      const sDate = new Date(s.scheduled_at);
                      return sDate.toDateString() === day.toDateString() && sDate.getHours() === hour;
                    });
                    const isSelected = rescheduleDate === day.toISOString().split('T')[0] && parseInt(rescheduleTime.split(':')[0]) === hour;

                    return (
                      <div 
                        key={dayIdx} 
                        onClick={() => !isOccupied && handleSlotClick(day, hour)}
                        className={cn(
                          "h-16 relative border-r border-b border-primary/10 transition-all cursor-pointer",
                          isOccupied ? "bg-red-50/30 cursor-not-allowed" : "hover:bg-primary/5",
                          isSelected && "bg-primary/10 ring-2 ring-primary ring-inset z-10"
                        )}
                      >
                        {isOccupied && (
                          <div className="absolute inset-1 rounded-lg bg-red-100/60 border border-red-200/50 flex flex-col items-center justify-center p-1 overflow-hidden">
                            <span className="text-[7px] font-black text-red-600 uppercase tracking-tighter text-center leading-none">Ocupado</span>
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute inset-1 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
                            <Check className="w-4 h-4 text-primary " />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="p-6 bg-white/50 border-t border-white/20 flex justify-between items-center px-8 shrink-0">
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Horário Selecionado</span>
              <span className="text-sm font-black text-primary">
                {rescheduleDate ? new Date(rescheduleDate + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : "Selecione na grade"}
                {rescheduleTime && ` às ${rescheduleTime}`}
              </span>
            </div>
            <div className="flex gap-3">
              <Button variant="ghost" className="rounded-full font-bold px-8" onClick={() => setShowRescheduleModal(false)}>
                CANCELAR
              </Button>
              <Button 
                className="gradient-primary text-white rounded-full font-black px-12 h-12 shadow-lg shadow-primary/20 active:scale-95 transition-all"
                onClick={handleReschedule}
                disabled={isSaving || !rescheduleDate || !rescheduleTime}
              >
                {isSaving ? "SALVANDO..." : "CONFIRMAR"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Series Dialog */}
      <Dialog open={showCancelSeriesModal} onOpenChange={setShowCancelSeriesModal}>
        <DialogContent className="sm:max-w-[400px] rounded-[32px] glass-panel border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Confirmar Cancelamento
            </DialogTitle>
            <DialogDescription className="text-sm font-medium pt-2">
              Tem certeza que deseja cancelar esta sessão?
            </DialogDescription>
          </DialogHeader>
          
          {cancellingSession?.recurrence_rule && (
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mt-2">
              <p className="text-xs text-amber-800 font-bold">Esta sessão faz parte de um pacote ou série recorrente.</p>
              <p className="text-[10px] text-amber-700 mt-1">Deseja cancelar apenas esta sessão ou todas as futuras?</p>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4 w-full">
            <Button variant="ghost" className="rounded-full font-bold text-muted-foreground order-3 sm:order-1" onClick={() => setShowCancelSeriesModal(false)}>
              Voltar
            </Button>
            
            {cancellingSession?.recurrence_rule ? (
              <div className="flex flex-col sm:flex-row gap-2 flex-1">
                <Button 
                  variant="outline"
                  className="rounded-full font-bold text-red-600 border-red-200 hover:bg-red-50 flex-1"
                  onClick={() => handleCancelSession(false)}
                  disabled={isSaving}
                >
                  Apenas esta
                </Button>
                <Button 
                  className="rounded-full font-black bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 flex-1"
                  onClick={() => handleCancelSession(true)}
                  disabled={isSaving}
                >
                  Toda a série
                </Button>
              </div>
            ) : (
              <Button 
                className="rounded-full font-black bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-200 flex-1"
                onClick={() => handleCancelSession(false)}
                disabled={isSaving}
              >
                Confirmar Cancelamento
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Session Detail Modal */}
      <Dialog open={showSessionModal} onOpenChange={setShowSessionModal}>
        <DialogContent className="sm:max-w-xl rounded-[32px] border-white/40 backdrop-blur-2xl bg-white/90 shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
          {viewingSession && (
            <div className="animate-in fade-in zoom-in-95 duration-200 flex flex-col h-full overflow-hidden">
              <div className="p-8 border-b border-primary/10 bg-white/50 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-2xl font-black text-primary tracking-tight uppercase leading-none">
                    {isEditingSession ? "Editar Sessão" : "Detalhes da Sessão"}
                  </h2>
                  <p className="text-xs font-bold text-muted-foreground/60 mt-1 uppercase tracking-widest">
                    {formatDate(viewingSession.scheduled_at)} às {formatTime(viewingSession.scheduled_at)}
                  </p>
                </div>
                {!isEditingSession && (
                  <div className="flex items-center gap-3">
                    <Badge className={cn("rounded-full px-4 py-1 text-[10px] font-black uppercase tracking-widest border-0", SESSION_STATUS[viewingSession.status as keyof typeof SESSION_STATUS]?.color)}>
                      {SESSION_STATUS[viewingSession.status as keyof typeof SESSION_STATUS]?.label}
                    </Badge>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="w-10 h-10 rounded-full bg-primary/5 text-primary hover:bg-primary/10 transition-all"
                      onClick={handleStartEditingSession}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-8 space-y-8 overflow-y-auto flex-1">
                {isEditingSession ? (
                  <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="space-y-3">
                      <Label className="text-[11px] font-black text-primary/60 uppercase ml-2 tracking-widest flex items-center gap-2">
                        <Edit className="w-4 h-4" />
                        Evolução Clínica
                      </Label>
                      <Textarea 
                        className="min-h-[180px] rounded-[24px] border-primary/20 bg-white/50 p-6 text-sm leading-relaxed focus:bg-white transition-all shadow-inner resize-none"
                        placeholder="Descreva a evolução do paciente..."
                        value={sessionEditForm.notes}
                        onChange={(e) => setSessionEditForm(p => ({ ...p, notes: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                          <Label className="text-[11px] font-black text-primary/60 uppercase tracking-widest">Humor do Paciente</Label>
                          <span className="text-lg font-black text-primary">{sessionEditForm.mood_happy_sad}</span>
                        </div>
                        <div className="bg-white/40 p-6 rounded-3xl border border-primary/20 shadow-sm space-y-4">
                          <div className="flex items-center justify-between px-2">
                            <Frown className={cn("w-6 h-6 transition-all", sessionEditForm.mood_happy_sad <= 3 ? "text-rose-500 scale-110" : "text-muted-foreground/30")} />
                            <Smile className={cn("w-6 h-6 transition-all", sessionEditForm.mood_happy_sad >= 8 ? "text-emerald-500 scale-110" : "text-muted-foreground/30")} />
                          </div>
                          <input 
                            type="range" min="1" max="10" step="1"
                            value={sessionEditForm.mood_happy_sad}
                            onChange={(e) => setSessionEditForm(p => ({ ...p, mood_happy_sad: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-primary/10 rounded-full appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between px-2">
                          <Label className="text-[11px] font-black text-primary/60 uppercase tracking-widest">Nível de Agitação</Label>
                          <span className="text-lg font-black text-primary">{sessionEditForm.mood_anxious_calm}</span>
                        </div>
                        <div className="bg-white/40 p-6 rounded-3xl border border-primary/20 shadow-sm space-y-4">
                          <div className="flex items-center justify-between px-2">
                            <Waves className={cn("w-6 h-6 transition-all", sessionEditForm.mood_anxious_calm <= 3 ? "text-sky-500 scale-110" : "text-muted-foreground/30")} />
                            <Zap className={cn("w-6 h-6 transition-all", sessionEditForm.mood_anxious_calm >= 8 ? "text-amber-500 scale-110" : "text-muted-foreground/30")} />
                          </div>
                          <input 
                            type="range" min="1" max="10" step="1"
                            value={sessionEditForm.mood_anxious_calm}
                            onChange={(e) => setSessionEditForm(p => ({ ...p, mood_anxious_calm: parseInt(e.target.value) }))}
                            className="w-full h-2 bg-primary/10 rounded-full appearance-none cursor-pointer accent-primary"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <Label className="text-[11px] font-black text-primary/60 uppercase ml-2 tracking-widest flex items-center gap-2">
                        <FileText className="w-4 h-4" />
                        Evolução Clínica
                      </Label>
                      <div className="bg-white/40 p-6 rounded-3xl border border-white/60 shadow-sm italic text-sm leading-relaxed text-slate-700">
                        {(() => {
                          try {
                            const evolution = JSON.parse(viewingSession.session_notes_encrypted || "{}");
                            return evolution.notes || viewingSession.session_notes_encrypted || "Nenhuma nota registrada.";
                          } catch (e) {
                            return viewingSession.session_notes_encrypted || "Nenhuma nota registrada.";
                          }
                        })()}
                      </div>
                    </div>

                    {(() => {
                      try {
                        const evolution = JSON.parse(viewingSession.session_notes_encrypted || "{}");
                        if (!evolution.mood_happy_sad && !evolution.mood_anxious_calm) return null;
                        
                        return (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 space-y-3">
                              <div className="flex items-center justify-between text-primary">
                                <Label className="text-[9px] font-black uppercase tracking-widest">Humor</Label>
                                {evolution.mood_happy_sad >= 7 ? <Smile className="w-4 h-4" /> : <Frown className="w-4 h-4" />}
                              </div>
                              <p className="text-2xl font-black text-primary">{evolution.mood_happy_sad}/10</p>
                            </div>
                            <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 space-y-3">
                              <div className="flex items-center justify-between text-amber-600">
                                <Label className="text-[9px] font-black uppercase tracking-widest">Agitação</Label>
                                {evolution.mood_anxious_calm >= 7 ? <Zap className="w-4 h-4" /> : <Waves className="w-4 h-4" />}
                              </div>
                              <p className="text-2xl font-black text-amber-700">{evolution.mood_anxious_calm}/10</p>
                            </div>
                          </div>
                        );
                      } catch (e) {
                        return null;
                      }
                    })()}

                    <div className="grid grid-cols-2 gap-8 bg-white/40 p-6 rounded-3xl border border-white/60">
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Duração</p>
                        <p className="text-base font-black text-primary">{viewingSession.duration_minutes} min</p>
                      </div>
                      <div className="text-right space-y-1">
                        <p className="text-[10px] font-black text-primary/40 uppercase tracking-widest">Tipo</p>
                        <p className="text-base font-black text-primary capitalize">{viewingSession.session_type}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
              
              <div className="p-6 bg-white/50 border-t border-primary/10 flex justify-between items-center px-8 shrink-0">
                {isEditingSession ? (
                  <>
                    <Button 
                      variant="ghost" 
                      onClick={() => setIsEditingSession(false)}
                      className="rounded-full px-8 font-black text-muted-foreground"
                    >
                      CANCELAR
                    </Button>
                    <Button 
                      onClick={handleSaveSessionEdit}
                      disabled={isSaving}
                      className="rounded-full px-12 h-12 font-black gradient-primary text-white shadow-lg active:scale-95 transition-all"
                    >
                      {isSaving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={() => handleExportSingleSession(viewingSession)}
                      disabled={isExportingPdf}
                      className="rounded-full px-6 h-10 font-bold border-primary/20 text-primary hover:bg-primary/5"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      EXPORTAR PDF
                    </Button>
                    <Button 
                      variant="ghost" 
                      onClick={() => setShowSessionModal(false)}
                      className="rounded-full px-8 font-black text-primary"
                    >
                      FECHAR
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              {errorDialog.title}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">{errorDialog.message}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setErrorDialog(prev => ({ ...prev, open: false }))}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
