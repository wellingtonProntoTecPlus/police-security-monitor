// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import LogoUploadField from "./LogoUploadField";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe("LogoUploadField", () => {
  afterEach(() => cleanup());

  it("envia PNG pelo controle de arquivo e propaga a URL retornada", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue("/manus-storage/company-logos/logo.png");
    const onChange = vi.fn();
    const { container } = render(
      <LogoUploadField value="" onChange={onChange} onUpload={onUpload} />,
    );
    const input = container.querySelector('input[type="file"]');
    expect(input).toBeTruthy();

    const file = new File(
      [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      "logo.png",
      { type: "image/png" },
    );
    await user.upload(input as HTMLInputElement, file);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(expect.any(String), "image/png"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/manus-storage/company-logos/logo.png"));
  });

  it("bloqueia formatos não aceitos antes de chamar o backend", async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn();
    const { container } = render(
      <LogoUploadField value="" onChange={vi.fn()} onUpload={onUpload} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["<svg></svg>"], "logo.svg", { type: "image/svg+xml" });
    await user.upload(input, file);

    expect(onUpload).not.toHaveBeenCalled();
  });

  it("oculta preview com URL quebrada e mantém o campo disponível para substituição", () => {
    const { container } = render(
      <LogoUploadField value="https://logo-antiga.invalida/logo.png" onChange={vi.fn()} onUpload={vi.fn()} />,
    );
    const image = screen.getByRole("img", { name: /logo da empresa/i });
    fireEvent.error(image);

    expect(screen.queryByRole("img", { name: /logo da empresa/i })).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeTruthy();
    expect(screen.getByRole("button", { name: /enviar logo/i })).toBeTruthy();
  });
});
