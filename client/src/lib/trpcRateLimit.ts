const RATE_LIMIT_MESSAGE = "O serviço está temporariamente com muitas consultas. O Dashboard tentará atualizar novamente em instantes.";
const INVALID_API_RESPONSE_MESSAGE = "A prévia retornou uma página no lugar dos dados. Recarregue a página e tente novamente.";

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

function looksLikeHtml(body: string) {
  return /^\s*<(?:!doctype\s+html|html(?:\s|>))/i.test(body);
}

function toInvalidApiResponse(response: Response) {
  const status = response.status >= 400 ? response.status : 502;

  return new Response(JSON.stringify([{
    error: {
      json: {
        message: INVALID_API_RESPONSE_MESSAGE,
        code: -32050,
        data: {
          code: "INVALID_API_RESPONSE",
          httpStatus: status,
        },
      },
    },
  }]), {
    status,
    statusText: status === 502 ? "Bad Gateway" : response.statusText,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Impede que o parser do tRPC tente interpretar index.html como JSON quando
 * um proxy ou fallback da SPA responde no lugar da API. A resposta original
 * é preservada para JSON válido, inclusive para mutations; não há replay aqui.
 */
export async function toTrpcApiResponse(response: Response) {
  const normalized = toTrpcRateLimitResponse(response);
  const contentType = normalized.headers.get("content-type") || "";

  if (contentType.toLowerCase().includes("text/html")) {
    return toInvalidApiResponse(normalized);
  }

  // Alguns proxies informam JSON incorretamente; o clone permite validar a
  // assinatura sem consumir a resposta que o tRPC ainda precisa analisar.
  const body = await normalized.clone().text();
  return looksLikeHtml(body) ? toInvalidApiResponse(normalized) : normalized;
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/muitas consultas|too many requests|unexpected token|página no lugar dos dados|invalid_api_response/i.test(message)) return false;
  return failureCount < 1;
}
