type RevocationHandler = (sessionIds: number[]) => void;
let revocationHandler: RevocationHandler | null = null;

export function setAuthSessionRevocationHandler(handler: RevocationHandler | null) {
  revocationHandler = handler;
}

export function notifyAuthSessionsRevoked(sessionIds: number[]) {
  if (sessionIds.length === 0) return;
  try {
    revocationHandler?.(sessionIds);
  } catch (error) {
    console.error("[Auth] Não foi possível avisar sockets locais sobre sessão revogada", error);
  }
}
