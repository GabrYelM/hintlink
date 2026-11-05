# scripts/stop-all.ps1
# Encerra todos os processos do Hintlink de forma limpa

$ErrorActionPreference = "SilentlyContinue"
$RootDir = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "Encerrando servicos do Hintlink..." -ForegroundColor Yellow

# 1. Ler arquivo de PIDs se existir
$PidFile = Join-Path $RootDir ".hintlink.pids"
$StopLocalPg = $false

if (Test-Path $PidFile) {
    $Lines = Get-Content $PidFile
    foreach ($Line in $Lines) {
        if ($Line -match "BACKEND_PID=(\d+)") {
            $TargetPid = [int]$Matches[1]
            Stop-Process -Id $TargetPid -Force -ErrorAction SilentlyContinue
        }
        if ($Line -match "FRONTEND_PID=(\d+)") {
            $TargetPid = [int]$Matches[1]
            Stop-Process -Id $TargetPid -Force -ErrorAction SilentlyContinue
        }
        if ($Line -match "LOCAL_PG=True") {
            $StopLocalPg = $true
        }
    }
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

# 2. Garantir que as portas 3333 e 3000 estao livres
$Ports = @(3333, 3000)
foreach ($Port in $Ports) {
    $Conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($Conns) {
        foreach ($Conn in $Conns) {
            $PortPid = $Conn.OwningProcess
            if ($PortPid -gt 0) {
                Stop-Process -Id $PortPid -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# 3. Parar PostgreSQL portatil se foi iniciado pelo Hintlink
$PgCtl = Join-Path $RootDir "bin\pgsql\bin\pg_ctl.exe"
$DataDir = Join-Path $RootDir "data"
if (Test-Path $PgCtl) {
    & $PgCtl -D $DataDir stop -m fast 2>$null | Out-Null
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "   [OK] Todos os servicos do Hintlink foram encerrados com sucesso! " -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
