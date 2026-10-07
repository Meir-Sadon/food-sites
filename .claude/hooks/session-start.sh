#!/bin/bash
# Prepares a Claude Code cloud session: .NET 10 SDK, backend restore, frontend packages,
# and a Docker daemon for the backend's Testcontainers tests. Safe to run more than once.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Microsoft's download hosts are usually blocked by the network policy; Ubuntu's archive is not.
if ! command -v dotnet >/dev/null 2>&1; then
  echo "Installing .NET 10 SDK from apt..."
  if ! apt-get install -y -q dotnet-sdk-10.0 >/dev/null 2>&1; then
    apt-get update -q >/dev/null 2>&1 || true
    apt-get install -y -q dotnet-sdk-10.0 >/dev/null 2>&1 || echo "WARNING: could not install dotnet-sdk-10.0"
  fi
fi

if command -v dotnet >/dev/null 2>&1; then
  echo "Restoring backend packages..."
  dotnet restore backend/FoodSite.slnx >/dev/null || echo "WARNING: dotnet restore failed"
  if [ ! -x "$HOME/.dotnet/tools/dotnet-ef" ]; then
    dotnet tool install --global dotnet-ef >/dev/null || echo "WARNING: could not install dotnet-ef"
  fi
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    echo 'export PATH="$PATH:$HOME/.dotnet/tools"' >> "$CLAUDE_ENV_FILE"
  fi
fi

echo "Installing frontend packages..."
(cd frontend && npm install --no-audit --no-fund >/dev/null)

# Backend integration tests start PostgreSQL through Testcontainers and need a Docker daemon.
if command -v dockerd >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  echo "Starting Docker daemon..."
  nohup dockerd >/tmp/dockerd.log 2>&1 &
  for _ in $(seq 1 20); do
    docker info >/dev/null 2>&1 && break
    sleep 1
  done
  docker info >/dev/null 2>&1 || echo "WARNING: Docker daemon did not start (see /tmp/dockerd.log)"
fi

echo "Session setup done."
