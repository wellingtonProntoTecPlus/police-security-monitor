import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    // A prévia passa por um proxy HTTPS que não expõe a porta WebSocket interna
    // do Vite de forma estável. Desativar HMR evita que o navegador tente abrir
    // localhost:5173 (ou um WSS inválido); alterações seguem sendo aplicadas
    // pelo reinício controlado do servidor de desenvolvimento.
    hmr: false,
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  // Uma página de prévia anterior pode ainda conter <script src="/@vite/client">.
  // Como HMR não é usado nesse ambiente, retornamos um módulo inerte para que
  // essa página legada não tente abrir WebSocket através do proxy HTTPS.
  app.get("/@vite/client", (_req, res) => {
    res.status(200).set({
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
    }).end(`const hot = {
  accept() {}, dispose() {}, prune() {}, decline() {}, invalidate() {},
  send() {}, on() {}, off() {},
};
const styles = new Map();
export function createHotContext() { return hot; }
export function updateStyle(id, content) {
  let style = styles.get(id) || document.querySelector('style[data-vite-dev-id="' + id + '"]');
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('data-vite-dev-id', id);
    document.head.appendChild(style);
  }
  style.textContent = content;
  styles.set(id, style);
}
export function removeStyle(id) { styles.get(id)?.remove(); styles.delete(id); }
export function injectQuery(url, query) { return url + (url.includes('?') ? '&' : '?') + query; }
export function createOverlay() { return null; }
export function clearErrorOverlay() {}
export function prepareError(error) { return error; }
export function buildErrorMessage(error) { return String(error?.message || error); }
export function waitForSuccessfulPing() { return Promise.resolve(); }
`);
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const transformedPage = await vite.transformIndexHtml(url, template);
      // Mesmo com HMR desativado, transformIndexHtml injeta /@vite/client, que
      // tenta abrir um WebSocket no proxy de prévia. Como a atualização ocorre
      // por reinício controlado, removemos somente esse cliente de desenvolvimento.
      const page = transformedPage.replace(
        /<script type="module" src="\/@vite\/client"><\/script>\s*/,
        "",
      );
      // A prévia passa por proxy e pode reaproveitar uma página anterior que
      // ainda carregava /@vite/client. A página de desenvolvimento nunca deve
      // ser armazenada: cada abertura recebe o HTML atual, já sem HMR.
      res.status(200).set({
        "Content-Type": "text/html",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
      }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
