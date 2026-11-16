import { describe, expect, it } from "vitest";
import { getOperatorLogoutBlockerReasons } from "./operatorShiftDb";

describe("classificação de bloqueios do logoff operacional", () => {
  it("permite ocorrência aberta pausada quando há motivo operacional não vazio", () => {
    expect(getOperatorLogoutBlockerReasons({ pauseReason: "Aguardando equipe tática no local" }, false)).toEqual([]);
  });

  it("bloqueia ocorrência aberta sem motivo, inclusive motivo só com espaços", () => {
    expect(getOperatorLogoutBlockerReasons({ pauseReason: null }, false)).toEqual([
      "Não há motivo operacional de pausa ou encaminhamento registrado.",
    ]);
    expect(getOperatorLogoutBlockerReasons({ pauseReason: "   \n  " }, false)).toEqual([
      "Não há motivo operacional de pausa ou encaminhamento registrado.",
    ]);
  });

  it("bloqueia lease ativo mesmo quando a ocorrência já possui motivo de pausa", () => {
    expect(getOperatorLogoutBlockerReasons({ pauseReason: "Aguardando retorno do cliente" }, true)).toEqual([
      "Painel ainda aberto em uma sessão ativa.",
    ]);
  });

  it("expõe ambos os bloqueadores quando lease e motivo ausente coexistem", () => {
    expect(getOperatorLogoutBlockerReasons({ pauseReason: "" }, true)).toEqual([
      "Painel ainda aberto em uma sessão ativa.",
      "Não há motivo operacional de pausa ou encaminhamento registrado.",
    ]);
  });
});
