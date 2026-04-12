#!/bin/bash

set -euo pipefail

ROOT_URL="${1:-http://localhost:3001}"
FILEBROWSER_URL="${ROOT_URL}/proxy/filebrowser/"
OPENCLAW_URL="${ROOT_URL}/proxy/openclaw/"
API_URL="${ROOT_URL}/api/system/hardware"

check_http() {
  local name="$1"
  local url="$2"
  local expected="$3"

  local body_file
  body_file="$(mktemp)"

  local status
  status="$(curl -sS -L -o "$body_file" -w '%{http_code}' "$url")"

  if [[ "$status" != "200" ]]; then
    echo "[FAIL] ${name}: HTTP ${status} -> ${url}"
    rm -f "$body_file"
    return 1
  fi

  if ! grep -q "$expected" "$body_file"; then
    echo "[FAIL] ${name}: expected marker '${expected}' not found -> ${url}"
    rm -f "$body_file"
    return 1
  fi

  local size
  size="$(wc -c < "$body_file")"
  echo "[OK] ${name}: HTTP 200 (${size} bytes)"
  rm -f "$body_file"
}

echo "ClawOS health check"
echo "Root URL: ${ROOT_URL}"

check_http "OpenClaw HTML" "$OPENCLAW_URL" "OpenClaw Control"
check_http "FileBrowser HTML" "$FILEBROWSER_URL" "File Browser"
check_http "System API" "$API_URL" '"success":true'

echo "[OK] All core endpoints are healthy"
