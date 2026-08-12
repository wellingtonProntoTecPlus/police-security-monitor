# Carga Contact ID — Police Central

| Grupo | Quantidade de referência | Regra |
|---|---:|---|
| Compatec | 26 | Carga base fornecida pela tabela Compatec. |
| Vetti | 52 | Carga base fornecida pela tabela Vetti. |
| Compatec + Vetti | 78 | Total da carga base de fabricantes. |
| Universais | Mínimo de 6 | Inclui E401, R401, E130, R130, E602 e E610; códigos personalizados do operador são preservados e somam ao total. |

Para validar a VPS sem apagar ou alterar códigos, execute:

```bash
mysql police_monitor < deploy/verify_contact_id_load.sql
```
