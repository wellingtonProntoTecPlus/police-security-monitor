export type CompactRemoteCommand = {
  commandId?: number;
  commandType?: string;
  action?: string;
  reason?: string | null;
  status?: string | null;
  response?: string | null;
  zoneNumbers?: number[];
};

type ParsedRemoteCommand = CompactRemoteCommand & { firstSeen: number };
type CommandHeader = { id: number; index: number; end: number };
type ParsedBlock = { command: ParsedRemoteCommand; humanLines: string[] };

const REMOTE_COMMAND_HEADER = /^\[COMANDO REMOTO #(\d+)(?: [^\]\r\n]+)?\][ \t]*\r?$/gm;
const COMMAND_AUDIT_FOOTER = /^Auditoria do comando:\s*#(\d+)[ \t]*\r?$/gm;

function sanitizeReason(value?: string | null) {
  if (!value) return "";
  let reason = value.trim();
  const nestedReason = reason.match(/(?:^|;\s*)Motivo:\s*(.+)$/i);
  if (nestedReason) reason = nestedReason[1].trim();
  reason = reason.replace(/^Solicitado por\s*:\s*/i, "");
  reason = reason.replace(/\b(?:MB\s*=\s*)?(?:AK|KA)\d(?:\[[^\]]*\])?/gi, "");
  reason = reason.replace(/\b(?:F7|[A-F0-9]{8,}|(?:[A-F0-9]{2,}[,;\s]+){2,}[A-F0-9]{2,})\b/gi, "");
  return reason.replace(/\s+/g, " ").slice(0, 28).trim();
}

function compactText(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function actionForType(commandType?: string, action?: string, zoneNumbers: number[] = []) {
  const zoneScope = zoneNumbers.length === 1
    ? ` ${zoneNumbers[0]}`
    : zoneNumbers.length > 1 && zoneNumbers.length <= 4
      ? ` ${zoneNumbers.join(", ")}`
      : zoneNumbers.length > 4
        ? ` ${zoneNumbers.slice(0, 4).join(", ")} +${zoneNumbers.length - 4}`
        : "";
  switch (commandType) {
    case "arm": return "Arme";
    case "disarm": return "Desarme";
    case "configure_zones": return `Alteração de setores${zoneScope}`;
    case "isolate_zone": return `Anulação de setor${zoneScope}`;
    case "restore_zone": return `Restauração de setor${zoneScope}`;
  }
  const normalized = (action || "Comando remoto").replace(/\s+via PoliceCentral$/i, "").trim();
  if (/desarme remoto/i.test(normalized)) return "Desarme";
  if (/arme remoto/i.test(normalized)) return "Arme";
  if (/configura[cç][aã]o(?: de setores)?/i.test(normalized)) return `Alteração de setores${zoneScope}`;
  if (/inibi[cç][aã]o de zona/i.test(normalized)) return `Anulação de setor${zoneScope}`;
  if (/restaura[cç][aã]o de zona/i.test(normalized)) return `Restauração de setor${zoneScope}`;
  return normalized || "Comando remoto";
}

function outcomeFor(statusValue?: string | null): string {
  switch ((statusValue || "unknown").toLowerCase()) {
    case "failed": return "Falha registrada; conferir histórico";
    case "expired": return "Expirado; conferir histórico";
    case "cancelled": return "Cancelado; conferir histórico";
    case "dispatch_unknown": return "Resultado incerto; conferir central";
    case "queued":
    case "waiting_connection":
    case "prepared":
    case "dispatching":
    case "sent": return "Aguardando retorno";
    case "responded": return "Resposta recebida; conferir estado final";
    case "reconciled": return "Resultado conferido manualmente";
    case "simulated": return "Simulação; não enviado";
    default: return "Registro incompleto; consultar histórico";
  }
}

function parseCommandType(action: string) {
  if (/desarme remoto/i.test(action)) return "disarm";
  if (/arme remoto/i.test(action)) return "arm";
  if (/configura[cç][aã]o(?: de setores)?/i.test(action)) return "configure_zones";
  if (/inibi[cç][aã]o de zona/i.test(action)) return "isolate_zone";
  if (/restaura[cç][aã]o de zona/i.test(action)) return "restore_zone";
  return undefined;
}

function technicalCommandLine(line: string) {
  return /^\s*(?:\[COMANDO REMOTO #\d+[^\]]*\]|A[cç][aã]o:\s*|Opera[cç][aã]o:\s*|Origem:\s*|Operador:\s*|Solicitado por:\s*|Zona:\s*\d+|Setor\s+\d+:|Motivo:\s*|Resultado:\s*|Resposta da central:\s*|Usu[aá]rio informado pela central:\s*|Usu[aá]rio t[eé]cnico do comando:\s*|Auditoria do comando:\s*#\d+|Quadros enviados:\s*|Zonas selecionadas para inibir|Sele[cç][aã]o zona\s+\d+:|MB\s*=|(?:AK|KA)\d\b|(?:HEX|FRAME|PAYLOAD):)/i.test(line)
    || /^\s*(?:[A-F0-9]{16,}|(?:[A-F0-9]{2}[ ,;:]+){7,}[A-F0-9]{2})\s*$/i.test(line)
    || /^\s*F7\s*$/i.test(line);
}

function parseCommandBlock(block: string, commandId: number, firstSeen: number, complete: boolean): ParsedBlock {
  const lines = block.split(/\r?\n/);
  const action = lines.map((line) => line.match(/^(?:A[cç][aã]o|Opera[cç][aã]o):\s*(.*)$/i)?.[1]).find(Boolean) || "";
  const reasonIndex = lines.findIndex((line) => /^Motivo:\s*/i.test(line));
  const reason = reasonIndex >= 0 ? lines[reasonIndex].replace(/^Motivo:\s*/i, "").trim() : "";
  const result = lines.map((line) => line.match(/^Resultado:\s*(.*)$/i)?.[1]).find(Boolean) || "";
  const response = lines.map((line) => line.match(/^Resposta da central:\s*(.*)$/i)?.[1]).filter(Boolean).join(" ");
  const responseIndex = lines.findIndex((line) => /^Resposta da central:/i.test(line));
  const explicitlyNegatedReceipt = /\b(?:não|nao|sem|nenhuma|nenhum)\s+(?:(?:houve|foi|há|tem|tinha|teria)\s+)?(?:a\s+)?(?:resposta\s+|confirma[cç][aã]o\s+)?(?:recebid[oa]|confirmad[oa])/i.test(result)
    || /\b(?:resposta|confirma[cç][aã]o)\s+(?:não|nao)\s+(?:foi\s+)?(?:recebid[oa]|confirmad[oa])/i.test(result)
    || /\b(?:não|nao)\s+(?:recebeu|obteve|teve)\s+(?:a\s+)?(?:resposta|confirma[cç][aã]o)/i.test(result)
    || /\b(?:não|nao)\s+(?:houve|confirmou|confirma|recebeu|obteve|teve)\s+(?:(?:a|o)\s+)?(?:resposta|confirma[cç][aã]o|recebimento)\b/i.test(result);
  const zoneNumbers = lines.map((line) => line.match(/^(?:Setor|Zona)\s+(\d+):/i)?.[1] || line.match(/^Zona:\s*(\d+)/i)?.[1]).filter(Boolean).map(Number);
  let status = "unknown";
  if (explicitlyNegatedReceipt && response) status = "dispatch_unknown";
  else if (/resultado indeterminado|resultado incerto/i.test(result)) status = "dispatch_unknown";
  else if (/falha/i.test(result)) status = "failed";
  else if (/cancelad/i.test(result)) status = "cancelled";
  else if (/expirad/i.test(result)) status = "expired";
  else if (/simula[cç][aã]o/i.test(result)) status = "simulated";
  else if (/aguardando|ainda n[aã]o enviado|reservado/i.test(result)) status = "waiting_connection";
  else if (/resultado conferido manualmente|reconciliad[oa]/i.test(result)) status = "reconciled";
  else if (!explicitlyNegatedReceipt && (response || /\b(?:resposta\s+(?:foi\s+)?recebida|confirmado\s+pela\s+central|confirma[cç][aã]o recebida)\b/i.test(result))) status = "responded";

  const humanLines = lines
    .filter((line, index) => {
      if (index === 0 || index === reasonIndex) return false;
      if (complete && responseIndex >= 0 && index > responseIndex && !/^(?:Observa[cç][aã]o humana|Anota[cç][aã]o humana|Nota humana|T[aá]tico informou):/i.test(line.trim())) return false;
      return true;
    })
    .filter((line) => !technicalCommandLine(line))
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    command: { commandId, commandType: parseCommandType(action), action, reason, status, response, zoneNumbers: Array.from(new Set(zoneNumbers)).sort((a, b) => a - b), firstSeen },
    humanLines,
  };
}

function mergeParsedCommand(existing: ParsedRemoteCommand, next: ParsedRemoteCommand) {
  existing.commandType = next.commandType || existing.commandType;
  existing.action = next.action || existing.action;
  existing.reason = next.reason || existing.reason;
  if (next.status && next.status !== "unknown") existing.status = next.status;
  existing.response = [existing.response, next.response].filter(Boolean).join(" ");
  existing.zoneNumbers = Array.from(new Set([...(existing.zoneNumbers || []), ...(next.zoneNumbers || [])])).sort((a, b) => a - b);
}

export function buildCompactRemoteCommandSummary(commands: CompactRemoteCommand[]) {
  if (!commands.length) return "";
  const groups = new Map<string, { label: string; count: number }>();
  const allReasons: string[] = [];
  const allOutcomes: string[] = [];
  for (const command of commands) {
    const zoneNumbers = Array.from(new Set((command.zoneNumbers || []).filter(Number.isInteger))).sort((a, b) => a - b);
    const label = actionForType(command.commandType, command.action, zoneNumbers);
    const reason = sanitizeReason(command.reason);
    const outcome = outcomeFor(command.status);
    const group = groups.get(label) || { label, count: 0 };
    group.count += 1;
    groups.set(label, group);
    if (reason && !allReasons.includes(reason)) allReasons.push(reason);
    if (!allOutcomes.includes(outcome)) allOutcomes.push(outcome);
  }
  const actionSummary = Array.from(groups.values()).map((group) => `${group.label}${group.count > 1 ? ` ×${group.count}` : ""}`).join("; ");
  const reasonSummary = allReasons.length ? `Motivo: ${allReasons[allReasons.length - 1]}${allReasons.length > 1 ? ` (+${allReasons.length - 1} outro${allReasons.length > 2 ? "s" : ""})` : ""}` : "";
  const outcomeSummary = allOutcomes.length === 1
    ? allOutcomes[0]
    : "Resultados variados; confira o histórico";
  const countLabel = commands.length === 1 ? "Comando" : `Comandos (${commands.length})`;
  const firstLine = compactText(`${countLabel}: ${actionSummary}.`, 100);
  const secondLine = compactText([reasonSummary, outcomeSummary].filter(Boolean).join(" · ") + ".", 100);
  return [firstLine, secondLine].filter(Boolean).join("\n");
}

function getHeaders(notes: string): CommandHeader[] {
  const headers: CommandHeader[] = [];
  REMOTE_COMMAND_HEADER.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = REMOTE_COMMAND_HEADER.exec(notes))) {
    headers.push({ id: Number(match[1]), index: match.index, end: REMOTE_COMMAND_HEADER.lastIndex });
  }
  REMOTE_COMMAND_HEADER.lastIndex = 0;
  return headers;
}

/**
 * Presentation/report summary only. Raw notes and structured command payloads are never changed.
 * Both complete and legacy incomplete command blocks are summarized; external or clearly labelled human notes survive.
 */
export function compactRemoteCommandAuditNotes(notes?: string | null) {
  if (!notes) return "";
  const headers = getHeaders(notes);
  if (!headers.length) {
    return notes.split(/\r?\n/).map((line) => line.trim()).filter((line) => Boolean(line) && line !== "Ocorrência manual criada pelo operador" && !/^\[COMANDO REMOTO #\d+\]$/.test(line)).join("\n");
  }

  const commands = new Map<number, ParsedRemoteCommand>();
  const seenIds: number[] = [];
  const humanLines: string[] = [];
  let cursor = 0;
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    humanLines.push(...notes.slice(cursor, header.index).split(/\r?\n/));
    const nextHeaderIndex = headers[index + 1]?.index ?? notes.length;
    COMMAND_AUDIT_FOOTER.lastIndex = header.end;
    const footer = COMMAND_AUDIT_FOOTER.exec(notes);
    const footerInsideSegment = footer && Number(footer[1]) === header.id && footer.index < nextHeaderIndex;
    const blockEnd = footerInsideSegment ? COMMAND_AUDIT_FOOTER.lastIndex : nextHeaderIndex;
    const parsed = parseCommandBlock(notes.slice(header.index, blockEnd), header.id, index, Boolean(footerInsideSegment));
    const hasCommandDetail = Boolean(parsed.command.commandType || parsed.command.action || parsed.command.reason || parsed.command.response || parsed.command.status !== "unknown" || parsed.command.zoneNumbers?.length);
    const existing = commands.get(header.id);
    if (hasCommandDetail && !existing) {
      commands.set(header.id, parsed.command);
      seenIds.push(header.id);
    } else if (hasCommandDetail && existing) {
      mergeParsedCommand(existing, parsed.command);
    }
    humanLines.push(...parsed.humanLines);
    cursor = blockEnd;
    COMMAND_AUDIT_FOOTER.lastIndex = 0;
  }
  humanLines.push(...notes.slice(cursor).split(/\r?\n/));
  const cleanedHumanNotes = humanLines
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && line !== "Ocorrência manual criada pelo operador" && !/^\[COMANDO REMOTO #\d+\]$/.test(line));
  const summary = buildCompactRemoteCommandSummary(seenIds.map((id) => commands.get(id)!));
  return [summary, cleanedHumanNotes.join("\n")].filter(Boolean).join("\n").trim();
}

export function hasCompleteRemoteCommandAuditBlock(notes?: string | null) {
  if (!notes) return false;
  const headers = getHeaders(notes);
  return headers.some((header) => {
    COMMAND_AUDIT_FOOTER.lastIndex = header.end;
    const footer = COMMAND_AUDIT_FOOTER.exec(notes);
    COMMAND_AUDIT_FOOTER.lastIndex = 0;
    return Boolean(footer && Number(footer[1]) === header.id);
  });
}
