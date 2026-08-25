import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("implantação da verificação automática de desconexão", () => {
  it("instala a execução por minuto no mesmo procedimento de atualização da VPS", () => {
    const deployScript = fs.readFileSync(path.resolve(process.cwd(), "deploy/update_vps.sh"), "utf8");
    const cronScript = fs.readFileSync(path.resolve(process.cwd(), "deploy/install_keepalive_disconnect_cron.sh"), "utf8");
    expect(deployScript).toContain("bash deploy/install_keepalive_disconnect_cron.sh");
    expect(deployScript).toContain("pm2 restart police-central");
    expect(cronScript).toContain("* * * * * curl");
    expect(cronScript).toContain("keep-alive-disconnect-sweep");
  });
});
