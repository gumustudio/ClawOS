#!/bin/bash

set -euo pipefail

SERVICE_NAME="clawos.service"
HEALTH_URL="http://127.0.0.1:3001/api/system/hardware"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/clawos-watchdog.log"
STATE_FILE="$PROJECT_DIR/logs/clawos-watchdog-status.json"
MAX_RETRIES=3
RETRY_DELAY=2

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

write_state() {
  local result="$1"
  local message="$2"
  local timestamp
  timestamp="$(date --iso-8601=seconds)"

  cat > "$STATE_FILE" <<EOF
{"timestamp":"${timestamp}","result":"${result}","message":"${message}"}
EOF
}

restart_service() {
  log "Restarting ${SERVICE_NAME}"
  write_state "repairing" "正在重启 ${SERVICE_NAME}"
  systemctl --user restart "$SERVICE_NAME"
}

if ! systemctl --user is-active --quiet "$SERVICE_NAME"; then
  log "${SERVICE_NAME} is not active"
  write_state "failed" "检测到 ${SERVICE_NAME} 未运行"
  restart_service
  exit 0
fi

# 从 ~/.clawos/.env 读取密码（格式: CLAWOS_PASSWORD=xxx）
if [[ -z "${CLAWOS_PASSWORD:-}" ]]; then
  if [[ -f "${HOME}/.clawos/.env" ]]; then
    CLAWOS_PASSWORD="$(grep -oP '^CLAWOS_PASSWORD=\K.*' "${HOME}/.clawos/.env" || true)"
  fi
fi
if [[ -z "${CLAWOS_PASSWORD:-}" ]]; then
  log "ERROR: CLAWOS_PASSWORD not set and ~/.clawos/.env not found"
  write_state "failed" "缺少 CLAWOS_PASSWORD 配置"
  exit 1
fi

attempt=1
while [[ "$attempt" -le "$MAX_RETRIES" ]]; do
  HTTP_STATUS="$(curl -sS -o /tmp/clawos-watchdog-health.json -w '%{http_code}' --max-time 8 -u "clawos:${CLAWOS_PASSWORD}" "$HEALTH_URL" || true)"
  if [[ "$HTTP_STATUS" == "200" ]] && grep -q '"success":true' /tmp/clawos-watchdog-health.json; then
    log "Health check passed on attempt ${attempt}"
    write_state "passed" "第 ${attempt} 次检查通过"
    exit 0
  fi

  log "Health check attempt ${attempt} failed with HTTP ${HTTP_STATUS}"
  write_state "retrying" "第 ${attempt} 次检查失败，HTTP ${HTTP_STATUS}"
  if [[ "$attempt" -lt "$MAX_RETRIES" ]]; then
    sleep "$RETRY_DELAY"
  fi
  attempt=$((attempt + 1))
done

log 'Health check failed after retries'
write_state "failed" "连续 ${MAX_RETRIES} 次检查失败"
restart_service
