#!/bin/bash
# ============================================================
# POLICE CENTRAL - Script de Instalação Automatizado
# Para VPS Ubuntu 22.04/24.04/26.04
# ============================================================
set -e

echo "============================================"
echo "  POLICE CENTRAL - Instalação Automatizada"
echo "============================================"
echo ""

# Atualizar sistema
echo "[1/8] Atualizando sistema..."
apt update && apt upgrade -y

# Instalar dependências
echo "[2/8] Instalando dependências..."
apt install -y curl git build-essential ufw nginx certbot python3-certbot-nginx

# Instalar Node.js 22
echo "[3/8] Instalando Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pnpm pm2

# Configurar Firewall
echo "[4/8] Configurando Firewall..."
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 3000/tcp  # App
ufw allow 1984/tcp  # go2rtc API
# Portas do receptor de alarmes
ufw allow 9061/tcp  # JFL
ufw allow 9191/tcp  # JFL
ufw allow 9131/tcp  # JFL
ufw allow 9071/tcp  # Intelbras
ufw allow 9271/tcp  # Intelbras
ufw allow 9111/tcp  # ViaWeb
ufw allow 9161/tcp  # Vetti
ufw allow 9112/tcp  # Compatec
ufw allow 9035/tcp  # Radioenge
ufw allow 9040/tcp  # Radioenge
ufw --force enable
echo "Firewall configurado!"

# Clonar projeto
echo "[5/8] Baixando o sistema..."
mkdir -p /opt/police-central
cd /opt/police-central
# O código será copiado manualmente ou via git
echo "Diretório criado: /opt/police-central"

# Instalar go2rtc (proxy RTSP -> HLS para câmeras)
echo "[6/8] Instalando go2rtc (proxy de câmeras)..."
mkdir -p /opt/go2rtc
cd /opt/go2rtc
curl -L -o go2rtc https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_amd64
chmod +x go2rtc

# Criar config padrão do go2rtc
cat > /opt/go2rtc/go2rtc.yaml << 'YAML'
api:
  listen: ":1984"

streams:
  # Adicione suas câmeras aqui no formato:
  # camera1: rtsp://usuario:senha@IP:554/cam/realmonitor?channel=1&subtype=0
  # camera2: rtsp://usuario:senha@IP:554/cam/realmonitor?channel=2&subtype=0
  exemplo: rtsp://admin:senha@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0
YAML

# Criar serviço systemd para go2rtc
cat > /etc/systemd/system/go2rtc.service << 'SERVICE'
[Unit]
Description=go2rtc - RTSP to HLS proxy
After=network.target

[Service]
Type=simple
ExecStart=/opt/go2rtc/go2rtc -config /opt/go2rtc/go2rtc.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable go2rtc
systemctl start go2rtc
echo "go2rtc instalado e rodando!"

# Criar serviço PM2 placeholder
echo "[7/8] Configurando PM2..."
pm2 startup systemd -u root --hp /root
echo "PM2 configurado para iniciar automaticamente!"

# Resumo
echo ""
echo "[8/8] Instalação concluída!"
echo ""
echo "============================================"
echo "  INSTALAÇÃO CONCLUÍDA COM SUCESSO!"
echo "============================================"
echo ""
echo "  IP do servidor: $(curl -s ifconfig.me)"
echo ""
echo "  Portas abertas:"
echo "    - 9061, 9191, 9131 (JFL)"
echo "    - 9071, 9271 (Intelbras)"
echo "    - 9111 (ViaWeb)"
echo "    - 9161 (Vetti)"
echo "    - 9112 (Compatec)"
echo "    - 9035, 9040 (Radioenge)"
echo "    - 3000 (Aplicação Web)"
echo "    - 1984 (go2rtc - Câmeras)"
echo ""
echo "  Próximos passos:"
echo "    1. Copie o código do sistema para /opt/police-central/"
echo "    2. Configure o .env com DATABASE_URL"
echo "    3. Execute: cd /opt/police-central && pnpm install && pnpm build"
echo "    4. Inicie: pm2 start dist/index.js --name police-central"
echo "    5. Salve: pm2 save"
echo ""
echo "  Câmeras (go2rtc):"
echo "    - Edite: nano /opt/go2rtc/go2rtc.yaml"
echo "    - Reinicie: systemctl restart go2rtc"
echo "    - Acesse: http://$(curl -s ifconfig.me):1984"
echo ""
echo "============================================"
