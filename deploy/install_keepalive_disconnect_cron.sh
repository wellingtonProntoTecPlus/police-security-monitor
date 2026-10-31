#!/usr/bin/env bash
set -euo pipefail

# Executar uma vez na VPS como root, depois de atualizar o projeto.
# A chamada local processa alertas de Keep Alive e o sweep de conformidade das agendas.
MARKER="# police-keep-alive-disconnect-sweep"
JOB="* * * * * curl --fail --silent --show-error -X POST http://127.0.0.1:3000/api/internal/keep-alive-disconnect-sweep >/dev/null 2>&1 ${MARKER}"

(crontab -l 2>/dev/null | grep -vF "${MARKER}" || true; echo "${JOB}") | crontab -
echo "Varredura operacional instalada: alertas de conexão e agendas, uma execução por minuto."
