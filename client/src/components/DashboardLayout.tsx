import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { LayoutDashboard, LogOut, PanelLeft, Users, Building2, Shield, Camera, Settings, Radio, KeyRound, UserRound, X } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Building2, label: "Empresa Gestora", path: "/managing-company" },
  { icon: Building2, label: "Empresa Parceira", path: "/partners" },
  { icon: Users, label: "Clientes", path: "/clients" },
  { icon: Radio, label: "Relatórios", path: "/reports" },
  { icon: Shield, label: "Contact ID", path: "/contact-id" },
  { icon: LayoutDashboard, label: "Finalizações", path: "/finalizations" },
  { icon: Users, label: "Usuários", path: "/users" },
  { icon: Settings, label: "Configurações", path: "/settings" },
];

const ROLE_MENU_ITEMS: Record<string, string[]> = {
  admin: menuItems.map((item) => item.path),
  supervisor: ["/dashboard", "/partners", "/clients", "/reports", "/contact-id", "/finalizations"],
  operator: ["/dashboard", "/clients", "/finalizations"],
  partner: ["/clients", "/reports"],
};

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 200;
const MIN_WIDTH = 180;
const MAX_WIDTH = 360;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <h1 className="text-2xl font-semibold tracking-tight text-center">
              Entre para continuar
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              O acesso ao Police Central exige login com e-mail e senha.
            </p>
          </div>
          <Button
            onClick={() => { window.location.href = "/login"; }}
            size="lg"
            className="w-full shadow-lg hover:shadow-xl transition-all"
          >
            Entrar no sistema
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      defaultOpen={false}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();
  const visibleMenuItems = user ? menuItems.filter((item) => (ROLE_MENU_ITEMS[user.role] || ROLE_MENU_ITEMS.operator).includes(item.path)) : menuItems;
  const changeOwnPasswordMut = trpc.auth.changeOwnPassword.useMutation();

  const changeShift = async () => {
    await logout();
    window.location.href = "/login?turno=1";
  };

  const saveOwnPassword = async () => {
    if (newPassword !== confirmPassword) {
      window.alert("A confirmação da nova senha não confere.");
      return;
    }
    try {
      await changeOwnPasswordMut.mutateAsync({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setProfileOpen(false);
      window.alert("Senha alterada com sucesso.");
    } catch (error: any) {
      window.alert(error?.message || "Não foi possível alterar a senha.");
    }
  };

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold tracking-tight truncate">
                    Police Central
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {visibleMenuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-11 w-11 border-2 border-primary/60 shadow-md shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-64">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-sm font-semibold truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-1">{user?.email}</p>
                  <p className="text-xs text-primary mt-1 capitalize">Perfil: {user?.role}</p>
                </div>
                <DropdownMenuItem onClick={() => setProfileOpen(true)} className="cursor-pointer">
                  <UserRound className="mr-2 h-4 w-4" />
                  <span>Meu perfil e senha</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void changeShift()} className="cursor-pointer text-amber-600 focus:text-amber-700">
                  <Users className="mr-2 h-4 w-4" />
                  <span>Trocar usuário</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void logout()}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        {profileOpen && (
          <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <h2 className="font-semibold">Perfil do operador</h2>
                  <p className="text-xs text-muted-foreground mt-1">{user?.name} · {user?.email}</p>
                </div>
                <button onClick={() => setProfileOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar perfil"><X className="h-5 w-5" /></button>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-lg bg-muted/50 p-3 text-sm">
                  <p><span className="text-muted-foreground">Função:</span> <span className="capitalize font-medium">{user?.role}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">Use a troca de usuário ao encerrar o turno. A tela volta ao login e as ocorrências abertas permanecem na fila.</p>
                </div>
                <div className="border-t border-border pt-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-primary" /> Alterar senha</p>
                  <div className="space-y-3">
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Senha atual" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nova senha (mínimo 6 caracteres)" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                    <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar nova senha" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
                <Button variant="outline" onClick={() => setProfileOpen(false)}>Cancelar</Button>
                <Button onClick={() => void saveOwnPassword()} disabled={changeOwnPasswordMut.isPending}>{changeOwnPasswordMut.isPending ? "Salvando..." : "Salvar senha"}</Button>
              </div>
            </div>
          </div>
        )}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 overflow-hidden h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}
