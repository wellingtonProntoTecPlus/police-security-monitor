// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import OperatorScheduleDecisionDialog from "./OperatorScheduleDecisionDialog";

afterEach(() => cleanup());

describe("modal obrigatório de escala do operador", () => {
  it("apresenta a mensagem e grava uma das três justificativas sem opção de dispensar", async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    render(<OperatorScheduleDecisionDialog open operatorName="Amanda dos Santos" onRetry={vi.fn()} onChoose={onChoose} />);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Amanda dos Santos, hoje não é o seu dia de trabalho.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /fechar|close/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: "EU TROQUEI MINHA ESCALA" }));
    expect(onChoose).toHaveBeenCalledWith("scale_swap");
  });

  it("desabilita opções enquanto grava e apresenta erro de conferência com ação de nova tentativa", () => {
    const retry = vi.fn();
    const { rerender } = render(<OperatorScheduleDecisionDialog open operatorName="Amanda" isSubmitting onRetry={retry} onChoose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "EU TROQUEI MINHA ESCALA" }).hasAttribute("disabled")).toBe(true);

    rerender(<OperatorScheduleDecisionDialog open operatorName="Amanda" isError errorMessage="Banco indisponível" onRetry={retry} onChoose={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("Banco indisponível");
    expect(screen.queryByRole("button", { name: "ESTOU FAZENDO UMA DOBRA" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeTruthy();
  });
});
