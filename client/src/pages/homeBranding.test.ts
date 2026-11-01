import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("branding da página inicial", () => {
  it("usa a marca pública cadastrada e mostra fallback quando a logo não estiver disponível", () => {
    expect(source).toContain("trpc.publicBranding.get.useQuery");
    expect(source).toContain("branding?.logoUrl");
    expect(source).toContain("onError={() => setLogoFailed(true)}");
    expect(source).not.toContain("/manus-storage/police-logo_4726d461.png");
  });
});
