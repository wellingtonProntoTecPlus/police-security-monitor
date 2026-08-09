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
- [ ] Buscar empresa parceira e cliente no cadastro de sistema
- [ ] Campos: Marca, Modelo, Versão da central
- [ ] Tipo de comunicação: Ethernet IP / GPRS / Ambos
- [ ] MAC últimos 6 dígitos (identificação no dashboard)
- [ ] Código ViaWeb 4 dígitos (quando marca = ViaWeb)
- [ ] Partições (até 8)
- [ ] Número da Conta: 2 primeiras letras do cliente + 4 dígitos (ex: PS0001)
- [ ] Câmeras: Marca, Modelo, Link RTSP
- [ ] Usuários (até 254)
- [ ] Zonas/Setores (até 254)
- [ ] PGM (até 16)
- [ ] Tabela de Horários (Seg-Dom) para verificar arme/desarme
- [ ] Data de Instalação
- [ ] Data da Bateria

## Melhorias no Cadastro de Cliente
- [ ] Contatos com Telefone, WhatsApp, Senha, Contra-Senha, Senha de Coação
- [ ] Providências: descrição de como o operador deve proceder

## Melhorias no Cadastro de Parceira
- [ ] Cadastro de Feriados por empresa parceira
- [ ] Busca de endereço por CEP em todos os cadastros com endereço
