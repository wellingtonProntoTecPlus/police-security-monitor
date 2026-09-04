import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/Dashboard.tsx"), "utf8");

describe("Identificação operacional do atendimento", () => {
  it("mostra a empresa parceira no card e no tratamento da ocorrência", () => {
    expect(source).toContain("Parceira: {eventPartner?.name || \"Sem empresa parceira vinculada\"}");
    expect(source).toContain("Parceira responsável:");
  });

  it("mostra o número e o nome cadastrado do usuário da central para E401 e R401", () => {
    expect(source).toContain('const PANEL_USER_EVENT_CODES = new Set(["401", "407"])');
    expect(source).toContain("Usuário da central:");
    expect(source).toContain("selectedPanelUser ? ` · ${selectedPanelUser.name}`");
    expect(source).toContain("trpc.alarmUser.operationalList.useQuery(undefined)");
    expect(source).toContain("eventPanelUser?.name || \"Não cadastrado\"");
  });
});
