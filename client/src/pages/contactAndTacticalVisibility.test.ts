import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectFile = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("visibilidade dos cadastros operacionais", () => {
  it("destaca as credenciais de segurança no formulário de contato", () => {
    const source = projectFile("client/src/pages/ClientDetail.tsx");

    expect(source).toContain("Contatos e Credenciais");
    expect(source).toContain("Credenciais de Segurança");
    expect(source).toContain("Contra senha");
    expect(source).toContain("Senha de coação");
  });

  it("orienta a seleção da parceira antes do cadastro de Tático Móvel", () => {
    const source = projectFile("client/src/pages/Partners.tsx");

    expect(source).toContain("Configuração da Parceira");
    expect(source).toContain("Selecionar esta parceira para cadastrar Tático Móvel e feriados");
    expect(source).toContain("Tático Móvel");
  });

  it("explica o cadastro de vários sistemas independentes no cliente", () => {
    const source = projectFile("client/src/pages/ClientDetail.tsx");

    expect(source).toContain("Cada sistema é independente");
    expect(source).toContain("Adicionar outro sistema");
    expect(source).toContain("Sistema {index + 1} · Conta:");
  });

  it("mantém Keep Alive e porta sugerida no cadastro de cada central", () => {
    const source = projectFile("client/src/pages/ClientDetail.tsx");

    expect(source).toContain("Configurações de Keep Alive");
    expect(source).toContain("Padrão: 5 minutos");
    expect(source).toContain("receiverPort: portsForBrand(v)[0] || 0");
    expect(source).toContain("A porta é sugerida ao selecionar a central");
    expect(source).toContain("onValueChange={(value) => setSystemForm({ ...systemForm, receiverPort: Number(value) })}");
  });

  it("exibe, ordena e permite buscar clientes pela conta", () => {
    const source = projectFile("client/src/pages/Clients.tsx");

    expect(source).toContain("Buscar por conta, nome, fantasia ou documento");
    expect(source).toContain("<span>Conta</span>");
    expect(source).toContain("client.accounts.join(\" · \")");
    expect(source).toContain("(c.accounts || []).some");
  });

  it("vincula contatos e usuários ao sistema de alarme selecionado", () => {
    const source = projectFile("client/src/pages/ClientDetail.tsx");

    expect(source).toContain("Sistema para contatos");
    expect(source).toContain("Usuários do Painel");
    expect(source).toContain("Usuários programados somente na central selecionada");
    expect(source).toContain("alarmSystemId: activeSystemId");
  });

  it("só fecha o formulário de usuário depois que a gravação é confirmada", () => {
    const source = projectFile("client/src/pages/ClientDetail.tsx");

    expect(source).toContain("await createAlarmUser.mutateAsync");
    expect(source).toContain("Não foi possível salvar o usuário do painel");
    expect(source).toContain("createAlarmUser.isPending ? \"Salvando...\" : \"Salvar\"");
    expect(source).toContain("Conta {activeSystem?.account || \"—\"}");
  });
});
