-- Conferência somente leitura do catálogo Contact ID Radioenge.
-- Execute: mysql -N -B police_monitor < deploy/verify_contact_id_radioenge.sql
-- A sincronização Radioenge não altera nem substitui registros UNIVERSAL.
SELECT 'RADIOENGE_TOTAL' AS secao,
       COUNT(*) AS quantidade,
       CASE WHEN COUNT(*) = 58 THEN 'OK' ELSE 'PENDENTE' END AS resultado
FROM contact_id_codes
WHERE fabricante = 'RADIOENGE';

SELECT 'RADIOENGE_CODIGO' AS secao,
       qualifier,
       code,
       description,
       tipo,
       abre_tela,
       fecha_automatico,
       fecha_com_restauracao,
       codigo_restauracao,
       category,
       priority
FROM contact_id_codes
WHERE fabricante = 'RADIOENGE'
ORDER BY CAST(code AS UNSIGNED), qualifier;

SELECT 'UNIVERSAL_PRESERVADA' AS secao,
       code,
       qualifier,
       description,
       abre_tela,
       fecha_automatico
FROM contact_id_codes
WHERE isUniversal = 1
ORDER BY CAST(code AS UNSIGNED), qualifier;

SELECT 'RADIOENGE_SEM_DUPLICAR_UNIVERSAL' AS secao,
       COUNT(*) AS quantidade,
       CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'ATENCAO' END AS resultado
FROM contact_id_codes radioenge
JOIN contact_id_codes universal
  ON universal.isUniversal = 1
 AND universal.code = radioenge.code
 AND universal.qualifier = radioenge.qualifier
WHERE radioenge.fabricante = 'RADIOENGE';
