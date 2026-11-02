import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("experiência e desempenho de carregamento inicial", () => {
  it("mostra mensagem e nova tentativa antes de o React iniciar", () => {
    const html = readProjectFile("../client/index.html");
    expect(html).toContain("Conectando ao Police Central");
    expect(html).toContain("app-boot-retry");
    expect(html).toContain("Tentar novamente");
    expect(html).toContain("rel=\"preload\"");
    expect(html).not.toContain("rel=\"stylesheet\" />\n  </head>");
  });

  it("carrega as páginas sob demanda dentro de Suspense", () => {
    const app = readProjectFile("../client/src/App.tsx");
    expect(app).toContain("Suspense");
    expect(app).toContain("lazy(() => import(\"@/pages/Dashboard\"))");
    expect(app).toContain("lazy(() => import(\"@/pages/Reports\"))");
    expect(app).toContain("Abrindo tela…");
    for (const path of ["/dashboard", "/clients", "/clients/:id", "/partners", "/alarm-systems", "/settings", "/managing-company", "/contact-id", "/reports", "/finalizations", "/users", "/login"]) {
      expect(app).toContain(`path=\"${path}\"`);
    }
  });

  it("adianta o suporte HLS somente quando uma câmera é aberta", () => {
    const player = readProjectFile("../client/src/components/HLSPlayer.tsx");
    expect(player).toContain('import("hls.js")');
    expect(player).not.toContain('import Hls from "hls.js"');
  });

  it("não injeta o runtime de edição Manus na build de produção", () => {
    const vite = readProjectFile("../vite.config.ts");
    expect(vite).toContain('apply: "serve"');
    expect(vite).toContain("vitePluginManusRuntime()");
  });

  it("comprime respostas e configura cache longo só para assets com hash", () => {
    const server = readProjectFile("_core/index.ts");
    const staticServer = readProjectFile("_core/vite.ts");
    expect(server).toContain('import compression from "compression"');
    expect(server).toContain("app.use(compression())");
    expect(staticServer).toContain("max-age=31536000, immutable");
    expect(staticServer).toContain("no-cache, must-revalidate");
  });

  it("oferece orientação visível quando autenticação ou consultas da tela falham", () => {
    const layout = readProjectFile("../client/src/components/DashboardLayout.tsx");
    const skeleton = readProjectFile("../client/src/components/DashboardLayoutSkeleton.tsx");
    const boundary = readProjectFile("../client/src/components/ErrorBoundary.tsx");
    expect(layout).toContain("Alguns dados não foram atualizados");
    expect(layout).toContain("<SidebarFooter className=\"p-3\">");
    expect(layout).not.toContain("fixed bottom-4 right-4 z-[100]");
    expect(layout).toContain("aria-live=\"polite\"");
    expect(layout).toContain("Clique para tentar novamente");
    expect(skeleton).toContain("A conexão está demorando");
    expect(boundary).toContain("Não foi possível abrir esta tela");
  });
});
