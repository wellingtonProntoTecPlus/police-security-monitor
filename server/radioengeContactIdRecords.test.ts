import { describe, expect, it } from "vitest";
import { radioengeContactIdRecords } from "../deploy/radioenge_contact_id_records.mjs";

describe("catálogo Contact ID Radioenge", () => {
  it("contém os códigos exclusivos documentados sem duplicar a tabela Universal", () => {
    expect(radioengeContactIdRecords).toHaveLength(58);
    expect(new Set(radioengeContactIdRecords.map((record) => `${record.qualifier}${record.code}`)).size).toBe(58);
    expect(radioengeContactIdRecords.every((record) => record.fabricante === "RADIOENGE")).toBe(true);
    expect(radioengeContactIdRecords.every((record) => record.isUniversal === false)).toBe(true);
    expect(radioengeContactIdRecords.some((record) => record.code === "130")).toBe(false);
    expect(radioengeContactIdRecords.some((record) => record.code === "401")).toBe(false);
    expect(radioengeContactIdRecords.some((record) => record.code === "602")).toBe(false);
  });

  it("relaciona corretamente os pares de restauração documentados", () => {
    for (const code of ["381", "383", "570", "622", "623", "624"]) {
      expect(radioengeContactIdRecords.filter((record) => record.code === code).map((record) => record.qualifier).sort()).toEqual(["E", "R"]);
    }
    expect(radioengeContactIdRecords.find((record) => record.code === "381" && record.qualifier === "E")).toMatchObject({
      fechaComRestauracao: 1,
      codigoRestauracao: "381",
    });
    expect(radioengeContactIdRecords.find((record) => record.code === "624" && record.qualifier === "E")).toMatchObject({
      priority: "critical",
      abreTela: 1,
    });
  });
});
