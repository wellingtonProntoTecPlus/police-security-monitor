# Police Central - Sistema de Monitoramento - TODO

## Infraestrutura e Backend
- [x] Schema do banco de dados (empresas gestoras, parceiras, clientes, sistemas, zonas, eventos)
- [x] API tRPC para CRUD de empresas gestoras
- [x] API tRPC para CRUD de empresas parceiras
- [x] API tRPC para CRUD de clientes (PF/PJ)
- [x] API tRPC para CRUD de sistemas de alarme (central, marca, versão, zonas, usuários)
- [x] API tRPC para CRUD de câmeras (RTSP)
- [x] Receptor de eventos Contact ID integrado ao backend (drivers: JFL, Vetti, Intelbras, Compatec, Radioenge)
- [x] API de ocorrências (filas de atendimento, status, despacho tático)
- [x] Tabela de códigos Contact ID com descrições
- [x] WebSocket/Socket.IO para eventos em tempo real no dashboard

## Frontend - Dashboard Operacional
- [x] Layout dark profissional para operação 24h (fontes grandes, alto contraste)
- [x] Header com relógio, status do sistema e operador logado
- [x] Cards de status (conexões ativas, eventos pendentes, eventos/min, último evento)
- [x] Grid de eventos em tempo real (hora, conta, marca, evento, descrição, partição, zona, IP)
- [x] Filas de atendimento: Aguardando, Em Atendimento, Em Observação, Enviou Tático
- [x] Painel lateral com dados do cliente selecionado e sistema de alarme
- [x] Barra de pesquisa/filtros (conta, marca, evento, porta, data/hora)
- [x] Footer com status do sistema (CPU, memória, banco, socket, drivers, uptime)

## Frontend - Cadastros
- [x] Tela de cadastro de Empresa Gestora
- [x] Tela de cadastro de Empresa Parceira (vinculada à gestora)
- [x] Tela de cadastro de Clientes (PF/PJ, vinculado à parceira)
- [ ] Padronizar nomes e descrições cadastrais com iniciais maiúsculas, preservando siglas e dados técnicos
- [x] Aplicar a normalização aos CRUDs restantes, incluindo sistemas, usuários do sistema, finalizações e procedimentos
- [x] Cobrir em testes os cadastros restantes e a preservação de siglas ou dados técnicos
- [ ] Validar na VPS a padronização de registros existentes e novos
- [x] Exercitar em teste integrado os CRUDs de sistemas, usuários do sistema, finalizações e procedimentos
- [x] Confirmar em teste que MAC, IMEI, ISEP, conta, firmware e códigos não são alterados pelos fluxos de criação e edição
- [x] Adicionar testes de CRUD que comprovem a normalização antes da persistência em cada cadastro restante
- [x] Extrair fluxos de gravação testáveis com banco injetado para validar payloads persistidos
- [x] Cobrir ISEP, firmware e códigos Contact ID nos payloads persistidos dos CRUDs reais
- [x] Testar a preservação de ISEP na edição de sistema e dos códigos Contact ID na edição real
- [x] Tela de contatos do cliente (telefone, WhatsApp, e-mail)
- [x] Tela de sistema de alarme do cliente (central, marca, versão)
- [x] Tela de setores/zonas do sistema
- [x] Tela de usuários do sistema de alarme
- [x] Tela de câmeras RTSP do cliente

## Frontend - Câmeras
- [x] Visualização de câmeras RTSP ao vivo no dashboard
- [x] Grid de câmeras do cliente selecionado

## Frontend - Despacho Tático
- [x] Painel de despacho para viatura/tático
- [x] Status da ocorrência (despachado, a caminho, no local, finalizado)

## White Label
- [x] Suporte multi-tenant (cada parceira com sua marca)
- [x] Configuração de logo e cores por parceira

## Roles e Permissões
- [x] Role admin (gestora) - acesso total
- [x] Role parceira - acesso aos seus clientes
- [x] Role operador - acesso ao dashboard de monitoramento

## Testes
- [x] Teste unitário das rotas tRPC

## Tempo Real
- [x] Instalar e configurar Socket.IO no servidor
- [x] Emitir eventos do receptor para o frontend via Socket.IO
- [x] Conectar o dashboard ao Socket.IO para receber eventos em tempo real
- [x] Exibir eventos novos instantaneamente no grid do dashboard

## Cadastro Completo do Cliente
- [x] Adicionar tipo de cliente: Residência, Empresa ou Condomínio
- [x] Exibir e persistir Número do Apartamento nos usuários do painel quando o cliente for Condomínio
- [ ] Corrigir a sincronização da VPS para exibir os novos campos de classificação e apartamento
- [x] Atualizar schema do banco com campos: nomefantasia, complemento, bairro, numero
- [x] Formulário profissional com seções: Empresa Responsável, Dados do Cliente, Endereço, Contatos
- [x] Busca de CEP automática (ViaCEP)
- [x] Validação de CPF/CNPJ
- [x] Máscara de campos (telefone, CEP, CPF/CNPJ)

## Ajustes de Layout Desktop
- [x] Menu lateral recolhível/expansível (toggle)
- [x] Layout de cadastros otimizado para telas de computador (desktop-first)
- [x] Melhor aproveitamento do espaço horizontal nos formulários

## Cadastro de Sistema de Alarme (Completo)
- [x] Adicionar Número do SIM Card e Número da Linha ao cadastro do sistema de alarme
- [x] Padronizar perfis técnicos automáticos de cadastro para JFL, Compatec, Vetti, Radioenge, Intelbras e ViaWeb
- [ ] Validar na VPS o cadastro de uma nova central a partir do perfil técnico selecionado
- [x] Compactar a lista de Usuários do Painel para reduzir espaços vazios entre nomes
- [x] Permitir cadastrar, editar e exibir o código de Usuário 0 como usuário mestre da central
- [x] Exibir o usuário mestre como código 0, sem preencher o código para 00
- [x] Cobrir criação, edição e leitura persistida do Usuário 0 no fluxo real de usuários do painel
- [x] Buscar empresa parceira e cliente no cadastro de sistema
- [x] Tornar explícito e funcional o cadastro de múltiplos sistemas por cliente
- [x] Vincular contatos, zonas e usuários do painel ao sistema de alarme selecionado
- [x] Preservar e migrar com segurança os contatos existentes para o primeiro sistema de cada cliente
- [x] Investigar usuários do painel recém-cadastrados que não aparecem na central selecionada
- [ ] Recuperar e vincular os dois usuários do painel recém-cadastrados à central correta
- [ ] Corrigir a falha de persistência que deixa a tabela alarm_users vazia após salvar
- [ ] Cadastrar novamente e validar os dois usuários do painel após a atualização da VPS
- [ ] Reproduzir a criação de usuário do painel com logs da API e identificar a causa real da ausência de inserção em alarm_users
- [ ] Corrigir o backend de criação e testar uma inserção real em alarm_users
- [ ] Diagnosticar a nova tentativa de salvamento de usuário do painel que não apareceu na VPS
- [ ] Corrigir o botão Salvar de Usuários do Painel que não emite sucesso, erro ou estado de salvamento
- [ ] Sincronizar a VPS com a versão que exibe Conta e Marca no aviso de Usuários do Painel
- [x] Publicar no GitHub o código atual de Usuários do Painel que ainda não chegou à VPS
- [x] Enviar o commit 73994a4 diretamente ao remoto github usado pela VPS
- [ ] Atualizar a tabela alarm_users da VPS para incluir os campos exigidos pelo cadastro atual
- [x] Campos: Marca, Modelo, Versão da central
- [x] Tipo de comunicação: Ethernet IP / GPRS / Ambos
- [x] MAC últimos 6 dígitos (identificação no dashboard)
- [x] Código ViaWeb 4 dígitos (quando marca = ViaWeb)
- [x] Partições (até 8)
- [x] Número da Conta: 2 primeiras letras do cliente + 4 dígitos (ex: PS0001)
- [x] Câmeras: Marca, Modelo, Link RTSP (API pronta, cadastro via detalhes do sistema)
- [x] Usuários (até 254) (API pronta, cadastro via detalhes do sistema)
- [x] Zonas/Setores (até 254) (API pronta, cadastro via detalhes do sistema)
- [x] PGM (até 16) (API pronta, cadastro via detalhes do sistema)
- [x] Tabela de Horários (Seg-Dom) para verificar arme/desarme (API pronta)
- [x] Data de Instalação
- [x] Data da Bateria

## Melhorias no Cadastro de Cliente
- [x] Exibir a conta como primeira coluna da lista de clientes, ordenar por conta e permitir busca pela conta
- [x] Aumentar o tamanho, o espaçamento e o destaque visual da conta na lista de clientes
- [x] Organizar contatos e credenciais por sistema em duas colunas, com até 20 contatos por página
- [x] Reduzir a altura das linhas de contatos e concentrar nome e função na mesma linha
- [x] Contatos com Telefone, WhatsApp, Senha, Contra-Senha, Senha de Coação (campos no banco)
- [x] Providências: descrição de como o operador deve proceder (API pronta)

## Melhorias no Cadastro de Parceira
- [x] Cadastro de Feriados por empresa parceira (API pronta)
- [x] Busca de endereço por CEP em todos os cadastros com endereço (já implementado no cliente)

## Dashboard Operacional Funcional
- [ ] Auditar a central Compatec que aparece Offline apesar de permanecer online no equipamento
- [ ] Capturar lastKeepAliveAt, prazo e logs no momento em que a Compatec 0334 voltar a aparecer Offline
- [x] Remover o uso do teste periódico E602 como supervisão Online da JFL
- [x] Monitorar por pelo menos cinco minutos o Keep Alive real da JFL identificada por serial e MAC
- [x] Definir o limite de desconexão da JFL conforme o intervalo real de Keep Alive medido
- [ ] Configurar quinze minutos como prazo de desconexão da central JFL 0044 na VPS
- [x] Adicionar ao cadastro do sistema controles de falha de Keep Alive, prazo de alerta e repetição de alerta
- [x] Adicionar frequência técnica de Keep Alive em segundos, preenchida com 60 segundos por padrão
- [x] Exibir providências completas e legíveis imediatamente ao abrir a ocorrência
- [x] Mover Zonas e setores para a coluna esquerda do popup de tratamento
- [x] Manter o botão Usuários como acesso direto às senhas e contra senhas do painel
- [x] Exibir resumo de providências e abrir o conteúdo completo em modal pelo popup de tratamento
- [x] Exibir senha, contra senha e senha de coação dos contatos autorizados no painel de atendimento
- [x] Exibir as credenciais disponíveis dos usuários do painel no painel de atendimento
- [x] Adicionar Senha, Contra Senha e Senha de Coação ao cadastro e à tabela de Usuários do Painel
- [x] Validar create, update e list de Usuários do Painel com Senha, Contra Senha e Senha de Coação em server/db.ts
- [x] Adicionar teste fim a fim de persistência e leitura das credenciais dos Usuários do Painel
- [ ] Validar na VPS as credenciais de Usuários do Painel no cadastro e no popup após executar upgrade_vps.sql
- [x] Adicionar botão WhatsApp no painel de contatos do tratamento, usando o número cadastrado do contato
- [ ] Diagnosticar e corrigir o atalho Contatos do popup quando não abrir o painel focal na VPS
- [ ] Confirmar visualmente na VPS que o clique em Contatos abre o painel acima da ocorrência
- [x] Criar no popup atalhos clicáveis para abrir Contatos e Usuários do Painel em foco durante o tratamento
- [x] Corrigir no popup a abertura de Finalização Rápida e Finalizar em massa
- [x] Restaurar o botão Finalização Rápida no popup de tratamento para abrir os textos prontos
- [x] Revisar e completar as informações operacionais exibidas no popup de tratamento da ocorrência
- [x] Exibir no popup as zonas, contatos e usuários vinculados ao sistema da ocorrência
- [x] Reorganizar visualmente a fila Aguardando com destaque para eventos novos/críticos
- [x] Criar mockup aprovado da coluna de ícones para filas recolhidas e da fila Aguardando sempre aberta
- [x] Reduzir moderadamente o tamanho dos ícones e cards da fila aprovada, preservando leitura rápida
- [x] Usar ícone de carro ou moto de segurança para a fila Tático, sem aparência de entrega
- [x] Abrir o tratamento da ocorrência em popup central amplo e reservar a largura do dashboard para as filas
- [x] Implementar de fato o agrupamento da fila Aguardando por cliente/conta, mostrando o evento mais recente no cabeçalho e permitindo expandir/retrair os demais eventos do mesmo cliente
- [x] Executar TypeScript, testes e verificação visual após o agrupamento real da fila Aguardando
- [x] Adicionar e validar teste automatizado que comprove o agrupamento expansível por cliente/conta na fila Aguardando
- [x] Ampliar cabeçalhos e cards agrupados da fila Aguardando para ocupar toda a largura disponível, sem faixa vazia lateral
- [ ] Corrigir a faixa vazia que ainda aparece na VPS entre os cards de Aguardando e a borda direita da fila
- [x] Usar a área central ociosa como extensão visível da fila Aguardando, mantendo o tratamento em popup
- [x] Painel de atendimento ao clicar no evento (dados do cliente, zona, providências)
- [x] Lista de contatos do cliente na ordem de prioridade
- [x] Botões de ação: Atender, Isolar Zona, Câmeras, Despachar Tático, Chamar Polícia, Finalizar
- [x] Registro de observações do operador durante atendimento
- [x] Visualização de câmeras do cliente (botão)
- [x] Alerta sonoro para eventos críticos
- [x] Fluxo de status: Aguardando → Em Atendimento → Observação/Despacho → Finalizado
- [x] Identificar com precisão as centrais online e offline por comunicação real
- [x] Atualizar Online e Offline exclusivamente pelo Keep Alive recebido de cada central
- [x] Unificar o status exibido no cadastro e nos modais Online/Offline para usar exclusivamente lastKeepAliveAt e o prazo configurado
- [x] Medir e registrar o intervalo real entre Keep Alives por central antes de definir o tempo de Offline
- [x] Persistir amostras de Keep Alive para calcular frequência por central e fabricante
- [x] Medir o intervalo de Keep Alive usando lastKeepAliveAt como referência exclusiva, sem misturar outras comunicações
- [x] Adicionar teste em que há evento entre dois Keep Alives para preservar o intervalo real de supervisão
- [x] Validar na VPS que a amostragem permite calcular a frequência real por central e fabricante
- [x] Diagnosticar na VPS os sinais brutos de supervisão das duas Radioenge e da Vetti quando ainda não houver amostras persistidas
- [x] Registrar o quadro Vetti F7 como Keep Alive sem enviar resposta adicional à central
- [x] Registrar no documento técnico a evidência bruta dos sinais de supervisão observados na VPS
- [x] Validar na VPS a geração de amostras persistidas para 0041, 0335 e 0336 após reconhecer o F7 da Vetti
- [x] Confirmar e medir as amostras de Keep Alive da Compatec 0334 após a reconexão
- [x] Aplicar limite Offline seguro por sistema usando as amostras reais de Keep Alive
- [ ] Publicar e atualizar a VPS com a regra de status por Keep Alive calculada por sistema
- [ ] Validar na VPS que Online e Offline usam apenas lastKeepAliveAt, sem depender de eventos de alarme
- [ ] Testar a transição real para Offline após exceder o limite calculado por sistema
- [ ] Adicionar por sistema as opções de gerar falha de Keep Alive, prazo para alerta de painel desconectado e repetição do alerta
- [x] Inserir a seção Configurações de Keep Alive no formulário de criação e edição de cada Sistema de Alarme
- [x] Preencher 60 minutos como padrão da configuração de Keep Alive em sistemas novos e existentes sem prazo definido
- [x] Preencher automaticamente a porta receptora sugerida ao selecionar a marca da central, preservando edição manual
- [ ] Separar no cadastro a frequência técnica medida de Keep Alive do prazo operacional para considerar o painel desconectado
- [x] Confirmar o significado do padrão de 60 minutos antes de usá-lo como prazo de desconexão (substituído pela decisão de cinco minutos)
- [x] Alterar o prazo padrão de desconexão por Keep Alive de 60 para 5 minutos em sistemas novos e existentes
- [ ] Publicar no GitHub a alteração do prazo padrão de Keep Alive de cinco minutos
- [ ] Atualizar a VPS para aplicar cinco minutos aos sistemas já cadastrados
- [ ] Validar na VPS que os cadastros e o status Offline usam o prazo de cinco minutos
- [x] Diagnosticar por que a conta 0035 não foi exibida como Online no dashboard
- [x] Vincular de forma segura o Keep Alive JFL da porta 9061 à central cadastrada da conta 0035
- [ ] Criar uma única ocorrência de painel desconectado quando o Keep Alive expirar, sem alertas recorrentes automáticos
- [ ] Alertar o operador e criar ocorrência tratável na fila quando uma central exceder o prazo sem Keep Alive real
- [ ] Manter a ocorrência de desconexão em Observação até a finalização manual após o retorno Online
- [ ] Ativar no procedimento real de atualização da VPS a varredura automática de desconexão e validar o cron instalado
- [ ] Cobrir o ciclo completo: limite estrito, abertura única, ausência de duplicidade e retorno para Observação
- [ ] Exibir nos modais Online e Offline as listas informativas das centrais e suas ocorrências em acompanhamento
- [ ] Preservar histórico de contatos, observações e operador entre turnos para a próxima operadora continuar o atendimento
- [x] Diagnosticar o retorno HTML transitório da pré-visualização e confirmar a recuperação das consultas da API
- [x] Identificar e documentar a causa raiz do retorno HTML inesperado da pré-visualização
- [x] Reproduzir e validar a ausência do erro de pré-visualização com a consulta e a resposta JSON esperada
- [x] Confirmar a recuperação da pré-visualização: o HTML veio de uma resposta 502 transitória do proxy, e as consultas do dashboard voltaram a responder JSON

## Player HLS para Câmeras
- [x] Instalar hls.js no projeto
- [x] Criar componente HLSPlayer reutilizável
- [x] Integrar player nas câmeras do dashboard (quadrados exibem stream ao vivo)
- [x] Modal expandido com player HLS ao clicar na câmera

## Persistência de Ocorrências Finalizadas
- [x] Criar tabela occurrences no banco (evento, cliente, operador, observações, logs, tempo)
- [x] API tRPC para salvar ocorrência finalizada
- [x] API tRPC para listar ocorrências (Relatórios/Finalizações)
- [x] Conectar botão Finalizar do dashboard à API de persistência
- [x] Salvar tempo de atendimento, observações e logs da ocorrência

## Ajustes de Layout e Cadastros
- [x] Câmeras posicionadas logo abaixo dos botões de ação no dashboard
- [x] Dashboard fixo na viewport (sem scroll geral, apenas fila rolável)
- [x] Página de Empresa Gestora com formulário completo
- [x] Campo WhatsApp na Empresa Gestora
- [x] Campo CEP com busca automática de endereço (ViaCEP) na Empresa Gestora
- [x] Campo de Logo (URL) na Empresa Gestora
- [x] Campos WhatsApp e CEP na Empresa Parceira (schema pronto)
- [x] Campo de Logo na Empresa Parceira (schema pronto)

## Correções Solicitadas
- [x] Câmeras com registro de log (ao visualizar câmera, registra no log da ocorrência)
- [x] CEP com máscara e busca automática em TODOS os cadastros (Gestora, Parceira, Clientes)
- [x] Calendário de feriados na Empresa Gestora
- [x] Calendário de feriados na Empresa Parceira
- [x] Dashboard fixo definitivamente (sem scroll na tela de atendimento)

## Edição e Exclusão de Cadastros
- [x] Editar e excluir Empresa Gestora
- [x] Editar e excluir Empresa Parceira
- [x] Editar e excluir Clientes
- [x] Editar e excluir Sistemas de Alarme
- [x] Corrigir vinculação de cliente à empresa parceira no formulário
- [x] Editar e excluir Contatos do cliente
- [x] Editar e excluir Câmeras
- [x] Tela/seção de Zonas/Setores acessível para cadastro

## Páginas Faltantes
- [x] Criar página de Relatórios (/reports) com filtros por data, operador, cliente
- [x] Revisar e corrigir o funcionamento completo dos Relatórios: dados, filtros, operador, cliente, conta e finalização
- [ ] Validar na VPS os Relatórios com ocorrências reais, filtros e exportação CSV
- [x] Redefinido pelo usuário: /finalizations é cadastro de motivos automáticos; o histórico de ocorrências permanece em /reports
- [x] Criar página de Usuários (/users) com hierarquias Admin/Supervisor/Operador
- [x] Implementar login próprio com usuário/senha (independente do Manus OAuth)
- [ ] Adicionar todos os 78 códigos Contact ID no banco local da VPS
- [x] Extrair, validar e importar os códigos Contact ID específicos da JFL a partir do manual fornecido
- [x] Fazer o receptor priorizar a descrição Contact ID do fabricante identificado antes do código universal

## Contact ID - Qualifier E/R e Códigos Universais
- [x] Exibir códigos universais somente na aba Universal, sem repeti-los visualmente nas abas de fabricantes
- [x] Atualizar a tabela JFL com os códigos convencionais e analíticos fornecidos, incluindo restaurações e regra de disparo
- [x] Adicionar campo qualifier (E/R/both) na tabela contact_id_codes
- [x] Adicionar campo isUniversal para marcar códigos universais
- [x] Separar E401 (Desarme) e R401 (Arme) como códigos universais
- [x] Separar E130 (Alarme) e R130 (Restauração) como códigos universais
- [x] Cadastrar E602 (Teste Periódico) e E610 (Teste Manual) como universais
- [x] Corrigir código 701 Compatec: E701 (Desarme por App) e R701 (Arme por App)
- [x] Códigos universais aparecem em TODAS as abas de fabricantes
- [x] Coluna Qualifier visível na tabela Contact ID
- [x] Edição de códigos Contact ID funcional (botão lápis)
- [x] Receptor busca descrição com qualifier (E/R) para identificar corretamente

## Botões Armados/Desarmados no Dashboard
- [x] Preservar a confirmação visível de arme e desarme após eventos analíticos ou disparos JFL
- [x] Rota backend getArmDisarmStatus que busca último evento de cada conta
- [x] Botão "Desarmados" (vermelho) com contador real
- [x] Botão "Armados" (verde) com contador real
- [x] Modal com lista de clientes armados/desarmados ao clicar no botão
- [x] Exibir no dashboard a confirmação recente de Arme e Desarme recebidos e finalizados automaticamente
- [x] Validar na VPS que E401/R401 aparecem como confirmação operacional visível sem entrar nas filas de atendimento
- [x] Normalizar registros Vetti antigos para a conta real do sistema nos indicadores Armados/Desarmados

## Correções e Melhorias Solicitadas (10/08)
- [x] Áudio de alerta: som por 5 segundos ao chegar evento, para ao clicar no evento
- [x] Popup de pendentes: a cada 20 minutos, lista de ocorrências pendentes pisca no centro da tela por 10s com som
- [x] Corrigir erro de validação de email na Empresa Parceira (campo deve ser opcional)
- [x] "CONTA NÃO CADASTRADA" no dashboard quando conta não existe no sistema
- [x] "EVENTO NÃO CADASTRADO" quando código do evento não está na tabela Contact ID
- [x] Finalizações = cadastro de textos/motivos de finalização automática (não é histórico)
- [x] Remover autenticação obrigatória para funcionar na VPS (já feito parcialmente)
- [x] Integrar finalizações automáticas no botão Finalizar do dashboard (selecionar motivo)
- [x] Integrar finalizações automáticas no botão Finalizar do dashboard (selecionar motivo)
- [x] Corrigir cadastro Empresa Gestora não salvando
- [x] Corrigir cadastro Empresa Parceira com erro SQL (campos undefined)
- [x] Corrigir cadastro Usuários do Sistema (openId obrigatório não gerado)
- [x] Adicionar máscaras em telefone e WhatsApp em todos os cadastros

## Correções 10/08 - Sessão 2
- [x] Remover feriados da Empresa Gestora
- [x] Corrigir feriados da Empresa Parceira (nacional=dia/mês, municipal=dia/mês/ano)
- [ ] Corrigir erro ao finalizar ocorrência na VPS
- [x] Som de alerta mais forte/persuasivo
- [x] Popup de finalização rápida não abre (corrigir para abrir modal com lista clicável)
- [x] Logo da parceira não aparece na lista de empresas parceiras

## Revisão de Cadastros, Relatórios e Hierarquias
- [x] Validar e corrigir a edição de Empresas Parceiras
- [x] Permitir editar e excluir feriados municipais da Empresa Parceira
- [x] Corrigir a edição e validar a exclusão de Clientes
- [x] Implementar edição e validar exclusão de Contatos do Cliente
- [x] Implementar edição e validar exclusão de Sistemas de Alarme
- [x] Implementar edição e validar exclusão de Zonas e Setores
- [x] Implementar edição e validar exclusão de Câmeras
- [x] Adicionar filtros de período por calendário nos Relatórios
- [x] Adicionar busca por número de conta nos Relatórios
- [x] Implementar edição e validar exclusão de Usuários do Sistema
- [x] Aplicar efetivamente as regras das hierarquias Admin, Supervisor, Operador e Parceiro
- [x] Aplicar autenticação e escopo por Parceiro nas rotas de detalhes: empresa, contatos, sistemas, câmeras e zonas
- [x] Diferenciar permissões de Supervisor e Operador nas rotas de gestão e validar os quatro perfis com testes

## Correção de Eventos no Dashboard
- [x] Corrigir chave React duplicada nos cards da fila de eventos do dashboard

## Complementos de Relatórios
- [x] Adicionar períodos rápidos Hoje, Ontem, Semana, Mês e período personalizado em Relatórios
- [x] Adicionar filtro por categoria de evento: Disparos, Arme, Desarme, Online e Offline
- [x] Adicionar filtro hierárquico de empresa parceira e cliente nos Relatórios
- [ ] Validar na VPS os novos períodos, categorias e filtros hierárquicos dos Relatórios
- [x] Adicionar filtros por operador e por cliente na página /reports, com suporte backend
- [x] Exibir o cliente correto no relatório de eventos identificados por MAC ou IMEI
- [x] Resolver o cliente do relatório por alarmSystemId nos eventos finalizados automaticamente
- [x] Enriquecer linhas já existentes do relatório pelo sistema e cliente vinculados
- [x] Testar o fluxo integrado de evento automático identificado até sua exibição com cliente no relatório
- [x] Preservar registros legados enriquecíveis no escopo de usuários parceiros
- [x] Simular a persistência de uma ocorrência automática e validar a listagem enriquecida no relatório
- [x] Exercitar a função listOccurrences em teste integrado com banco temporário ou mock de consulta
- [x] Validar na VPS o cliente exibido em um evento real identificado por MAC ou IMEI

## Correção de Carga Contact ID na VPS
- [x] Corrigir a carga para exibir os códigos Compatec, Vetti e Universais nos fabricantes corretos
- [x] Corrigir a sincronização do repositório da VPS para receber os arquivos de atualização publicados
- [x] Decisão do usuário: preservar todos os códigos UNIVERSAL personalizados cadastrados manualmente
- [ ] Adicionar verificação SQL versionada que comprove a carga esperada por fabricante na VPS
- [ ] Documentar a contagem oficial de códigos importados, separando base Compatec, base Vetti e universais personalizados

## Correção de Acesso
- [x] Corrigir login que valida credenciais mas não mantém a sessão no sistema
- [x] Criar e validar token de sessão local sem depender do SDK OAuth do Manus
- [x] Diagnosticar e corrigir o bloqueio de acesso após o redirecionamento para /dashboard na VPS

## Identificação de Sistemas de Alarme
- [x] Confirmar que o tráfego TLS da porta 9191 é uma sondagem externa, não uma central JFL
- [ ] Conferir no Programador JFL a porta configurada e validar a recepção da central real
- [ ] Diagnosticar a central JFL indicada como conectada no programador, mas ausente na Police Central
- [ ] Auditar a recepção e a identificação da central JFL conta 0071 na porta 9061
- [x] Corrigir o IMEI e o MAC cadastrados da central JFL 0071 antes de validar a conexão
- [x] Corrigir a associação do quadro JFL da conta 0071 ao sistema 27 pelo serial, MAC ou IMEI
- [x] Associar e persistir o Keep Alive JFL 0x40 da conta 0071 quando o sinal chegar em conexão TCP separada
- [x] Extrair serial e MAC do quadro JFL de conexão de 102 bytes e vincular os eventos subsequentes ao painel identificado
- [x] Identificar o protocolo ou canal pelo qual a FullTime obtém o serial da JFL Active 20
- [x] Validar na VPS que a JFL 0044 restaurada é identificada por serial ou MAC antes do próximo evento Contact ID
- [x] Confirmar que a JFL 0044 envia apenas Contact ID de 24 bytes à porta 9061, sem serial, MAC ou IMEI
- [ ] Obter da FullTime ou JFL a documentação do canal proprietário que fornece o serial da JFL versão 7 ou superior
- [x] Exigir e validar o serial de 10 caracteres para centrais JFL Active versão 7 ou superior
- [x] Exibir o campo Serial para todas as centrais JFL e torná-lo obrigatório somente a partir da versão 5.0
- [x] Impedir a associação de qualquer central IP somente pela conta Contact ID; exigir MAC e/ou IMEI confirmado
- [x] Capturar os quadros da JFL Active 20 e documentar que a conta 0044 chegou sem serial ou MAC confirmado
- [x] Substituído por decisão operacional: JFL sem MAC ou IMEI confirmado segue para a Conta do Sistema 0000, sem associação por conta
- [x] Confirmar que a conta 0044 da parceira Coruja sem MAC ou IMEI confirmado é registrada na Conta do Sistema 0000
- [x] Priorizar o MAC 3BCE24 da JFL da parceira Coruja e bloquear associação por conta 0044 isolada
- [x] Cadastrar MAC Ethernet de seis dígitos por sistema de alarme
- [x] Cadastrar IMEI GPRS de seis dígitos por sistema de alarme
- [x] Gerar e exibir ID ISEP de quatro caracteres para programação do painel
- [x] Permitir selecionar a porta receptora conforme a fabricante da central
- [x] Corrigir a leitura da Conta Contact ID Vetti para que a central da conta 0336 não seja exibida como 0A03
- [x] Diagnosticar e restaurar a chegada de eventos Arme e Desarme da Vetti após a atualização
- [ ] Garantir a identificação inequívoca quando fabricantes diferentes usam a mesma Conta Contact ID
- [ ] Identificar painéis IP principalmente por MAC ou IMEI e, em ViaWeb, por ID ISEP
- [ ] Permitir contas Contact ID repetidas entre parceiras sem usar fabricante ou porta como chave principal
- [ ] Adaptar os parsers por fabricante para extrair o identificador transmitido pela central e localizar corretamente o sistema
- [x] Capturar com segurança os pacotes de conexão e eventos de Compatec, Vetti e Radioenge para mapear o identificador transmitido
- [ ] Detectar nos pacotes capturados candidatos MAC ou IMEI já cadastrados, sem atribuir o evento automaticamente
- [x] Detectar com segurança o MAC de Vetti e Radioenge nos formatos capturados em teste real
- [x] Identificar o sexto caractere MAC ou quadro complementar da Compatec antes de permitir associação automática
- [ ] Cobrir em testes a detecção por IMEI e a regra de não associação da Compatec incompleta
- [ ] Consolidar transmissões duplicadas da Compatec geradas por um único comando operacional
- [x] Comprovar no pacote Compatec se o MAC completo ou outro identificador exclusivo é transmitido
- [x] Associar eventos Compatec ao sistema pelo MAC completo recebido no quadro de conexão
- [ ] Testar de forma integrada a resolução de um quadro Compatec pelo MAC e o vínculo ao sistema correto
- [x] Validar na VPS que o evento Compatec identificado deixa de cair na Conta do Sistema 0000
- [ ] Documentar e testar, por fabricante, o campo de protocolo usado para conta, MAC, IMEI ou ID ISEP
- [x] Garantir que o ID ISEP permaneça separado da Conta Contact ID em todos os cadastros e orientações técnicas
- [x] Restringir geração, exibição e identificação por ID ISEP exclusivamente às centrais ViaWeb

## Finalização Automática de Ocorrências
- [x] Finalizar e registrar apenas em Relatórios os eventos configurados para não abrir atendimento
- [x] Finalizar a ocorrência aberta ao receber a restauração correspondente
- [x] Registrar as descrições “Finalizada automaticamente” e “Finalizado com a restauração do evento” nos dois fluxos

## Alerta Sonoro Operacional
- [x] Garantir áudio audível ao entrar novo evento na fila Aguardando
- [x] Orientar a ativação inicial de áudio exigida pelos navegadores

## Ações Operacionais do Dashboard
- [x] Permitir finalizar em massa os eventos pendentes de um mesmo cliente
- [x] Tornar funcional o botão de Ocorrência Manual
- [x] Exibir em janela as centrais online ao clicar no botão Online
- [x] Exibir em janela as centrais offline ao clicar no botão Offline

## Conta Técnica do Sistema
- [x] Criar e manter a Conta do Sistema 0000 para eventos sem conta ou de central não cadastrada
- [x] Direcionar para a Conta do Sistema 0000 os eventos recebidos sem identificação de cliente
- [x] Manter eventos da Conta do Sistema 0000 somente em relatórios e fora dos indicadores do dashboard
- [x] Impedir que eventos da Conta do Sistema 0000 apareçam nas filas e cards operacionais do dashboard
- [x] Cobrir em teste que a Conta do Sistema não entra em indicadores ou filas e permanece consultável em relatórios
- [x] Testar funcionalmente o plano de persistência da Conta do Sistema sem incidente aberto ou emissão ao dashboard

## Validação Operacional na VPS
- [ ] Validar em eventos reais o áudio, finalização automática, finalização em massa, ocorrência manual, status Online/Offline e Conta do Sistema 0000
- [ ] Confirmar no relatório a persistência da finalização por restauração com a frase exigida
- [x] Persistir a Ocorrência Manual no backend no momento de sua criação
- [x] Persistir formalmente a Conta do Sistema 0000 como conta técnica independente de clientes
- [ ] Testar os modais Online e Offline com comunicação real de centrais na VPS
- [x] Reconstruir as filas do dashboard a partir dos incidentes e status persistidos após recarregar a página
- [x] Persistir o status Manutenção de forma reversível nas filas do dashboard
- [ ] Validar na VPS o recarregamento das filas Aguardando, Atendimento, Observação, Tático e Manutenção
- [ ] Validar na VPS a criação, o atendimento, a finalização e a presença da Ocorrência Manual no relatório

## Correções de Controles do Dashboard
- [x] Permitir desativar o áudio somente após validar a senha do usuário logado
- [x] Corrigir o botão Trocar Usuário para encerrar a sessão e abrir o login
- [x] Corrigir a abertura e criação da Ocorrência Manual no dashboard
- [x] Investigar a abertura do modal de Ocorrência Manual e eliminar possíveis falhas de estado ou sobreposição
- [x] Adicionar validação automatizada do fluxo backend de criação de Ocorrência Manual
- [x] Elevar e validar a camada visual do modal de Ocorrência Manual para evitar sobreposição por outros modais
- [x] Documentar no código a prevenção adotada para a abertura confiável da Ocorrência Manual
- [x] Corrigir a validação de senha que está rejeitando o usuário ao desativar o áudio
- [x] Corrigir o erro React #185 no dashboard após a atualização da VPS
- [x] Corrigir o erro React que ocorre ao clicar em Ocorrência Manual na VPS
- [x] Validar por teste de interface a abertura da Ocorrência Manual sem ciclo React
- [x] Documentar a causa raiz e a prevenção do ciclo React no modal manual
- [ ] Validar na VPS a abertura e salvamento da Ocorrência Manual após a correção
- [x] Corrigir o erro React ao abrir o modal de desativação de áudio
- [x] Substituir o modal reativo de áudio por confirmação nativa com senha
- [x] Validar por teste de interface a confirmação de senha ao desativar o áudio
- [x] Corrigir a VPS que continua servindo o pacote JavaScript antigo após atualização
- [x] Identificar e corrigir o diretório de execução do processo PM2 police-central
- [x] Corrigir o ciclo React acionado automaticamente pela atualização do dashboard após o login
- [x] Forçar a recompilação do pacote dist da VPS usando a revisão atual do repositório
- [x] Atualizar o repositório da VPS antes de gerar o novo pacote dist
- [x] Enviar ao GitHub a revisão corrigida usada pelo ambiente de desenvolvimento

## Manutenção e Observação Operacionais
- [x] Preservar ocorrências em Manutenção ao trocar de usuário ou recarregar o dashboard
- [x] Criar manutenção programada por sistema com data e hora inicial e final
- [x] Finalizar automaticamente eventos de sistemas em manutenção com a descrição exigida
- [x] Permitir retirada manual antecipada do sistema de manutenção
- [x] Criar observação temporizada por ocorrência com data e hora final
- [x] Retornar a ocorrência da observação para o atendimento quando o prazo terminar
- [x] Adicionar testes automatizados para manutenção, observação e reconstrução de filas
- [x] Abrir o calendário de manutenção usando a conta do evento mesmo quando o vínculo de sistema não vier no incidente

## Persistência de Ocorrências Abertas
- [x] Garantir que todo evento recebido possua incidente persistido antes de ser exibido na fila
- [x] Reconstruir todas as filas abertas após reinício, atualização, troca de usuário ou recarregamento
- [x] Preservar cliente, sistema, operador de atendimento e histórico até a finalização da ocorrência
- [x] Cobrir em testes a recuperação de uma ocorrência aberta e a transferência ao relatório somente após finalizar

## Ajustes de Operação e Perfil
- [x] Retirar o incidente em manutenção do painel de tratamento e bloquear sua finalização até retirada da manutenção
- [x] Evitar qualquer duplicidade entre fila de manutenção, tratamento e relatório
- [x] Substituir controles amontoados do operador por avatar visível e menu de perfil
- [x] Exibir informações do operador e permitir alteração de senha pelo menu de perfil
- [x] Transformar Trocar Usuário em espera de próximo operador na tela de login

## Ocorrência Manual por Conta
- [x] Buscar e mostrar o cliente e sistema ao informar a Conta Contact ID
- [x] Corrigir a gravação de evento e incidente ao criar ocorrência manual
- [x] Cobrir em testes a ocorrência manual associada a uma conta cadastrada

## Eventos Recebidos sem Fila
- [ ] Auditar a conta 0044: recepção, identificação, persistência e abertura de ocorrência no dashboard
- [x] Corrigir E724 analítico da JFL para abrir ocorrência, mantendo o R724 como restauração automática
- [ ] Validar na VPS que o próximo E724 da conta 0044 abre ocorrência e o R724 a finaliza
- [ ] Executar teste controlado com uma conta temporária exclusiva na JFL 0044 e restaurar a conta operacional ao final
- [x] Confirmar na VPS se os eventos da JFL Active 20 conta 0044 estão no relatório da Conta do Sistema 0000
- [x] Verificar nos logs e no banco da VPS se a conta 0044 está chegando, persistindo e entrando na fila correta
- [ ] Identificar por que eventos recebidos atualizam status, mas não criam ocorrência na fila
- [ ] Restaurar a abertura de ocorrência para eventos que exigem atendimento
- [x] Rastrear a origem técnica do evento E130 da conta 0001 e corrigir a associação indevida ao cliente/painel
- [x] Impedir que um evento JFL na porta 9061 seja associado a um sistema Vetti pela mesma conta Contact ID
- [ ] Bloquear qualquer associação por conta quando marca, porta, MAC, IMEI ou ISEP indicarem origem divergente ou ambígua
- [x] Encaminhar evento sem sistema compatível para a Conta do Sistema 0000 como Conta Não Cadastrada
- [x] Validar na VPS o recebimento e a exibição de eventos reais após a correção

## Recebimento Operacional Equilibrado
- [x] Confirmar se o receptor TCP está recebendo novos eventos nas portas configuradas
- [ ] Garantir que apenas eventos críticos configurados para abrir tela entrem nas filas

## Atualização de Status após Reinício
- [ ] Verificar por que o desarme da Conta 0001 não atualizou o dashboard
- [ ] Restaurar a atualização de Armados e Desarmados após reinício do processo

## Persistência Bloqueada de Incidentes
- [x] Identificar a restrição da tabela incidents que rejeita os eventos recebidos
- [ ] Corrigir a gravação de incidentes para Arme, Desarme e alarmes

## Colunas Operacionais Ausentes
- [x] Adicionar dispatchedAt e demais colunas de incidentes ausentes na VPS

## Confirmação da Atualização de Banco
- [ ] Confirmar que a coluna dispatchedAt foi criada na VPS após a atualização

## Correção Direta de Coluna
- [ ] Criar diretamente a coluna dispatchedAt ausente na tabela incidents da VPS

## Cadastro Operacional de Clientes e Parceiras
- [x] Incluir zonas e setores vinculados ao sistema de alarme do cliente
- [x] Incluir senha e contra senha nos contatos de clientes
- [x] Ampliar a busca de clientes para nome, nome fantasia e documento
- [x] Criar cadastro de Tático Móvel vinculado à empresa parceira
- [x] Tornar visíveis e fáceis de localizar os cadastros de Tático Móvel e credenciais de contato
- [x] Corrigir a divergência entre a revisão instalada na VPS e a versão atual do repositório
- [x] Diagnosticar a revisão, build e processo PM2 ativos quando a VPS não refletir uma atualização publicada
- [x] Enviar ao GitHub a revisão posterior a a952a3df que contém o popup com contatos, zonas e usuários
- [x] Configurar e validar o remoto GitHub separado do remoto interno de checkpoints antes do envio à VPS
- [ ] Confirmar e corrigir a VPS que ainda exibe o popup antigo sem o botão Ver providências da revisão b264ee9

## Compatibilidade de Colunas de Evento
- [ ] Harmonizar alarmEventId e eventId na tabela incidents sem perder histórico
- [ ] Preencher alarmEventId junto com eventId em novos incidentes da VPS

## Visibilidade de Filas Operacionais
- [x] Manter a ocorrência que iniciou a manutenção visível na fila Em Manutenção
- [ ] Manter ocorrências em observação visíveis na fila Em Observação até o prazo ou ação do operador
- [x] Garantir que eventos novos finalizados por manutenção não substituam a ocorrência de manutenção na fila
- [x] Criar um card de manutenção persistente quando o sistema não tiver incidente aberto

## Áudio Operacional Justificado
- [x] Corrigir a criação do card de manutenção quando a manutenção já está ativa
- [x] Ativar o controle de áudio ao abrir o dashboard
- [x] Exigir senha e motivo obrigatório para desativar o áudio

## Card Imediato de Manutenção
- [x] Criar o card de manutenção diretamente na confirmação da programação
- [x] Atualizar a fila local para mostrar o card sem depender de recarregamento

## Diagnóstico de Manutenção sem Card
- [x] Inspecionar os registros de sistema e incidentes ativos para a Conta 0001
- [x] Corrigir a condição que impede o card persistido de aparecer na fila
- [x] Compatibilizar a criação do card com os nomes de colunas existentes na VPS

## Verificação da Migração da VPS
- [x] Confirmar que a coluna eventId existe na tabela incidents da VPS
- [x] Confirmar que o processo police-central foi reiniciado após a migração

## Incidente de Manutenção da Conta 0001
- [x] Consultar o evento e o incidente persistidos vinculados à Conta 0001

## Recuperação Retroativa de Manutenção
- [x] Criar card operacional para sistemas já em manutenção sem incidente aberto
- [x] Executar a recuperação de manutenção ativa antes de devolver as filas abertas

## Horário de Manutenção na VPS
- [x] Alinhar a comparação de horários de manutenção ao fuso operacional brasileiro

## Comandos Operacionais Remotos
- [x] Substituir o campo genérico por credenciais técnicas específicas no cadastro de cada sistema
- [x] Cadastrar para JFL Senha Master do Usuário 0 e Senha de Instalador do Programador JFL
- [x] Cadastrar para Intelbras Senha Master do Usuário 0, Senha de Instalador e Senha de Configuração Remota
- [x] Cadastrar para Vetti Senha de Instalador e Senha de Usuário de Comando, exibindo o usuário derivado da senha
- [x] Derivar e validar o usuário Vetti como prefixo `3` mais os dois primeiros dígitos da senha de comando
- [x] Mapear por fabricante a credencial técnica necessária ao comando remoto, separada da autenticação do operador
- [x] Criar no cadastro do sistema a credencial técnica protegida para comandos remotos
- [ ] Usar a senha Master do painel nos fluxos JFL e Intelbras, e a credencial de protocolo exigida por Vetti e Compatec
- [x] Remover a dependência da senha do operador como credencial da central na simulação Compatec
- [x] Remover o campo de senha do operador da confirmação de comando, mantendo sessão, motivo e confirmação explícita
- [x] Diagnosticar a senha do operador recusada na confirmação dos comandos Compatec
- [x] Confirmar que a recuperação da senha do operador não é necessária para comandos remotos autenticados por sessão
- [x] Testar o contrato de confirmação pela sessão ativa, sem exigir senha repetida do operador
- [ ] Definir protocolo, autenticação, confirmação e permissões para Arme, Desarme, Isolamento de Zona e PGM por fabricante
- [x] Criar solicitações auditáveis de Arme, Desarme, Isolamento de Zona e PGM no atendimento da ocorrência para Compatec em modo de simulação
- [ ] Validar comandos em simulação antes de habilitar qualquer envio real ao painel
- [x] Auditar o receptor Compatec contra a documentação: identificação `*ID`, confirmação de conta, Keep Alive `@` e confirmação de evento
- [x] Corrigir a deduplicação Compatec pelo contador do pacote Contact ID, preservando eventos diferentes
- [x] Validar em testes o ciclo Compatec de identificação, conta, Keep Alive e evento com ACKs documentados
- [x] Modelar registros auditáveis de comandos Compatec com operador, motivo, parâmetros, quadro MicroBus, resposta e resultado de simulação
- [x] Criar no popup de atendimento as ações Compatec de Arme, Desarme, Isolar/Restaurar Zona e Acionar PGM com confirmação dupla
- [x] Implementar o gerador MicroBus Compatec para CMD_GRUPO, CMD_SETOR, CMD_MASK_SETOR e CMD_PGM em modo de simulação
- [x] Validar com testes os quadros Compatec, o bloqueio de envio real e o histórico operacional
- [x] Corrigir a palavra reservada `partition` na migração SQL da auditoria Compatec para MySQL da VPS
- [x] Atualizar a VPS com o receptor Compatec e o histórico de simulação antes da homologação em bancada
- [ ] Validar em bancada a simulação auditável sem transmitir MicroBus à central
- [ ] Confirmar com a Compatec ou por captura controlada a porta, rota e resposta MicroBus da central de bancada
- [ ] Homologar em bancada, um por vez, consulta de estado, arme, desarme, isolamento/restauração e PGM
