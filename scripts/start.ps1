# OpenFinance Terminal - one-command start for Windows PowerShell.
#   powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1          (development)
#   powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Prod    (production build)
param([switch]$Prod)

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js 20.9 or newer is required: https://nodejs.org"
  exit 1
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  Write-Error "Node.js $(node -v) found; version 20.9 or newer is required."
  exit 1
}

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.example" ".env.local"
  Write-Host "Created .env.local from .env.example (demo mode, embedded database)."
}

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing dependencies..."
  npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host "Preparing the database..."
npm run db:setup
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Prod) {
  npm run build
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Starting OpenFinance Terminal at http://localhost:3000"
  npm run start
} else {
  Write-Host "Starting OpenFinance Terminal at http://localhost:3000"
  npm run dev
}
