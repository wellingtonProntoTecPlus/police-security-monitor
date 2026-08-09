# Police Central - Sistema de Monitoramento - TODO

## Infraestrutura e Backend
- [ ] Schema do banco de dados (empresas gestoras, parceiras, clientes, sistemas, zonas, eventos)
- [ ] API tRPC para CRUD de empresas gestoras
- [ ] API tRPC para CRUD de empresas parceiras
- [ ] API tRPC para CRUD de clientes (PF/PJ)
- [ ] API tRPC para CRUD de sistemas de alarme (central, marca, versão, zonas, usuários)
- [ ] API tRPC para CRUD de câmeras (RTSP)
- [ ] Receptor de eventos Contact ID integrado ao backend (drivers: JFL, Vetti, Intelbras, Compatec, Radioenge)
- [ ] WebSocket/Socket.IO para eventos em tempo real no dashboard
- [ ] API de ocorrências (filas de atendimento, status, despacho tático)
- [ ] Tabela de códigos Contact ID com descrições

## Frontend - Dashboard Operacional
- [ ] Layout dark profissional para operação 24h (fontes grandes, alto contraste)
- [ ] Header com logo, relógio, status do sistema e operador logado
- [ ] Cards de status (conexões ativas, eventos pendentes, eventos/min, último evento)
- [ ] Grid de eventos em tempo real (hora, conta, marca, evento, descrição, partição, zona, IP, RX/TX/ACK, operador)
- [ ] Filas de atendimento: Aguardando, Em Atendimento, Em Observação, Enviou Tático
- [ ] Painel lateral com dados do cliente selecionado e sistema de alarme
- [ ] Barra de pesquisa/filtros (conta, marca, evento, porta, data/hora)
- [ ] Footer com status do sistema (CPU, memória, banco, socket, drivers, uptime)

## Frontend - Cadastros
- [ ] Tela de cadastro de Empresa Gestora
- [ ] Tela de cadastro de Empresa Parceira (vinculada à gestora)
- [ ] Tela de cadastro de Clientes (PF/PJ, vinculado à parceira)
- [ ] Tela de contatos do cliente (telefone, WhatsApp, e-mail)
- [ ] Tela de sistema de alarme do cliente (central, marca, versão)
- [ ] Tela de setores/zonas do sistema
- [ ] Tela de usuários do sistema de alarme
- [ ] Tela de câmeras RTSP do cliente

## Frontend - Câmeras
- [ ] Visualização de câmeras RTSP ao vivo no dashboard
- [ ] Grid de câmeras do cliente selecionado

## Frontend - Despacho Tático
- [ ] Painel de despacho para viatura/tático
- [ ] Status da ocorrência (despachado, a caminho, no local, finalizado)

## White Label
- [ ] Suporte multi-tenant (cada parceira com sua marca)
- [ ] Configuração de logo e cores por parceira

## Roles e Permissões
- [ ] Role admin (gestora) - acesso total
- [ ] Role parceira - acesso aos seus clientes
- [ ] Role operador - acesso ao dashboard de monitoramento
