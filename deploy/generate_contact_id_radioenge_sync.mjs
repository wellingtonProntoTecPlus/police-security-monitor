import { writeFileSync } from "node:fs";
import { radioengeContactIdRecords } from "./radioenge_contact_id_records.mjs";

function escapeSql(value) {
  return String(value ?? "").replace(/'/g, "\\'");
}

function values(item) {
  return [
    `'${escapeSql(item.code)}'`,
    `'${escapeSql(item.qualifier)}'`,
    `'${escapeSql(item.fabricante)}'`,
    item.isUniversal ? 1 : 0,
    `'${escapeSql(item.description)}'`,
    `'${escapeSql(item.tipo)}'`,
    `'${escapeSql(item.cor)}'`,
    item.abreTela,
    item.fechaAutomatico,
    item.fechaComRestauracao,
    `'${escapeSql(item.codigoRestauracao)}'`,
    0,
    item.prioridade,
    `'${escapeSql(item.category)}'`,
    `'${escapeSql(item.priority)}'`,
  ].join(", ");
}

function insert(item) {
  return `INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority) SELECT ${values(item)} FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '${escapeSql(item.code)}' AND qualifier = '${escapeSql(item.qualifier)}' AND fabricante = 'RADIOENGE');`;
}

function update(item) {
  return `UPDATE contact_id_codes SET isUniversal = ${item.isUniversal ? 1 : 0}, description = '${escapeSql(item.description)}', tipo = '${escapeSql(item.tipo)}', cor = '${escapeSql(item.cor)}', abre_tela = ${item.abreTela}, fecha_automatico = ${item.fechaAutomatico}, fecha_com_restauracao = ${item.fechaComRestauracao}, codigo_restauracao = '${escapeSql(item.codigoRestauracao)}', tempo_espera_segundos = 0, prioridade = ${item.prioridade}, category = '${escapeSql(item.category)}', priority = '${escapeSql(item.priority)}' WHERE fabricante = 'RADIOENGE' AND code = '${escapeSql(item.code)}' AND qualifier = '${escapeSql(item.qualifier)}';`;
}

const sql = [
  "-- Sincronização idempotente dos códigos Contact ID exclusivos da Radioenge.",
  "-- A tabela UNIVERSAL não é alterada por este arquivo.",
  "-- Catálogo baseado na Tabela 8 do manual da central CHR-128 Radioenge.",
  "-- Execute: mysql police_monitor < deploy/sync_contact_id_radioenge.sql",
  "START TRANSACTION;",
  ...radioengeContactIdRecords.map(insert),
  ...radioengeContactIdRecords.map(update),
  "COMMIT;",
  "",
].join("\n");

writeFileSync(new URL("./sync_contact_id_radioenge.sql", import.meta.url), sql);
console.log(`Gerada sincronização Radioenge com ${radioengeContactIdRecords.length} registros.`);
