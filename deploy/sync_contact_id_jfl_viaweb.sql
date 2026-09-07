-- Atualização idempotente dos códigos exclusivos JFL e VIAWEB.
-- A tabela UNIVERSAL não é alterada por este arquivo.
START TRANSACTION;

-- Correções de código/qualificador conforme a tabela Contact ID validada.
DELETE FROM contact_id_codes
WHERE fabricante = 'JFL'
  AND ((code = '366' AND qualifier IN ('E', 'R'))
    OR (code = '430' AND qualifier = 'E')
    OR (code = '628' AND qualifier = 'E'));

UPDATE contact_id_codes SET
  description = 'Falha de Keep Alive IP', tipo = 'tecnico', cor = '#F59E0B',
  abre_tela = 1, fecha_automatico = 0, fecha_com_restauracao = 1,
  codigo_restauracao = '361', tempo_espera_segundos = 0, prioridade = 3,
  category = 'fault', priority = 'medium'
WHERE fabricante = 'JFL' AND code = '361' AND qualifier = 'E';

UPDATE contact_id_codes SET
  description = 'Keep Alive restaurado IP', tipo = 'restauracao', cor = '#3B82F6',
  abre_tela = 0, fecha_automatico = 0, fecha_com_restauracao = 0,
  codigo_restauracao = '', tempo_espera_segundos = 0, prioridade = 5,
  category = 'restore', priority = 'low'
WHERE fabricante = 'JFL' AND code = '361' AND qualifier = 'R';

UPDATE contact_id_codes SET
  description = 'Armado por aplicativo', tipo = 'arme', cor = '#10B981',
  abre_tela = 0, fecha_automatico = 1, fecha_com_restauracao = 0,
  codigo_restauracao = '', tempo_espera_segundos = 0, prioridade = 5,
  category = 'arm_disarm', priority = 'low'
WHERE fabricante = 'JFL' AND code = '407' AND qualifier = 'R';

UPDATE contact_id_codes SET
  description = 'Desarmado por aplicativo', tipo = 'desarme', cor = '#F97316',
  abre_tela = 0, fecha_automatico = 1, fecha_com_restauracao = 0,
  codigo_restauracao = '', tempo_espera_segundos = 0, prioridade = 5,
  category = 'arm_disarm', priority = 'low'
WHERE fabricante = 'JFL' AND code = '407' AND qualifier = 'E';

UPDATE contact_id_codes SET
  description = 'Autoarme por horário programado', tipo = 'arme', cor = '#10B981',
  abre_tela = 0, fecha_automatico = 1, fecha_com_restauracao = 0,
  codigo_restauracao = '', tempo_espera_segundos = 0, prioridade = 5,
  category = 'arm_disarm', priority = 'low'
WHERE fabricante = 'JFL' AND code = '403' AND qualifier = 'E';

UPDATE contact_id_codes SET
  description = 'Autodesarme por horário programado', tipo = 'desarme', cor = '#F97316',
  abre_tela = 0, fecha_automatico = 1, fecha_com_restauracao = 0,
  codigo_restauracao = '', tempo_espera_segundos = 0, prioridade = 5,
  category = 'arm_disarm', priority = 'low'
WHERE fabricante = 'JFL' AND code = '403' AND qualifier = 'R';

UPDATE contact_id_codes SET
  description = 'Detecção de pessoa', tipo = 'analitico', cor = '#EF4444',
  abre_tela = 1, fecha_automatico = 0, fecha_com_restauracao = 0,
  codigo_restauracao = '', tempo_espera_segundos = 0, prioridade = 2,
  category = 'analytics', priority = 'high'
WHERE fabricante = 'JFL' AND code = '730' AND qualifier = 'E';

UPDATE contact_id_codes SET
  description = 'Zona isolada (Bypass)'
WHERE fabricante = 'JFL' AND code = '570' AND qualifier = 'E';

-- Códigos ausentes e qualificadores corrigidos. Cada INSERT é repetível.
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '101', 'E', 'JFL', 0, 'Emergência médica', 'alarme', '#EF4444', 1, 0, 0, '', 0, 1, 'alarm', 'critical' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '101' AND qualifier = 'E' AND fabricante = 'JFL');
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '365', 'E', 'JFL', 0, 'Problema de módulo de Ethernet', 'tecnico', '#F59E0B', 1, 0, 1, '365', 0, 3, 'fault', 'medium' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '365' AND qualifier = 'E' AND fabricante = 'JFL');
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '365', 'R', 'JFL', 0, 'Restauração do problema de módulo de Ethernet', 'restauracao', '#3B82F6', 0, 0, 0, '', 0, 5, 'restore', 'low' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '365' AND qualifier = 'R' AND fabricante = 'JFL');
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '430', 'R', 'JFL', 0, 'Fim de ronda', 'sistema', '#8B5CF6', 0, 1, 0, '', 0, 5, 'system', 'low' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '430' AND qualifier = 'R' AND fabricante = 'JFL');
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '570', 'R', 'JFL', 0, 'Restauração de zona isolada (Bypass)', 'restauracao', '#3B82F6', 0, 0, 0, '', 0, 5, 'restore', 'low' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '570' AND qualifier = 'R' AND fabricante = 'JFL');
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '628', 'R', 'JFL', 0, 'Saiu da programação', 'sistema', '#8B5CF6', 0, 1, 0, '', 0, 5, 'system', 'low' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '628' AND qualifier = 'R' AND fabricante = 'JFL');
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '708', 'E', 'JFL', 0, 'PGM acionada', 'sistema', '#8B5CF6', 0, 1, 0, '', 0, 5, 'system', 'low' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '708' AND qualifier = 'E' AND fabricante = 'JFL');
INSERT INTO contact_id_codes (code, qualifier, fabricante, isUniversal, description, tipo, cor, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, tempo_espera_segundos, prioridade, category, priority)
SELECT '708', 'R', 'JFL', 0, 'PGM desacionada', 'restauracao', '#3B82F6', 0, 0, 0, '', 0, 5, 'restore', 'low' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM contact_id_codes WHERE code = '708' AND qualifier = 'R' AND fabricante = 'JFL');

-- VIAWEB: conserva os eventos específicos, corrigindo a classificação do teste periódico.
UPDATE contact_id_codes SET
  description = 'Teste periódico', tipo = 'teste', cor = '#6B7280',
  abre_tela = 0, fecha_automatico = 1, fecha_com_restauracao = 0,
  codigo_restauracao = '', tempo_espera_segundos = 0, prioridade = 5,
  category = 'test', priority = 'low'
WHERE fabricante = 'VIAWEB' AND code = '602' AND qualifier = 'E';

UPDATE contact_id_codes SET description = 'Desarmado por Usuário'
WHERE fabricante = 'VIAWEB' AND code = '401' AND qualifier = 'E';
UPDATE contact_id_codes SET description = 'Armado por Usuário'
WHERE fabricante = 'VIAWEB' AND code = '401' AND qualifier = 'R';

COMMIT;
