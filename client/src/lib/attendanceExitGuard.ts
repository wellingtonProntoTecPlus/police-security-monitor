type NavigationClickAttempt = {
  hasActiveAttendance: boolean;
  href?: string | null;
  currentPath: string;
  target?: string | null;
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  baseHref?: string;
};

export function shouldConfirmAttendanceNavigation({
  hasActiveAttendance,
  href,
  currentPath,
  target,
  button = 0,
  metaKey = false,
  ctrlKey = false,
  shiftKey = false,
  altKey = false,
  baseHref = "https://police-central.local",
}: NavigationClickAttempt) {
  if (!hasActiveAttendance || !href || button !== 0) return false;
  if (target && target !== "_self") return false;
  if (metaKey || ctrlKey || shiftKey || altKey) return false;

  try {
    const destination = new URL(href, baseHref);
    const current = new URL(currentPath, baseHref);
    return destination.origin === current.origin
      && destination.pathname.startsWith("/")
      && destination.pathname !== current.pathname;
  } catch {
    return false;
  }
}
