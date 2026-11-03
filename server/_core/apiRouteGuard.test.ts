import { describe, expect, it, vi } from "vitest";
import { isApiRequestUrl, rejectApiFallback } from "./apiRouteGuard";

describe("guard de fallback das rotas API", () => {
  it.each([
    "/api",
    "/api/unknown",
    "/api/trpc/auth.me?batch=1",
    "/api/internal/health#check",
  ])("reconhece %s como URL de API", (url) => {
    expect(isApiRequestUrl(url)).toBe(true);
  });

  it.each(["/", "/dashboard", "/apix", "/apiary"])(
    "não confunde %s com URL de API",
    (url) => {
      expect(isApiRequestUrl(url)).toBe(false);
    },
  );

  it("encerra uma API desconhecida com JSON em vez de delegar ao SPA", () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const next = vi.fn();

    rejectApiFallback({ originalUrl: "/api/unknown" }, { status } as never, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: "API route not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("delega rotas não-API para o fallback normal da SPA", () => {
    const next = vi.fn();

    rejectApiFallback({ originalUrl: "/dashboard" }, {} as never, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
