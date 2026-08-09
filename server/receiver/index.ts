/**
 * RECEPTOR DE EVENTOS CONTACT ID
 * Integrado ao servidor Express do Police Central
 * Suporta: JFL, Intelbras, Vetti, Compatec, Radioenge
 */
import net from 'net';
import { createAlarmEvent, getAlarmSystemByAccount, getContactIdDescription } from '../db';

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

let eventCallback: EventCallback | null = null;

export function setEventCallback(cb: EventCallback) {
  eventCallback = cb;
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
      let resp = Buffer.from([0x7B, 0x07, seq, 0x21, 0x01, 0x05, 0x00]);
      resp = calcularChecksum(resp);
      socket.write(resp);
      break;
    }
    case 0x40: { // KEEP ALIVE
      let resp = Buffer.from([0x7B, 0x06, seq, 0x40, 0x05, 0x00]);
      resp = calcularChecksum(resp);
      socket.write(resp);
      break;
    }
    case 0x24: { // EVENTO
      const evento = parseStandardEvent(hex, brand, port);
      if (evento) {
        await processEvent(evento, socket.remoteAddress || '');
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

    await processEvent(eventoObj, socket.remoteAddress || '');
    socket.write(Buffer.from([0xFE]));
    return;
  }

  if (data.length >= 51 && data[1] === 0x95) {
    socket.write(Buffer.from([0xFE]));
    return;
  }
}

// Driver Vetti
async function handleVetti(socket: net.Socket, data: Buffer, port: number) {
  if (!Buffer.isBuffer(data) || data.length < 3) return;

  const fr = data.readUInt8(2);
  const cidDigit = (byte: number) => byte === 0x0A ? '0' : byte.toString(16).toUpperCase();

  switch (fr) {
    case 0xC0: // LOGIN
      socket.write(Buffer.from([0x02, 0x04, 0xC0, 0x80, 0xCF]));
      break;
    case 0xC2: // LOGIN 2
      socket.write(Buffer.from([0x02, 0x04, 0xC2, 0x80, 0xE5, 0x04]));
      break;
    case 0xAB: // KEEP ALIVE
      socket.write(Buffer.from([0x02, 0x04, 0xAB, 0x80, 0xAD]));
      break;
    case 0xC1: { // EVENTO CONTACT-ID
      if (data.length < 20) {
        socket.write(Buffer.from([0x02, 0x04, 0xC1, 0x80, 0xDA]));
        break;
      }
      const conta = hex2(data[4]) + hex2(data[5]);
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

      await processEvent(eventoObj, socket.remoteAddress || '');
      socket.write(Buffer.from([0x02, 0x04, 0xC1, 0x80, 0xDA]));
      break;
    }
  }
}

// Driver Compatec
async function handleCompatec(socket: net.Socket, data: Buffer, port: number) {
  const texto = data.toString('latin1');

  if (texto.startsWith('*')) { socket.write('+'); return; }
  if (texto.startsWith('#')) { socket.write('@'); return; }
  if (texto === '@') { socket.write('@'); return; }

  if (texto.startsWith('$')) {
    const payload = texto.substring(1, texto.length - 2);
    const account = payload.substring(0, 4);
    const qualificador = payload.substring(4, 5);
    const evento = payload.substring(5, 8);
    const particao = payload.substring(8, 10);
    const zona = payload.substring(10, 13);

    const eventoObj = {
      brand: 'COMPATEC',
      account,
      qualifier: qualificador === '1' || qualificador === 'E' ? 'E' : 'R',
      eventCode: evento,
      partition: particao,
      zoneUser: zona,
      receiverPort: port,
      rawData: texto,
    };

    await processEvent(eventoObj, socket.remoteAddress || '');
    socket.write('@');
    return;
  }
}

// Processa e salva o evento
async function processEvent(evento: any, remoteIp: string) {
  try {
    // Buscar descrição do código
    const codeInfo = await getContactIdDescription(evento.eventCode);
    const description = codeInfo?.description || `Evento ${evento.eventCode}`;
    const priority = codeInfo?.priority || 'medium';

    // Buscar sistema de alarme pela conta
    const system = await getAlarmSystemByAccount(evento.account);

    // Salvar evento no banco
    const savedEvent = await createAlarmEvent({
      alarmSystemId: system?.id || null,
      account: evento.account,
      brand: evento.brand,
      qualifier: evento.qualifier,
      eventCode: evento.eventCode,
      partition: evento.partition,
      zoneUser: evento.zoneUser,
      description,
      priority: priority as any,
      receiverPort: evento.receiverPort,
      remoteIp: remoteIp.replace('::ffff:', ''),
      rawData: evento.rawData,
    });

    // Emitir para o dashboard via callback
    if (eventCallback) {
      eventCallback({
        id: savedEvent.id,
        ...evento,
        description,
        priority,
        clientId: system?.clientId,
        alarmSystemId: system?.id,
        remoteIp: remoteIp.replace('::ffff:', ''),
        timestamp: new Date().toISOString(),
      });
    }

    console.log(`[RECIP] ${evento.brand} | Conta ${evento.account} | ${evento.qualifier}${evento.eventCode} | ${description}`);
  } catch (err: any) {
    console.error('[RECIP] Erro ao processar evento:', err.message);
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
