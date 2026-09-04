import net from "net";

export type ViawebEvent = {
  operationId: string;
  isep: string;
  requiresAuthorization: boolean;
  internalEventType: number | null;
  qualifier: "E" | "R";
  eventCode: string;
  partition: string;
  zoneUser: string;
  receivedAccount: string;
  remoteIp: string;
  rawData: string;
};

type ViawebIntegrationOptions = {
  onEvent: (event: ViawebEvent) => Promise<{ persisted: boolean; authorizeIsep: boolean }>;
};

const VIAWEB_SERVER_PORT = 9111;
const VIAWEB_INTEGRATION_PORT = 2700;
const MAX_RECONNECT_DELAY_MS = 30_000;

function isValidHex(value: unknown, length: number) {
  return typeof value === "string" && new RegExp(`^[0-9A-F]{${length}}$`).test(value.toUpperCase());
}

function normalizeHex(value: unknown) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeEventNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue >= 0 ? String(numberValue) : "0";
}

function safeRemoteIp(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[0-9A-Fa-f:.]{1,45}$/.test(candidate) ? candidate : "127.0.0.1";
}

/**
 * O VIAWEB Receiver informa Contact ID em QEEE hexadecimal. O primeiro nibble
 * representa o qualifier: 1 para evento e 3 para restauração. O Police Central
 * mantém qualifier e código em campos separados para compartilhar a tabela
 * Contact ID entre fabricantes.
 */
export function parseViawebEvent(operation: unknown): ViawebEvent | null {
  if (!operation || typeof operation !== "object") return null;
  const value = operation as Record<string, unknown>;
  if (value.acao !== "evento") return null;

  const operationId = typeof value.id === "string" || typeof value.id === "number" ? String(value.id) : "";
  const isep = normalizeHex(value.isep);
  const contactId = normalizeHex(value.codigoEvento);
  if (!operationId || !isValidHex(isep, 4) || !isValidHex(contactId, 4)) return null;

  const qualifier = contactId[0] === "1" ? "E" : contactId[0] === "3" ? "R" : null;
  if (!qualifier) return null;

  const internalEventType = Number.isInteger(Number(value.eventoInterno)) ? Number(value.eventoInterno) : null;
  return {
    operationId,
    isep,
    requiresAuthorization: internalEventType === 3,
    internalEventType,
    qualifier,
    eventCode: contactId.slice(1),
    partition: normalizeEventNumber(value.particao),
    zoneUser: normalizeEventNumber(value.zonaUsuario),
    receivedAccount: isValidHex(normalizeHex(value.contaCliente), 4) ? normalizeHex(value.contaCliente) : "",
    remoteIp: safeRemoteIp(value.ip),
    rawData: JSON.stringify({
      acao: "evento",
      id: operationId,
      codigoEvento: contactId,
      particao: value.particao ?? null,
      zonaUsuario: value.zonaUsuario ?? null,
      contaCliente: value.contaCliente ?? null,
      isep,
      numSerie: value.numSerie ?? null,
      modelo: value.modelo ?? null,
      meio: value.meio ?? null,
      ip: value.ip ?? null,
      eventoInterno: value.eventoInterno ?? null,
    }),
  };
}

function extractJsonMessages(buffer: string) {
  const messages: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < buffer.length; index += 1) {
    const character = buffer[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        messages.push(buffer.slice(start, index + 1));
        start = -1;
      }
    }
  }

  const remainder = depth > 0 && start >= 0 ? buffer.slice(start) : "";
  return { messages, remainder };
}

function canUsePlaintextLocalIntegration() {
  const enabled = process.env.VIAWEB_INTEGRATION_ENABLED === "true";
  const host = (process.env.VIAWEB_INTEGRATION_HOST || "127.0.0.1").trim().toLowerCase();
  return enabled && ["127.0.0.1", "::1", "localhost"].includes(host);
}

function getIntegrationHost() {
  return (process.env.VIAWEB_INTEGRATION_HOST || "127.0.0.1").trim();
}

function getIntegrationPort() {
  const parsed = Number(process.env.VIAWEB_INTEGRATION_PORT || VIAWEB_INTEGRATION_PORT);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : VIAWEB_INTEGRATION_PORT;
}

function integrationHandshake() {
  return {
    ts: Date.now(),
    oper: [
      {
        id: "policecentral-ident-viaweb-v1",
        acao: "ident",
        nome: "PoliceCentral ViaWeb",
        serializado: 1,
        retransmite: 60,
        limite: 20_000,
        limiteOnline: -1,
        versaoProto: 1,
      },
      {
        id: "policecentral-config-viaweb-v1",
        acao: "salvarVIAWEB",
        operacao: 2,
        porta: VIAWEB_SERVER_PORT,
        monitoramento: 1,
        servidorDependente: 0,
        minFaixaIsep: "0000",
        maxFaixaIsep: "FFFF",
        descarteEventos: -1,
        filtroEvento: 255,
        filtroRestauro: 255,
      },
    ],
  };
}

export function buildIsepAuthorizationOperation(event: ViawebEvent) {
  if (!event.requiresAuthorization) return null;
  return {
    id: `policecentral-authorize-${event.operationId}`,
    acao: "salvarCliente",
    operacao: 2,
    porta: VIAWEB_SERVER_PORT,
    idISEP: event.isep,
    autorizacao: 1,
  };
}

/**
 * Conecta-se somente ao VIAWEB Receiver local. A criptografia é dispensada
 * exclusivamente para loopback, conforme modo documentado pelo fabricante;
 * qualquer host externo mantém a integração desativada até haver credenciais
 * AES-256-CBC entregues por canal seguro.
 */
export function startViawebEventIntegration(options: ViawebIntegrationOptions) {
  if (!canUsePlaintextLocalIntegration()) {
    console.log("[VIAWEB] Integração oficial local desativada; a porta 9111 permanece reservada ao VIAWEB Receiver.");
    return;
  }

  const host = getIntegrationHost();
  const port = getIntegrationPort();
  let reconnectDelayMs = 1_000;
  let reconnectTimer: NodeJS.Timeout | undefined;
  let stopped = false;

  const scheduleReconnect = (reason: string) => {
    if (stopped || reconnectTimer) return;
    const delay = reconnectDelayMs;
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    console.warn(`[VIAWEB] Integração local indisponível (${reason}); nova tentativa em ${Math.round(delay / 1000)}s.`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      connect();
    }, delay);
  };

  const connect = () => {
    if (stopped) return;
    let textRemainder = "";
    const socket = net.createConnection({ host, port });

    socket.on("connect", () => {
      reconnectDelayMs = 1_000;
      socket.write(JSON.stringify(integrationHandshake()));
      console.log(`[VIAWEB] Conectado ao VIAWEB Receiver local em ${host}:${port}; aguardando eventos.`);
    });

    socket.on("data", async (data) => {
      const extracted = extractJsonMessages(textRemainder + data.toString("utf8"));
      textRemainder = extracted.remainder;

      for (const rawMessage of extracted.messages) {
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(rawMessage) as Record<string, unknown>;
        } catch {
          console.warn("[VIAWEB] Mensagem JSON inválida recebida do Receiver local; aguardando próximo quadro.");
          continue;
        }

        const responses: Array<{ id: string }> = [];
        const operationsToSend: Array<Record<string, unknown>> = [];
        const operations = Array.isArray(message.oper) ? message.oper : [];
        for (const operation of operations) {
          const event = parseViawebEvent(operation);
          if (event) {
            try {
              console.log(`[VIAWEB] Evento recebido do ISEP ${event.isep}: ${event.qualifier}${event.eventCode}${event.requiresAuthorization ? " (solicita autorização)" : ""}.`);
              const result = await options.onEvent(event);
              if (result.persisted) responses.push({ id: event.operationId });
              else console.warn(`[VIAWEB] Evento ${event.operationId} do ISEP ${event.isep} não confirmado; o Receiver poderá retransmiti-lo.`);
              if (result.persisted && result.authorizeIsep && event.requiresAuthorization) {
                const authorization = buildIsepAuthorizationOperation(event);
                if (authorization) operationsToSend.push(authorization);
                console.log(`[VIAWEB] Solicitação de autorização do ISEP ${event.isep} confirmada após persistência do evento interno.`);
              }
            } catch (error: any) {
              console.error(`[VIAWEB] Falha ao processar evento ${event.operationId} do ISEP ${event.isep}: ${error?.message || "erro desconhecido"}`);
            }
            continue;
          }

          const unknown = operation as Record<string, unknown>;
          if ((typeof unknown.id === "string" || typeof unknown.id === "number") && unknown.acao === "ping") {
            responses.push({ id: String(unknown.id) });
          }
        }

        if ((responses.length > 0 || operationsToSend.length > 0) && !socket.destroyed) {
          socket.write(JSON.stringify({
            ...(responses.length > 0 ? { resp: responses } : {}),
            ...(operationsToSend.length > 0 ? { oper: operationsToSend } : {}),
          }));
        }

        const receivedResponses = Array.isArray(message.resp) ? message.resp as Array<Record<string, unknown>> : [];
        for (const response of receivedResponses) {
          if (response.erro) console.warn(`[VIAWEB] Receiver recusou operação ${String(response.id ?? "sem ID")}: ${String(response.descricao ?? response.erro)}`);
        }
      }
    });

    socket.on("error", (error) => scheduleReconnect(error.message));
    socket.on("close", () => scheduleReconnect("conexão encerrada"));
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}

export const __testables = {
  extractJsonMessages,
  integrationHandshake,
};
