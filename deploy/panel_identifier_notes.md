# Identificação de Painéis de Alarme

> **A Conta Contact ID é obrigatória e não pode ser substituída pelo ID ISEP.**

| Campo | Finalidade | Programação na central |
|---|---|---|
| Conta Contact ID | Identifica o evento no protocolo Contact ID atual. | Deve permanecer no campo de conta da central. |
| MAC Ethernet | Últimos 6 caracteres do adaptador Ethernet. | Cadastro de inventário e identificação quando o protocolo transmitir MAC. |
| IMEI GPRS | Últimos 6 caracteres do modem/chip GPRS. | Cadastro de inventário e identificação quando o protocolo transmitir IMEI. |
| ID ISEP | Código de 4 caracteres gerado pelo Police Central para centrais ViaWeb. | Somente no campo ISEP próprio da ViaWeb; nunca no campo Conta Contact ID. |

O receptor atual vincula eventos usando **Conta Contact ID + Marca + Porta receptora**. A utilização do MAC ou IMEI depende de confirmar, para cada fabricante, o formato exato do pacote recebido e o campo que carrega esse identificador. O ID ISEP é reservado para a ViaWeb.
