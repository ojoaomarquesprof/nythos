"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  MoreVertical,
  CheckCircle2,
  AlertCircle,
  Clock,
  Ban,
  MessageCircle,
  Filter
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type User = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  created_at: string;
  subscription: {
    id: string;
    status: string;
    current_period_end: string;
    plan_id: string;
  } | null;
};

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [subAction, setSubAction] = useState({ status: 'active', days: 30 });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Falha ao carregar usuários');
      const data = await res.json();
      setUsers(data);
    } catch {
      console.error("[admin/page] Failed to load users");
      alert("Erro ao carregar usuários. Verifique se você tem permissão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleUpdateSubscription = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/subscription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subAction)
      });
      
      if (!res.ok) throw new Error('Falha ao atualizar');
      
      await loadUsers();
      setModalOpen(false);
    } catch {
      console.error("[admin/page] Failed to update subscription");
      alert("Erro ao atualizar assinatura.");
    } finally {
      setActionLoading(false);
    }
  };

  const isExpiredTrial = (u: User) => {
    if (u.subscription?.status !== 'trialing') return false;
    const end = new Date(u.subscription.current_period_end).getTime();
    return end < Date.now();
  };

  const isActiveTrial = (u: User) => {
    if (u.subscription?.status !== 'trialing') return false;
    const end = new Date(u.subscription.current_period_end).getTime();
    return end >= Date.now();
  };

  const isActiveSub = (u: User) => {
    return u.subscription?.status === 'active';
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.full_name?.toLowerCase().includes(search.toLowerCase()) || 
                          u.email?.toLowerCase().includes(search.toLowerCase());
    
    if (!matchesSearch) return false;

    if (filterType === "active") return isActiveSub(u);
    if (filterType === "trial") return isActiveTrial(u);
    if (filterType === "expired_trial") return isExpiredTrial(u);
    if (filterType === "total_active") return isActiveSub(u) || isActiveTrial(u);
    
    return true; // "all"
  });

  const stats = {
    active: users.filter(isActiveSub).length,
    trialing: users.filter(isActiveTrial).length,
    expired_trial: users.filter(isExpiredTrial).length,
    total_active: users.filter(u => isActiveSub(u) || isActiveTrial(u)).length,
  };

  const formatPhone = (phone: string | null) => {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 10 ? `55${digits}` : null;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Gestão de Usuários</h1>
          <p className="text-slate-500 font-medium">Controle total sobre contas e acessos.</p>
        </div>
        <Button onClick={loadUsers} disabled={loading} variant="outline" className="font-bold">
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm cursor-pointer transition-transform hover:scale-105" onClick={() => setFilterType("active")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Assinaturas Ativas</p>
              <p className="text-2xl font-black text-slate-800">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm cursor-pointer transition-transform hover:scale-105" onClick={() => setFilterType("trial")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Trial Ativo</p>
              <p className="text-2xl font-black text-slate-800">{stats.trialing}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm cursor-pointer transition-transform hover:scale-105" onClick={() => setFilterType("expired_trial")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Trial Expirado</p>
              <p className="text-2xl font-black text-slate-800">{stats.expired_trial}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm cursor-pointer transition-transform hover:scale-105" onClick={() => setFilterType("total_active")}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-500">Total Usuários (Trial + Ativos)</p>
              <p className="text-2xl font-black text-slate-800">{stats.total_active}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-slate-50/50 flex flex-col md:flex-row items-start md:items-center gap-4 py-4">
          <div className="relative w-full max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input 
              placeholder="Buscar por nome ou e-mail..." 
              className="pl-9 bg-white border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto ml-auto">
            <Filter className="w-4 h-4 text-slate-400" />
            <Select value={filterType} onValueChange={(val) => setFilterType(val as string)}>
              <SelectTrigger className="w-[200px] bg-white font-medium">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Registros</SelectItem>
                <SelectItem value="active">Apenas Ativos</SelectItem>
                <SelectItem value="trial">Apenas Trial Ativo</SelectItem>
                <SelectItem value="expired_trial">Apenas Trial Expirado</SelectItem>
                <SelectItem value="total_active">Ativos + Trial (Total)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b">
              <tr>
                <th className="px-6 py-4 font-bold">Nome</th>
                <th className="px-6 py-4 font-bold">E-mail</th>
                <th className="px-6 py-4 font-bold">WhatsApp</th>
                <th className="px-6 py-4 font-bold">Cadastro</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold">Vencimento</th>
                <th className="px-6 py-4 font-bold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500 font-medium">
                    Carregando usuários...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-500 font-medium">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const phoneWa = formatPhone(user.phone);
                  const isTrialExpired = isExpiredTrial(user);

                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800">{user.full_name || 'Sem Nome'}</div>
                        <div className="text-[10px] text-slate-400 font-medium uppercase mt-0.5">{user.role}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        {phoneWa ? (
                          <a 
                            href={`https://wa.me/${phoneWa}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-md transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            {user.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {new Date(user.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4">
                        {user.subscription ? (
                          <Badge className={`font-bold ${
                            user.subscription.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                            isTrialExpired ? 'bg-rose-100 text-rose-700' :
                            user.subscription.status === 'trialing' ? 'bg-amber-100 text-amber-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {isTrialExpired ? 'trial expirado' : user.subscription.status}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="font-bold bg-slate-100 text-slate-600">sem assinatura</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {user.subscription?.current_period_end 
                          ? new Date(user.subscription.current_period_end).toLocaleDateString('pt-BR')
                          : '-'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          className="font-bold shadow-sm"
                          onClick={() => {
                            setSelectedUser(user);
                            setModalOpen(true);
                          }}
                        >
                          Gerenciar.
                        </Button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black">Gerenciar Acesso</DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
              Alterar assinatura manualmente para <strong className="text-slate-800">{selectedUser?.full_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="font-bold text-slate-700">Tipo de Acesso</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  type="button"
                  variant={subAction.status === 'active' ? 'default' : 'outline'}
                  className={subAction.status === 'active' ? 'bg-emerald-500 hover:bg-emerald-600 font-bold' : 'font-bold'}
                  onClick={() => setSubAction(p => ({ ...p, status: 'active' }))}
                >
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  Ativo (Pago)
                </Button>
                <Button 
                  type="button"
                  variant={subAction.status === 'trialing' ? 'default' : 'outline'}
                  className={subAction.status === 'trialing' ? 'bg-amber-500 hover:bg-amber-600 font-bold' : 'font-bold'}
                  onClick={() => setSubAction(p => ({ ...p, status: 'trialing' }))}
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Teste (Trial)
                </Button>
                <Button 
                  type="button"
                  variant={subAction.status === 'canceled' ? 'default' : 'outline'}
                  className={`col-span-2 ${subAction.status === 'canceled' ? 'bg-rose-500 hover:bg-rose-600 font-bold text-white' : 'font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200'}`}
                  onClick={() => setSubAction(p => ({ ...p, status: 'canceled' }))}
                >
                  <Ban className="w-4 h-4 mr-2" />
                  Suspender / Cancelar
                </Button>
              </div>
            </div>

            {subAction.status !== 'canceled' && (
              <div className="space-y-3">
                <Label className="font-bold text-slate-700">Duração (Dias)</Label>
                <Input 
                  type="number" 
                  className="font-bold"
                  value={subAction.days}
                  onChange={(e) => setSubAction(p => ({ ...p, days: parseInt(e.target.value) || 0 }))}
                />
                <p className="text-xs text-slate-500">A assinatura vencerá em {subAction.days} dias a partir de hoje.</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="font-bold">Cancelar</Button>
            <Button 
              onClick={handleUpdateSubscription} 
              disabled={actionLoading}
              className="bg-slate-900 text-white font-black hover:bg-slate-800"
            >
              {actionLoading ? 'Salvando...' : 'Aplicar Alterações'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
