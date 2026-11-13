// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ClientDetail from "./ClientDetail";

const harness = vi.hoisted(() => ({
  user: { id: 8, role: "operator", partnerId: null, name: "Operador" } as any,
  client: {
    id: 42,
    partnerCompanyId: 77,
    type: "pj",
    name: "Cliente DVR",
    document: "12345678000199",
    isActive: true,
    monitoringStatus: "active",
  } as any,
  dvr: {
    id: 501,
    clientId: 42,
    brand: "Intelbras",
    model: "MHDX 1232",
    firmwareVersion: "2.0.1",
    serialNumber: "SN-DVR-42",
    host: "dvr.example.test",
    tcpPort: 37777,
    udpPort: 37778,
    httpPort: 8080,
    rtspPort: 554,
    httpsPort: 443,
    serverPort: 9000,
    username: "admin",
    password: "DVR-secret-42",
  } as any,
  createDvrOptions: null as any,
  createDvrMutate: vi.fn(),
  noopMutate: vi.fn(),
  refetchDvrs: vi.fn().mockResolvedValue(undefined),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: harness.user }),
}));

vi.mock("wouter", () => ({
  useRoute: () => [true, { id: "42" }],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: new Proxy({}, {
    get: (_routerTarget, routerName) => new Proxy({}, {
      get: (_procedureTarget, procedureName) => {
        const path = `${String(routerName)}.${String(procedureName)}`;
        return {
          useQuery: () => {
            let data: any = [];
            if (path === "monitoredClient.get") data = harness.client;
            if (path === "dvr.list") data = [harness.dvr];
            return {
              data,
              refetch: path === "dvr.list" ? harness.refetchDvrs : vi.fn(),
            };
          },
          useMutation: (options?: any) => {
            if (path === "dvr.create") harness.createDvrOptions = options;
            return {
              mutate: path === "dvr.create" ? harness.createDvrMutate : harness.noopMutate,
              isPending: false,
            };
          },
        };
      },
    }),
  }),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/AlarmScheduleEditor", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: harness.toast }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  harness.user = { id: 8, role: "operator", partnerId: null, name: "Operador" };
  harness.createDvrOptions = null;
});

async function renderDvrTab() {
  const user = userEvent.setup();
  render(<ClientDetail />);
  await user.click(screen.getByRole("tab", { name: /DVRs/i }));
  return user;
}

async function openDvrForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Adicionar DVR/i }));
  return screen.findByRole("dialog");
}

function inputForLabel(dialog: HTMLElement, labelText: string): HTMLInputElement {
  const label = Array.from(dialog.querySelectorAll("label")).find(
    (candidate) => candidate.textContent?.trim().replace(/\s*\*$/, "") === labelText,
  );
  if (!label) throw new Error(`Label ausente para: ${labelText}`);
  const input = label.parentElement?.querySelector("input");
  if (!input) throw new Error(`Campo de entrada ausente para: ${labelText}`);
  return input;
}

describe("ClientDetail — cadastro informativo de DVRs", () => {
  it.each(["admin", "partner"])("exibe dados e senha legível para %s", async (role) => {
    harness.user = {
      id: role === "partner" ? 77 : 1,
      role,
      partnerId: role === "partner" ? 77 : null,
      name: role === "partner" ? "Parceira Responsável" : "Administrador",
    };
    const user = await renderDvrTab();

    expect(screen.getByText("Cadastro informativo; não conecta nem acessa o equipamento.")).toBeTruthy();
    expect(screen.getByText("Intelbras · MHDX 1232")).toBeTruthy();
    expect(screen.getByText(/Versão: 2\.0\.1 · Serial: SN-DVR-42/)).toBeTruthy();
    expect(screen.getByText(/IP\/DDNS: dvr\.example\.test · Usuário: admin/)).toBeTruthy();
    for (const [label, port] of [
      ["TCP:", "37777"],
      ["UDP:", "37778"],
      ["HTTP:", "8080"],
      ["RTSP:", "554"],
      ["HTTPS:", "443"],
      ["Servidor:", "9000"],
    ]) {
      expect(screen.getByText(label).parentElement?.textContent).toContain(port);
    }
    expect(screen.getByText("DVR-secret-42")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Adicionar DVR/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Senha do DVR")).toBeTruthy();
    expect(within(dialog).getByText(/cifrada no banco/)).toBeTruthy();
  });

  it("não expõe a senha ao operador nem no cadastro nem no resumo do DVR", async () => {
    const user = await renderDvrTab();

    expect(screen.queryByText("DVR-secret-42")).toBeNull();
    expect(screen.getByText(/Visível somente ao Administrador e à parceira responsável/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Adicionar DVR/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("Senha do DVR")).toBeNull();
    expect(within(dialog).queryByDisplayValue("DVR-secret-42")).toBeNull();
  });

  it("não inclui password no mutation de cadastro enviado por operador", async () => {
    const user = await renderDvrTab();
    const dialog = await openDvrForm(user);
    await user.type(inputForLabel(dialog, "Marca"), "Intelbras");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar DVR" }));

    expect(harness.createDvrMutate).toHaveBeenCalledTimes(1);
    expect(harness.createDvrMutate.mock.calls[0][0]).not.toHaveProperty("password");
  });

  it("envia os dados cadastrais sem conexão ao equipamento e fecha somente após onSuccess", async () => {
    harness.user = { id: 1, role: "admin", partnerId: null, name: "Administrador" };
    const user = await renderDvrTab();
    const dialog = await openDvrForm(user);

    const fields: Array<[string, string]> = [
      ["Marca", "Intelbras"],
      ["Modelo", "MHDX 1232"],
      ["Versão", "2.0.1"],
      ["Serial", "SN-DVR-42"],
      ["IP/DDNS", "dvr.example.test"],
      ["Porta TCP", "37777"],
      ["Porta UDP", "37778"],
      ["Porta HTTP", "8080"],
      ["Porta RTSP", "554"],
      ["Porta HTTPS", "443"],
      ["Porta Servidor", "9000"],
      ["Usuário", "security-admin"],
      ["Senha do DVR", "Vault Secret 123"],
    ];
    for (const [label, value] of fields) {
      const input = inputForLabel(dialog, label);
      if (label === "Usuário") await user.clear(input);
      await user.type(input, value);
    }

    await user.click(within(dialog).getByRole("button", { name: "Cadastrar DVR" }));
    expect(harness.createDvrMutate).toHaveBeenCalledTimes(1);
    expect(harness.createDvrMutate).toHaveBeenCalledWith({
      clientId: 42,
      brand: "Intelbras",
      model: "MHDX 1232",
      firmwareVersion: "2.0.1",
      serialNumber: "SN-DVR-42",
      host: "dvr.example.test",
      tcpPort: 37777,
      udpPort: 37778,
      httpPort: 8080,
      rtspPort: 554,
      httpsPort: 443,
      serverPort: 9000,
      username: "security-admin",
      password: "Vault Secret 123",
    });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(harness.createDvrOptions?.onSuccess).toBeTypeOf("function");

    await act(async () => {
      await harness.createDvrOptions.onSuccess();
    });

    expect(harness.refetchDvrs).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(harness.toast.success).toHaveBeenCalledWith("DVR cadastrado com sucesso!");
  });

  it("mantém o formulário aberto e apresenta o erro do mutation quando o cadastro falha", async () => {
    harness.user = { id: 1, role: "admin", partnerId: null, name: "Administrador" };
    const user = await renderDvrTab();
    const dialog = await openDvrForm(user);
    await user.type(inputForLabel(dialog, "Marca"), "Intelbras");
    await user.click(within(dialog).getByRole("button", { name: "Cadastrar DVR" }));

    expect(harness.createDvrMutate).toHaveBeenCalledTimes(1);
    expect(harness.createDvrOptions?.onError).toBeTypeOf("function");
    act(() => harness.createDvrOptions.onError(new Error("Banco indisponível")));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(harness.toast.error).toHaveBeenCalledWith("Não foi possível cadastrar o DVR: Banco indisponível");
  });
});
