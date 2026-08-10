import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Shield, Monitor, Bell, Users, Radio } from "lucide-react";
import { Redirect } from "wouter";
import { useLocation } from "wouter";
import { LogIn } from "lucide-react";

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-primary text-xl font-bold">Carregando...</div>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Redirect to="/dashboard" />;
  }

  // Bypass para VPS sem OAuth - acesso direto ao dashboard
  const handleDirectAccess = () => {
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/manus-storage/police-logo_4726d461.png" alt="Police Central" className="h-12 object-contain" />
        </div>
        <div className="flex gap-3">
          <Button onClick={handleDirectAccess} variant="default" size="lg" className="font-bold">
            <LogIn className="w-5 h-5 mr-2" />
            ENTRAR NO SISTEMA
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="max-w-4xl text-center space-y-8">
          <h1 className="text-5xl font-black tracking-tight text-foreground">
            POLICE <span className="text-primary">CENTRAL</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Software de Monitoramento de Alarmes e Câmeras. Recepção de eventos Contact ID em tempo real com suporte multi-central.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="bg-card border border-border rounded-xl p-6 text-left">
              <Bell className="h-8 w-8 text-alarm-critical mb-3" />
              <h3 className="font-bold text-lg text-foreground">Monitoramento 24h</h3>
              <p className="text-sm text-muted-foreground mt-2">Dashboard operacional com filas de atendimento em tempo real</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 text-left">
              <Radio className="h-8 w-8 text-primary mb-3" />
              <h3 className="font-bold text-lg text-foreground">Multi-Central</h3>
              <p className="text-sm text-muted-foreground mt-2">JFL, Intelbras, Vetti, Compatec, Radioenge, ViaWeb</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6 text-left">
              <Monitor className="h-8 w-8 text-alarm-online mb-3" />
              <h3 className="font-bold text-lg text-foreground">Câmeras RTSP</h3>
              <p className="text-sm text-muted-foreground mt-2">Visualização ao vivo integrada ao painel de ocorrências</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mt-8">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="h-4 w-4" />
              <span>Gestora + Parceiras + Clientes</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>Multi-tenant White Label</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border px-6 py-4 text-center text-sm text-muted-foreground">
        Police Central - Software de Monitoramento &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
