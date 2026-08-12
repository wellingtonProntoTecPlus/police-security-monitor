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
- [x] Buscar empresa parceira e cliente no cadastro de sistema
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
- [x] Contatos com Telefone, WhatsApp, Senha, Contra-Senha, Senha de Coação (campos no banco)
- [x] Providências: descrição de como o operador deve proceder (API pronta)

## Melhorias no Cadastro de Parceira
- [x] Cadastro de Feriados por empresa parceira (API pronta)
- [x] Busca de endereço por CEP em todos os cadastros com endereço (já implementado no cliente)

## Dashboard Operacional Funcional
- [x] Painel de atendimento ao clicar no evento (dados do cliente, zona, providências)
- [x] Lista de contatos do cliente na ordem de prioridade
- [x] Botões de ação: Atender, Isolar Zona, Câmeras, Despachar Tático, Chamar Polícia, Finalizar
- [x] Registro de observações do operador durante atendimento
- [x] Visualização de câmeras do cliente (botão)
- [x] Alerta sonoro para eventos críticos
- [x] Fluxo de status: Aguardando → Em Atendimento → Observação/Despacho → Finalizado

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
- [x] Redefinido pelo usuário: /finalizations é cadastro de motivos automáticos; o histórico de ocorrências permanece em /reports
- [x] Criar página de Usuários (/users) com hierarquias Admin/Supervisor/Operador
- [x] Implementar login próprio com usuário/senha (independente do Manus OAuth)
- [ ] Adicionar todos os 78 códigos Contact ID no banco local da VPS

## Contact ID - Qualifier E/R e Códigos Universais
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
- [x] Rota backend getArmDisarmStatus que busca último evento de cada conta
- [x] Botão "Desarmados" (vermelho) com contador real
- [x] Botão "Armados" (verde) com contador real
- [x] Modal com lista de clientes armados/desarmados ao clicar no botão

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
- [x] Adicionar filtros por operador e por cliente na página /reports, com suporte backend

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
- [x] Cadastrar MAC Ethernet de seis dígitos por sistema de alarme
- [x] Cadastrar IMEI GPRS de seis dígitos por sistema de alarme
- [x] Gerar e exibir ID ISEP de quatro caracteres para programação do painel
- [x] Permitir selecionar a porta receptora conforme a fabricante da central
- [ ] Adaptar os parsers por fabricante para extrair o identificador transmitido pela central e localizar corretamente o sistema
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
