-- Sincronização segura dos códigos universais de falha/restauração de Keep Alive.
-- Não altera registros Universal já personalizados pelo usuário.
-- Execute na VPS após atualizar o repositório:
--   mysql police_monitor < deploy/sync_contact_id_keepalive.sql

INSERT INTO contact_id_codes
  (code, qualifier, fabricante, isUniversal, description, tipo, cor,
   abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao,
   tempo_espera_segundos, prioridade, category, priority)
SELECT '361', 'E', 'UNIVERSAL', 1, 'Falha de Keep Alive IP', 'tecnico', '#F59E0B',
       1, 0, 1, '361', 0, 3, 'fault', 'medium'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM contact_id_codes
  WHERE code = '361' AND qualifier = 'E' AND isUniversal = 1
);

INSERT INTO contact_id_codes
  (code, qualifier, fabricante, isUniversal, description, tipo, cor,
   abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao,
   tempo_espera_segundos, prioridade, category, priority)
SELECT '361', 'R', 'UNIVERSAL', 1, 'Keep Alive restaurado IP', 'restauracao', '#3B82F6',
       0, 0, 0, '', 0, 5, 'restore', 'low'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM contact_id_codes
  WHERE code = '361' AND qualifier = 'R' AND isUniversal = 1
);

SELECT fabricante, isUniversal, code, qualifier, description, abre_tela,
       fecha_com_restauracao, codigo_restauracao
FROM contact_id_codes
WHERE code = '361' AND (isUniversal = 1 OR fabricante IN ('JFL', 'RADIOENGE'))
ORDER BY isUniversal DESC, fabricante, qualifier;
