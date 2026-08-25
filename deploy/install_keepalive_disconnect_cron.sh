#!/usr/bin/env bash
set -euo pipefail

# Executar uma vez na VPS como root, depois de atualizar o projeto.
# A chamada é local e o endpoint só aceita loopback.
MARKER="# police-keep-alive-disconnect-sweep"
JOB="* * * * * curl --fail --silent --show-error -X POST http://127.0.0.1:3000/api/internal/keep-alive-disconnect-sweep >/dev/null 2>&1 ${MARKER}"

(crontab -l 2>/dev/null | grep -vF "${MARKER}" || true; echo "${JOB}") | crontab -
echo "Verificação de desconexão instalada: uma execução por minuto."
