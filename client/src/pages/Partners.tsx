import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search, Building2, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export default function Partners() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newPartner, setNewPartner] = useState({
    managingCompanyId: 1,
    name: "",
    cnpj: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
  });

  const { data: partners = [], refetch } = trpc.partnerCompany.list.useQuery(undefined);
  const createMutation = trpc.partnerCompany.create.useMutation({
    onSuccess: () => {
      toast.success("Empresa parceira cadastrada!");
      setShowCreate(false);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const filteredPartners = partners.filter((p: any) =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.cnpj.includes(search)
  );

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Empresas Parceiras</h1>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Nova Parceira</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Cadastrar Empresa Parceira</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Razão Social</Label>
                  <Input value={newPartner.name} onChange={(e) => setNewPartner({ ...newPartner, name: e.target.value })} />
                </div>
                <div>
                  <Label>CNPJ</Label>
                  <Input value={newPartner.cnpj} onChange={(e) => setNewPartner({ ...newPartner, cnpj: e.target.value })} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={newPartner.phone} onChange={(e) => setNewPartner({ ...newPartner, phone: e.target.value })} />
                </div>
                <div>
                  <Label>E-mail</Label>
                  <Input value={newPartner.email} onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })} />
                </div>
                <div>
                  <Label>Cidade</Label>
                  <Input value={newPartner.city} onChange={(e) => setNewPartner({ ...newPartner, city: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
                <Button onClick={() => createMutation.mutate(newPartner)} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Salvando..." : "Cadastrar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou CNPJ..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <ScrollArea className="h-[calc(100vh-250px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPartners.map((partner: any) => (
              <Card key={partner.id} className="hover:border-primary/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-bold text-foreground">{partner.name}</h3>
                    </div>
                    <Badge variant={partner.isActive ? "default" : "destructive"} className="text-xs">
                      {partner.isActive ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>CNPJ: {partner.cnpj}</p>
                    {partner.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{partner.phone}</p>}
                    {partner.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{partner.email}</p>}
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
