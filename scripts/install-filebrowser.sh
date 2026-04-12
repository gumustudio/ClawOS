#!/bin/bash
# Install and configure FileBrowser locally

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Create directory
mkdir -p "$PROJECT_DIR/filebrowser"
cd "$PROJECT_DIR/filebrowser"

echo "Downloading FileBrowser..."
curl -fsSL https://raw.githubusercontent.com/filebrowser/get/master/get.sh | bash

echo "Configuring FileBrowser..."
# Initialize database
filebrowser config init -a '127.0.0.1' -p 8080 -d ./filebrowser.db -r "$HOME"

# Set default credentials (admin/admin - you should change this later)
filebrowser users add admin admin --perm.admin -d ./filebrowser.db

echo "FileBrowser installed successfully."
