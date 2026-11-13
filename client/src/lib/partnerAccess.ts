export function isPartnerWorkspacePath(pathname: string): boolean {
  return pathname === "/clients" || pathname.startsWith("/clients/");
}
