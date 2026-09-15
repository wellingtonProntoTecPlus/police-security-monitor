import { afterEach, describe, expect, it, vi } from "vitest";
import { deferViewTransition } from "./deferredViewTransition";

describe("deferViewTransition", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes focus and only changes the view in the next browser cycle", () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const blurActiveElement = vi.fn();

    deferViewTransition(callback, {
      blurActiveElement,
      schedule: (next) => setTimeout(next, 0),
    });

    expect(blurActiveElement).toHaveBeenCalledOnce();
    expect(callback).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(callback).toHaveBeenCalledOnce();
  });
});
