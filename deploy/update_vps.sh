#!/usr/bin/env bash
set -euo pipefail

# Atualização padrão da VPS Police Central.
# Executar como root dentro de /opt/police-central:
#   bash deploy/update_vps.sh

cd "$(dirname "$0")/.."

git pull --ff-only origin main
mysql police_monitor < deploy/upgrade_vps.sql
pnpm build
pm2 restart police-central
bash deploy/install_keepalive_disconnect_cron.sh

echo "Police Central atualizada e verificação de desconexão ativa."
