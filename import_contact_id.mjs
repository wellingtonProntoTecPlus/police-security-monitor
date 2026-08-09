import { drizzle } from "drizzle-orm/mysql2";
import dotenv from "dotenv";
dotenv.config();

const db = drizzle(process.env.DATABASE_URL);

const compatecCodes = [
  { code: "120", description: "Pânico audível gerado por Teclado", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "121", description: "Acesso sob senha de coação", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "122", description: "Pânico silencioso gerado por Teclado", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "130", description: "Alarme de intrusão", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "142", description: "Alarme de curto circuito no setor duplicado", tipo: "alarme", cor: "#EF4444", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "144", description: "Alarme de violação do Tamper", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "301", description: "Corte da rede elétrica da central", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "301" },
  { code: "302", description: "Bateria baixa da central", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "302" },
  { code: "306", description: "Alteração da programação da central", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "381", description: "Perda de comunicação com sensor sem fio", tipo: "tecnico", cor: "#F59E0B", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "381" },
  { code: "383", description: "Tamper do sensor sem fio", tipo: "alarme", cor: "#EF4444", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "384", description: "Bateria baixa do sensor sem fio", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "384" },
  { code: "401", description: "Arme/Desarme por Teclado", tipo: "arme", cor: "#10B981", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "409", description: "Arme/Desarme por Controle", tipo: "arme", cor: "#10B981", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "421", description: "Tentativa de acesso não autorizada", tipo: "alarme", cor: "#EF4444", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "570", description: "Anulação permanente", tipo: "sistema", cor: "#8B5CF6", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "573", description: "Anulação temporária", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "601", description: "Teste manual por Teclado", tipo: "teste", cor: "#6B7280", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "627", description: "Entrada em modo de programação", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "628", description: "Saída do modo de programação", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "701", description: "Arme/Desarme por App", tipo: "arme", cor: "#10B981", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "702", description: "Pânico silencioso por App", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "703", description: "Pânico audível por App", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "704", description: "Pânico silencioso por Controle", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "705", description: "Pânico audível por Controle", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "602", description: "Teste periódico", tipo: "teste", cor: "#6B7280", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
];

const vettiCodes = [
  { code: "1120", description: "Pânico com acionamento de sirene", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "1121", description: "Coação", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "1122", description: "Pânico silencioso", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "1130", description: "Disparo de zona", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3130" },
  { code: "1133", description: "Disparo de zona 24 horas", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3133" },
  { code: "1137", description: "Tamper painel aberto", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3137" },
  { code: "1141", description: "Laço Aberto (sensor abertura aberto)", tipo: "alarme", cor: "#EF4444", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3141" },
  { code: "1144", description: "Tamper sensor aberto", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3144" },
  { code: "1146", description: "Disparo de zona silenciosa", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3146" },
  { code: "1147", description: "Falha de comunicação com sensor", tipo: "tecnico", cor: "#F59E0B", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3147" },
  { code: "1301", description: "Falha de AC", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3301" },
  { code: "1302", description: "Bateria principal baixa", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3302" },
  { code: "1305", description: "Reset da central", tipo: "sistema", cor: "#8B5CF6", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "1308", description: "Desligamento da central (Shutdown)", tipo: "tecnico", cor: "#F59E0B", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3308" },
  { code: "1309", description: "Falha no teste de bateria principal", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3309" },
  { code: "1311", description: "Bateria principal ausente", tipo: "tecnico", cor: "#F59E0B", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3311" },
  { code: "1313", description: "Reset de fábrica", tipo: "sistema", cor: "#8B5CF6", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "1321", description: "Sirene com fio ausente", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3321" },
  { code: "1384", description: "Bateria baixa de sensor sem fio", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3384" },
  { code: "1401", description: "Desarme", tipo: "desarme", cor: "#F97316", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1403", description: "Desarme Automático", tipo: "desarme", cor: "#F97316", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1407", description: "Desarme Remoto", tipo: "desarme", cor: "#F97316", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1454", description: "Falha Arme", tipo: "tecnico", cor: "#F59E0B", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "1530", description: "Sensor / Zona Inibida", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 1, codigoRestauracao: "3530" },
  { code: "1570", description: "Sensor / Zona Isolada", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 1, codigoRestauracao: "3570" },
  { code: "1602", description: "Teste periódico", tipo: "teste", cor: "#6B7280", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1627", description: "Entrada Modo Programação Painel", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1628", description: "Saída Modo Programação Painel", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1708", description: "PGM acionado", tipo: "sistema", cor: "#8B5CF6", prioridade: 4, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1840", description: "Disparo de zona abertura Shox", tipo: "alarme", cor: "#EF4444", prioridade: 1, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3840" },
  { code: "1850", description: "Disparo de zona Portão", tipo: "alarme", cor: "#EF4444", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3850" },
  { code: "1860", description: "PGM ligado", tipo: "sistema", cor: "#8B5CF6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 1, codigoRestauracao: "3860" },
  { code: "1861", description: "PGM pulso", tipo: "sistema", cor: "#8B5CF6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1870", description: "Teclado - Tamper Violado", tipo: "alarme", cor: "#EF4444", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3870" },
  { code: "1871", description: "Teclado - Excesso de tentativas senha inválida", tipo: "alarme", cor: "#EF4444", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3871" },
  { code: "1872", description: "Teclado - Bateria baixa", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3872" },
  { code: "1873", description: "Teclado - Fonte ausente", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3873" },
  { code: "1874", description: "Teclado - Perda de comunicação", tipo: "tecnico", cor: "#F59E0B", prioridade: 2, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: "3874" },
  { code: "1903", description: "Firmware - Download iniciado", tipo: "sistema", cor: "#8B5CF6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "1904", description: "Firmware - Falha na atualização", tipo: "tecnico", cor: "#F59E0B", prioridade: 3, abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 0 },
  { code: "1905", description: "Firmware - Atualização concluída", tipo: "sistema", cor: "#8B5CF6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  // Restaurações Vetti
  { code: "3130", description: "Restauração de disparo de zona", tipo: "restauracao", cor: "#3B82F6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3133", description: "Restauração de disparo zona 24h", tipo: "restauracao", cor: "#3B82F6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3137", description: "Restauração de Tamper painel", tipo: "restauracao", cor: "#3B82F6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3141", description: "Restauração de Laço Aberto", tipo: "restauracao", cor: "#3B82F6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3144", description: "Restauração de Tamper sensor", tipo: "restauracao", cor: "#3B82F6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3301", description: "Restauração de falha de AC", tipo: "restauracao", cor: "#3B82F6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3302", description: "Restauração de bateria baixa", tipo: "restauracao", cor: "#3B82F6", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3401", description: "Arme", tipo: "arme", cor: "#10B981", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3403", description: "Arme Automático", tipo: "arme", cor: "#10B981", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3407", description: "Arme Remoto", tipo: "arme", cor: "#10B981", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
  { code: "3441", description: "Arme Stay", tipo: "arme", cor: "#10B981", prioridade: 5, abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0 },
];

// Build SQL
const allCodes = [
  ...compatecCodes.map(c => ({ ...c, fabricante: "COMPATEC" })),
  ...vettiCodes.map(c => ({ ...c, fabricante: "VETTI" })),
];

let sql = "DELETE FROM contact_id_codes;\n";
for (const c of allCodes) {
  const desc = c.description.replace(/'/g, "\\'");
  sql += `INSERT INTO contact_id_codes (code, fabricante, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category) VALUES ('${c.code}', '${c.fabricante}', '${desc}', '${c.tipo}', '${c.cor}', ${c.abreTela}, ${c.fechaAutomatico}, ${c.fechaComRestauracao}, '${c.codigoRestauracao || ""}', 0, ${c.prioridade}, 'alarm');\n`;
}

import { writeFileSync } from "fs";
writeFileSync("/home/ubuntu/police-security-monitor/import_cid.sql", sql);
console.log(`Gerado ${allCodes.length} códigos Contact ID em import_cid.sql`);
