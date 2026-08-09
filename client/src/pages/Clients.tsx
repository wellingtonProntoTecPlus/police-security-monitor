import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search, User, Building2, Phone, Mail, MapPin } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function Clients() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newClient, setNewClient] = useState({
    partnerCompanyId: 0,
    type: "pf" as "pf" | "pj",
    name: "",
    document: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });

  const { data: clients = [], refetch } = trpc.monitoredClient.list.useQuery(undefined);
  const { data: partners = [] } = trpc.partnerCompany.list.useQuery(undefined);
  const createMutation = trpc.monitoredClient.create.useMutation({
    onSuccess: () => {
      toast.success("Cliente cadastrado com sucesso!");
      setShowCreate(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredClients = clients.filter((c: any) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.document.includes(search)
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Clientes Monitorados</h1>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Novo Cliente</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Empresa Parceira</Label>
                  <Select onValueChange={(v) => setNewClient({ ...newClient, partnerCompanyId: Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {partners.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={newClient.type} onValueChange={(v) => setNewClient({ ...newClient, type: v as "pf" | "pj" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pf">Pessoa Física</SelectItem>
                      <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Nome / Razão Social</Label>
                  <Input value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                </div>
                <div>
                  <Label>{newClient.type === "pf" ? "CPF" : "CNPJ"}</Label>
                  <Input value={newClient.document} onChange={(e) => setNewClient({ ...newClient, document: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} />
                </div>
                <div>
                  <Label>WhatsApp</Label>
                  <Input value={newClient.whatsapp} onChange={(e) => setNewClient({ ...newClient, whatsapp: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label>Endereço</Label>
                  <Input value={newClient.address} onChange={(e) => setNewClient({ ...newClient, address: e.target.value })} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={newClient.city} onChange={(e) => setNewClient({ ...newClient, city: e.target.value })} />
                </div>
                <div>
                  <Label>UF</Label>
                  <Input value={newClient.state} maxLength={2} onChange={(e) => setNewClient({ ...newClient, state: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button onClick={() => createMutation.mutate(newClient)} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Cadastrar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou documento..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <ScrollArea className="h-[calc(100vh-250px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClients.map((client: any) => (
              <Card key={client.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(`/clients/${client.id}`)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {client.type === "pj" ? <Building2 className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-primary" />}
                      <h3 className="font-bold text-foreground truncate">{client.name}</h3>
                    </div>
                    <Badge variant={client.isActive ? "default" : "destructive"} className="text-xs">
                      {client.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>{client.type === "pf" ? "CPF" : "CNPJ"}: {client.document}</p>
                    {client.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{client.phone}</p>}
                    {client.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.email}</p>}
                    {client.city && <p className="flex items-center gap-1"><MapPin className="h-3 w-3" />{client.city}/{client.state}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>
    </DashboardLayout>
  );
}
