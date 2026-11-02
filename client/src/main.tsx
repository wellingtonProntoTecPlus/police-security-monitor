import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { startLogin } from "./const";
import { shouldRetryQuery, toTrpcRateLimitResponse } from "./lib/trpcRateLimit";
import "./index.css";

const API_REQUEST_TIMEOUT_MS = 8_000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Evita picos de tráfego quando o Dashboard volta ao foco e impede que um
      // 429 textual do proxy provoque novas tentativas imediatas em cascata.
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
      retryDelay: 3_000,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;
  if (error.message === "SESSION_REPLACED_OR_EXPIRED") {
    if (window.location.pathname !== "/login") {
      window.location.href = "/login?motivo=sessao-substituida";
    }
    return;
  }

  if (!isUnauthorized) return;

  startLogin();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        return {};
      },
      async fetch(input, init) {
        const controller = new AbortController();
        const upstreamSignal = init?.signal;
        const abortForUpstream = () => controller.abort();
        if (upstreamSignal?.aborted) controller.abort();
        upstreamSignal?.addEventListener("abort", abortForUpstream, { once: true });
        const timeout = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

        try {
          const response = await globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
            signal: controller.signal,
          });
          return toTrpcRateLimitResponse(response);
        } catch (error) {
          if (controller.signal.aborted && !upstreamSignal?.aborted) {
            throw new Error("O sistema demorou para responder. Tente novamente.");
          }
          throw error;
        } finally {
          window.clearTimeout(timeout);
          upstreamSignal?.removeEventListener("abort", abortForUpstream);
        }
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
