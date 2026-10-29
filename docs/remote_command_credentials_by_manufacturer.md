# Credenciais Técnicas para Comandos Remotos

## Regra de segurança do Police Central

O operador já autenticado no Police Central é identificado no histórico, com data, hora e motivo. A sessão do operador **não substitui** a credencial técnica que a central exige para aceitar uma ordem remota. Essa credencial nunca deve ser incluída no histórico de auditoria, nos logs ou no payload de simulação.

| Fabricante | Credencial técnica conhecida | Situação de integração |
|---|---|---|
| Compatec | Os quadros MicroBus Wi-Fi oficiais fornecidos não incluem senha no quadro `MB=`. A autorização depende da rota, da sessão autenticada da central e da configuração do módulo. | `AK4[4]` Arme fixo e `AK4[12]` Desarme fixo disponíveis para centrais Compatec ativas e cadastradas; a sessão física deve ser identificada antes da entrega. Consultas, Toggle, partições, zonas e PGMs permanecem restritos ou bloqueados. |
| JFL Active | O manual oficial relaciona operações do aplicativo à senha de usuário mestre. | Exigir a documentação do protocolo de terceiros para saber como a senha deve ser apresentada no comando IP. |
| Intelbras | A documentação oficial informa que a credencial de acesso remoto varia por modelo: em centrais monitoradas, o AMT Remoto Mobile usa senha remota de seis dígitos; em ANM 24 NET, usa senha Master. | O perfil deve solicitar a credencial apropriada ao modelo, não assumir senha Master para toda a marca. |
| Vetti | Informação operacional do usuário: possui senha própria para comandos. | Aguardar manual/protocolo do fabricante antes de definir o formato e o campo exato. |

## Decisões de implementação

1. O botão de comando não volta a pedir a senha do operador autenticado.
2. O cadastro do sistema deverá armazenar uma credencial técnica por fabricante de forma protegida e sem devolvê-la à interface após a gravação.
3. A simulação não usa nem grava credenciais técnicas.
4. Envio físico Compatec só ocorre pela sessão TCP autenticada da própria central; se a central estiver desconectada, o comando aguarda o próximo contato identificado.

## Fontes consultadas

- JFL, Manual Active: <https://jflalarmes.com.br/wp-content/uploads/2024/05/manual-actives.pdf>
- Intelbras, AMT Remoto Mobile: <https://www.intelbras.com/pt-br/software-para-centrais-de-alarme-ip-amt-remoto-mobile>
- Intelbras, Guia AMT 8000 Pro Lite: <https://backend.intelbras.com/sites/default/files/2024-03/Guia_AMT_8000_PRO_Lite_01-24_site.pdf>
- Documentos Compatec enviados pelo usuário, arquivados em `docs/compatec_microbus_command_protocol.md`.
