"use client";

import { useState, useEffect } from "react";
import { 
  Users, 
  UserPlus, 
  Mail, 
  ShieldCheck, 
  Lock, 
  MoreHorizontal, 
  Trash2, 
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export default function TeamPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>("Starter");
  
  const { isSecretary, isTrial } = useSubscription();
  const supabase = createClient() as any;

  useEffect(() => {
    loadTeamData();
  }, []);

  async function loadTeamData() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Buscar plano do usuário
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('plan_name')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (subData?.plan_name) {
        setCurrentPlan(subData.plan_name);
      }

      // 2. Buscar membros da equipe (secretárias)
      const { data: teamMembers } = await supabase
        .from('profiles')
        .select('*')
        .eq('employer_id', user.id)
        .eq('role', 'secretary');

      if (teamMembers) setMembers(teamMembers);
    } catch (error) {
      console.error("Erro ao carregar equipe:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleInvite = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const full_name = formData.get('full_name') as string;
    const password = formData.get('password') as string;

    setIsInviting(true);
    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Erro ao convidar');

      toast.success("Secretária cadastrada!", {
        description: `Lembre-se de passar a senha temporária para ${full_name}.`,
      });
      
      setIsInviteOpen(false);
      loadTeamData();
    } catch (error: any) {
      toast.error("Erro no convite", {
        description: error.message,
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja remover o acesso de ${name}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/team/remove?id=${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'Erro ao remover');

      toast.success("Acesso removido", {
        description: `${name} não faz mais parte da sua equipe.`,
      });
      
      loadTeamData();
    } catch (error: any) {
      toast.error("Erro ao remover", {
        description: error.message,
      });
    }
  };

  // Só é considerado plano Starter (bloqueado) se NÃO estiver em período de teste
  const isStarterPlan = currentPlan === "Starter" && !isTrial;

  if (isSecretary) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h2 className="text-xl font-bold">Acesso Restrito</h2>
        <p className="text-muted-foreground mt-2 max-w-md">
          Apenas o administrador da clínica pode gerenciar a equipe e convidar novos membros.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-5xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestão de Equipe</h1>
          <p className="text-muted-foreground mt-1 text-sm">Adicione e gerencie as secretárias da sua clínica.</p>
        </div>

        {isStarterPlan ? (
          <Button 
            size="lg"
            className="bg-muted text-muted-foreground cursor-not-allowed shadow-none"
            disabled
          >
            <Lock className="w-4 h-4 mr-2" />
            Convidar Secretária
          </Button>
        ) : (
          <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
            <DialogTrigger 
              render={
                <Button 
                  size="lg"
                  className="gradient-primary text-white shadow-md hover:shadow-lg transition-all"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Convidar Secretária
                </Button>
              }
            />
            <DialogContent className="sm:max-w-[425px]">
              <form onSubmit={handleInvite}>
                <DialogHeader>
                  <DialogTitle>Convidar Secretária</DialogTitle>
                  <DialogDescription>
                    Preencha os dados abaixo para criar o acesso da sua secretária.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-5 py-6">
                  <div className="grid gap-2">
                    <Label htmlFor="full_name">Nome Completo</Label>
                    <Input id="full_name" name="full_name" placeholder="Ex: Maria Souza" required className="h-11" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" name="email" type="email" placeholder="email@exemplo.com" required className="h-11" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="password">Senha Temporária</Label>
                    <Input id="password" name="password" type="password" required className="h-11" />
                    <p className="text-[10px] text-muted-foreground">Dica: Crie uma senha simples e peça para ela trocar no primeiro acesso.</p>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" className="w-full h-11 gradient-primary text-white font-bold" disabled={isInviting}>
                    {isInviting ? "Cadastrando..." : "Confirmar Cadastro"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isStarterPlan && (
        <Card className="bg-primary/5 border-primary/20 shadow-none overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-primary/40" />
          <CardContent className="py-5 flex items-center gap-5">
            <div className="bg-primary/10 p-3 rounded-2xl flex-shrink-0">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 space-y-1">
              <h4 className="font-bold text-sm text-primary">Upgrade Necessário para Equipe</h4>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
                Você está no plano <strong>Starter</strong>. Para adicionar membros à sua equipe e delegar tarefas administrativas, faça o upgrade para o plano <strong>Growth</strong>.
              </p>
              <Button 
                variant="link" 
                className="p-0 h-auto text-primary text-xs font-bold hover:underline" 
                onClick={() => window.location.href = '/dashboard/settings/billing'}
              >
                Ver planos e preços →
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 pb-6 border-b">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Membros Ativos</CardTitle>
              <CardDescription>Visualização da sua equipe de suporte.</CardDescription>
            </div>
            <Badge variant="secondary" className="h-7 px-3 font-semibold">
              {members.length} {members.length === 1 ? 'membro' : 'membros'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Carregando equipe...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed rounded-xl">
              <div className="bg-muted p-3 rounded-full mb-4">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold">Nenhuma secretária cadastrada</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-[250px] text-center">
                Comece convidando alguém para ajudar na gestão da sua clínica.
              </p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Membro</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                            {member.full_name?.charAt(0) || 'S'}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-sm">{member.full_name}</span>
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {member.email || "Sem e-mail"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-50 border-indigo-100">
                          Secretária
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Ativo
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger 
                            render={
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            }
                          />
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              className="text-destructive flex items-center gap-2 cursor-pointer"
                              onClick={() => handleRemove(member.id, member.full_name)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Remover Acesso
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
