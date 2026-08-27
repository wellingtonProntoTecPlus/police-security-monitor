/**
 * RECEPTOR DE EVENTOS CONTACT ID
 * Integrado ao servidor Express do Police Central
 * Suporta: JFL, Intelbras, Vetti, Compatec, Radioenge
 */
import net from 'net';
import { createAlarmEvent, createAlarmEventWithOpenIncident, createOccurrence, ensureSystemTechnicalAccount, finalizeIncidentWithRestoration, findIncidentForRestoration, getAlarmSystemByCapturedPanelIdentifier, getAlarmSystemByReceivedAccount, getAlarmSystemByPanelIdentifier, getClient, getContactIdDescription, getPendingCompatecBenchQuery, getPendingVettiBenchStatusQuery, isSystemInMaintenance, recordSystemKeepAlive, updateAlarmRemoteCommandDelivery } from '../db';
import { getAutomaticEventAction } from './autoFinalization';
import { hasPersistedOpenIncident } from './persistenceContract';
import { formatSafeCaptureLog, getSafeCaptureFrames, getSafeCaptureSummary, isSafeCaptureEnabled, parseJflConnectionIdentity, recordSafeCaptureFrame, shouldResolveSystemByCapturedPanelIdentifier } from './safeCapture';
import { getConfirmedJflEndpoint, refreshConfirmedJflEndpoint, rememberConfirmedJflEndpoint } from './jflKeepAliveContinuation';
import { isVettiKeepAliveFrame, parseVettiLoginIdentity, resolveVettiEventAccount, type VettiLoginIdentity } from './vettiProtocol';
import { getOperationalDeliveryPlan, resolveSystemAccount } from './systemAccount';
import { getAutomaticOccurrenceAssociation } from './automaticOccurrenceAssociation';
import { persistAutomaticOccurrence } from './automaticOccurrencePersistence';
import { formatKeepAliveInterval } from '../keepAliveTracking';
import { extractCompatecFrames, parseCompatecFrame, shouldProcessCompatecEvent } from './compatecProtocol';
import { consumeCompatecMw1StatusResponse, getCompatecMw1StatusResponseLine, rememberActiveCompatecSession, sendCompatecMw1BenchQuery, sendCompatecMw1StatusQuery } from './compatecMicrobusTransport';
import { consumeVettiBenchStatusResponse, rememberActiveVettiBenchSession, sendVettiBenchStatusQuery } from './vettiBenchTransport';
import { isConfirmedVettiBenchSystem } from '../remoteCommandContract';

// Configuração dos receptores por marca/porta
const RECEIVERS_CONFIG = [
  { brand: 'JFL', port: 9061 },
  { brand: 'JFL', port: 9191 },
  { brand: 'JFL', port: 9131 },
  { brand: 'INTELBRAS', port: 9071 },
  { brand: 'INTELBRAS', port: 9271 },
  { brand: 'VIAWEB', port: 9111 },
  { brand: 'VETTI', port: 9161 },
  { brand: 'COMPATEC', port: 9112 },
  { brand: 'RADIOENGE', port: 9035 },
  { brand: 'RADIOENGE', port: 9040 },
];

type EventCallback = (event: any) => void;

export { sendCompatecMw1BenchQuery, sendCompatecMw1StatusQuery } from './compatecMicrobusTransport';
export { sendVettiBenchStatusQuery } from './vettiBenchTransport';

let eventCallback: EventCallback | null = null;
const identifiedSystemBySocket = new WeakMap<object, { id: number; account: string; brand: string }>();
const compatecPendingBytesBySocket = new WeakMap<object, Buffer>();
const compatecAccountBySocket = new WeakMap<object, string>();
const compatecRecentEventsBySocket = new WeakMap<object, Map<string, number>>();

export function setEventCallback(cb: EventCallback) {
  eventCallback = cb;
}

function rememberSystem(socket: net.Socket, system: any, receiverPort?: number) {
  if (!system?.id) return;
  const known = { id: system.id, account: system.account, brand: system.brand };
  identifiedSystemBySocket.set(socket, known);
  if (receiverPort && system.brand?.trim().toUpperCase() === "JFL") {
    rememberConfirmedJflEndpoint(socket.remoteAddress || "", receiverPort, known);
  }
  if (isConfirmedVettiBenchSystem(system)) rememberActiveVettiBenchSession(socket, system);
}

async function recordKeepAlive(socket: net.Socket, brand: string, port: number, signal: string) {
  let known = identifiedSystemBySocket.get(socket);
  if (!known && brand === "JFL") {
    known = getConfirmedJflEndpoint(socket.remoteAddress || "", port);
    if (known) {
      identifiedSystemBySocket.set(socket, known);
      console.log(`[RECIP] JFL Keep Alive 0x40 associado à identidade JFL confirmada recentemente | Conta ${known.account}`);
    }
  }
  if (!known && isSafeCaptureEnabled(brand)) {
    const system = await getAlarmSystemByCapturedPanelIdentifier({ brand, frames: getSafeCaptureFrames(socket) });
    if (system) {
      rememberSystem(socket, system, port);
      known = identifiedSystemBySocket.get(socket);
    }
  }
  if (!known) {
    console.log(`[KEEPALIVE] ${brand} porta ${port} | ${signal} | central ainda não identificada`);
    return;
  }
  if (brand === "JFL") refreshConfirmedJflEndpoint(socket.remoteAddress || "", port);
  const measurement = await recordSystemKeepAlive(known.id);
  if (measurement) console.log(`[KEEPALIVE] ${brand} | Conta ${known.account} | ${signal} | ${formatKeepAliveInterval(measurement.intervalMs)}`);
}

function calcularChecksum(buffer: Buffer<ArrayBuffer>): Buffer<ArrayBuffer> {
  let xor = 0;
  for (let i = 0; i < buffer.length - 1; i++) {
    xor ^= buffer[i];
  }
  buffer[buffer.length - 1] = xor;
  return buffer;
}

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

function bcd(v: number): number {
  return ((Math.floor(v / 10) & 0x0F) << 4) | (v % 10 & 0x0F);
}

// Parser padrão para JFL/Radioenge (protocolo 7B)
function parseStandardEvent(hex: string, brand: string, port: number) {
  const buffer = Buffer.from(hex, 'hex');
  if (buffer.length < 24) return null;
  const cmd = buffer[3];
  if (cmd !== 0x24) return null;

  const eventoCompleto = buffer.slice(8, 12).toString();
  const qualificador = eventoCompleto.substring(0, 1);
  const evento = eventoCompleto.substring(1);

  return {
    brand,
    seq: buffer[2],
    account: buffer.slice(4, 8).toString(),
    qualifier: qualificador === '1' || qualificador === 'E' ? 'E' : 'R',
    eventCode: evento,
    partition: buffer.slice(12, 14).toString(),
    zoneUser: buffer.slice(14, 17).toString(),
    counter: Uint8Array.prototype.slice.call(buffer, 17, 21) as Buffer<ArrayBuffer>,
    receiverPort: port,
    rawData: hex,
  };
}

// Driver JFL/Radioenge
async function handleJflRadioenge(socket: net.Socket, data: Buffer, brand: string, port: number) {
  const hex = data.toString('hex').toUpperCase();
  if (data.length < 4) return;

  const seq = data[2];
  const cmd = data[3];

  switch (cmd) {
    case 0x21: { // CONEXÃO
      if (brand === "JFL") {
        const identity = parseJflConnectionIdentity(data);
        if (identity) {
          const system = await getAlarmSystemByCapturedPanelIdentifier({ brand, frames: getSafeCaptureFrames(socket) });
          if (system) {
            rememberSystem(socket, system, port);
            console.log(`[RECIP] JFL conexão identificada por ${system.capturedIdentifier.identifierType}: ${system.capturedIdentifier.identifier} | Conta ${system.account}`);
          } else {
            console.log(`[RECIP] JFL conexão sem painel cadastrado | Serial ${identity.serialNumber || "—"} | MAC ${identity.fullMac || "—"}`);
          }
        }
      }
      let resp = Buffer.from([0x7B, 0x07, seq, 0x21, 0x01, 0x05, 0x00]);
      resp = calcularChecksum(resp);
      socket.write(resp);
      break;
    }
    case 0x40: { // KEEP ALIVE
      await recordKeepAlive(socket, brand, port, "0x40");
      let resp = Buffer.from([0x7B, 0x06, seq, 0x40, 0x05, 0x00]);
      resp = calcularChecksum(resp);
      socket.write(resp);
      break;
    }
    case 0x24: { // EVENTO
      const evento = parseStandardEvent(hex, brand, port);
      if (evento) {
        await processEvent(evento, socket.remoteAddress || '', getSafeCaptureSummary(socket), getSafeCaptureFrames(socket), socket);
        // ACK
        const resp = Buffer.alloc(10);
        resp[0] = 0x7B; resp[1] = 0x0A; resp[2] = evento.seq;
        resp[3] = 0x24; resp[4] = 0x01;
        evento.counter.copy(resp, 5);
        let xor = 0;
        for (let i = 0; i < 9; i++) xor ^= resp[i];
        resp[9] = xor;
        socket.write(resp);
      }
      break;
    }
  }
}

// Driver Intelbras
async function handleIntelbras(socket: net.Socket, data: Buffer, port: number) {
  if (data.length >= 2 && data[1] === 0x80) {
    // Pedido de data/hora
    const agora = new Date();
    const resp = Buffer.alloc(10);
    resp[0] = 0x08; resp[1] = 0x80;
    resp[2] = bcd(agora.getFullYear() % 100);
    resp[3] = bcd(agora.getMonth() + 1);
    resp[4] = bcd(agora.getDate());
    resp[5] = agora.getDay();
    resp[6] = bcd(agora.getHours());
    resp[7] = bcd(agora.getMinutes());
    resp[8] = bcd(agora.getSeconds());
    let chk = 0;
    for (let i = 0; i < 9; i++) chk ^= resp[i];
    resp[9] = chk ^ 0xFF;
    socket.write(resp);
    return;
  }

  if (data.length >= 19 && data[1] === 0xB0) {
    // Evento Contact ID
    const cidBcd = (v: number) => v === 0x0A ? '0' : v.toString();
    const account = cidBcd(data[3]) + cidBcd(data[4]) + cidBcd(data[5]) + cidBcd(data[6]);
    const qualificador = data[9];
    const evento = cidBcd(data[10]) + cidBcd(data[11]) + cidBcd(data[12]);
    const particao = cidBcd(data[13]) + cidBcd(data[14]);
    const zona = cidBcd(data[15]) + cidBcd(data[16]) + cidBcd(data[17]);

    const eventoObj = {
      brand: 'INTELBRAS',
      account,
      qualifier: qualificador === 1 ? 'E' : 'R',
      eventCode: evento,
      partition: particao,
      zoneUser: zona,
      receiverPort: port,
      rawData: data.toString('hex').toUpperCase(),
    };

    await processEvent(eventoObj, socket.remoteAddress || '', getSafeCaptureSummary(socket), getSafeCaptureFrames(socket), socket);
    socket.write(Buffer.from([0xFE]));
    return;
  }

  if (data.length >= 51 && data[1] === 0x95) {
    socket.write(Buffer.from([0xFE]));
    return;
  }
}

// Driver Vetti
const vettiLoginIdentityBySocket = new WeakMap<object, VettiLoginIdentity>();

async function handleVetti(socket: net.Socket, data: Buffer, port: number) {
  if (!Buffer.isBuffer(data) || data.length === 0) return;
  const completedStatusQuery = consumeVettiBenchStatusResponse(socket, data);
  if (completedStatusQuery) {
    await updateAlarmRemoteCommandDelivery(completedStatusQuery.commandId, { status: "responded", responsePayload: completedStatusQuery.response, executedAt: new Date() });
    console.log(`[VSEC] VETTI consulta de status confirmada pela central | comando ${completedStatusQuery.commandId} | ${completedStatusQuery.response}`);
  }
  if (isVettiKeepAliveFrame(data)) {
    await recordKeepAlive(socket, "VETTI", port, "0xF7");
    return;
  }
  if (data.length < 3) return;

  const fr = data.readUInt8(2);
  const cidDigit = (byte: number) => byte === 0x0A ? '0' : byte.toString(16).toUpperCase();

  switch (fr) {
    case 0xC0: // LOGIN
      {
        const loginIdentity = parseVettiLoginIdentity(data);
        if (loginIdentity) {
          vettiLoginIdentityBySocket.set(socket, loginIdentity);
          const system = await getAlarmSystemByPanelIdentifier(loginIdentity.macSuffix, "mac", "VETTI", port);
          if (system) {
            rememberSystem(socket, system);
            if (isConfirmedVettiBenchSystem(system)) {
              const pendingQuery = await getPendingVettiBenchStatusQuery(system.id);
              if (pendingQuery) {
                const dispatched = sendVettiBenchStatusQuery({ alarmSystemId: system.id, commandId: pendingQuery.id });
                if (dispatched.sent) {
                  await updateAlarmRemoteCommandDelivery(pendingQuery.id, { status: "sent", responsePayload: "Consulta VSec 0x14 enviada no contato autenticado da central; aguardando resposta 0x94.", executedAt: new Date() });
                  console.log(`[VSEC] VETTI consulta pendente enviada no contato autenticado | comando ${pendingQuery.id} | Conta ${system.account}`);
                }
              }
            }
          }
          console.log(`[RECIP] VETTI login | Conta ${loginIdentity.account} | MAC ${loginIdentity.macSuffix}`);
        }
      }
      socket.write(Buffer.from([0x02, 0x04, 0xC0, 0x80, 0xCF]));
      break;
    case 0xC2: // LOGIN 2
      socket.write(Buffer.from([0x02, 0x04, 0xC2, 0x80, 0xE5, 0x04]));
      break;
    case 0xAB: // KEEP ALIVE
      await recordKeepAlive(socket, "VETTI", port, "0xAB");
      socket.write(Buffer.from([0x02, 0x04, 0xAB, 0x80, 0xAD]));
      break;
    case 0xC1: { // EVENTO CONTACT-ID
      if (data.length < 20) {
        socket.write(Buffer.from([0x02, 0x04, 0xC1, 0x80, 0xDA]));
        break;
      }
      const conta = resolveVettiEventAccount(data, vettiLoginIdentityBySocket.get(socket));
      const qualificador = cidDigit(data[10]);
      const evento = cidDigit(data[11]) + cidDigit(data[12]) + cidDigit(data[13]);
      const particao = cidDigit(data[14]) + cidDigit(data[15]);
      const zona = cidDigit(data[16]) + cidDigit(data[17]) + cidDigit(data[18]);

      const eventoObj = {
        brand: 'VETTI',
        account: conta,
        qualifier: qualificador === '1' || qualificador === 'E' ? 'E' : 'R',
        eventCode: evento,
        partition: particao,
        zoneUser: zona,
        receiverPort: port,
        rawData: data.toString('hex').toUpperCase(),
      };

      await processEvent(eventoObj, socket.remoteAddress || '', getSafeCaptureSummary(socket), getSafeCaptureFrames(socket), socket);
      socket.write(Buffer.from([0x02, 0x04, 0xC1, 0x80, 0xDA]));
      break;
    }
  }
}

// Driver Compatec. O protocolo universal possui mensagens de tamanho fixo que
// podem chegar juntas ou fracionadas em um mesmo stream TCP.
async function handleCompatec(socket: net.Socket, data: Buffer, port: number) {
  const microbusResponse = getCompatecMw1StatusResponseLine(data);
  if (microbusResponse) {
    const completed = consumeCompatecMw1StatusResponse(socket, microbusResponse);
    if (completed) {
      await updateAlarmRemoteCommandDelivery(completed.commandId, { status: "responded", responsePayload: microbusResponse, executedAt: new Date() });
      console.log(`[MICROBUS] COMPATEC consulta confirmada pela central | comando ${completed.commandId} | ${microbusResponse.replace(/\r?\n/g, "")}`);
    }
  }
  const pending = compatecPendingBytesBySocket.get(socket) || Buffer.alloc(0);
  const { frames, remainder } = extractCompatecFrames(Buffer.concat([pending, data]));
  compatecPendingBytesBySocket.set(socket, remainder);

  for (const frame of frames) {
    const parsed = parseCompatecFrame(frame);
    if (!parsed) continue;

    if (parsed.kind === "identity") {
      const system = await getAlarmSystemByCapturedPanelIdentifier({ brand: "COMPATEC", frames: getSafeCaptureFrames(socket) });
      if (system) {
        rememberSystem(socket, system, port);
        if (system.remoteCommandLabEnabled) {
          rememberActiveCompatecSession(socket, system);
          const pendingQuery = await getPendingCompatecBenchQuery(system.id);
          if (pendingQuery) {
            const dispatched = sendCompatecMw1BenchQuery({ alarmSystemId: system.id, commandId: pendingQuery.id, payload: pendingQuery.commandPayload });
            if (dispatched.sent) {
              await updateAlarmRemoteCommandDelivery(pendingQuery.id, {
                status: "sent",
                responsePayload: `Comando ${pendingQuery.commandPayload.replace(/\r\n/g, "")} enviado na próxima conexão autenticada da central; aguardando resposta.`,
                executedAt: new Date(),
              });
              console.log(`[MICROBUS] COMPATEC comando pendente enviado no contato autenticado | comando ${pendingQuery.id} | Conta ${system.account}`);
            }
          }
        }
        console.log(`[RECIP] COMPATEC identificada por ${system.capturedIdentifier.identifierType}: ${system.capturedIdentifier.identifier} | Conta ${system.account}`);
      } else {
        console.log(`[RECIP] COMPATEC identificação sem painel cadastrado | ID ${parsed.identifier}`);
      }
      socket.write('+');
      continue;
    }

    if (parsed.kind === "account") {
      compatecAccountBySocket.set(socket, parsed.account);
      socket.write('@');
      continue;
    }

    if (parsed.kind === "keep_alive") {
      await recordKeepAlive(socket, "COMPATEC", port, "@");
      socket.write('@');
      continue;
    }

    const announcedAccount = compatecAccountBySocket.get(socket);
    if (announcedAccount && announcedAccount !== parsed.account) {
      console.warn(`[RECIP] COMPATEC conta do evento ${parsed.account} diverge da conta anunciada ${announcedAccount}; o vínculo permanece físico.`);
    }

    const recentEvents = compatecRecentEventsBySocket.get(socket) || new Map<string, number>();
    compatecRecentEventsBySocket.set(socket, recentEvents);
    if (!shouldProcessCompatecEvent(recentEvents, parsed.rawData)) {
      console.log(`[RECIP] COMPATEC retransmissão confirmada sem duplicar evento | Conta ${parsed.account} | contador ${parsed.packetCounter}`);
      socket.write('@');
      continue;
    }

    const accepted = await processEvent({
      brand: 'COMPATEC',
      account: parsed.account,
      qualifier: parsed.qualifier === '1' || parsed.qualifier === 'E' ? 'E' : 'R',
      eventCode: parsed.eventCode,
      partition: parsed.partition,
      zoneUser: parsed.zoneUser,
      receiverPort: port,
      rawData: parsed.rawData,
    }, socket.remoteAddress || '', getSafeCaptureSummary(socket), getSafeCaptureFrames(socket), socket);

    // ACK @ somente após persistência. Sem ACK, a central retransmite o pacote.
    if (accepted) socket.write('@');
    else recentEvents.delete(parsed.rawData);
  }
}

// Processa e salva o evento
async function processEvent(evento: any, remoteIp: string, captureSummary = "", captureFrames = [] as ReturnType<typeof getSafeCaptureFrames>, socket?: net.Socket): Promise<boolean> {
  try {
    // Buscar descrição do código
    let description = `Evento ${evento.eventCode}`;
    let priority = 'medium';
    let codeInfo: any = null;
    try {
      codeInfo = await getContactIdDescription(evento.eventCode, evento.qualifier, evento.brand);
      if (codeInfo) {
        description = codeInfo.description || description;
        priority = codeInfo.priority || priority;
      } else {
        description = `EVENTO NÃO CADASTRADO (${evento.qualifier || ''}${evento.eventCode})`;
      }
    } catch (e: any) {
      description = `EVENTO NÃO CADASTRADO (${evento.qualifier || ''}${evento.eventCode})`;
      console.warn(`[RECIP] Código não cadastrado ${evento.eventCode}: ${e.message}`);
    }

    // Nenhuma central IP pode ser associada somente pela conta. MAC, IMEI ou,
    // exclusivamente para ViaWeb, ID ISEP precisam estar confirmados no pacote
    // antes de qualquer vínculo operacional entre parceiras.
    const captureMode = shouldResolveSystemByCapturedPanelIdentifier(evento.brand);
    let system: any = null;
    let clientName = `CONTA NÃO CADASTRADA (${evento.account})`;
    if (captureMode) {
      system = await getAlarmSystemByCapturedPanelIdentifier({ brand: evento.brand, frames: captureFrames });
      if (system) {
        clientName = `Sistema ${system.account}`;
        console.log(`[RECIP] ${evento.brand} identificado por ${system.capturedIdentifier.identifierType}: ${system.capturedIdentifier.identifier}`);
      }
    } else {
      try {
        system = await getAlarmSystemByReceivedAccount(evento.account, evento.brand, evento.receiverPort);
        if (system) {
          clientName = `Sistema ${system.account}`;
        }
      } catch (e: any) {
        console.warn(`[RECIP] Não encontrou sistema para conta ${evento.account}: ${e.message}`);
      }
    }

    // JFL transmite o Keep Alive 0x40 sem conta. Depois de identificar a conta
    // em um evento da mesma conexão, os próximos sinais usam esse vínculo seguro.
    if (system && socket) rememberSystem(socket, system, evento.receiverPort);

    const accountResolution = resolveSystemAccount(evento.account, Boolean(system));
    const receivedAccount = accountResolution.receivedAccount;
    const effectiveAccount = accountResolution.account;
    if (accountResolution.isSystemAccount) {
      await ensureSystemTechnicalAccount();
      clientName = "CONTA DO SISTEMA (0000)";
      const captureDescription = captureMode ? "CENTRAL SEM IDENTIFICADOR ÚNICO CONFIRMADO — MAC/IMEI/ID ISEP pendente" : "CENTRAL NÃO CADASTRADA";
      description = `${captureDescription}${receivedAccount ? ` — conta recebida ${receivedAccount}` : " — sem conta recebida"}: ${description}`;
    }

    const automaticAction = getAutomaticEventAction(evento.qualifier, codeInfo);
    const systemInMaintenance = isSystemInMaintenance(system);
    const maintenanceMessage = "Sistema em manutenção";
    if (systemInMaintenance) {
      description = `${maintenanceMessage} — ${description}`;
    }
    const deliveryPlan = getOperationalDeliveryPlan({
      isSystemAccount: accountResolution.isSystemAccount,
      automaticAction,
      systemInMaintenance,
    });
    const shouldOpenAttendance = deliveryPlan.shouldOpenAttendance;
    const automaticFinalizationMessage = accountResolution.isSystemAccount
      ? "Registrada na Conta do Sistema (0000) para conferência no relatório"
      : systemInMaintenance ? maintenanceMessage : "Finalizada automaticamente";

    // Salvar o evento e a ocorrência aberta juntos antes de emitir ao dashboard.
    // Nunca use Date.now() como ID de reserva: isso criaria um card temporário que
    // não poderia ser reconstruído depois de reiniciar ou trocar de operador.
    let savedEvent: any;
    let incident: { id: number } | null = null;
    try {
      const eventData = {
        alarmSystemId: system?.id || null,
        account: effectiveAccount,
        brand: evento.brand,
        qualifier: evento.qualifier,
        eventCode: evento.eventCode,
        partition: evento.partition,
        zoneUser: evento.zoneUser,
        description,
        priority: priority as any,
        receiverPort: evento.receiverPort,
        remoteIp: remoteIp.replace('::ffff:', ''),
        rawData: `${evento.rawData || ""}${receivedAccount ? `\nConta recebida: ${receivedAccount}` : "\nConta recebida: ausente"}${system?.capturedIdentifier ? `\nIdentificado por ${system.capturedIdentifier.identifierType}: ${system.capturedIdentifier.identifier}` : ""}${captureSummary ? `\n${captureSummary}` : ""}`,
        autoFinalized: !shouldOpenAttendance,
        autoFinalizationReason: shouldOpenAttendance ? null : automaticFinalizationMessage,
      };
      if (shouldOpenAttendance) {
        const persisted = await createAlarmEventWithOpenIncident({
          event: eventData,
          incident: {
            alarmSystemId: system?.id || null,
            clientId: system?.clientId || null,
            status: "waiting",
            priority: priority as "critical" | "high" | "medium" | "low",
            notes: "Evento recebido e aguardando atendimento",
          },
        });
        savedEvent = { id: persisted.eventId };
        incident = { id: persisted.incidentId };
      } else {
        savedEvent = await createAlarmEvent(eventData);
      }
    } catch (e: any) {
      const databaseError = e?.cause?.message || e?.cause?.sqlMessage || e?.message;
      console.error(`[RECIP] Evento não emitido: falha ao persistir evento/incidente: ${databaseError}`);
      return false;
    }

    if (deliveryPlan.shouldPersistReport) {
      const client = system?.clientId ? await getClient(system.clientId) : undefined;
      await persistAutomaticOccurrence({
        create: createOccurrence,
        system,
        client,
        occurrence: {
          account: effectiveAccount,
          eventCode: evento.eventCode,
          qualifier: evento.qualifier,
          partition: evento.partition,
          zoneUser: evento.zoneUser,
          description,
          priority,
          brand: evento.brand,
          operatorName: "Sistema",
          observations: automaticFinalizationMessage,
          logs: JSON.stringify([`[${new Date().toLocaleTimeString("pt-BR")}] ${automaticFinalizationMessage}`]),
          attendingTimeMs: 0,
          eventReceivedAt: new Date(),
        },
      });
      console.log(`[RECIP] ${evento.brand} | Conta ${effectiveAccount} | ${evento.qualifier}${evento.eventCode} | ${automaticFinalizationMessage}`);
      return true;
    }

    if (!hasPersistedOpenIncident(savedEvent?.id, incident?.id)) {
      console.error("[RECIP] Evento não emitido: ocorrência aberta sem persistência confirmada");
      return false;
    }

    if (automaticAction === "try_restoration") {
      const pending = await findIncidentForRestoration({ alarmSystemId: system?.id, account: effectiveAccount, restorationCode: evento.eventCode });
      if (pending) {
        await finalizeIncidentWithRestoration(pending);
        if (eventCallback) {
          eventCallback({
            id: savedEvent.id,
            kind: "restoration_closed",
            originalEventId: pending.event.id,
            account: effectiveAccount,
            brand: evento.brand,
            qualifier: evento.qualifier,
            eventCode: evento.eventCode,
            description: "Finalizado com a restauração do evento",
            priority,
            receiverPort: evento.receiverPort,
            timestamp: new Date().toISOString(),
          });
        }
        console.log(`[RECIP] ${evento.brand} | Conta ${effectiveAccount} | ${evento.qualifier}${evento.eventCode} | Finalizado com a restauração do evento`);
        return true;
      }
    }

    // Emitir para o dashboard via callback
    if (deliveryPlan.shouldEmitDashboard && eventCallback) {
      eventCallback({
        id: savedEvent.id,
        ...evento,
        account: effectiveAccount,
        description,
        priority,
        clientName: system ? undefined : clientName,
        clientId: system?.clientId,
        alarmSystemId: system?.id,
        incidentId: incident?.id,
        remoteIp: remoteIp.replace('::ffff:', ''),
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[RECIP] ${evento.brand} | Conta ${effectiveAccount} | ${evento.qualifier}${evento.eventCode} | ${description}`);
    return true;
  } catch (err: any) {
    console.error('[RECIP] Erro ao processar evento:', err.message);
    return false;
  }
}

// Inicia todos os receptores TCP
export function startReceivers() {
  console.log('[RECIP] Iniciando receptores de alarme...');

  RECEIVERS_CONFIG.forEach(({ brand, port }) => {
    try {
      const server = net.createServer((socket) => {
        socket.setTimeout(0);
        console.log(`[RECIP] Nova conexão ${brand} na porta ${port} de ${socket.remoteAddress}`);

        socket.on('data', async (data) => {
          try {
            if (isSafeCaptureEnabled(brand)) {
              const frame = recordSafeCaptureFrame(socket, {
                brand,
                receiverPort: port,
                remoteIp: socket.remoteAddress || "",
                payload: data,
              });
              if (frame) console.log(formatSafeCaptureLog(frame));
            }
            if (brand === 'VETTI') {
              await handleVetti(socket, data, port);
            } else if (brand === 'INTELBRAS') {
              await handleIntelbras(socket, data, port);
            } else if (brand === 'COMPATEC') {
              await handleCompatec(socket, data, port);
            } else {
              // JFL, RADIOENGE - protocolo padrão 7B
              await handleJflRadioenge(socket, data, brand, port);
            }
          } catch (err: any) {
            console.error(`[RECIP] Erro no driver ${brand}:`, err.message);
          }
        });

        socket.on('error', (err) => {
          console.log(`[RECIP] Erro socket ${brand}:`, err.message);
        });

        socket.on('close', () => {
          console.log(`[RECIP] Conexão encerrada ${brand} porta ${port}`);
        });
      });

      server.listen(port, () => {
        console.log(`[RECIP] ✓ Porta ${port} (${brand})`);
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`[RECIP] Porta ${port} (${brand}) já em uso - ignorando`);
        } else {
          console.error(`[RECIP] Erro ao iniciar ${brand} porta ${port}:`, err.message);
        }
      });
    } catch (err: any) {
      console.error(`[RECIP] Falha ao criar servidor ${brand} porta ${port}:`, err.message);
    }
  });
}
