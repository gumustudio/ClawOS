#!/bin/bash
# ClawOS Build Script

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

install_if_needed() {
  local project_dir="$1"
  if [[ ! -d "${project_dir}/node_modules" ]]; then
    echo "Installing dependencies in ${project_dir}..."
    npm install --prefix "$project_dir"
  fi
}

echo "Building Frontend..."
FRONTEND_DIR="$PROJECT_DIR/frontend"
install_if_needed "$FRONTEND_DIR"
npm --prefix "$FRONTEND_DIR" run build

echo "Building Backend..."
BACKEND_DIR="$PROJECT_DIR/backend"
install_if_needed "$BACKEND_DIR"
npm --prefix "$BACKEND_DIR" run build

echo "Running Health Check..."
"$SCRIPT_DIR/health-check.sh"

echo "Build complete. Ready for production."
