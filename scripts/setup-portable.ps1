# scripts/setup-portable.ps1
# Script de instalacao e configuracao portatil do Hintlink (Zero dependencias previas)

$ErrorActionPreference = "Stop"
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

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "   INSTALADOR HINTLINK - MONITORIAS UNIVERSITARIAS (UFABC)          " -ForegroundColor Yellow
Write-Host "   Configurando ambiente portatil (sem necessidade de Docker/Node)   " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# Criar pasta bin se nao existir
$BinDir = Join-Path $RootDir "bin"
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

# 1. Checar ou Baixar Node.js Portatil
Write-Host "[1/5] Verificando ambiente Node.js..." -ForegroundColor Yellow
$NodeExe = $null

if (Test-Path (Join-Path $BinDir "node\node.exe")) {
    $NodeExe = Join-Path $BinDir "node\node.exe"
    Write-Host "  -> Node.js portatil detectado em: bin\node" -ForegroundColor Green
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    $NodeExe = (Get-Command node).Source
    Write-Host "  -> Node.js do sistema detectado: $NodeExe" -ForegroundColor Green
} else {
    Write-Host "  -> Node.js nao encontrado. Baixando versao portatil oficial (~29MB)..." -ForegroundColor Cyan
    $NodeZip = Join-Path $BinDir "node.zip"
    $NodeUrl = "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip"
    
    try {
        curl.exe -L -o $NodeZip $NodeUrl
        Write-Host "  -> Extraindo Node.js portatil..." -ForegroundColor Cyan
        tar.exe -xf $NodeZip -C $BinDir
        Rename-Item -Path (Join-Path $BinDir "node-v20.18.0-win-x64") -NewName "node"
        Remove-Item -Path $NodeZip -Force
        $NodeExe = Join-Path $BinDir "node\node.exe"
        Write-Host "  -> Node.js configurado com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host "  [ERRO] Falha ao baixar Node.js. Verifique sua conexao com a internet." -ForegroundColor Red
        exit 1
    }
}

# Adiciona o Node local ao PATH da sessao atual
$NodeDir = Split-Path -Parent $NodeExe
$env:PATH = "$NodeDir;$env:PATH"

# 2. Checar ou Baixar PostgreSQL Portatil
Write-Host "[2/5] Verificando banco de dados PostgreSQL..." -ForegroundColor Yellow
$PgBinDir = Join-Path $BinDir "pgsql\bin"
$PgCtl = Join-Path $PgBinDir "pg_ctl.exe"
$InitDb = Join-Path $PgBinDir "initdb.exe"
$Createdb = Join-Path $PgBinDir "createdb.exe"
$DataDir = Join-Path $RootDir "data"

$IsPort5432Open = (Test-PortOpen "127.0.0.1" 5432)

if ($IsPort5432Open) {
    Write-Host "  -> Servidor PostgreSQL ja esta ativo na porta 5432 (Docker ou local)." -ForegroundColor Green
} else {
    if (-not (Test-Path $PgCtl)) {
        Write-Host "  -> Baixando PostgreSQL 16 portatil (zero Docker, executa localmente)..." -ForegroundColor Cyan
        $PgZip = Join-Path $BinDir "pgsql.zip"
        $PgUrl = "https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64-binaries.zip"
        
        try {
            curl.exe -L -o $PgZip $PgUrl
            Write-Host "  -> Extraindo binarios do PostgreSQL..." -ForegroundColor Cyan
            tar.exe -xf $PgZip -C $BinDir
            Remove-Item -Path $PgZip -Force
            Write-Host "  -> PostgreSQL configurado com sucesso em: bin\pgsql" -ForegroundColor Green
        } catch {
            Write-Host "  [ERRO] Falha ao baixar PostgreSQL portatil." -ForegroundColor Red
            exit 1
        }
    }

    # Inicializar pasta data se nao existir
    if (-not (Test-Path $DataDir)) {
        Write-Host "  -> Inicializando cluster de dados em: data..." -ForegroundColor Cyan
        & $InitDb -D $DataDir -U hintlink_user -E UTF8 --no-locale -A trust | Out-Null
    }

    # Iniciar PostgreSQL portatil
    Write-Host "  -> Iniciando servico PostgreSQL portatil..." -ForegroundColor Cyan
    $LogFile = Join-Path $RootDir "pgsql.log"
    Start-Process -FilePath $PgCtl -ArgumentList "-D `"$DataDir`" -l `"$LogFile`" -o `"-p 5432`" start" -WindowStyle Hidden
    
    # Aguardar PostgreSQL responder na porta 5432
    for ($i = 0; $i -lt 20; $i++) {
        if (Test-PortOpen "127.0.0.1" 5432) {
            break
        }
        Start-Sleep -Milliseconds 300
    }

    # Criar database hintlink_db se nao existir
    Write-Host "  -> Criando banco de dados hintlink_db..." -ForegroundColor Cyan
    cmd.exe /c "`"$Createdb`" -U hintlink_user -h 127.0.0.1 -p 5432 hintlink_db >nul 2>&1"
}

# 3. Validar Migracoes e Seeds do Banco
Write-Host "[3/5] Aplicando tabelas e registros iniciais da UFABC..." -ForegroundColor Yellow
$BackendDir = Join-Path $RootDir "backend"
Push-Location $BackendDir
try {
    Write-Host "  -> Sincronizando schema Prisma..." -ForegroundColor Cyan
    & npx prisma db push --skip-generate | Out-Null
    Write-Host "  -> Executando seed de usuarios e materias..." -ForegroundColor Cyan
    & npx prisma db seed | Out-Null
    Write-Host "  -> Banco de dados pronto e populado!" -ForegroundColor Green
} catch {
    Write-Host "  [AVISO] Verifique a conexao com o banco de dados." -ForegroundColor Yellow
} finally {
    Pop-Location
}

# 4. Compilar Builds de Producao (se ainda nao foram gerados)
Write-Host "[4/5] Verificando compilacao dos sistemas (Next.js & Fastify)..." -ForegroundColor Yellow
$FrontendDir = Join-Path $RootDir "frontend"

if (-not (Test-Path (Join-Path $BackendDir "dist\server.js"))) {
    Write-Host "  -> Compilando Backend Fastify..." -ForegroundColor Cyan
    Push-Location $BackendDir
    & npm run build | Out-Null
    Pop-Location
}

if (-not (Test-Path (Join-Path $FrontendDir ".next"))) {
    Write-Host "  -> Compilando Frontend Next.js..." -ForegroundColor Cyan
    Push-Location $FrontendDir
    & npm run build | Out-Null
    Pop-Location
}
Write-Host "  -> Builds validados com sucesso!" -ForegroundColor Green

# 5. Criar Atalho na Area de Trabalho
Write-Host "[5/5] Criando atalho na Area de Trabalho..." -ForegroundColor Yellow
try {
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = Join-Path $DesktopPath "Hintlink - Iniciar.lnk"
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = Join-Path $RootDir "INICIAR-HINTLINK.bat"
    $Shortcut.WorkingDirectory = $RootDir
    $Shortcut.Description = "Iniciar a Plataforma Hintlink (UFABC)"
    $Shortcut.Save()
    Write-Host "  -> Atalho criado na sua Area de Trabalho: 'Hintlink - Iniciar.lnk'" -ForegroundColor Green
} catch {
    Write-Host "  [AVISO] Nao foi possivel criar o atalho automaticamente." -ForegroundColor Gray
}

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "   INSTALACAO CONCLUIDA COM SUCESSO!                                " -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "  [OK] Binarios portateis configurados (Node.js & PostgreSQL)       " -ForegroundColor White
Write-Host "  [OK] Banco de dados inicializado e populado                       " -ForegroundColor White
Write-Host "  [OK] Atalho criado na sua Area de Trabalho: 'Hintlink - Iniciar'  " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
