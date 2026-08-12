import { trpc } from "@/lib/trpc";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users as UsersIcon, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  operator: "Operador",
  partner: "Parceiro",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-600",
  supervisor: "bg-yellow-600",
  operator: "bg-blue-600",
  partner: "bg-green-600",
};

export default function UsersPage() {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "supervisor" | "operator" | "partner">("operator");
  const [partnerId, setPartnerId] = useState<number | undefined>(undefined);
  const [editingUser, setEditingUser] = useState<any>(null);

  const { data: users = [], refetch } = trpc.systemUser.list.useQuery();
  const { data: partners = [] } = trpc.partnerCompany.list.useQuery();
  const createMut = trpc.systemUser.create.useMutation({
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      setShowForm(false);
      setName(""); setEmail(""); setPassword(""); setRole("operator");
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.systemUser.delete.useMutation({
    onSuccess: () => { toast.success("Usuário removido!"); refetch(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.systemUser.update.useMutation({
    onSuccess: () => {
      toast.success("Usuário atualizado com sucesso!");
      setShowForm(false);
      setEditingUser(null);
      setName(""); setEmail(""); setPassword(""); setRole("operator"); setPartnerId(undefined);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const openUserForm = (user?: any) => {
    setEditingUser(user || null);
    setName(user?.name || "");
    setEmail(user?.email || "");
    setPassword("");
    setRole(user?.role || "operator");
    setPartnerId(user?.partnerId || undefined);
    setShowForm(true);
  };

  const handleSave = () => {
    if (!name || !email || (!editingUser && !password)) { toast.error("Preencha os campos obrigatórios"); return; }
    if (role === "partner" && !partnerId) { toast.error("Selecione a empresa parceira do usuário"); return; }
    if (editingUser) updateMut.mutate({ id: editingUser.id, name, email, role, partnerId: role === "partner" ? partnerId! : null, ...(password ? { password } : {}) });
    else createMut.mutate({ name, email, password, role, ...(role === "partner" ? { partnerId } : {}) });
  };

  return (<DashboardLayout>
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UsersIcon className="w-6 h-6" /> Usuários do Sistema
        </h1>
        <Button onClick={() => openUserForm()}>
          <Plus className="w-4 h-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>{editingUser ? "Editar Usuário" : "Cadastrar Novo Usuário"}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">E-mail</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">{editingUser ? "Nova senha (opcional)" : "Senha"}</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={editingUser ? "Deixe em branco para manter" : "Senha de acesso"} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Hierarquia</label>
                <Select value={role} onValueChange={(value) => setRole(value as "admin" | "supervisor" | "operator" | "partner")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="partner">Parceiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {role === "partner" && (
                <div>
                  <label className="text-sm text-muted-foreground">Empresa Parceira *</label>
                  <Select value={partnerId ? String(partnerId) : undefined} onValueChange={(value) => setPartnerId(Number(value))}>
                    <SelectTrigger><SelectValue placeholder="Selecione a parceira" /></SelectTrigger>
                    <SelectContent>
                      {partners.map((partner: any) => <SelectItem key={partner.id} value={String(partner.id)}>{partner.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleSave} disabled={createMut.isPending || updateMut.isPending}>
                {createMut.isPending || updateMut.isPending ? "Salvando..." : editingUser ? "Salvar Alterações" : "Cadastrar"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditingUser(null); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="p-3 text-left">Nome</th>
                  <th className="p-3 text-left">E-mail</th>
                  <th className="p-3 text-left">Hierarquia</th>
                  <th className="p-3 text-left">Último Acesso</th>
                  <th className="p-3 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nenhum usuário cadastrado. Clique em "+ Novo Usuário".</td></tr>
                ) : (
                  users.map((u: any) => (
                    <tr key={u.id} className="border-b hover:bg-muted/50">
                      <td className="p-3 font-medium">{u.name}</td>
                      <td className="p-3">{u.email}</td>
                      <td className="p-3">
                        <Badge className={ROLE_COLORS[u.role] || "bg-gray-600"}>
                          {ROLE_LABELS[u.role] || u.role}
                        </Badge>
                      </td>
                      <td className="p-3">{new Date(u.lastSignedIn).toLocaleString("pt-BR")}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openUserForm(u)} title="Editar usuário"><Pencil className="w-4 h-4 text-blue-400" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir este usuário?")) deleteMut.mutate({ id: u.id }); }} title="Excluir usuário"><Trash2 className="w-4 h-4 text-red-500" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Hierarquias do Sistema</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
            <div className="p-3 border rounded">
              <Badge className="bg-red-600 mb-2">Administrador</Badge>
              <p className="text-muted-foreground">Acesso total ao sistema. Gerencia usuários, empresas, configurações e relatórios.</p>
            </div>
            <div className="p-3 border rounded">
              <Badge className="bg-yellow-600 mb-2">Supervisor</Badge>
              <p className="text-muted-foreground">Monitora operadores, acessa relatórios e finalizações. Pode gerenciar cadastros.</p>
            </div>
            <div className="p-3 border rounded">
              <Badge className="bg-blue-600 mb-2">Operador</Badge>
              <p className="text-muted-foreground">Acesso ao dashboard de monitoramento. Atende eventos, despacha tático e finaliza ocorrências.</p>
            </div>
            <div className="p-3 border rounded">
              <Badge className="bg-green-600 mb-2">Parceiro</Badge>
              <p className="text-muted-foreground">Acesso restrito aos clientes vinculados à sua empresa parceira, com consulta de ocorrências e cadastros autorizados.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>);
}
