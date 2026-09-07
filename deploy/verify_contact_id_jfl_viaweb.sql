-- Conferência somente leitura pós-sincronização JFL e VIAWEB.
-- A primeira consulta confirma a tabela Universal sem alterações.
SELECT 'UNIVERSAL_PRESERVADA' AS secao, code, qualifier, description, abre_tela, fecha_automatico
FROM contact_id_codes
WHERE isUniversal = 1
ORDER BY CAST(code AS UNSIGNED), qualifier;

-- Lista integral dos registros exclusivos JFL e VIAWEB e seus comportamentos operacionais.
SELECT fabricante, code, qualifier, description, tipo, abre_tela, fecha_automatico, fecha_com_restauracao, codigo_restauracao, category, priority
FROM contact_id_codes
WHERE fabricante IN ('JFL', 'VIAWEB')
ORDER BY fabricante, CAST(code AS UNSIGNED), qualifier;

-- Pontos críticos alinhados com a tabela validada.
SELECT 'PONTOS_CRITICOS' AS secao, fabricante, code, qualifier, description, abre_tela, fecha_automatico
FROM contact_id_codes
WHERE (fabricante = 'JFL' AND code IN ('101', '361', '365', '403', '407', '430', '570', '628', '708', '730'))
   OR (fabricante = 'VIAWEB' AND code IN ('401', '602', '603'))
ORDER BY fabricante, CAST(code AS UNSIGNED), qualifier;
