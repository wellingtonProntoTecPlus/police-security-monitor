# Verificação de credencial técnica para comandos remotos

## Validação local

- Em 25 de agosto de 2026, o cadastro de cliente voltou a renderizar sem erros após reinicialização do ambiente de desenvolvimento.
- A tipagem, a compilação de produção e 159 testes automatizados foram aprovados.
- A credencial técnica é cifrada no servidor e armazenada na tabela exclusiva `alarm_remote_credentials`.
- Consultas da interface recebem somente o estado da configuração; o valor protegido não é retornado, exibido em histórico ou usado como senha do operador.

## Próxima validação

Abrir a aba **Sistemas**, selecionar o ícone de chave da central e confirmar que o diálogo permite salvar, substituir e remover uma credencial sem revelar o valor já cadastrado.
