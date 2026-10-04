# PowerShell convenience script for RAG on Windows
param(
    [Parameter(Position=0)]
    [string]$Command = "start",

    [Parameter(Position=1)]
    [string]$Option = ""
)

$ErrorActionPreference = "Stop"

$ProjectDir = $PSScriptRoot
$ComposeFile = Join-Path $ProjectDir "docker-compose.local.yml"
$EnvFile = Join-Path $ProjectDir ".env.local"
$EnvTemplate = Join-Path $ProjectDir ".env.local.example"

function Check-Prerequisites {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker Desktop is not installed or not in PATH. Please install and start Docker Desktop."
        exit 1
    }
    
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker daemon is not running. Please start Docker Desktop and try again."
        exit 1
    }

    if (-not (Test-Path $EnvFile)) {
        Copy-Item $EnvTemplate $EnvFile
        Write-Host "Created .env.local with local development defaults." -ForegroundColor Green
    }
}

function Run-Compose {
    param([string[]]$ComposeArgs)
    & docker compose --project-name ragio-local --env-file $EnvFile -f $ComposeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker Compose command failed with exit code $LASTEXITCODE"
        exit $LASTEXITCODE
    }
}

function Show-Urls {
    $httpPort = "3003"
    $apiPort = "8088"
    $minioPort = "9000"
    $minioConsolePort = "9001"
    $flowerPort = "5555"

    if (Test-Path $EnvFile) {
        Get-Content $EnvFile | ForEach-Object {
            if ($_ -match '^HTTP_PORT=(.*)$') { $httpPort = $matches[1].Trim() }
            if ($_ -match '^API_PORT=(.*)$') { $apiPort = $matches[1].Trim() }
            if ($_ -match '^MINIO_PORT=(.*)$') { $minioPort = $matches[1].Trim() }
            if ($_ -match '^MINIO_CONSOLE_PORT=(.*)$') { $minioConsolePort = $matches[1].Trim() }
            if ($_ -match '^FLOWER_PORT=(.*)$') { $flowerPort = $matches[1].Trim() }
        }
    }

    Write-Host ""
    Write-Host "RAG is running:" -ForegroundColor Cyan
    Write-Host "  App:           http://localhost:$httpPort" -ForegroundColor Green
    Write-Host "  API docs:      http://localhost:$apiPort/docs" -ForegroundColor Green
    Write-Host "  MinIO console: http://localhost:$minioConsolePort" -ForegroundColor Green
    Write-Host "  MinIO API:     http://localhost:$minioPort" -ForegroundColor Green
    Write-Host "  Flower:        http://localhost:$flowerPort" -ForegroundColor Green
    Write-Host ""
    Write-Host "Tip: Configure MISTRAL_API_KEY (or GROQ_API_KEY / GEMINI_API_KEY) in .env.local to enable AI chat answers." -ForegroundColor Yellow
}

function Show-Help {
    Write-Host "Usage: .\ragio.ps1 <command>" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  start [--no-build]  Build (unless --no-build) and start every component"
    Write-Host "  stop                Stop containers but keep their data"
    Write-Host "  restart             Restart the running stack"
    Write-Host "  status              Show component status"
    Write-Host "  logs [service]      Follow all logs, or one service's logs"
    Write-Host "  down                Remove containers and network but keep Docker volumes"
}

switch ($Command.ToLower()) {
    "start" {
        Check-Prerequisites
        if ($Option -eq "--no-build") {
            Run-Compose @("up", "--detach")
        } elseif ($Option -ne "") {
            Show-Help
            exit 1
        } else {
            Run-Compose @("up", "--detach", "--build")
        }
        Run-Compose @("ps")
        Show-Urls
    }
    "stop" {
        Check-Prerequisites
        Run-Compose @("stop")
    }
    "restart" {
        Check-Prerequisites
        Run-Compose @("restart")
        Run-Compose @("ps")
        Show-Urls
    }
    "status" {
        Check-Prerequisites
        Run-Compose @("ps")
    }
    "logs" {
        Check-Prerequisites
        if ($Option -ne "") {
            Run-Compose @("logs", "--follow", $Option)
        } else {
            Run-Compose @("logs", "--follow")
        }
    }
    "down" {
        Check-Prerequisites
        Run-Compose @("down")
    }
    default {
        Show-Help
    }
}
