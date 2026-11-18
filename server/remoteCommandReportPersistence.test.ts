import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const dbSource = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
const upgradeSql = fs.readFileSync(path.join(root, "deploy/upgrade_vps.sql"), "utf8");

function sourceBetween(source: string, start: string, end: string) {
  const startAt = source.indexOf(start);
  const endAt = source.indexOf(end, startAt + start.length);
  if (startAt < 0 || endAt < 0) throw new Error(`Não foi possível localizar o trecho ${start}`);
  return source.slice(startAt, endAt);
}

describe("relatório de Arme/Desarme remoto Compatec", () => {
  it("compõe notas persistidas dentro da transação ao finalizar, sem depender do cache do cliente", () => {
    const finalize = sourceBetween(
      dbSource,
      "export async function createOccurrenceAndCloseIncident",
      "export async function listOccurrences",
    );
    expect(finalize).toContain("await assertActivePanelLease(tx, incidentId");
    expect(finalize).toContain("current.notes?.trim()");
    expect(finalize).toContain("observations: finalObservations");
    expect(finalize).toContain("resolution: finalObservations");
    expect(finalize).toContain("note: finalObservations");
  });

  it("cria o primeiro registro dentro da reserva e sincroniza cada mudança de resultado", () => {
    const reserve = sourceBetween(
      dbSource,
      "export async function createExclusiveCompatecPhysicalCommand",
      "/** Compatibilidade para chamadas antigas",
    );
    const updateDelivery = sourceBetween(
      dbSource,
      "export async function updateAlarmRemoteCommandDelivery",
      "/** Anexa nota somente ao atendimento",
    );
    const confirm = sourceBetween(
      dbSource,
      "export async function recordRemoteCommandConfirmation",
      "/**\n * Um evento Vetti",
    );

    expect(reserve).toContain("await syncCompatecRemoteCommandOccurrence(tx, command)");
    expect(updateDelivery).toContain("await syncCompatecRemoteCommandOccurrence(tx, updatedCommand)");
    expect(updateDelivery).toContain("appendResponsePayload && command.responsePayload");
    expect(updateDelivery).toContain('`${command.responsePayload}\\n${updates.responsePayload || ""}`');
    expect(confirm).toContain("await syncCompatecRemoteCommandOccurrence(tx, updatedCommand)");
  });

  it("mantém uma ocorrência informativa, não cria evento/fila e deduplica pelo ID do comando", () => {
    const sync = sourceBetween(
      dbSource,
      "async function syncCompatecRemoteCommandOccurrence",
      "/**\n * Reserva atomicamente a única sequência VSec",
    );
    expect(sync).toContain('command.brand !== "COMPATEC"');
    expect(sync).toContain('command.transportMode !== "microbus_compatec"');
    expect(sync).toContain("[COMANDO REMOTO #${command.id}]");
    expect(sync).toContain("buildCompactRemoteCommandSummary");
    expect(sync).not.toContain("buildRemoteCommandOccurrenceText");
    expect(sync).not.toContain("Quadros enviados:");
    expect(sync).toContain('eventCode: "REMOTE"');
    expect(sync).toContain("tx.insert(occurrences)");
    expect(sync).toContain("tx.update(occurrences)");
    expect(sync).toContain('"isolate_zone", "restore_zone"');
    expect(sync).not.toContain("payload.requestedBy");
    expect(sync).toContain("operatorName");
    expect(sync).toContain("reason: command.reason");
    expect(sync).toContain("payload.zoneNumber");
    expect(sync).not.toContain("alarmEvents");
    expect(sync).not.toContain("tx.insert(incidents)");
  });

  it("reserva zona Compatec exclusivamente e revalida cadastro ativo antes de cada envio", () => {
    const reservation = sourceBetween(
      dbSource,
      "export async function createExclusiveCompatecPhysicalCommand",
      "/** Compatibilidade para chamadas antigas",
    );
    const dispatch = sourceBetween(
      dbSource,
      "export async function dispatchAlarmRemoteCommand",
      "/** Marca como indeterminado um despacho interrompido",
    );
    const pending = sourceBetween(
      dbSource,
      "export async function getPendingCompatecCommand",
      "/** Compatibilidade com o nome histórico usado pelo receptor MicroBus",
    );
    expect(reservation).toContain('if (!["arm", "disarm", "query_status", "query_sectors"].includes(data.commandType))');
    expect(reservation).toContain("await syncCompatecRemoteCommandOccurrence(tx, command)");
    expect(dispatch.match(/if \(input\.requiredZoneNumber !== undefined\)/g)).toHaveLength(2);
    expect(dispatch.match(/eq\(alarmZones\.isActive, true\)/g)).toHaveLength(4);
    expect(dispatch.match(/input\.requiredZoneNumbers \|\| \[\]/g)).toHaveLength(2);
    expect(dispatch).toContain("foi desativada antes da escrita do socket");
    expect(pending).toContain('"isolate_zone", "restore_zone"');
    expect(pending).toContain('inArray(alarmRemoteCommands.commandType, ["query_status", "query_sectors", "arm", "disarm"])');
    expect(pending).toContain("zoneNumber: command.zoneNumber");
    expect(pending).toContain("cancelado sem transmissão");
  });

  it("registra resposta de zona como ACK KA1 sem definir panelConfirmedAt", () => {
    const confirmation = sourceBetween(
      dbSource,
      "export async function recordRemoteCommandConfirmation",
      "/**\n * Um evento Vetti",
    );
    expect(confirmation).toContain('command.commandType === "isolate_zone" || command.commandType === "restore_zone"');
    expect(confirmation).toContain('"RESPOSTA KA1 RECEBIDA" : isCompatecArmDisarmAck ? "RESPOSTA KA4 RECEBIDA"');
    expect(confirmation).toContain("...(isResponseOnly ? {} : { panelConfirmedAt: confirmedAt })");
    expect(confirmation).toContain("syncCompatecRemoteCommandOccurrence(tx, updatedCommand)");
  });

  it("registra Arme/Desarme Compatec KA4 como resposta recebida, sem estado final confirmado", () => {
    const confirmation = sourceBetween(
      dbSource,
      "export async function recordRemoteCommandConfirmation",
      "/**\n * Um evento Vetti",
    );
    expect(confirmation).toContain('command.transportMode === "microbus_compatec"');
    expect(confirmation).toContain("const isResponseOnly = isZoneBypassCommand || isCompatecArmDisarmAck");
    expect(confirmation).toContain("...(isResponseOnly ? {} : { panelConfirmedAt: confirmedAt })");
    expect(confirmation).toContain("isCompatecArmDisarmAck ? \"RESPOSTA KA4 RECEBIDA\"");
  });

  it("inclui comandos antigos na migração VPS de forma idempotente e vinculados ao cliente correto", () => {
    const backfill = sourceBetween(
      upgradeSql,
      "-- Relatórios informativos compactos:",
      "-- Escala e presença operacional;",
    );
    expect(upgradeSql).toContain("INSERT INTO `occurrences`");
    expect(backfill).toContain("CREATE TEMPORARY TABLE `_pc_remote_command_summary`");
    expect(backfill).toContain("safeReason");
    expect(backfill).toContain("(F7|[A-F0-9]{8,}");
    expect(backfill).toContain("`compactObservations`");
    expect(backfill).not.toContain("UPDATE `occurrences`");
    expect(backfill).not.toContain("UPDATE `incidents`");
    expect(backfill).toContain("WHEN 'responded' THEN 'Resposta recebida; confira o estado final.'");
    expect(backfill).toContain("WHEN 'cancelled' THEN 'Cancelado; consulte o histórico.'");
    expect(backfill).toContain("WHEN 'expired' THEN 'Expirado; consulte o histórico.'");
    expect(backfill).not.toContain("Confirmado pela central.");
    expect(backfill).not.toContain("não enviado à central");
    expect(backfill).not.toContain("Resposta da central: ");
    expect(backfill).not.toContain("Origem: PoliceCentral");
    expect(backfill).toContain("WHERE NOT EXISTS (");
    expect(backfill).toContain("o.`logs` LIKE CONCAT('%[COMANDO REMOTO #', rc.`id`, ']%')");
    expect(upgradeSql).toContain("rc.`transportMode` = 'microbus_compatec'");
    expect(upgradeSql).toContain("rc.`commandType` IN ('arm', 'disarm')");
    expect(upgradeSql).toContain("LEFT JOIN `clients` c ON c.`id` = COALESCE(s.`clientId`, i.`clientId`)");
    expect(upgradeSql).toContain("WHERE o.`observations` LIKE CONCAT('%[COMANDO REMOTO #', rc.`id`, ']%')");
    expect(upgradeSql).toContain("OR o.`logs` LIKE CONCAT('%[COMANDO REMOTO #', rc.`id`, ']%')");
  });
});
