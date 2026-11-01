import { describe, expect, it, vi } from "vitest";
import { getPublicBrandingOrNull } from "./publicBrandingFallback";

describe("public branding fallback", () => {
  it("returns the public branding when the database query succeeds", async () => {
    const branding = { name: "Police Central", logoUrl: "https://example.test/logo.png" };
    await expect(getPublicBrandingOrNull(async () => branding)).resolves.toEqual(branding);
  });

  it("returns null and logs a fallback when the database query fails", async () => {
    const onUnavailable = vi.fn();
    await expect(
      getPublicBrandingOrNull(async () => {
        throw new Error("database unavailable");
      }, onUnavailable),
    ).resolves.toBeNull();
    expect(onUnavailable).toHaveBeenCalledOnce();
  });

  it("returns null without warning when no database connection is configured", async () => {
    const onUnavailable = vi.fn();
    await expect(getPublicBrandingOrNull(async () => null, onUnavailable)).resolves.toBeNull();
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
