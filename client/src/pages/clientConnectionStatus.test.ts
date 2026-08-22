import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../../../");

describe("status de conexão na tela de cliente", () => {
  it("usa a mesma consulta de Keep Alive dos modais Online e Offline", () => {
    const source = fs.readFileSync(path.join(projectRoot, "client/src/pages/ClientDetail.tsx"), "utf8");

    expect(source).toContain("trpc.dashboard.connectionStatus.useQuery");
    expect(source).toContain("connectionStatusBySystemId");
    expect(source).toContain('connectionStatus === "online"');
    expect(source).not.toContain("system.isOnline ?");
  });
});
