export async function getPublicBrandingOrNull<T>(
  loadBranding: () => Promise<T | null | undefined>,
  onUnavailable?: () => void,
): Promise<T | null> {
  try {
    return (await loadBranding()) ?? null;
  } catch {
    onUnavailable?.();
    return null;
  }
}
