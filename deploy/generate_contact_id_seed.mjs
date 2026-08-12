import { readFileSync, writeFileSync } from 'node:fs';

const source = readFileSync(new URL('../import_cid.sql', import.meta.url), 'utf8');
const lines = source.split('\n').filter((line) => line.startsWith('INSERT INTO contact_id_codes'));

function parseValues(line) {
  const values = line.match(/'(?:(?:\\')|[^'])*'|\b\d+\b/g) ?? [];
  return values.map((value) => value.startsWith("'") ? value.slice(1, -1).replace(/\\'/g, "'") : Number(value));
}

function escapeSql(value) {
  return String(value ?? '').replace(/'/g, "\\'");
}

function priorityFrom(number) {
  if (number <= 1) return 'critical';
  if (number === 2) return 'high';
  if (number === 3) return 'medium';
  return 'low';
}

function statement(item) {
  const valueList = [
    `'${escapeSql(item.code)}'`, `'${escapeSql(item.qualifier)}'`, `'${escapeSql(item.fabricante)}'`, item.isUniversal ? 1 : 0,
    `'${escapeSql(item.description)}'`, `'${escapeSql(item.tipo)}'`, `'${escapeSql(item.cor)}'`, item.abreTela, item.fechaAutomatico,
    item.fechaComRestauracao, `'${escapeSql(item.codigoRestauracao)}'`, 0, item.prioridade, `'${escapeSql(item.category)}'`, `'${escapeSql(item.priority)}'`,
  ].join(', ');
  return `INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority) SELECT ${valueList} FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '${escapeSql(item.code)}' AND qualifier = '${escapeSql(item.qualifier)}' AND fabricante = '${escapeSql(item.fabricante)}');`;
}

const records = lines.map((line) => {
  const [code, fabricante, description, tipo, cor, abreTela, fechaAutomatico, fechaComRestauracao, codigoRestauracao, , prioridade, category] = parseValues(line);
  const record = { code, qualifier: 'E', fabricante, isUniversal: false, description, tipo, cor, abreTela, fechaAutomatico, fechaComRestauracao, codigoRestauracao, prioridade, category, priority: priorityFrom(prioridade) };
  if (fabricante === 'COMPATEC' && code === '401') Object.assign(record, { description: 'Desarme por Teclado', tipo: 'desarme', cor: '#F97316' });
  if (fabricante === 'COMPATEC' && code === '701') Object.assign(record, { description: 'Desarme por App', tipo: 'desarme', cor: '#F97316' });
  return record;
});

records.push(
  { code: '401', qualifier: 'R', fabricante: 'COMPATEC', isUniversal: false, description: 'Arme por Teclado', tipo: 'arme', cor: '#10B981', abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0, codigoRestauracao: '', prioridade: 5, category: 'arm_disarm', priority: 'low' },
  { code: '701', qualifier: 'R', fabricante: 'COMPATEC', isUniversal: false, description: 'Arme por App', tipo: 'arme', cor: '#10B981', abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0, codigoRestauracao: '', prioridade: 5, category: 'arm_disarm', priority: 'low' },
  { code: '401', qualifier: 'E', fabricante: 'UNIVERSAL', isUniversal: true, description: 'Desarme', tipo: 'desarme', cor: '#F97316', abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0, codigoRestauracao: '', prioridade: 3, category: 'arm_disarm', priority: 'low' },
  { code: '401', qualifier: 'R', fabricante: 'UNIVERSAL', isUniversal: true, description: 'Arme', tipo: 'arme', cor: '#10B981', abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0, codigoRestauracao: '', prioridade: 3, category: 'arm_disarm', priority: 'low' },
  { code: '130', qualifier: 'E', fabricante: 'UNIVERSAL', isUniversal: true, description: 'Disparo de Alarme - Zona/Setor', tipo: 'alarme', cor: '#EF4444', abreTela: 1, fechaAutomatico: 0, fechaComRestauracao: 1, codigoRestauracao: '130', prioridade: 1, category: 'alarm', priority: 'critical' },
  { code: '130', qualifier: 'R', fabricante: 'UNIVERSAL', isUniversal: true, description: 'Restauração de Alarme - Zona/Setor', tipo: 'restauracao', cor: '#3B82F6', abreTela: 0, fechaAutomatico: 0, fechaComRestauracao: 0, codigoRestauracao: '', prioridade: 5, category: 'restore', priority: 'low' },
  { code: '602', qualifier: 'E', fabricante: 'UNIVERSAL', isUniversal: true, description: 'Teste Periódico', tipo: 'teste', cor: '#6B7280', abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0, codigoRestauracao: '', prioridade: 5, category: 'test', priority: 'low' },
  { code: '610', qualifier: 'E', fabricante: 'UNIVERSAL', isUniversal: true, description: 'Teste Manual', tipo: 'teste', cor: '#6B7280', abreTela: 0, fechaAutomatico: 1, fechaComRestauracao: 0, codigoRestauracao: '', prioridade: 5, category: 'test', priority: 'low' },
);

const sql = [
  '-- Carga idempotente dos códigos Compatec, Vetti e Universais.',
  '-- Execute: mysql police_monitor < deploy/seed_contact_ids.sql',
  ...records.map(statement),
  "UPDATE contact_id_codes SET description = 'Desarme por Teclado', tipo = 'desarme', cor = '#F97316' WHERE fabricante = 'COMPATEC' AND code = '401' AND qualifier = 'E';",
  "UPDATE contact_id_codes SET description = 'Desarme por App', tipo = 'desarme', cor = '#F97316' WHERE fabricante = 'COMPATEC' AND code = '701' AND qualifier = 'E';",
  '',
].join('\n');

writeFileSync(new URL('./seed_contact_ids.sql', import.meta.url), sql);
console.log(`Gerada carga idempotente com ${records.length} registros em deploy/seed_contact_ids.sql`);
