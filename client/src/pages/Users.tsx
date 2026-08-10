import { trpc } from "@/lib/trpc";
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Users as UsersIcon, Plus, Trash2 } from "lucide-react";
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
  const [role, setRole] = useState("operator");

  const { data: users = [], refetch } = trpc.systemUser.list.useQuery();
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

  const handleCreate = () => {
    if (!name || !email || !password) { toast.error("Preencha todos os campos"); return; }
    createMut.mutate({ name, email, password, role });
  };

  return (<DashboardLayout>
    <div className="p-6 space-y-6 overflow-auto h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <UsersIcon className="w-6 h-6" /> Usuários do Sistema
        </h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" /> Novo Usuário
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>Cadastrar Novo Usuário</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="text-sm text-muted-foreground">Nome</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">E-mail</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Senha</label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Senha de acesso" />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Hierarquia</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="operator">Operador</SelectItem>
                    <SelectItem value="partner">Parceiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={handleCreate} disabled={createMut.isPending}>
                {createMut.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
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
                        <Button variant="ghost" size="sm" onClick={() => { if (confirm("Excluir este usuário?")) deleteMut.mutate({ id: u.id }); }}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
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
          <div className="grid grid-cols-3 gap-4 text-sm">
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
          </div>
        </CardContent>
      </Card>
    </div>
  </DashboardLayout>);
}
