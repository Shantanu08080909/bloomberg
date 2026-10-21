#!/usr/bin/env bash
# OpenFinance Terminal — one-command start for macOS and Linux.
#   ./scripts/start.sh          development server (http://localhost:3000)
#   ./scripts/start.sh --prod   production build + server
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20.9 or newer is required: https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js $(node -v) found; version 20.9 or newer is required." >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example (demo mode, embedded database)."
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies…"
  npm install
fi

echo "Preparing the database…"
npm run db:setup

if [ "${1:-}" = "--prod" ]; then
  npm run build
  echo "Starting OpenFinance Terminal at http://localhost:3000"
  npm run start
else
  echo "Starting OpenFinance Terminal at http://localhost:3000"
  npm run dev
fi
