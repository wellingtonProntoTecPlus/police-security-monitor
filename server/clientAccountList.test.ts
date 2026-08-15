import { describe, expect, it } from "vitest";
import { enrichClientsWithAccounts } from "./clientAccountList";

describe("lista de clientes por conta", () => {
  it("agrupa múltiplas contas, coloca a conta antes do cliente e ordena crescente", () => {
    const result = enrichClientsWithAccounts(
      [{ id: 1, name: "Cliente B" }, { id: 2, name: "Cliente A" }, { id: 3, name: "Sem Sistema" }],
      [
        { clientId: 1, account: "0100" },
        { clientId: 1, account: "0005" },
        { clientId: 2, account: "0001" },
      ],
    );

    expect(result.map((client) => client.id)).toEqual([2, 1, 3]);
    expect(result[0]).toMatchObject({ primaryAccount: "0001", accounts: ["0001"] });
    expect(result[1]).toMatchObject({ primaryAccount: "0005", accounts: ["0005", "0100"] });
    expect(result[2]).toMatchObject({ primaryAccount: null, accounts: [] });
  });
});
