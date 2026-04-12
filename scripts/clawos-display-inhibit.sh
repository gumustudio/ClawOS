#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/clawos-display-inhibit.log"

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG_FILE"
}

log 'Starting display inhibit guard'

exec systemd-inhibit \
  --why="Keep remote desktop display output alive" \
  --who="ClawOS" \
  --what=idle:sleep \
  bash -lc 'trap "exit 0" TERM INT; while true; do sleep 3600; done'
