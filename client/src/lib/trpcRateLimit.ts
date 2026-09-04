const RATE_LIMIT_MESSAGE = "O serviço está temporariamente com muitas consultas. O Dashboard tentará atualizar novamente em instantes.";

export function isPlainTextRateLimitResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  return response.status === 429 && !contentType.toLowerCase().includes("application/json");
}

/**
 * O proxy pode responder 429 em texto puro antes de o tRPC alcançar o backend.
 * Esta adaptação preserva o contrato JSON do tRPC e transforma o caso em um erro
 * recuperável, em vez de tentar analisar “Too many requests” como JSON.
 */
export function toTrpcRateLimitResponse(response: Response) {
  if (!isPlainTextRateLimitResponse(response)) return response;

  return new Response(JSON.stringify([{
    error: {
      json: {
        message: RATE_LIMIT_MESSAGE,
        code: -32029,
        data: {
          code: "TOO_MANY_REQUESTS",
          httpStatus: 429,
        },
      },
    },
  }]), {
    status: 429,
    statusText: "Too Many Requests",
    headers: { "content-type": "application/json" },
  });
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/muitas consultas|too many requests|unexpected token/i.test(message)) return false;
  return failureCount < 1;
}
