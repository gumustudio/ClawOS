#!/bin/bash

set -euo pipefail

INHIBIT_SERVICE="clawos-display-inhibit.service"
REMOTE_SERVICE="gnome-remote-desktop.service"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/clawos-display-watchdog.log"
STATE_FILE="$PROJECT_DIR/logs/clawos-display-watchdog-status.json"

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

repair_needed=false
message="显示保活正常"

if ! systemctl --user is-active --quiet "$INHIBIT_SERVICE"; then
  repair_needed=true
  message="显示保活服务未运行，正在重启"
  log "$message"
  write_state "repairing" "$message"
  systemctl --user restart "$INHIBIT_SERVICE"
fi

if ! systemctl --user is-active --quiet "$REMOTE_SERVICE"; then
  log "提醒：${REMOTE_SERVICE} 当前未运行"
  message="显示保活正常，远程桌面服务当前未运行"
fi

if [[ "$repair_needed" == true ]]; then
  if systemctl --user is-active --quiet "$INHIBIT_SERVICE"; then
    log '显示保活服务已恢复'
    write_state "passed" "显示保活服务已恢复"
    exit 0
  fi

  log '显示保活服务恢复失败'
  write_state "failed" "显示保活服务恢复失败"
  exit 0
fi

log "$message"
write_state "passed" "$message"
