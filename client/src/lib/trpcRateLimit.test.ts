import { describe, expect, it } from "vitest";
import { isPlainTextRateLimitResponse, shouldRetryQuery, toTrpcRateLimitResponse } from "./trpcRateLimit";

describe("respostas de limite do proxy tRPC", () => {
  it("converte a resposta 429 em texto para um erro JSON compreensível pelo tRPC", async () => {
    const normalized = toTrpcRateLimitResponse(new Response("Too many requests. Please try again later.", {
      status: 429,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }));
    expect(isPlainTextRateLimitResponse(normalized)).toBe(false);
    await expect(normalized.json()).resolves.toMatchObject([{
      error: { json: { data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } } },
    }]);
  });

  it("preserva respostas JSON e não repete consultas limitadas", () => {
    const response = new Response("[]", { status: 429, headers: { "content-type": "application/json" } });
    expect(toTrpcRateLimitResponse(response)).toBe(response);
    expect(shouldRetryQuery(0, new Error("Too many requests"))).toBe(false);
    expect(shouldRetryQuery(0, new Error("Unexpected token 'T'"))).toBe(false);
    expect(shouldRetryQuery(0, new Error("Falha comum"))).toBe(true);
    expect(shouldRetryQuery(1, new Error("Falha comum"))).toBe(false);
  });
});
