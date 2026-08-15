# Tabela Contact ID — JFL

## Fonte e formato de importação

Os códigos desta tabela foram extraídos do arquivo **CONTACIDJFL.pdf** fornecido pelo usuário, na seção “Tabela de Eventos Contact ID”. O manual apresenta os códigos em quatro dígitos, em que o primeiro dígito representa a natureza do reporte. No Police Central, eles foram normalizados para o formato operacional já usado pelo receptor: **código de três dígitos** combinado com o qualificador **E** para evento/desarme e **R** para restauração/arme.

| Medida | Resultado |
|---|---:|
| Registros JFL importados | 101 |
| Eventos/Desarmes (E) | 62 |
| Restaurações/Armes (R) | 39 |
| Exemplos validados | E130/R130, E301/R301, E401/R401, E602 |

## Regras operacionais aplicadas

Os disparos, pânicos e acessos negados foram classificados para abrir atendimento conforme a criticidade. Falhas técnicas, como falta de AC, bateria, Ethernet, GPRS e Wi-Fi, preservam o vínculo com seus respectivos restauros. Arme, desarme, testes periódicos, programação e eventos informativos são carregados com a política automática coerente com o fluxo operacional já existente.

O receptor passa a procurar primeiro o código da **marca efetivamente identificada** no evento — por exemplo, JFL — e somente então usa o código universal. Isso evita que descrições de fabricantes diferentes sejam usadas para o mesmo número Contact ID.

## Arquivos envolvidos

| Arquivo | Responsabilidade |
|---|---|
| `deploy/jfl_contact_id_records.mjs` | Fonte estruturada dos 101 registros JFL. |
| `deploy/generate_contact_id_seed.mjs` | Gera a carga SQL idempotente de todos os fabricantes. |
| `deploy/seed_contact_ids.sql` | Carga usada durante a atualização da VPS. |
| `deploy/verify_contact_id_load.sql` | Confere a quantidade mínima carregada por fabricante. |
