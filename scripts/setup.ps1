param(
  [switch]$StartDev,
  [string]$MigrationName = 'init'
)

Set-StrictMode -Version Latest

## Helper to kill processes on a port.
function Stop-ProcessOnPort {
  param([int]$Port)
  $lines = netstat -ano 2>$null | Select-String "[\s:]$Port\s" | Select-String 'LISTENING'
  $pids = $lines | ForEach-Object { ($_ -split '\s+')[-1] } | Sort-Object -Unique
  foreach ($procId in $pids) {
    if ($procId -match '^\d+$' -and [int]$procId -gt 0) {
      $proc = Get-Process -Id ([int]$procId) -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Host "  Stopping $($proc.ProcessName) (PID $procId) on port $Port..."
        Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Install-NpmDependencies {
  param(
    [string]$ProjectName
  )

  Write-Host "Installing npm dependencies for $ProjectName..."

  if (Test-Path package-lock.json) {
    & npm ci
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "npm ci failed in $ProjectName - falling back to npm install"
      & npm install
    }
  } else {
    & npm install
  }

  if ($LASTEXITCODE -ne 0) {
    Write-Error "npm dependency installation failed in $ProjectName."
    exit 1
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Join-Path $scriptDir '..')

Write-Host "Working directory: $PWD"

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env -Force
  Write-Host "Created .env from .env.example"
} else {
  Write-Host ".env exists; leaving it in place"
}

Get-Content .env | ForEach-Object {
  if (-not $_ -or $_.Trim().StartsWith('#')) { return }
  $parts = $_ -split '=', 2
  if ($parts.Count -eq 2) {
    [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
  }
}

if (-not $env:DATABASE_URL) {
  $dbHost = if ($env:DATABASE_HOST -and $env:DATABASE_HOST -ne 'postgres') { $env:DATABASE_HOST } else { 'localhost' }
  $dbPort = if ($env:DATABASE_PORT) { $env:DATABASE_PORT } else { '5432' }
  $dbUser = if ($env:DATABASE_USER) { $env:DATABASE_USER } else { 'stryk_user' }
  $dbPassword = if ($env:DATABASE_PASSWORD) { $env:DATABASE_PASSWORD } else { 'stryk_pass' }
  $dbName = if ($env:DATABASE_NAME) { $env:DATABASE_NAME } else { 'stryker_jtts' }
  $env:DATABASE_URL = "postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker CLI not found. Install and start Docker Desktop, then re-run this script."
  exit 1
}


Write-Host "Pulling images..."
docker compose pull

Write-Host "Checking port 4000 for conflicting processes..."
Stop-ProcessOnPort 4000
if ($?) { Start-Sleep -Milliseconds 500 }

Write-Host "Starting infrastructure (Postgres, MinIO, Redis, Adminer)..."
docker compose up -d --build

Write-Host "Setting up backend..."
Push-Location backend

# Kill any node process still holding Prisma
Write-Host "Stopping lingering node processes that may hold backend files..."
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "  Stopping node PID $($_.Id)..."
  Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 500

Install-NpmDependencies -ProjectName 'backend'

Write-Host "Generating Prisma client..."
npx prisma@5 generate --schema prisma/schema.prisma
if ($LASTEXITCODE -ne 0) {
  Write-Error "prisma generate failed - cannot continue without a generated client."
  exit 1
}

Write-Host "Applying database migrations..."
npx prisma@5 migrate deploy --schema prisma/schema.prisma
if ($LASTEXITCODE -ne 0) {
  Write-Warning "migrate deploy returned a non-zero exit code (may be safe to ignore on a fresh DB)"
}

Write-Host "Seeding database..."
try { npm run seed } catch { Write-Warning "Seeding failed: $_" }
Pop-Location

Write-Host "Setting up frontend dependencies..."
Push-Location frontend
Install-NpmDependencies -ProjectName 'frontend'
Pop-Location

if ($StartDev) {
  $backendPath = Join-Path $PWD 'backend'
  $frontendPath = Join-Path $PWD 'frontend'

  Write-Host "Starting backend dev in a new PowerShell window..."
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$backendPath'; npm run dev"

  Write-Host "Starting frontend dev in a new PowerShell window..."
  Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$frontendPath'; npm run dev"
}

Write-Host "Setup complete."