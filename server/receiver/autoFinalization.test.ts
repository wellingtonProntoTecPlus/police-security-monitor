import { describe, expect, it } from "vitest";
import { getAutomaticEventAction } from "./autoFinalization";

describe("decisões de finalização automática", () => {
  it("envia para relatório sem abrir atendimento quando abre_tela é zero", () => {
    expect(getAutomaticEventAction("E", { abreTela: 0 })).toBe("report_only");
  });

  it("mantém o evento em rastreamento quando deve fechar com restauração", () => {
    expect(getAutomaticEventAction("E", { abreTela: 1, fechaComRestauracao: 1 })).toBe("track_for_restoration");
  });

  it("tenta fechar ocorrência pendente ao receber uma restauração sem abertura configurada", () => {
    expect(getAutomaticEventAction("R", {})).toBe("try_restoration");
  });

  it("envia eventos comuns para a fila", () => {
    expect(getAutomaticEventAction("E", { abreTela: 1, fechaComRestauracao: 0 })).toBe("queue");
  });

  it("mantém na fila evento analítico direcional com qualifier R marcado para disparo", () => {
    expect(getAutomaticEventAction("R", { abreTela: 1, fechaComRestauracao: 0 })).toBe("queue");
  });
});
