// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Clients from "./Clients";

const standardMutation = {
  mutate: vi.fn(),
  isPending: false,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    monitoredClient: {
      list: { useQuery: () => ({ data: [], refetch: vi.fn() }) },
      create: { useMutation: () => standardMutation },
      update: { useMutation: () => standardMutation },
      delete: { useMutation: () => standardMutation },
    },
    partnerCompany: {
      list: { useQuery: () => ({ data: [{ id: 1, name: "Police Electronics" }] }) },
    },
  },
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/clients", vi.fn()],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("Clientes — Novo Cliente", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("abre o formulário no próximo ciclo após o clique, sem desmontagem imediata", async () => {
    const user = userEvent.setup();
    render(<Clients />);

    await user.click(screen.getByRole("button", { name: /novo cliente/i }));

    expect(await screen.findByRole("heading", { name: /cadastrar novo cliente/i })).toBeTruthy();
    expect(screen.getByText("Empresa Responsável")).toBeTruthy();
    expect(screen.getByRole("button", { name: /cadastrar cliente/i })).toBeTruthy();
  });
});
