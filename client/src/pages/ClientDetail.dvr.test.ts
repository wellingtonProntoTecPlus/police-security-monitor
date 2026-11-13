import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ClientDetail.tsx", import.meta.url), "utf8");

describe("ClientDetail DVR registration", () => {
  it("provides an informative DVR tab with each requested registration field and no device connection flow", () => {
    expect(source).toContain('<TabsTrigger value="dvrs">DVRs ({dvrs.length})</TabsTrigger>');
    expect(source).toContain("Cadastro informativo; não conecta nem acessa o equipamento.");
    for (const label of ["Marca", "Modelo", "Versão", "Serial", "IP/DDNS", "Porta TCP", "Porta UDP", "Porta HTTP", "Porta RTSP", "Porta HTTPS", "Porta Servidor", "Usuário", "Senha do DVR"]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('username: "admin"');
    expect(source).toContain("trpc.dvr.list.useQuery({ clientId }");
    expect(source).toContain('toast.success("DVR cadastrado com sucesso!")');
  });

  it("shows the password only to admin or partner of the scoped client", () => {
    expect(source).toContain('const canSeeDvrPassword = user?.role === "admin" || isPartner;');
    expect(source).toContain("{canSeeDvrPassword && <div><Label>Senha do DVR</Label>");
    expect(source).toContain("Visível somente ao Administrador e à parceira responsável");
  });
});
