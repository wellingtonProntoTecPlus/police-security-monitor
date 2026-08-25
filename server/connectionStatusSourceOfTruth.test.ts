import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../");

describe("fonte de verdade do status de conexão", () => {
  it("não transforma identificação ou evento Contact ID em sinal Online e calcula o indicador por Keep Alive", () => {
    const source = fs.readFileSync(path.join(projectRoot, "server/db.ts"), "utf8");

    expect(source).toContain("Evento Contact ID, por si só, não confirma a supervisão do painel");
    expect(source).toContain("Keep Alive real como fonte de verdade para Online/Offline");
    expect(source).toContain("const connectionSystems = await listSystemsConnectionStatus();");
    expect(source).toContain('connectionSystems.filter((system) => system.connectionStatus === "online").length');
  });
});
