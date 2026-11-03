import { describe, expect, it } from "vitest";
import { isPlainTextRateLimitResponse, shouldRetryQuery, toTrpcApiResponse, toTrpcRateLimitResponse } from "./trpcRateLimit";

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

  it("converte HTML de fallback em erro JSON do tRPC sem expor o documento", async () => {
    const normalized = await toTrpcApiResponse(new Response("<!doctype html><html><body>SPA</body></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }));

    expect(normalized.status).toBe(502);
    expect(normalized.headers.get("content-type")).toContain("application/json");
    await expect(normalized.json()).resolves.toMatchObject([{
      error: {
        json: {
          message: "A prévia retornou uma página no lugar dos dados. Recarregue a página e tente novamente.",
          data: { code: "INVALID_API_RESPONSE", httpStatus: 502 },
        },
      },
    }]);
  });

  it("preserva resposta tRPC JSON e não marca texto não-HTML como HTML", async () => {
    const jsonResponse = new Response("[{\"result\":{\"data\":{\"json\":true}}}]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    expect(await toTrpcApiResponse(jsonResponse)).toBe(jsonResponse);

    const textResponse = new Response("gateway unavailable", { status: 503 });
    expect(await toTrpcApiResponse(textResponse)).toBe(textResponse);
  });

  it("detecta HTML mesmo quando o proxy anuncia application/json", async () => {
    const normalized = await toTrpcApiResponse(new Response("<html><body>SPA</body></html>", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    expect(normalized.status).toBe(502);
    await expect(normalized.json()).resolves.toMatchObject([{
      error: { json: { data: { code: "INVALID_API_RESPONSE" } } },
    }]);
  });

  it("não habilita retry para o erro de resposta inválida", () => {
    expect(shouldRetryQuery(0, new Error("INVALID_API_RESPONSE"))).toBe(false);
    expect(shouldRetryQuery(0, new Error("A prévia retornou uma página no lugar dos dados."))).toBe(false);
  });
});
