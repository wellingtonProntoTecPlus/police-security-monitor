#!/usr/bin/env bash
# Instalação autorizada do VIAWEB Receiver oficial para a porta 9111.
# Integração restrita à recepção e confirmação de eventos locais; não habilita comandos.
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute este instalador como root."
  exit 1
fi

readonly APP_DIR="/opt/police-central"
readonly RECEIVER_DIR="/opt/viaweb-receiver"
readonly RECEIVER_BIN="${RECEIVER_DIR}/VIAWEBReceiver"
readonly RECEIVER_URL="https://policesec-ufxwqgtv.manus.space/manus-storage/VIAWEBReceiver-linux-x64-v10.1_6d51bba4.5"
readonly RECEIVER_SHA256="e75b7161682df4c3b860a1e96a46561766bb227bb3835761efa903d8f7eb0e2f"
readonly SERVICE_FILE="/etc/systemd/system/viaweb-receiver.service"
readonly DIST_BACKUP="${APP_DIR}/.dist-before-viaweb-receiver"

app_stopped=0
receiver_started=0

rollback() {
  local exit_code="$1"
  if [[ "${exit_code}" -eq 0 ]]; then
    return
  fi

  echo "Falha na instalação. Tentando restaurar o PoliceCentral anterior..."
  if [[ "${receiver_started}" -eq 1 ]]; then
    systemctl stop viaweb-receiver.service || true
  fi
  if [[ "${app_stopped}" -eq 1 && -d "${DIST_BACKUP}" ]]; then
    rm -rf "${APP_DIR}/dist"
    mv "${DIST_BACKUP}" "${APP_DIR}/dist"
    cd "${APP_DIR}"
    pm2 restart police-central --update-env || true
  fi
  exit "${exit_code}"
}

cleanup_and_rollback() {
  local exit_code=$?
  rm -f "${tmp_file:-}"
  rollback "${exit_code}"
}

mkdir -p "${RECEIVER_DIR}" /var/lib/viaweb-receiver /var/log/viaweb-receiver /etc/viaweb-receiver

tmp_file="$(mktemp)"
trap cleanup_and_rollback EXIT
curl --fail --location --retry 3 --connect-timeout 20 --output "${tmp_file}" "${RECEIVER_URL}"
printf '%s  %s\n' "${RECEIVER_SHA256}" "${tmp_file}" | sha256sum --check --status
install -m 0755 "${tmp_file}" "${RECEIVER_BIN}"
rm -f "${tmp_file}"

cat > "${SERVICE_FILE}" <<'EOF'
[Unit]
Description=VIAWEB Receiver - PoliceCentral
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/opt/viaweb-receiver/VIAWEBReceiver --quiet --semcripto --portaweb=0 --integra=2700 --config=/etc/viaweb-receiver/VIAWEBReceiver.conf --database=/var/lib/viaweb-receiver/ --log=/var/log/viaweb-receiver/VIAWEBReceiver --pidfile=/run/viaweb-receiver.pid
Restart=on-failure
RestartSec=5
LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

cd "${APP_DIR}"
[[ -d dist ]]
rm -rf "${DIST_BACKUP}"
cp -a dist "${DIST_BACKUP}"

git pull --ff-only origin main
mysql police_monitor < deploy/upgrade_vps.sql
pnpm build

# O Node antigo ocupa a 9111. O Receiver oficial passa a atender a central nessa porta.
pm2 stop police-central
app_stopped=1
systemctl daemon-reload
systemctl enable viaweb-receiver.service
systemctl start viaweb-receiver.service
receiver_started=1

# A interface 2700 é explicitamente limitada ao loopback e usada sem criptografia
# apenas entre processos na mesma VPS, como permitido pelo manual do fabricante.
VIAWEB_INTEGRATION_ENABLED=true \
VIAWEB_INTEGRATION_HOST=127.0.0.1 \
VIAWEB_INTEGRATION_PORT=2700 \
pm2 restart police-central --update-env
pm2 save

sleep 3
ss -ltnp | grep -E ':(2700|9111)\b'
systemctl --no-pager --full status viaweb-receiver.service
pm2 status police-central

rm -rf "${DIST_BACKUP}"
app_stopped=0
trap - EXIT
echo "VIAWEB Receiver instalado. O PoliceCentral está aguardando somente eventos ViaWeb pelo ISEP cadastrado."
