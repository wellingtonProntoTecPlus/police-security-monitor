import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { Shield, LogIn } from "lucide-react";
import { startLogin } from "@/const";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [, navigate] = useLocation();
  const isShiftChange = new URLSearchParams(window.location.search).get("turno") === "1";
  const wasSessionReplaced = new URLSearchParams(window.location.search).get("motivo") === "sessao-substituida";

  const loginMut = trpc.auth.login.useMutation({
    onSuccess: (result) => {
      toast.success("Login realizado com sucesso!");
      window.location.href = result.user.role === "partner" ? "/clients" : "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message || "Email ou senha inválidos");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha email e senha");
      return;
    }
    loginMut.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="bg-primary/10 p-4 rounded-full">
              <Shield className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">POLICE CENTRAL</CardTitle>
          <p className="text-sm text-muted-foreground">{isShiftChange ? "Troca de turno: aguardando o próximo operador." : "Sistema de Monitoramento de Alarmes"}</p>
        </CardHeader>
        <CardContent>
          {wasSessionReplaced && <div role="alert" className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            Sua sessão foi encerrada porque este usuário entrou no sistema em outro computador. Entre novamente aqui somente se quiser transferir o acesso para esta máquina.
            <Button type="button" variant="outline" className="mt-3 w-full" onClick={startLogin}>Entrar com conta corporativa</Button>
          </div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="operador@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loginMut.isPending}>
              <LogIn className="w-4 h-4 mr-2" />
              {loginMut.isPending ? "Entrando..." : "Entrar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
