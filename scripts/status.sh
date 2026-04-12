#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_URL="${1:-http://localhost:3001}"

echo "ClawOS status"
echo "Root URL: ${ROOT_URL}"
echo

echo "[systemd]"
systemctl --user --no-pager --plain --full status clawos.service | sed -n '1,8p'
echo
systemctl --user --no-pager --plain --full status clawos-filebrowser.service | sed -n '1,8p'
echo
systemctl --user --no-pager --plain --full status clawos-watchdog.timer | sed -n '1,8p'
echo
systemctl --user --no-pager --plain --full status clawos-display-inhibit.service | sed -n '1,8p'
echo
systemctl --user --no-pager --plain --full status clawos-display-watchdog.timer | sed -n '1,8p'
echo

echo "[ports]"
ss -ltnp | grep -E ':(3001|18789|18790)\b' || true
echo

echo "[health]"
"$SCRIPT_DIR/health-check.sh" "$ROOT_URL"

echo
echo "[recent logs]"
python3 - "$PROJECT_DIR" <<'PY'
import sys
from pathlib import Path

project_dir = sys.argv[1]
log_path = Path(project_dir) / 'logs' / 'backend-out.log'
if not log_path.exists():
    print('backend-out.log not found')
else:
    interesting = [
        line for line in log_path.read_text().splitlines()
        if '[Server]' in line or '[Proxy]' in line or '[ERROR]' in line or '[WARN]' in line
    ]
    for line in interesting[-12:]:
        print(line)
PY
