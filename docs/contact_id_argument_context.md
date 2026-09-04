# Contexto do Argumento Contact ID

## Regra geral

O campo final de um evento Contact ID não é, por definição, uma zona. O Police Central deve interpretá-lo pelo **código do evento** e pelo **qualificador** (`E` ou `R`) antes de apresentá-lo em qualquer fila, atendimento, relatório ou exportação. Quando não houver regra conhecida, ele será exibido como **Argumento**, e não como Zona.

## Mapeamentos operacionais validados

| Qualificador e código | Significado do argumento | Exibição esperada para argumento 2 |
| --- | --- | --- |
| `E361` | IP | Falha de Keep Alive IP 2 |
| `R361` | IP | Keep Alive restaurado IP 2 |
| `R401` | Usuário | Armado por Usuário 2 |
| `E401` | Usuário | Desarmado por Usuário 2 |
| `E570` | Zona isolada | Zona isolada 2 |
| `R570` | Zona isolada | Restaura Zona Isolada 2 |
| `E708` | PGM | PGM acionado 2 |
| `R708` | PGM | PGM desacionado 2 |
| `E407` | Usuário | Desarmado por aplicativo Usuário 2 |
| `R407` | Usuário | Armado por aplicativo Usuário 2 |

> A classificação é compartilhada por fabricantes e não cria uma tabela de eventos paralela. Códigos e descrições continuam sendo resolvidos pela tabela Contact ID universal e pelo perfil específico do fabricante, enquanto o contexto impede que IP, usuário e PGM sejam mostrados indevidamente como zona.
