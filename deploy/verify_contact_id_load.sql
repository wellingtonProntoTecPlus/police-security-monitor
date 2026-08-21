-- Execute: mysql police_monitor < deploy/verify_contact_id_load.sql
-- Base oficial importada: 26 códigos Compatec + 52 códigos Vetti + tabela JFL.
-- UNIVERSAL é extensível: inclui os 6 padrões e todos os códigos personalizados cadastrados pelo operador.

SELECT
  expected.fabricante,
  expected.quantidade_minima AS minimo_esperado,
  COALESCE(actual.quantidade_atual, 0) AS quantidade_atual,
  CASE
    WHEN COALESCE(actual.quantidade_atual, 0) >= expected.quantidade_minima THEN 'OK'
    ELSE 'PENDENTE'
  END AS resultado
FROM (
  SELECT 'COMPATEC' AS fabricante, 26 AS quantidade_minima
  UNION ALL SELECT 'VETTI', 52
  UNION ALL SELECT 'JFL', 162
) AS expected
LEFT JOIN (
  SELECT fabricante, COUNT(*) AS quantidade_atual
  FROM contact_id_codes
  GROUP BY fabricante
) AS actual ON actual.fabricante = expected.fabricante
UNION ALL
SELECT
  'UNIVERSAL / PERSONALIZADO' AS fabricante,
  6 AS minimo_esperado,
  COUNT(*) AS quantidade_atual,
  CASE WHEN COUNT(*) >= 6 THEN 'OK' ELSE 'PENDENTE' END AS resultado
FROM contact_id_codes
WHERE fabricante = 'UNIVERSAL';
