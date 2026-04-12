#!/bin/bash
# Start script for ClawOS Development

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Start Backend
cd "$PROJECT_DIR/backend"
npm run dev &
BACKEND_PID=$!

# Start Frontend
cd "$PROJECT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo "ClawOS is running!"
echo "Frontend: http://localhost:5173"
echo "Backend: http://localhost:3001"

wait $BACKEND_PID $FRONTEND_PID
