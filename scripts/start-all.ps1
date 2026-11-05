# scripts/start-all.ps1
# Iniciador orquestrado dos servicos do Hintlink

$ErrorActionPreference = "Continue"
$RootDir = Split-Path -Parent $PSScriptRoot

function Test-PortOpen([string]$ip, [int]$port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect($ip, $port, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(300, $false)
        if (-not $wait) {
            $tcp.Close()
            return $false
        }
        $tcp.EndConnect($iar)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

# 1. Configurar Executavel Node.js
$NodeExe = $null
if (Test-Path (Join-Path $RootDir "bin\node\node.exe")) {
    $NodeExe = Join-Path $RootDir "bin\node\node.exe"
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    $NodeExe = (Get-Command node).Source
} else {
    $NodeExe = "node"
}
$NodeDir = Split-Path -Parent $NodeExe
$env:PATH = "$NodeDir;$env:PATH"

# 2. Verificar e Iniciar Banco de Dados
$IsPort5432Open = (Test-PortOpen "127.0.0.1" 5432)
$StartedLocalPg = $false

if (-not $IsPort5432Open) {
    $PgCtl = Join-Path $RootDir "bin\pgsql\bin\pg_ctl.exe"
    $DataDir = Join-Path $RootDir "data"
    $LogFile = Join-Path $RootDir "pgsql.log"

    if (Test-Path $PgCtl) {
        Write-Host "Iniciando PostgreSQL portatil..." -ForegroundColor Cyan
        Start-Process -FilePath $PgCtl -ArgumentList "-D `"$DataDir`" -l `"$LogFile`" -o `"-p 5432`" start" -WindowStyle Hidden
        $StartedLocalPg = $true
        
        # Aguardar porta 5432 abrir
        for ($i = 0; $i -lt 15; $i++) {
            if (Test-PortOpen "127.0.0.1" 5432) {
                break
            }
            Start-Sleep -Milliseconds 300
        }
    } elseif (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "Iniciando container PostgreSQL via Docker..." -ForegroundColor Cyan
        Push-Location $RootDir
        docker compose up -d 2>$null
        Pop-Location
        Start-Sleep -Seconds 3
    }
}

# 3. Limpar processos antigos nas portas 3333 e 3000 (evitar conflito EADDRINUSE)
$PortsToFree = @(3333, 3000)
foreach ($Port in $PortsToFree) {
    $Conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($Conns) {
        foreach ($Conn in $Conns) {
            $PidToKill = $Conn.OwningProcess
            if ($PidToKill -gt 0) {
                Stop-Process -Id $PidToKill -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# 4. Iniciar Backend Fastify em Segundo Plano
$BackendDir = Join-Path $RootDir "backend"
$BackendLog = Join-Path $RootDir "backend.log"
$BackendErr = Join-Path $RootDir "backend.err.log"
$BackendServer = Join-Path $BackendDir "dist\server.js"

if (-not (Test-Path $BackendServer)) {
    $BackendProc = Start-Process -FilePath $NodeExe -ArgumentList "src/server.ts" -WorkingDirectory $BackendDir -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErr -WindowStyle Hidden -PassThru
} else {
    $BackendProc = Start-Process -FilePath $NodeExe -ArgumentList "dist/server.js" -WorkingDirectory $BackendDir -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErr -WindowStyle Hidden -PassThru
}

# 5. Iniciar Frontend Next.js em Segundo Plano
$FrontendDir = Join-Path $RootDir "frontend"
$FrontendLog = Join-Path $RootDir "frontend.log"
$FrontendErr = Join-Path $RootDir "frontend.err.log"
$FrontendProc = Start-Process -FilePath $NodeExe -ArgumentList "node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000" -WorkingDirectory $FrontendDir -RedirectStandardOutput $FrontendLog -RedirectStandardError $FrontendErr -WindowStyle Hidden -PassThru

# Salvar PIDs para encerramento
$PidFile = Join-Path $RootDir ".hintlink.pids"
@(
    "BACKEND_PID=$($BackendProc.Id)"
    "FRONTEND_PID=$($FrontendProc.Id)"
    "LOCAL_PG=$StartedLocalPg"
) | Out-File -FilePath $PidFile -Encoding utf8

# 6. Aguardar servidores responderem
Write-Host "Aguardando servicos ficarem prontos..." -ForegroundColor Cyan
$MaxAttempts = 40
$IsReady = $false

for ($i = 0; $i -lt $MaxAttempts; $i++) {
    $Test3000 = (Test-PortOpen "127.0.0.1" 3000)
    $Test3333 = (Test-PortOpen "127.0.0.1" 3333)
    if ($Test3000 -and $Test3333) {
        $IsReady = $true
        break
    }
    Start-Sleep -Milliseconds 400
}

# 7. Abrir Navegador
if ($IsReady) {
    Write-Host "Servicos prontos! Abrindo navegador..." -ForegroundColor Green
    cmd.exe /c start http://localhost:3000
} else {
    Write-Host "[AVISO] Inicializacao demorou mais que o esperado. Abrindo navegador..." -ForegroundColor Yellow
    cmd.exe /c start http://localhost:3000
}

# 8. Painel de Controle no Console
Clear-Host
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "   HINTLINK - SISTEMA DE MONITORIAS SOB DEMANDA (UFABC)             " -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "  [OK] Banco de Dados:  ONLINE (Porta 5432)                         " -ForegroundColor Green
Write-Host "  [OK] Servidor API:    ONLINE (http://localhost:3333)              " -ForegroundColor Green
Write-Host "  [OK] Interface Web:   ONLINE (http://localhost:3000)              " -ForegroundColor Green
Write-Host "  [OK] Documentacao:    ONLINE (http://localhost:3333/docs)         " -ForegroundColor Green
Write-Host "  [OK] Navegador:       ABERTO                                      " -ForegroundColor Green
Write-Host "--------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Contas de teste pre-configuradas para demonstracao:                " -ForegroundColor White
Write-Host "    * Monitor: monitor@aluno.ufabc.edu.br  |  Senha: 123456          " -ForegroundColor Yellow
Write-Host "    * Aluno:   aluno@aluno.ufabc.edu.br    |  Senha: 123456          " -ForegroundColor Yellow
Write-Host "    * Aluno 2: rafa@aluno.ufabc.edu.br     |  Senha: 123456          " -ForegroundColor Yellow
Write-Host "--------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  -> Dica: O sistema tambem pode ser acessado de outro computador   " -ForegroundColor Gray
Write-Host "           na mesma rede Wi-Fi via: http://<SEU_IP_LOCAL>:3000       " -ForegroundColor Gray
Write-Host "--------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  Pressione qualquer tecla ou execute PARAR-HINTLINK.bat para       " -ForegroundColor Magenta
Write-Host "  encerrar todos os servicos com seguranca.                          " -ForegroundColor Magenta
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# Aguarda tecla do usuario para desligar
try {
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} catch {
    cmd.exe /c pause > $null
}

# Executa desligamento limpo
& (Join-Path $PSScriptRoot "stop-all.ps1")
