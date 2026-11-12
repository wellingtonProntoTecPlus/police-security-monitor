/**
 * RECEPTOR DE EVENTOS CONTACT ID
 * Integrado ao servidor Express do Police Central
 * Suporta: JFL, Intelbras, Vetti, Compatec, Radioenge
 */
import net from 'net';
import { createAlarmEvent, createAlarmEventWithOpenIncident, createAlarmScheduleComplianceAlert, createConfirmedVettiDisarmEventWithOpenIncident, createOccurrence, ensureSystemTechnicalAccount, finalizeIncidentWithRestoration, findIncidentForRestoration, findOpenTrackedIncident, findRadioengeKeepAliveObservationForRestoration, getAlarmRemoteCredentialForTransport, getAlarmRemoteCredentialTechnicalUserCode, getAlarmScheduleContext, getAlarmSystem, getAlarmSystemByCapturedPanelIdentifier, getAlarmSystemByReceivedAccount, getAlarmSystemByPanelIdentifier, getClientOperationalProfile, getContactIdDescription, getOperationalAlarmSystem, getPendingCompatecBenchQuery, getPendingVettiBenchStatusQuery, isSystemInMaintenance, promoteExpiredRadioengeKeepAliveObservations, recordRemoteCommandConfirmation, recordSystemKeepAlive, resolveAlarmScheduleAlerts, updateAlarmRemoteCommandDelivery } from '../db';
import { getAutomaticEventAction } from './autoFinalization';
import { hasPersistedOpenIncident } from './persistenceContract';
import { formatSafeCaptureLog, getSafeCaptureFrames, getSafeCaptureSummary, isSafeCaptureEnabled, parseJflConnectionIdentity, recordSafeCaptureFrame, shouldResolveSystemByCapturedPanelIdentifier } from './safeCapture';
import { forgetConfirmedJflEndpoint, getConfirmedJflEndpoint, refreshConfirmedJflEndpoint, rememberConfirmedJflEndpoint } from './jflKeepAliveContinuation';
import { buildJflActive8wConnectionAcknowledgement, buildJflStatusRequest, isJflActive8wV8Connection, isJflActive8wV8StatusReply } from './jflActive8wProtocol';
import { forgetConfirmedIntelbrasEndpoint, rememberConfirmedIntelbrasEndpoint } from './intelbrasIsecnetContinuation';
import { clearIntelbrasSession, consumeIntelbrasPhysicalResponse, rememberActiveIntelbrasSession, sendIntelbrasPhysicalCommand } from './intelbrasPhysicalTransport';
import { isVettiKeepAliveFrame, parseVettiLoginIdentity, resolveVettiEventAccount, type VettiLoginIdentity } from './vettiProtocol';
import { getOperationalDeliveryPlan, resolveSystemAccount } from './systemAccount';
import { getAutomaticOccurrenceAssociation } from './automaticOccurrenceAssociation';
import { persistAutomaticOccurrence } from './automaticOccurrencePersistence';
import { formatKeepAliveInterval } from '../keepAliveTracking';
import { extractIntelbrasIsecnetFrames, isIntelbrasIsecnetHeartbeat, parseIntelbrasIsecnetEvent, parseIntelbrasIsecnetIdentification } from './intelbrasIsecnetProtocol';
import { extractCompatecFrames, parseCompatecFrame, shouldProcessCompatecEvent } from './compatecProtocol';
import { COMPATEC_MW1_ARM_ALL, COMPATEC_MW1_DISARM_ALL, consumeCompatecMw1StatusResponse, getCompatecMw1StatusResponseLineForSocket, isCompatecArmDisarmConfirmation, isCompatecArmWithZonesCommand, isCompatecPhysicalZoneCommand, isCompatecPhysicalZoneConfirmation, rememberActiveCompatecSession, sendCompatecMw1ArmAfterZones, sendCompatecMw1PhysicalCommand, sendCompatecMw1StatusQuery } from './compatecMicrobusTransport';
import { clearPendingVettiBenchCommand, consumeVettiBenchDisarmResponse, consumeVettiBenchRemoteLoginResponse, consumeVettiBenchStatusResponse, doesVettiPostStatusConfirmDisarm, extractVettiFrames, parseVerifiedVettiStatusResponse, rememberActiveVettiBenchSession, sendVettiBenchDisarm, sendVettiBenchRemoteLogin, sendVettiBenchStatusQuery } from './vettiBenchTransport';
import { isConfirmedVettiBenchSystem } from '../remoteCommandContract';
import { getContactIdArgumentContext } from '@shared/contactIdArgumentContext';
import { startViawebEventIntegration } from './viawebIntegration';
import { getRadioengeKeepAliveObservationUntil, isRadioengeKeepAliveFailure, isRadioengeKeepAliveRestoration } from './radioengeKeepAlivePolicy';
import { classifyContactIdOperationalEvent, evaluateAlarmSchedule, getAlarmScheduleEventAction } from '../alarmSchedulePolicy';
import { getEffectiveClientMonitoringStatus } from '@shared/clientMonitoringStatus';
import { dispatchAlarmRemoteCommand } from '../db';
import { resetCompatecZoneSelectionsOnDisarm } from '../db';
import { onAlarmSystemsRetired } from '../_core/alarmSystemRuntime';

// Configuração dos receptores por marca/porta
const RECEIVERS_CONFIG = [
  { brand: 'JFL', port: 9061 },
  { brand: 'JFL', port: 9191 },
  { brand: 'JFL', port: 9131 },
  { brand: 'INTELBRAS', port: 9071 },
  { brand: 'INTELBRAS', port: 9271 },
  { brand: 'VETTI', port: 9161 },
  { brand: 'COMPATEC', port: 9112 },
  { brand: 'RADIOENGE', port: 9035 },
  { brand: 'RADIOENGE', port: 9040 },
];

type EventCallback = (event: any) => void;

export { isCompatecSessionActive, sendCompatecMw1PhysicalCommand, sendCompatecMw1StatusQuery } from './compatecMicrobusTransport';
export { sendVettiBenchStatusQuery } from './vettiBenchTransport';
export { isIntelbrasSessionActive, sendIntelbrasPhysicalCommand } from './intelbrasPhysicalTransport';

let eventCallback: EventCallback | null = null;
const identifiedSystemBySocket = new Map<net.Socket, { id: number; account: string; brand: string }>();
const compatecPendingBytesBySocket = new WeakMap<object, Buffer>();
const intelbrasPendingBytesBySocket = new WeakMap<object, Buffer>();
const compatecAccountBySocket = new WeakMap<object, string>();
const compatecRecentEventsBySocket = new WeakMap<object, Map<string, number>>();
const radioengeObservationTimers = new Map<number, ReturnType<typeof setTimeout>>();

onAlarmSystemsRetired((systemIds) => {
  const retired = new Set(systemIds);
  for (const [socket, known] of Array.from(identifiedSystemBySocket.entries())) {
    if (!retired.has(known.id)) continue;
    identifiedSystemBySocket.delete(socket);
    compatecPendingBytesBySocket.delete(socket);
    intelbrasPendingBytesBySocket.delete(socket);
    compatecAccountBySocket.delete(socket);
    clearIntelbrasSession(socket);
    const timers = vettiCommandTimeoutsBySocket.get(socket);
    if (timers) for (const commandId of Array.from(timers.keys())) clearVettiCommandTimeout(socket, commandId);
  }
});

export function setEventCallback(cb: EventCallback) {
  eventCallback = cb;
}

function cancelRadioengeObservationTimer(incidentId: number) {
  const timer = radioengeObservationTimers.get(incidentId);
  if (timer) clearTimeout(timer);
  radioengeObservationTimers.delete(incidentId);
}

function scheduleRadioengeObservationEscalation(input: { incidentId: number; observationUntil: Date }) {
  cancelRadioengeObservationTimer(input.incidentId);
  const delay = Math.max(0, input.observationUntil.getTime() - Date.now());
  const timer = setTimeout(async () => {
    radioengeObservationTimers.delete(input.incidentId);
    try {
      const escalated = await promoteExpiredRadioengeKeepAliveObservations(new Date());
      for (const item of escalated) {
        eventCallback?.({
          kind: "radioenge_observation_escalated",
          id: item.eventId,
          incidentId: item.incidentId,
          alarmSystemId: item.alarmSystemId,
          account: item.account,
          brand: item.brand,
          qualifier: item.qualifier,
          eventCode: item.eventCode,
          description: item.description || "Falha de Keep Alive Radioenge sem restauração",
          timestamp: new Date().toISOString(),
        });
        console.warn(`[RECIP] RADIOENGE | Conta ${item.account} | E361 excedeu 4 segundos sem R361; ocorrência encaminhada ao atendimento.`);
      }
    } catch (error) {
      console.error("[RECIP] Falha ao escalar observação E361 da Radioenge", error);
    }
  }, delay);
  radioengeObservationTimers.set(input.incidentId, timer);
}

function rememberSystem(socket: net.Socket, system: any, receiverPort?: number) {
  if (!system?.id) return;
  const previous = identifiedSystemBySocket.get(socket);
  if (previous && previous.id !== system.id) {
    if (previous.brand?.trim().toUpperCase() === "JFL" && receiverPort) {
      forgetConfirmedJflEndpoint(socket.remoteAddress || "", receiverPort, previous.id);
    }
    if (previous.brand?.trim().toUpperCase() === "INTELBRAS" && receiverPort) {
      forgetConfirmedIntelbrasEndpoint(socket.remoteAddress || "", receiverPort, previous.account, previous.id);
      clearIntelbrasSession(socket);
    }
  }
  const known = { id: system.id, account: system.account, brand: system.brand };
  identifiedSystemBySocket.set(socket, known);
  if (receiverPort && system.brand?.trim().toUpperCase() === "JFL") {
    rememberConfirmedJflEndpoint(socket.remoteAddress || "", receiverPort, known);
  }
  if (receiverPort && system.brand?.trim().toUpperCase() === "INTELBRAS") {
    rememberConfirmedIntelbrasEndpoint(socket.remoteAddress || "", receiverPort, known);
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
  let measurement = known ? await recordSystemKeepAlive(known.id) : undefined;
  if (known && !measurement) {
    // Cache de endpoint/sessão nunca sobrevive como autoridade quando o cadastro
    // desapareceu, foi inativado ou perdeu o vínculo com um cliente ativo.
    identifiedSystemBySocket.delete(socket);
    if (known.brand?.trim().toUpperCase() === "JFL") forgetConfirmedJflEndpoint(socket.remoteAddress || "", port, known.id);
    if (known.brand?.trim().toUpperCase() === "INTELBRAS") {
      forgetConfirmedIntelbrasEndpoint(socket.remoteAddress || "", port, known.account, known.id);
      clearIntelbrasSession(socket);
    }
    known = undefined;
  }
  if (!known && isSafeCaptureEnabled(brand)) {
    const system = await getAlarmSystemByCapturedPanelIdentifier({ brand, frames: getSafeCaptureFrames(socket) });
    if (system) {
      rememberSystem(socket, system, port);
      known = identifiedSystemBySocket.get(socket);
      measurement = known ? await recordSystemKeepAlive(known.id) : undefined;
    }
  }
  if (!known) {
    console.log(`[KEEPALIVE] ${brand} porta ${port} | ${signal} | central ainda não identificada`);
    return;
  }
  if (brand === "JFL") refreshConfirmedJflEndpoint(socket.remoteAddress || "", port);
  if (measurement) {
    console.log(`[KEEPALIVE] ${brand} | Conta ${known.account} | ${signal} | ${formatKeepAliveInterval(measurement.intervalMs)}`);
    // Atualização de supervisão somente informativa. O Dashboard usa este
    // sinal para atualizar seus indicadores, sem criar card de ocorrência.
    eventCallback?.({
      kind: "keepalive",
      alarmSystemId: known.id,
      account: known.account,
      brand,
      timestamp: new Date().toISOString(),
    });
  }
}

async function refreshIntelbrasSocketIdentity(socket: net.Socket, port: number, account?: string) {
  let previous = identifiedSystemBySocket.get(socket);
  if (previous?.brand?.trim().toUpperCase() === "INTELBRAS") {
    const current = await getOperationalAlarmSystem(previous.id);
    if (current && current.brand?.trim().toUpperCase() === "INTELBRAS" && current.receiverPort === port && current.account === previous.account && (!account || account === current.account)) {
      return previous;
    }
    identifiedSystemBySocket.delete(socket);
    forgetConfirmedIntelbrasEndpoint(socket.remoteAddress || "", port, previous.account, previous.id);
    clearIntelbrasSession(socket);
    previous = undefined;
  }

  // A identidade Intelbras nunca atravessa sockets TCP. Um evento em nova
  // conexão só pode ser associado depois do 0x94/MAC físico nesta conexão;
  // conta, IP, porta e cache de outra conexão não são prova de identidade.
  for (const frame of getSafeCaptureFrames(socket)) {
    if (frame.brand.trim().toUpperCase() !== "INTELBRAS" || frame.receiverPort !== port) continue;
    const identification = parseIntelbrasIsecnetIdentification(Buffer.from(frame.payloadHex, "hex"));
    if (!identification || (account && account !== identification.account)) continue;
    const system = await getAlarmSystemByPanelIdentifier(identification.macSuffix, "mac", "INTELBRAS", port);
    if (!system || system.account !== identification.account || (account && account !== system.account)) continue;
    await rememberConfirmedIntelbrasSystem(socket, system, port);
    return identifiedSystemBySocket.get(socket);
  }
  return undefined;
}

async function rememberConfirmedIntelbrasSystem(socket: net.Socket, system: any, port: number) {
  rememberSystem(socket, system, port);
  rememberActiveIntelbrasSession(socket, { id: system.id, account: system.account, brand: system.brand });
}

// Hooks de regressão: não abrem sockets e não são expostos por nenhuma rota API.
export const receiverIdentityTestHooks = {
  rememberIntelbras: rememberConfirmedIntelbrasSystem,
  refreshIntelbras: refreshIntelbrasSocketIdentity,
  getKnownSystem: (socket: net.Socket) => identifiedSystemBySocket.get(socket),
  forgetSocket: (socket: net.Socket) => identifiedSystemBySocket.delete(socket),
};

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

  // A Active 8W v8 responde à consulta passiva 7B/0x4D com 7A/.../0x24.
  // O byte 0x24 ocupa uma posição semelhante ao Contact ID, mas este é um
  // quadro de estado proprietário, não um evento de alarme. Ele não pode abrir
  // ocorrência, alterar Arme/Desarme nem herdar o sistema identificado.
  if (brand === "JFL" && isJflActive8wV8StatusReply(data)) {
    await recordKeepAlive(socket, brand, port, "Active 8W v8 resposta passiva de status");
    console.log("[RECIP] JFL Active 8W v8 | resposta passiva de estado 7A/.../0x24 recebida; supervisão registrada e quadro ignorado como evento Contact ID.");
    return;
  }

  const seq = data[2];
  const isJflActive8wV8ConnectionFrame = brand === "JFL" && isJflActive8wV8Connection(data);
  const cmd = isJflActive8wV8ConnectionFrame ? 0x21 : data[3];

  switch (cmd) {
    case 0x21: { // CONEXÃO
      if (brand === "JFL") {
        const identity = parseJflConnectionIdentity(data);
        if (identity) {
          const system = await getAlarmSystemByCapturedPanelIdentifier({ brand, frames: getSafeCaptureFrames(socket) });
          if (system) {
            rememberSystem(socket, system, port);
            console.log(`[RECIP] JFL conexão identificada por ${system.capturedIdentifier.identifierType}: ${system.capturedIdentifier.identifier} | Conta ${system.account}`);
            if (isJflActive8wV8ConnectionFrame) {
              await recordKeepAlive(socket, brand, port, "Active 8W v8 identificação 0x21");
            }
          } else {
            console.log(`[RECIP] JFL conexão sem painel cadastrado | Serial ${identity.serialNumber || "—"} | MAC ${identity.fullMac || "—"}`);
          }
        }
      }
      // A Active 8W v8.0 apresenta o painel em 7A/0x21, mas a confirmação e
      // a consulta passiva de pendências usam quadros JFL 7B. Sem esse retorno
      // a central fica Online, porém pode não entregar Contact ID ao receptor.
      // Ambos os quadros abaixo são de infraestrutura; não controlam a central.
      if (isJflActive8wV8ConnectionFrame) {
        const acknowledgement = buildJflActive8wConnectionAcknowledgement(data);
        if (acknowledgement) socket.write(acknowledgement);
        socket.write(buildJflStatusRequest());
        console.log(`[RECIP] JFL Active 8W v8 | confirmação e consulta passiva de status enviadas | Conta ${identifiedSystemBySocket.get(socket)?.account || "sem identificação"}`);
        break;
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
async function handleIntelbrasFrame(socket: net.Socket, data: Buffer, port: number) {
  if (await consumeIntelbrasPhysicalResponse(socket, data)) return;

  if (isIntelbrasIsecnetHeartbeat(data)) {
    const known = await refreshIntelbrasSocketIdentity(socket, port);
    if (known) {
      await recordKeepAlive(socket, "INTELBRAS", port, "ISECnet 0xF7");
      console.log(`[RECIP] INTELBRAS ISECnet 0xF7 confirmado | Conta ${known.account}`);
    } else {
      console.warn(`[RECIP] INTELBRAS ISECnet 0xF7 recebido antes da identificação física; ACK de transporte enviado sem associação.`);
    }
    // A AMT-8000 encerra a sessão se não receber FE para o Heartbeat F7.
    socket.write(Buffer.from([0xfe]));
    return;
  }

  const identification = parseIntelbrasIsecnetIdentification(data);
  if (identification) {
    // A associação é sempre por MAC físico; a conta transportada é conferida
    // como defesa adicional e nunca é usada como fallback de identificação.
    const system = await getAlarmSystemByPanelIdentifier(identification.macSuffix, "mac", "INTELBRAS", port);
    if (system && system.account === identification.account) {
      await rememberConfirmedIntelbrasSystem(socket, system, port);
      await recordKeepAlive(socket, "INTELBRAS", port, `ISECnet 0x94 (${identification.channel})`);
      console.log(`[RECIP] INTELBRAS ISECnet 0x94 identificado por MAC ${identification.macSuffix} | Conta ${system.account}`);
    } else if (system) {
      console.warn(`[RECIP] INTELBRAS ISECnet 0x94 recusado para supervisão: conta recebida ${identification.account} diverge da conta cadastrada para MAC ${identification.macSuffix}.`);
    } else {
      console.log(`[RECIP] INTELBRAS ISECnet 0x94 sem painel cadastrado | Conta ${identification.account} | MAC ${identification.macSuffix}`);
    }
    // ACK oficial do comando de identificação. Não é resposta de evento nem
    // habilita controle remoto.
    socket.write(Buffer.from([0xfe]));
    // Comandos Intelbras de alternância nunca são disparados automaticamente
    // ao reconectar: a confirmação do operador deve ocorrer com sessão viva.
    return;
  }

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

  const isecnetEvent = parseIntelbrasIsecnetEvent(data);
  if (isecnetEvent) {
    const known = await refreshIntelbrasSocketIdentity(socket, port, isecnetEvent.account);
    if (!known || known.brand !== "INTELBRAS" || known.account !== isecnetEvent.account) {
      console.warn(`[RECIP] INTELBRAS ${isecnetEvent.command} descartado: evento da conta ${isecnetEvent.account} sem identidade física confirmada nesta conexão.`);
      socket.write(Buffer.from([0xfe]));
      return;
    }
    const eventoObj = {
      brand: 'INTELBRAS',
      account: isecnetEvent.account,
      qualifier: isecnetEvent.qualifier,
      eventCode: isecnetEvent.eventCode,
      partition: isecnetEvent.partition,
      zoneUser: isecnetEvent.zoneUser,
      receiverPort: port,
      rawData: data.toString('hex').toUpperCase(),
      // O 0xB0 não carrega MAC. Este ID só existe após o 0x94 ter conferido
      // MAC e conta na mesma origem dentro da janela curta de segurança.
      confirmedIntelbrasSystemId: known.id,
      confirmedIntelbrasIdentifier: "MAC confirmado no ISECnet 0x94 desta origem",
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

async function handleIntelbras(socket: net.Socket, data: Buffer, port: number) {
  const pending = intelbrasPendingBytesBySocket.get(socket) || Buffer.alloc(0);
  const { frames, remainder } = extractIntelbrasIsecnetFrames(Buffer.concat([pending, data]));
  intelbrasPendingBytesBySocket.set(socket, remainder);
  for (const frame of frames) await handleIntelbrasFrame(socket, frame, port);
}

// Driver Vetti
const vettiLoginIdentityBySocket = new WeakMap<object, VettiLoginIdentity>();
const vettiPendingBytesBySocket = new WeakMap<object, Buffer>();
const vettiCommandTimeoutsBySocket = new WeakMap<object, Map<number, ReturnType<typeof setTimeout>>>();
const vettiTimeoutBoundSockets = new WeakSet<object>();
const VETTI_RESPONSE_TIMEOUT_MS = 12_000;

function clearVettiCommandTimeout(socket: net.Socket, commandId: number) {
  const timers = vettiCommandTimeoutsBySocket.get(socket);
  const timer = timers?.get(commandId);
  if (timer) clearTimeout(timer);
  timers?.delete(commandId);
}

function scheduleVettiCommandTimeout(socket: net.Socket, commandId: number, stage: string) {
  clearVettiCommandTimeout(socket, commandId);
  const timers = vettiCommandTimeoutsBySocket.get(socket) || new Map<number, ReturnType<typeof setTimeout>>();
  vettiCommandTimeoutsBySocket.set(socket, timers);
  timers.set(commandId, setTimeout(() => {
    clearVettiCommandTimeout(socket, commandId);
    clearPendingVettiBenchCommand(socket, commandId);
    void updateAlarmRemoteCommandDelivery(commandId, {
      status: "failed",
      responsePayload: `Fluxo VSec expirado: não houve resposta da central em até 12 segundos durante ${stage}.`,
      executedAt: new Date(),
    });
    console.warn(`[VSEC] VETTI tempo esgotado | comando ${commandId} | etapa ${stage}`);
  }, VETTI_RESPONSE_TIMEOUT_MS));
}

function bindVettiTimeoutCleanup(socket: net.Socket) {
  if (vettiTimeoutBoundSockets.has(socket)) return;
  vettiTimeoutBoundSockets.add(socket);
  socket.once("close", () => {
    const timers = vettiCommandTimeoutsBySocket.get(socket);
    if (timers) {
      for (const commandId of Array.from(timers.keys())) {
        clearVettiCommandTimeout(socket, commandId);
        clearPendingVettiBenchCommand(socket, commandId);
        void updateAlarmRemoteCommandDelivery(commandId, {
          status: "failed",
          responsePayload: "Fluxo VSec interrompido: a conexão autenticada da central foi encerrada antes da resposta esperada.",
          executedAt: new Date(),
        });
      }
    }
    vettiPendingBytesBySocket.delete(socket);
  });
}

async function deliverPendingVettiBenchStatusQuery(system: { id: number; account: string }, socket: net.Socket) {
  const pendingQuery = await getPendingVettiBenchStatusQuery(system.id);
  if (!pendingQuery) return;
  const externalAccessPassword = await getAlarmRemoteCredentialForTransport(system.id, "vetti_installer");
  if (!externalAccessPassword) {
    await updateAlarmRemoteCommandDelivery(pendingQuery.id, {
      status: "failed",
      responsePayload: "Fluxo VSec bloqueado: cadastre a Senha de Instalador Vetti (acesso externo) antes de transmitir o login remoto 0x11.",
      executedAt: new Date(),
    });
    console.warn(`[VSEC] VETTI consulta bloqueada sem credencial de acesso externo | comando ${pendingQuery.id} | Conta ${system.account}`);
    return;
  }
  const dispatched = await dispatchAlarmRemoteCommand({
    alarmSystemId: system.id, commandId: pendingQuery.id,
    expectedStatuses: ["queued", "waiting_connection"], unavailableStatus: "failed",
    sentResponsePayload: pendingQuery.commandType === "disarm"
      ? "Login remoto VSec 0x11 enviado; aguardando confirmação 0x91 antes da consulta prévia 0x14 e do Desarme 0x43."
      : "Login remoto VSec 0x11 enviado após o ACK da central; aguardando confirmação 0x91 antes da consulta 0x14.",
    send: () => sendVettiBenchRemoteLogin({
      alarmSystemId: system.id, commandId: pendingQuery.id, externalAccessPassword,
      flow: pendingQuery.commandType === "disarm" ? "disarm" : "status",
    }),
  });
  if (!dispatched.sent) return;
  scheduleVettiCommandTimeout(socket, pendingQuery.id, "a confirmação do login remoto 0x91");
  console.log(`[VSEC] VETTI login remoto enviado após ACK da central | comando ${pendingQuery.id} | Conta ${system.account}`);
}

async function handleVettiFrame(socket: net.Socket, data: Buffer, port: number) {
  if (!Buffer.isBuffer(data) || data.length === 0) return;
  bindVettiTimeoutCleanup(socket);
  const completedRemoteLogin = consumeVettiBenchRemoteLoginResponse(socket, data);
  if (completedRemoteLogin) {
    clearVettiCommandTimeout(socket, completedRemoteLogin.commandId);
    if (!completedRemoteLogin.accepted) {
      await updateAlarmRemoteCommandDelivery(completedRemoteLogin.commandId, {
        status: "failed",
        responsePayload: `Login remoto VSec 0x11 recusado pela central: erro 0x${completedRemoteLogin.errorCode.toString(16).toUpperCase().padStart(2, "0")} (${completedRemoteLogin.response}).`,
        executedAt: new Date(),
      });
      console.warn(`[VSEC] VETTI login remoto recusado | comando ${completedRemoteLogin.commandId} | erro 0x${completedRemoteLogin.errorCode.toString(16).toUpperCase().padStart(2, "0")}`);
      return;
    }
    const knownSystem = identifiedSystemBySocket.get(socket);
    if (!knownSystem) {
      await updateAlarmRemoteCommandDelivery(completedRemoteLogin.commandId, {
        status: "failed",
        responsePayload: "Fluxo VSec bloqueado: a sessão autenticada não possui identidade de central confirmada.",
        executedAt: new Date(),
      });
      return;
    }
    // A sessão guarda somente identidade mínima para o receptor. Releia o
    // sistema antes do 0x14 para preservar MAC e modo de bancada na decisão
    // crítica, inclusive se a bancada tiver sido desativada durante o login.
    const currentSystem = await getOperationalAlarmSystem(knownSystem.id);
    if (!currentSystem || !isConfirmedVettiBenchSystem(currentSystem)) {
      await updateAlarmRemoteCommandDelivery(completedRemoteLogin.commandId, {
        status: "failed",
        responsePayload: "Fluxo VSec bloqueado: a central deixou de atender à identificação física e ao modo de bancada durante o login remoto.",
        executedAt: new Date(),
      });
      return;
    }
    const dispatchedStatus = await dispatchAlarmRemoteCommand({
      alarmSystemId: currentSystem.id, commandId: completedRemoteLogin.commandId,
      expectedStatuses: ["sent"], unavailableStatus: "failed",
      sentResponsePayload: completedRemoteLogin.flow === "disarm"
        ? "Login remoto VSec 0x11 confirmado (0x91); consulta prévia 0x14 enviada para validar o Desarme 0x43."
        : "Login remoto VSec 0x11 confirmado (0x91); consulta 0x14 enviada e aguardando resposta 0x94.",
      send: () => sendVettiBenchStatusQuery({
        alarmSystemId: currentSystem.id, commandId: completedRemoteLogin.commandId,
        flow: completedRemoteLogin.flow,
        stage: completedRemoteLogin.flow === "disarm" ? "pre_disarm" : "standalone",
      }),
    });
    if (!dispatchedStatus.sent) return;
    scheduleVettiCommandTimeout(socket, completedRemoteLogin.commandId, "a resposta de status 0x94");
    console.log(`[VSEC] VETTI login remoto confirmado; consulta 0x14 enviada | comando ${completedRemoteLogin.commandId} | Conta ${currentSystem.account}`);
    return;
  }
  const completedStatusQuery = consumeVettiBenchStatusResponse(socket, data);
  if (completedStatusQuery) {
    clearVettiCommandTimeout(socket, completedStatusQuery.commandId);
    const accepted = completedStatusQuery.errorCode === 0x80;
    if (accepted && completedStatusQuery.flow === "disarm" && completedStatusQuery.stage === "pre_disarm") {
      const knownSystem = identifiedSystemBySocket.get(socket);
      const currentSystem = knownSystem ? await getOperationalAlarmSystem(knownSystem.id) : undefined;
      const state = parseVerifiedVettiStatusResponse(completedStatusQuery.response);
      if (!currentSystem || !isConfirmedVettiBenchSystem(currentSystem) || !state || (state.centralStatus & 0x01) === 0 || state.partitionMask === 0) {
        await updateAlarmRemoteCommandDelivery(completedStatusQuery.commandId, {
          status: "failed",
          responsePayload: `Desarme VSec bloqueado: a consulta prévia 0x14 não confirmou partições armadas (${completedStatusQuery.response}).`,
          executedAt: new Date(),
        });
        console.warn(`[VSEC] VETTI Desarme bloqueado por estado prévio inválido | comando ${completedStatusQuery.commandId}`);
        return;
      }
      const commandPassword = await getAlarmRemoteCredentialForTransport(currentSystem.id, "vetti_command_user");
      if (!commandPassword) {
        await updateAlarmRemoteCommandDelivery(completedStatusQuery.commandId, {
          status: "failed",
          responsePayload: "Desarme VSec bloqueado: cadastre a Senha do Usuário de Comando Vetti antes de transmitir o quadro 0x43.",
          executedAt: new Date(),
        });
        return;
      }
      const technicalUserCode = await getAlarmRemoteCredentialTechnicalUserCode(currentSystem.id, "vetti_command_user");
      const dispatchedDisarm = await dispatchAlarmRemoteCommand({
        alarmSystemId: currentSystem.id, commandId: completedStatusQuery.commandId,
        expectedStatuses: ["sent"], unavailableStatus: "failed",
        technicalUserCode: technicalUserCode || null,
        sentResponsePayload: `Consulta prévia 0x14 confirmou central armada (partições 0x${state.partitionMask.toString(16).toUpperCase().padStart(2, "0")}); Desarme VSec 0x43 enviado e aguardando confirmação 0xC3.`,
        send: () => sendVettiBenchDisarm({
          alarmSystemId: currentSystem.id, commandId: completedStatusQuery.commandId,
          partitionMask: state.partitionMask, commandPassword,
          preStatusResponse: completedStatusQuery.response,
        }),
      });
      if (!dispatchedDisarm.sent) return;
      scheduleVettiCommandTimeout(socket, completedStatusQuery.commandId, "a confirmação do Desarme 0xC3");
      console.log(`[VSEC] VETTI Desarme 0x43 enviado após status prévio | comando ${completedStatusQuery.commandId} | Conta ${currentSystem.account}`);
      return;
    }
    const isDisarmPostCheck = completedStatusQuery.flow === "disarm" && completedStatusQuery.stage === "post_disarm";
    const disarmVerified = !isDisarmPostCheck || Boolean(
      accepted && completedStatusQuery.preStatusResponse && doesVettiPostStatusConfirmDisarm(completedStatusQuery.preStatusResponse, completedStatusQuery.response),
    );
    await updateAlarmRemoteCommandDelivery(completedStatusQuery.commandId, {
      status: accepted && disarmVerified ? "responded" : "failed",
      responsePayload: isDisarmPostCheck
        ? `Status prévio: ${completedStatusQuery.preStatusResponse}; Desarme 0x43: ${completedStatusQuery.disarmResponse}; status posterior 0x14: ${completedStatusQuery.response}${disarmVerified ? "" : "; Desarme não confirmado pelo estado posterior."}`
        : completedStatusQuery.response,
      executedAt: new Date(),
    });
    console.log(`[VSEC] VETTI consulta de status ${accepted && disarmVerified ? "confirmada" : "recusada"} pela central | comando ${completedStatusQuery.commandId} | ${completedStatusQuery.response}`);
    return;
  }
  const completedDisarm = consumeVettiBenchDisarmResponse(socket, data);
  if (completedDisarm) {
    clearVettiCommandTimeout(socket, completedDisarm.commandId);
    if (!completedDisarm.accepted || !completedDisarm.partitionMaskMatches || !completedDisarm.commandPasswordMatches) {
      await updateAlarmRemoteCommandDelivery(completedDisarm.commandId, {
        status: "failed",
        responsePayload: !completedDisarm.accepted
          ? `Desarme VSec 0x43 recusado pela central: erro 0x${completedDisarm.errorCode.toString(16).toUpperCase().padStart(2, "0")} (${completedDisarm.response}).`
          : !completedDisarm.partitionMaskMatches
            ? `Desarme VSec 0x43 bloqueado: a máscara confirmada pela central (0x${completedDisarm.partitionMask.toString(16).toUpperCase().padStart(2, "0")}) diverge da máscara enviada.`
            : "Desarme VSec 0x43 bloqueado: a confirmação não reflete a credencial de comando enviada.",
        executedAt: new Date(),
      });
      console.warn(`[VSEC] VETTI Desarme 0x43 recusado | comando ${completedDisarm.commandId}`);
      return;
    }
    const knownSystem = identifiedSystemBySocket.get(socket);
      const currentSystem = knownSystem ? await getOperationalAlarmSystem(knownSystem.id) : undefined;
    if (!currentSystem || !isConfirmedVettiBenchSystem(currentSystem)) {
      await updateAlarmRemoteCommandDelivery(completedDisarm.commandId, {
        status: "failed",
        responsePayload: "Fluxo VSec bloqueado: a central deixou de atender à identificação física e ao modo de bancada antes da validação posterior.",
        executedAt: new Date(),
      });
      return;
    }
    const dispatchedStatus = await dispatchAlarmRemoteCommand({
      alarmSystemId: currentSystem.id, commandId: completedDisarm.commandId,
      expectedStatuses: ["sent"], unavailableStatus: "failed", panelConfirmedAt: new Date(),
      sentResponsePayload: "Desarme VSec 0x43 confirmado (0xC3); consulta posterior 0x14 enviada para validar o novo estado.",
      send: () => sendVettiBenchStatusQuery({
        alarmSystemId: currentSystem.id, commandId: completedDisarm.commandId,
        flow: "disarm", stage: "post_disarm",
        preStatusResponse: completedDisarm.preStatusResponse, disarmResponse: completedDisarm.response,
      }),
    });
    if (!dispatchedStatus.sent) return;
    scheduleVettiCommandTimeout(socket, completedDisarm.commandId, "a consulta posterior de status 0x94");
    console.log(`[VSEC] VETTI Desarme 0x43 confirmado; consulta posterior enviada | comando ${completedDisarm.commandId} | Conta ${currentSystem.account}`);
    return;
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
        let confirmedBenchSystem: { id: number; account: string } | undefined;
        const loginIdentity = parseVettiLoginIdentity(data);
        if (loginIdentity) {
          vettiLoginIdentityBySocket.set(socket, loginIdentity);
          const system = await getAlarmSystemByPanelIdentifier(loginIdentity.macSuffix, "mac", "VETTI", port);
          if (system) {
            rememberSystem(socket, system);
            if (isConfirmedVettiBenchSystem(system)) confirmedBenchSystem = system;
          }
          console.log(`[RECIP] VETTI login | Conta ${loginIdentity.account} | MAC ${loginIdentity.macSuffix}`);
        }
        socket.write(Buffer.from([0x02, 0x04, 0xC0, 0x80, 0xCF]));
        if (confirmedBenchSystem) await deliverPendingVettiBenchStatusQuery(confirmedBenchSystem, socket);
      }
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

async function handleVetti(socket: net.Socket, data: Buffer, port: number) {
  const pending = vettiPendingBytesBySocket.get(socket) || Buffer.alloc(0);
  const { frames, remainder } = extractVettiFrames(Buffer.concat([pending, data]));
  vettiPendingBytesBySocket.set(socket, remainder);
  for (const frame of frames) {
    if (isSafeCaptureEnabled("VETTI")) {
      if (frame.length >= 4 && frame[0] === 0x02 && frame[2] === 0xAF && frame[3] === 0xC3) {
        console.log(`[CAPTURA-IP] VETTI | porta ${port} | resposta 0xC3 recebida; campo de senha oculto`);
      } else {
        const captured = recordSafeCaptureFrame(socket, {
          brand: "VETTI",
          receiverPort: port,
          remoteIp: socket.remoteAddress || "",
          payload: frame,
        });
        if (captured) console.log(formatSafeCaptureLog(captured));
      }
    }
    await handleVettiFrame(socket, frame, port);
  }
}

// Driver Compatec. O protocolo universal possui mensagens de tamanho fixo que
// podem chegar juntas ou fracionadas em um mesmo stream TCP.
async function handleCompatec(socket: net.Socket, data: Buffer, port: number) {
  const microbusResponse = getCompatecMw1StatusResponseLineForSocket(socket, data);
  if (microbusResponse) {
    const completed = consumeCompatecMw1StatusResponse(socket, microbusResponse);
    if (completed) {
      const isComposite = isCompatecArmWithZonesCommand(completed.payload);
      if ("intermediateZoneAck" in completed && completed.intermediateZoneAck) {
        const payload = JSON.parse(completed.payload);
        await dispatchAlarmRemoteCommand({
          alarmSystemId: identifiedSystemBySocket.get(socket)?.id || 0,
          commandId: completed.commandId, requiredZoneNumbers: payload.zoneNumbers,
          expectedStatuses: ["sent"], unavailableStatus: "dispatch_unknown",
          sentResponsePayload: `${microbusResponse.trim()} recebido para AK2→AK1 (somente recebimento do bypass); AK4[4] enviado em seguida; aguardando resposta de Arme.`,
          send: () => sendCompatecMw1ArmAfterZones({ alarmSystemId: identifiedSystemBySocket.get(socket)?.id || 0, commandId: completed.commandId }),
        });
      } else {
      const isArmDisarmAction = completed.payload === COMPATEC_MW1_ARM_ALL || completed.payload === COMPATEC_MW1_DISARM_ALL || isComposite;
      const isPhysicalZoneAction = isCompatecPhysicalZoneCommand(completed.payload);
      const isPhysicalAction = isArmDisarmAction || isPhysicalZoneAction;
      const isPhysicalConfirmation = isArmDisarmAction
        ? (!isComposite || completed.stage === "arm_ack") && isCompatecArmDisarmConfirmation(completed.payload, microbusResponse)
        : isPhysicalZoneAction && isCompatecPhysicalZoneConfirmation(completed.payload, microbusResponse);
      if (isPhysicalAction && isPhysicalConfirmation) {
        const confirmation = await recordRemoteCommandConfirmation({
          commandId: completed.commandId,
          responsePayload: microbusResponse,
        });
        if (confirmation.recorded) {
          eventCallback?.({
            kind: isPhysicalZoneAction ? "remote_command_ack" : "remote_command_confirmation",
            alarmSystemId: confirmation.alarmSystemId,
            incidentId: confirmation.incidentId || undefined,
            commandId: confirmation.commandId,
            commandType: confirmation.commandType,
            actionLabel: confirmation.actionLabel,
            timestamp: new Date().toISOString(),
          });
        }
        if (confirmation.recorded) {
          console.log(`[MICROBUS] COMPATEC ${confirmation.actionLabel} recebeu resposta física | comando ${completed.commandId} | ${microbusResponse.replace(/\r?\n/g, "")}`);
        } else {
          console.warn(`[MICROBUS] COMPATEC resposta recebida para comando inexistente | comando ${completed.commandId}`);
        }
      } else if (isPhysicalAction) {
        await updateAlarmRemoteCommandDelivery(completed.commandId, {
          status: "failed",
          responsePayload: `Resposta incompatível com o comando Compatec: ${microbusResponse.replace(/\r?\n/g, "")}`,
          executedAt: new Date(),
        });
        console.warn(`[MICROBUS] COMPATEC resposta incompatível com ação física | comando ${completed.commandId} | ${microbusResponse.replace(/\r?\n/g, "")}`);
      } else {
        await updateAlarmRemoteCommandDelivery(completed.commandId, { status: "responded", responsePayload: microbusResponse, executedAt: new Date() });
        console.log(`[MICROBUS] COMPATEC consulta confirmada pela central | comando ${completed.commandId} | ${microbusResponse.replace(/\r?\n/g, "")}`);
      }
      }
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
        rememberActiveCompatecSession(socket, system);
        const pendingQuery = await getPendingCompatecBenchQuery(system.id);
        if (pendingQuery) {
          const dispatched = await dispatchAlarmRemoteCommand({
            alarmSystemId: system.id, commandId: pendingQuery.id,
            requiredZoneNumber: pendingQuery.zoneNumber ?? undefined,
            expectedStatuses: ["waiting_connection"], unavailableStatus: "waiting_connection",
            sentResponsePayload: `Comando ${pendingQuery.commandPayload.replace(/\r\n/g, "")} enviado na próxima sessão Compatec identificada por cadastro físico/porta; aguardando resposta.`,
            send: () => sendCompatecMw1PhysicalCommand({ alarmSystemId: system.id, commandId: pendingQuery.id, payload: pendingQuery.commandPayload }),
          });
          if (dispatched.sent) {
            console.log(`[MICROBUS] COMPATEC comando pendente enviado na sessão identificada por cadastro físico/porta | comando ${pendingQuery.id} | Conta ${system.account}`);
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
export async function processEvent(evento: any, remoteIp: string, captureSummary = "", captureFrames = [] as ReturnType<typeof getSafeCaptureFrames>, socket?: net.Socket): Promise<boolean> {
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
    const argumentContext = getContactIdArgumentContext({
      eventCode: evento.eventCode,
      qualifier: evento.qualifier,
      value: evento.zoneUser,
    });
    if (argumentContext.description) description = argumentContext.description;
    const isViawebInternalEvent = evento.brand === "VIAWEB" && Number.isInteger(evento.viawebInternalEventType);
    if (isViawebInternalEvent) {
      const internalDescriptions: Record<number, string> = {
        1: "VIAWEB: Servidor, cliente ou equipamento entrou On Line",
        2: "VIAWEB: Servidor, cliente ou equipamento ficou Off Line",
        3: "VIAWEB: Equipamento solicitou autorização de conexão",
      };
      description = internalDescriptions[evento.viawebInternalEventType] || `VIAWEB: Evento interno ${evento.viawebInternalEventType}`;
      priority = evento.viawebInternalEventType === 2 ? "medium" : "low";
    }

    // Nenhuma central IP pode ser associada somente pela conta. MAC, IMEI ou,
    // exclusivamente para ViaWeb, ID ISEP precisam estar confirmados no pacote
    // antes de qualquer vínculo operacional entre parceiras.
    const captureMode = shouldResolveSystemByCapturedPanelIdentifier(evento.brand);
    let system: any = null;
    let clientName = `CONTA NÃO CADASTRADA (${evento.account})`;
    if (captureMode) {
      const confirmedIntelbrasSystemId = evento.brand === "INTELBRAS" && Number.isInteger(evento.confirmedIntelbrasSystemId)
        ? evento.confirmedIntelbrasSystemId
        : undefined;
      if (confirmedIntelbrasSystemId) {
        const continuedSystem = await getOperationalAlarmSystem(confirmedIntelbrasSystemId);
        if (
          continuedSystem
          && continuedSystem.brand?.trim().toUpperCase() === "INTELBRAS"
          && continuedSystem.account === evento.account
        ) {
          system = continuedSystem;
          clientName = `Sistema ${system.account}`;
          console.log(`[RECIP] INTELBRAS evento associado à identidade 0x94 já confirmada | Conta ${system.account}`);
        }
      }
      const confirmedViawebSystemId = evento.brand === "VIAWEB" && Number.isInteger(evento.confirmedViawebSystemId)
        ? evento.confirmedViawebSystemId
        : undefined;
      if (!system && confirmedViawebSystemId) {
        const continuedSystem = await getOperationalAlarmSystem(confirmedViawebSystemId);
        if (
          continuedSystem
          && continuedSystem.brand?.trim().toUpperCase() === "VIAWEB"
          && continuedSystem.isepId === evento.confirmedViawebIsep
        ) {
          system = continuedSystem;
          clientName = `Sistema ${system.account}`;
          console.log(`[RECIP] VIAWEB evento associado ao ISEP confirmado ${evento.confirmedViawebIsep} | Conta ${system.account}`);
        }
      }
      if (!system) system = await getAlarmSystemByCapturedPanelIdentifier({ brand: evento.brand, frames: captureFrames });
      if (system) {
        clientName = `Sistema ${system.account}`;
        if (system.capturedIdentifier) console.log(`[RECIP] ${evento.brand} identificado por ${system.capturedIdentifier.identifierType}: ${system.capturedIdentifier.identifier}`);
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

    const accountResolution = resolveSystemAccount(evento.account, system ? { account: system.account } : undefined);
    const receivedAccount = accountResolution.receivedAccount;
    const effectiveAccount = accountResolution.account;
    if (accountResolution.isSystemAccount) {
      await ensureSystemTechnicalAccount();
      clientName = "CONTA DO SISTEMA (0000)";
      const captureDescription = captureMode ? "CENTRAL SEM IDENTIFICADOR ÚNICO CONFIRMADO — MAC/IMEI/ID ISEP pendente" : "CENTRAL NÃO CADASTRADA";
      description = `${captureDescription}${receivedAccount ? ` — conta recebida ${receivedAccount}` : " — sem conta recebida"}: ${description}`;
    }

    const eventReceivedAt = new Date();
    const automaticAction = getAutomaticEventAction(evento.qualifier, codeInfo);
    const operationalClassification = classifyContactIdOperationalEvent({
      eventCode: evento.eventCode,
      qualifier: evento.qualifier,
      brand: evento.brand,
      description,
    });
    let scheduleContext: Awaited<ReturnType<typeof getAlarmScheduleContext>> = null;
    let scheduleDecision: ReturnType<typeof evaluateAlarmSchedule> | null = null;
    if (system?.id && operationalClassification.kind !== "unknown" && !accountResolution.isSystemAccount) {
      try {
        scheduleContext = await getAlarmScheduleContext(system.id);
        if (scheduleContext?.schedule?.isActive) {
          scheduleDecision = evaluateAlarmSchedule({
            schedule: scheduleContext.schedule,
            holidays: scheduleContext.holidays,
            exceptions: scheduleContext.exceptions,
            at: eventReceivedAt,
            event: { eventCode: evento.eventCode, qualifier: evento.qualifier, brand: evento.brand, description, receivedAt: eventReceivedAt },
          });
        }
      } catch (error) {
        console.error(`[AGENDA] Falha ao consultar agenda da central ${system.account}; mantendo regra segura do evento.`, error);
      }
    }
    const scheduleRelevantState = operationalClassification.kind === "arm" || operationalClassification.kind === "disarm";
    const scheduleEventAction = getAlarmScheduleEventAction({
      classification: operationalClassification,
      hasActiveSchedule: Boolean(scheduleContext?.schedule?.isActive),
      decision: scheduleDecision,
    });
    const scheduleViolation = scheduleEventAction === "queue";
    const eventOperationalAction = scheduleEventAction === "use_catalog" ? automaticAction : scheduleEventAction;
    const isRadioengeE361 = isRadioengeKeepAliveFailure({ brand: evento.brand, qualifier: evento.qualifier, eventCode: evento.eventCode })
      && Boolean(system?.id)
      && !accountResolution.isSystemAccount;
    const isRadioengeR361 = isRadioengeKeepAliveRestoration({ brand: evento.brand, qualifier: evento.qualifier, eventCode: evento.eventCode })
      && Boolean(system?.id)
      && !accountResolution.isSystemAccount;
    const eventAutomaticAction = isRadioengeR361 ? "try_restoration" as const : eventOperationalAction;
    const repeatedTrackedIncident = (eventAutomaticAction === "track_for_restoration" || isRadioengeE361) && system?.id
      ? await findOpenTrackedIncident({
        alarmSystemId: system.id,
        account: effectiveAccount,
        eventCode: evento.eventCode,
        qualifier: evento.qualifier,
      })
      : undefined;
    const systemInMaintenance = isSystemInMaintenance(system);
    const maintenanceMessage = "Sistema em manutenção";
    if (systemInMaintenance) {
      description = `${maintenanceMessage} — ${description}`;
    }
    let client: Awaited<ReturnType<typeof getClientOperationalProfile>>;
    if (system?.clientId && !accountResolution.isSystemAccount) {
      try {
        client = await getClientOperationalProfile(system.clientId);
      } catch (error) {
        // Falha na consulta não pode silenciar alarme: atende normalmente.
        console.error(`[RECIP] Falha ao verificar o status do cliente da conta ${effectiveAccount}; mantendo atendimento.`, error);
      }
    }
    const clientMonitoringStatus = getEffectiveClientMonitoringStatus(client, eventReceivedAt);
    const clientMonitoringBlocked = clientMonitoringStatus !== "active";
    const radioengeObservation = isRadioengeE361 && !systemInMaintenance && !clientMonitoringBlocked && !repeatedTrackedIncident;
    const radioengeRestorationCandidate = isRadioengeR361 && !systemInMaintenance
      ? await findRadioengeKeepAliveObservationForRestoration({
        alarmSystemId: system?.id,
        account: effectiveAccount,
        now: eventReceivedAt,
      })
      : undefined;
    // Eventos internos ViaWeb já associados ao ISEP são auditáveis, mas não são
    // ocorrências operacionais. Forçar report_only mantém a confirmação ao
    // Receiver e evita que o EAA5 fique retransmitindo e bloqueie a fila.
    const deliveryAutomaticAction = isViawebInternalEvent ? "report_only" as const : eventAutomaticAction;
    const deliveryPlan = getOperationalDeliveryPlan({
      isSystemAccount: accountResolution.isSystemAccount,
      automaticAction: deliveryAutomaticAction,
      systemInMaintenance,
      clientMonitoringBlocked,
    });
    const shouldOpenAttendance = deliveryPlan.shouldOpenAttendance && !repeatedTrackedIncident && !radioengeObservation;
    const automaticFinalizationMessage = clientMonitoringBlocked
      ? `Cliente ${clientMonitoringStatus === "blocked" ? "bloqueado" : "suspenso"}${client?.monitoringStatusReason ? ` — ${client.monitoringStatusReason}` : ""}; evento registrado somente no relatório, sem abrir atendimento`
      : scheduleRelevantState && !scheduleViolation
      ? !scheduleContext?.schedule?.isActive
        ? "Arme/Desarme sem agenda ativa; registrado somente no relatório"
        : operationalClassification.mode === "stay"
          ? "Arme Stay registrado somente no relatório"
          : scheduleDecision?.status === "missed_arm"
            ? "Arme realizado fora da janela de 10 minutos; registrado somente no relatório"
          : "Arme/Desarme dentro da agenda; registrado somente no relatório"
      : scheduleViolation
      ? scheduleDecision?.status === "unexpected_disarm"
        ? "Desarme fora do horário programado; encaminhado ao operador"
        : "Arme atrasado ou fora da janela programada; encaminhado ao operador"
      : operationalClassification.kind === "isolation"
      ? "Isolamento/restauração de zona registrado somente no relatório"
      : radioengeObservation
      ? "Falha de Keep Alive Radioenge E361 em observação por até 4 segundos, aguardando R361"
      : repeatedTrackedIncident
      ? "Falha repetida registrada no relatório; ocorrência operacional já aberta aguardando restauração"
      : accountResolution.isSystemAccount
      ? "Registrada na Conta do Sistema (0000) para conferência no relatório"
      : systemInMaintenance ? maintenanceMessage : isViawebInternalEvent ? "Evento interno ViaWeb registrado para auditoria" : "Finalizada automaticamente";

    // Salvar o evento e a ocorrência aberta juntos antes de emitir ao dashboard.
    // Nunca use Date.now() como ID de reserva: isso criaria um card temporário que
    // não poderia ser reconstruído depois de reiniciar ou trocar de operador.
    let savedEvent: any;
    let incident: { id: number } | null = null;
    let remoteCommandMatched = false;
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
        rawData: `${evento.rawData || ""}${receivedAccount ? `\nConta recebida: ${receivedAccount}` : "\nConta recebida: ausente"}\n${argumentContext.label}: ${argumentContext.value}${evento.confirmedIntelbrasIdentifier ? `\nIdentificado por ${evento.confirmedIntelbrasIdentifier}` : system?.capturedIdentifier ? `\nIdentificado por ${system.capturedIdentifier.identifierType}: ${system.capturedIdentifier.identifier}` : ""}${captureSummary ? `\n${captureSummary}` : ""}`,
        autoFinalized: radioengeObservation ? false : !shouldOpenAttendance,
        autoFinalizationReason: radioengeObservation || shouldOpenAttendance ? null : automaticFinalizationMessage,
      };
      const remoteMatch = system && !accountResolution.isSystemAccount && !systemInMaintenance && !clientMonitoringBlocked
        ? await createConfirmedVettiDisarmEventWithOpenIncident({
          event: eventData,
          eventReceivedAt,
          alarmSystemId: system.id,
          clientId: system.clientId || null,
          priority: priority as "critical" | "high" | "medium" | "low",
        })
        : undefined;
      if (remoteMatch) {
        savedEvent = { id: remoteMatch.eventId };
        incident = { id: remoteMatch.incidentId };
        remoteCommandMatched = true;
        console.log(`[RECIP] VETTI | Conta ${effectiveAccount} | evento associado ao Desarme remoto confirmado #${remoteMatch.commandId}`);
      } else if (radioengeObservation) {
        const persisted = await createAlarmEventWithOpenIncident({
          event: eventData,
          incident: {
            alarmSystemId: system?.id || null,
            clientId: system?.clientId || null,
            status: "observing",
            priority: priority as "critical" | "high" | "medium" | "low",
            observationUntil: getRadioengeKeepAliveObservationUntil(eventReceivedAt),
            notes: "Radioenge E361 em observação; aguardando R361 por até 4 segundos.",
          },
        });
        savedEvent = { id: persisted.eventId };
        incident = { id: persisted.incidentId };
        scheduleRadioengeObservationEscalation({
          incidentId: persisted.incidentId,
          observationUntil: getRadioengeKeepAliveObservationUntil(eventReceivedAt),
        });
      } else if (shouldOpenAttendance) {
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

    if (system?.id && evento.brand === "COMPATEC" && operationalClassification.kind === "disarm") {
      try { await resetCompatecZoneSelectionsOnDisarm(system.id, savedEvent.id); }
      catch (error) { console.error("[COMPATEC] Falha ao normalizar chaves após Desarme confirmado", error); }
    }
    if (system?.id && scheduleRelevantState && !clientMonitoringBlocked) {
      try {
        if (scheduleContext?.schedule?.isActive && scheduleViolation && scheduleDecision) {
          const alertType = scheduleDecision.status === "unexpected_disarm" ? "unexpected_disarm" : "missed_arm";
          const expectedAt = scheduleDecision.transition?.at || (alertType === "missed_arm" ? eventReceivedAt : null);
          const alertDateAt = expectedAt || eventReceivedAt;
          const localDateParts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
          }).formatToParts(alertDateAt);
          const localDate = `${localDateParts.find((part) => part.type === "year")?.value}-${localDateParts.find((part) => part.type === "month")?.value}-${localDateParts.find((part) => part.type === "day")?.value}`;
          const created = await createAlarmScheduleComplianceAlert({
            alarmSystemId: system.id,
            scheduleId: scheduleContext.schedule.id,
            sourceEventId: savedEvent.id,
            alertType,
            dedupeKey: `${system.id}:${scheduleContext.schedule.id}:${alertType}:${localDate}:${evento.eventCode}:${evento.qualifier}:${savedEvent.id}`,
            alertDate: localDate,
            expectedAt,
            currentState: operationalClassification.state === "armed" ? "armed" : "disarmed",
            detectedAt: eventReceivedAt,
          });
          if (created.created) {
            eventCallback?.({
              kind: "alarm_schedule_alert",
              id: created.id,
              alarmSystemId: system.id,
              account: effectiveAccount,
              brand: evento.brand,
              alertType,
              alertDate: localDate,
              expectedAt,
              detectedAt: eventReceivedAt,
              sourceEventId: savedEvent.id,
              timestamp: new Date().toISOString(),
            });
          }
        } else if (!scheduleViolation) {
          await resolveAlarmScheduleAlerts({ alarmSystemId: system.id, resolvedAt: eventReceivedAt });
        }
      } catch (error) {
        console.error(`[AGENDA] Falha ao registrar/atualizar alerta da conta ${effectiveAccount}`, error);
      }
    }

    if (radioengeRestorationCandidate) {
      cancelRadioengeObservationTimer(radioengeRestorationCandidate.incident.id);
      await finalizeIncidentWithRestoration({
        incident: radioengeRestorationCandidate.incident,
        event: {
          id: savedEvent.id,
          account: effectiveAccount,
          eventCode: evento.eventCode,
          qualifier: evento.qualifier,
          partition: evento.partition,
          zoneUser: evento.zoneUser,
          description,
          priority,
          brand: evento.brand,
          receivedAt: eventReceivedAt,
        } as any,
      });
      if (eventCallback) {
        eventCallback({
          id: savedEvent.id,
          kind: "restoration_closed",
          originalEventId: radioengeRestorationCandidate.event.id,
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
      console.log(`[RECIP] RADIOENGE | Conta ${effectiveAccount} | R361 recebido dentro de 4 segundos; E361 e R361 fechados juntos.`);
      return true;
    }

    if (eventAutomaticAction === "try_restoration") {
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

    if ((deliveryPlan.shouldPersistReport || Boolean(repeatedTrackedIncident)) && !remoteCommandMatched && !radioengeObservation) {
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
      // Arme e desarme são finalizados automaticamente e não entram na fila.
      // Mesmo assim, o Dashboard precisa atualizar os indicadores no instante
      // da confirmação, sem aguardar o próximo ciclo de consulta.
      if (system && ["401", "403", "407", "408", "409", "441"].includes(evento.eventCode)) {
        eventCallback?.({
          kind: "arm_disarm_confirmation",
          alarmSystemId: system.id,
          account: effectiveAccount,
          brand: evento.brand,
          qualifier: evento.qualifier,
          eventCode: evento.eventCode,
          timestamp: new Date().toISOString(),
        });
      }
      console.log(`[RECIP] ${evento.brand} | Conta ${effectiveAccount} | ${evento.qualifier}${evento.eventCode} | ${automaticFinalizationMessage}`);
      return true;
    }

    if (!hasPersistedOpenIncident(savedEvent?.id, incident?.id)) {
      console.error("[RECIP] Evento não emitido: ocorrência aberta sem persistência confirmada");
      return false;
    }

    // Emitir para o dashboard via callback
    if ((deliveryPlan.shouldEmitDashboard || remoteCommandMatched) && !radioengeObservation && eventCallback) {
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
            if (isSafeCaptureEnabled(brand) && brand !== 'VETTI') {
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
          identifiedSystemBySocket.delete(socket);
          if (brand === 'INTELBRAS') clearIntelbrasSession(socket);
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

  startViawebEventIntegration({
    onClientStatus: async (status) => {
      if (!status.online) return;
      const system = await getAlarmSystemByPanelIdentifier(status.isep, "isep", "VIAWEB", 9111);
      if (!system) {
        console.warn(`[VIAWEB] Status On Line recebido para ISEP ${status.isep} não cadastrado; supervisão ignorada.`);
        return;
      }
      const measurement = await recordSystemKeepAlive(system.id);
      console.log(`[KEEPALIVE] VIAWEB | Conta ${system.account} | ISEP ${status.isep} autenticado On Line${measurement ? ` | ${formatKeepAliveInterval(measurement.intervalMs)}` : ""}`);
    },
    onEvent: async (viawebEvent) => {
      const system = await getAlarmSystemByPanelIdentifier(viawebEvent.isep, "isep", "VIAWEB", 9111);
      if (!system) console.warn(`[VIAWEB] ISEP ${viawebEvent.isep} não cadastrado; o evento será preservado na Conta do Sistema.`);
      const persisted = await processEvent({
        brand: "VIAWEB",
        account: system?.account || viawebEvent.receivedAccount,
        qualifier: viawebEvent.qualifier,
        eventCode: viawebEvent.eventCode,
        partition: viawebEvent.partition,
        zoneUser: viawebEvent.zoneUser,
        receiverPort: 9111,
        rawData: viawebEvent.rawData,
        confirmedViawebSystemId: system?.id,
        confirmedViawebIsep: viawebEvent.isep,
        viawebInternalEventType: viawebEvent.internalEventType,
      }, viawebEvent.remoteIp);
      return {
        persisted,
        // A autorização ocorre somente no evento interno oficial e exclusivamente
        // quando o ISEP já corresponde a uma central ViaWeb cadastrada.
        authorizeIsep: Boolean(system && viawebEvent.requiresAuthorization),
      };
    },
  });
}
