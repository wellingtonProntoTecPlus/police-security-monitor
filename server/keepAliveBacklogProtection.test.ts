import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receiverSource = readFileSync(new URL("./receiver/index.ts", import.meta.url), "utf8");
const databaseSource = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
const dashboardSource = readFileSync(new URL("../client/src/pages/Dashboard.tsx", import.meta.url), "utf8");
const universalSeed = readFileSync(new URL("../deploy/init_db.sql", import.meta.url), "utf8");
const keepAliveSync = readFileSync(new URL("../deploy/sync_contact_id_keepalive.sql", import.meta.url), "utf8");

describe("proteção contra fila de Keep Alive", () => {
  it("mantém uma ocorrência rastreada por falha até a restauração", () => {
    expect(receiverSource).toContain("findOpenTrackedIncident");
    expect(receiverSource).toContain("Boolean(repeatedTrackedIncident)");
    expect(receiverSource).toContain("Falha repetida registrada no relatório");
  });

  it("cadastra E/R361 como Universal e evita herdar código de outra marca", () => {
    expect(universalSeed).toContain("('361','E','UNIVERSAL',1");
    expect(universalSeed).toContain("('361','R','UNIVERSAL',1");
    expect(keepAliveSync).toContain("code = '361' AND qualifier = 'E' AND isUniversal = 1");
    expect(databaseSource).toContain("Nunca reutilizar a primeira descrição de");
  });

  it("finaliza a fila em uma mutação de servidor, não em milhares de chamadas paralelas", () => {
    expect(databaseSource).toContain("bulkFinalizeOpenIncidents");
    expect(dashboardSource).toContain("trpc.incident.bulkFinalize.useMutation()");
    expect(dashboardSource).not.toContain("Promise.all(relatedEvents.flatMap");
  });
});
