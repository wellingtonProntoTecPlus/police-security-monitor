# Verificações de Desenvolvimento

## 12/08/2026 — Cadastros, Relatórios e Hierarquias

- A tela de **Relatórios** exibe filtros de Data Início, Data Fim e Número da Conta, além dos botões Buscar e Limpar.
- A tela de **Login** é apresentada corretamente com autenticação por e-mail e senha.
- Uma rota protegida sem sessão apresenta a mensagem de acesso restrito e direciona para o login próprio.
- A compilação TypeScript e a suíte Vitest foram executadas com sucesso após a implementação das edições e regras de acesso.

## 12/08/2026 — Cards de eventos

- O dashboard foi renderizado com a fila Aguardando ativa após a alteração das chaves dos cards, sem alerta de chave duplicada no preview.

## 12/08/2026 — Relatórios

- A tela de Relatórios foi revisada visualmente com campos de Data Início, Data Fim, Conta, Cliente e Operador, além dos comandos Buscar e Limpar.

## 12/08/2026 — Cadastro de cliente

- A página de detalhe de cliente renderizou corretamente após a ampliação do cadastro de sistemas de alarme, preservando as abas de contatos, sistemas, zonas e câmeras.

## 12/08/2026 — Alerta sonoro

- O dashboard exibe de forma visível o botão “Ativar áudio” no cabeçalho, antes dos indicadores Armados/Desarmados, permitindo liberar o som após o login conforme a regra do navegador.

## 12/08/2026 — Ações operacionais

- O cabeçalho do dashboard exibe os botões Ocorrência Manual, Online e Offline com contadores de centrais; a lista de eventos e a estrutura de filas permaneceram estáveis após a inclusão das ações operacionais.

## 12/08/2026 — Filas persistidas

- O dashboard foi renderizado após a reconstrução pelas filas de incidentes persistidos, mantendo os contadores e o estado vazio estável sem erro de renderização.
