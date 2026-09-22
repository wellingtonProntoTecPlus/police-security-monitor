import { describe, expect, it } from "vitest";
import { getQuickFinalizationOptions } from "./quickFinalizationSearch";

describe("busca progressiva de finalizações rápidas", () => {
  const options = [
    { id: 1, title: "Zeladoria", description: "Registro final", isActive: true },
    { id: 2, title: "Abertura indevida", description: "Alarme falso", isActive: true },
    { id: 3, title: "Desarme autorizado", description: "Cliente confirmou", isActive: true },
    { id: 4, title: "Pânico", description: "Não deve aparecer", isActive: false },
  ];

  it("filtra enquanto digita, ignora acentos e ordena pelo título", () => {
    expect(getQuickFinalizationOptions(options, "").map((item) => item.title)).toEqual([
      "Abertura indevida",
      "Desarme autorizado",
      "Zeladoria",
    ]);
    expect(getQuickFinalizationOptions(options, "desar").map((item) => item.title)).toEqual(["Desarme autorizado"]);
    expect(getQuickFinalizationOptions(options, "cliente confirmou").map((item) => item.title)).toEqual(["Desarme autorizado"]);
  });

  it("não exibe finalizações inativas", () => {
    expect(getQuickFinalizationOptions(options, "panico")).toEqual([]);
  });
});
