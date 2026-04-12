#!/bin/bash
# Install Systemd user services for ClawOS

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_DIR="$HOME/.config/systemd/user"
mkdir -p "$SERVICE_DIR"

install_template() {
  local template="$1"
  local target="$2"
  echo "Installing ${target}..."
  sed -e "s|__PROJECT_DIR__|${PROJECT_DIR}|g" \
      -e "s|__HOME__|${HOME}|g" \
      "$SCRIPT_DIR/$template" > "$SERVICE_DIR/$target"
}

install_template "clawos.service.template" "clawos.service"
install_template "clawos-filebrowser.service.template" "clawos-filebrowser.service"
install_template "clawos-alist.service.template" "clawos-alist.service"
install_template "clawos-watchdog.service.template" "clawos-watchdog.service"
install_template "clawos-watchdog.timer.template" "clawos-watchdog.timer"
install_template "clawos-display-inhibit.service.template" "clawos-display-inhibit.service"
install_template "clawos-display-watchdog.service.template" "clawos-display-watchdog.service"
install_template "clawos-display-watchdog.timer.template" "clawos-display-watchdog.timer"

echo "Reloading systemd user daemon..."
systemctl --user daemon-reload

echo "Enabling and starting services..."
systemctl --user enable --now clawos.service
systemctl --user enable --now clawos-filebrowser.service
systemctl --user enable --now clawos-watchdog.timer
systemctl --user enable --now clawos-display-inhibit.service
systemctl --user enable --now clawos-display-watchdog.timer

echo "Checking status..."
systemctl --user status clawos.service --no-pager
systemctl --user status clawos-filebrowser.service --no-pager
systemctl --user status clawos-watchdog.timer --no-pager
systemctl --user status clawos-display-inhibit.service --no-pager
systemctl --user status clawos-display-watchdog.timer --no-pager

echo "Running health check..."
"$SCRIPT_DIR/health-check.sh"

echo ""
echo "======================================"
echo "ClawOS is now running persistently!"
echo "Access it at: http://localhost:3001"
echo "======================================"
