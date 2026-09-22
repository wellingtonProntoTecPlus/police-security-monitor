export type WorkspaceRole = "admin" | "supervisor" | "operator" | "partner" | string;

export type WorkspaceScreen = {
  label: string;
  path: string;
};

export const WORKSPACE_SCREENS: WorkspaceScreen[] = [
  { label: "Dashboard", path: "/dashboard" },
  { label: "Empresa Gestora", path: "/managing-company" },
  { label: "Empresa Parceira", path: "/partners" },
  { label: "Clientes", path: "/clients" },
  { label: "Relatórios", path: "/reports" },
  { label: "Contact ID", path: "/contact-id" },
  { label: "Finalizações", path: "/finalizations" },
  { label: "Usuários", path: "/users" },
  { label: "Configurações", path: "/settings" },
];

const ROLE_WORKSPACE_PATHS: Record<string, string[]> = {
  admin: WORKSPACE_SCREENS.map((screen) => screen.path),
  supervisor: ["/dashboard", "/partners", "/clients", "/reports", "/contact-id", "/finalizations"],
  operator: ["/dashboard", "/clients", "/finalizations"],
  partner: ["/clients", "/reports"],
};

export function getWorkspaceScreensForRole(role?: WorkspaceRole | null) {
  const allowedPaths = ROLE_WORKSPACE_PATHS[role || ""] || ROLE_WORKSPACE_PATHS.operator;
  return WORKSPACE_SCREENS.filter((screen) => allowedPaths.includes(screen.path));
}
