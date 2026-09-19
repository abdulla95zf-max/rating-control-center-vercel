$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

Write-Host "Online Rating Control Center - Windows installer"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw "Node.js is not installed. Install Node.js 24 or newer and try again." }
$nodeVersion = (& node --version).TrimStart("v")
if ([int]($nodeVersion.Split(".")[0]) -lt 24) { throw "Node.js 24 or newer is required. Installed: $nodeVersion" }

if (-not (Test-Path (Join-Path $projectRoot ".env"))) {
    Copy-Item (Join-Path $projectRoot ".env.example") (Join-Path $projectRoot ".env")
    Write-Host "Created .env. Set TALABAT_DB_PATH to the production monitor database before starting."
}

Write-Host "Installing dependencies..."
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

Write-Host "Building dashboard..."
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

Write-Host ""
Write-Host "Installation completed."
Write-Host "Edit .env, then run start-dashboard.bat."
