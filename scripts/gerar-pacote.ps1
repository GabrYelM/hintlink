# scripts/gerar-pacote.ps1
# Gera o pacote portatil completo para Pendrive / Demonstracao Offline (Zero instalacao)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$OutputDir = Join-Path $RootDir "dist-portable\Hintlink"

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host "   GERADOR DE PACOTE PORTATIL OFFLINE - HINTLINK (UFABC)           " -ForegroundColor Yellow
Write-Host "   Preparando versao pronta para Pen Drive (100% Plug & Play)       " -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Executar instalacao portatil local se ainda nao foi feita
Write-Host "[1/5] Verificando dependencias portateis..." -ForegroundColor Yellow
& (Join-Path $PSScriptRoot "setup-portable.ps1")

# 2. Criar pasta de saida
Write-Host "[2/5] Preparando estrutura de distribuicao..." -ForegroundColor Yellow
if (Test-Path $OutputDir) {
    Remove-Item -Path $OutputDir -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDir | Out-Null

# 3. Copiar Binarios Portateis (Node & PostgreSQL)
Write-Host "[3/5] Copiando executaveis portateis (Node.js & PostgreSQL)..." -ForegroundColor Yellow
$BinDir = Join-Path $RootDir "bin"
if (Test-Path $BinDir) {
    Copy-Item -Path $BinDir -Destination $OutputDir -Recurse -Force
}

# 4. Copiar Banco de Dados Pre-Configurado (data)
Write-Host "[4/5] Copiando dados do banco pre-populado..." -ForegroundColor Yellow
$DataDir = Join-Path $RootDir "data"
if (Test-Path $DataDir) {
    # Garante que o postgres esta parado antes de copiar os dados
    $PgCtl = Join-Path $RootDir "bin\pgsql\bin\pg_ctl.exe"
    if (Test-Path $PgCtl) {
        & $PgCtl -D $DataDir stop -m fast 2>$null | Out-Null
        Start-Sleep -Seconds 1
    }
    Copy-Item -Path $DataDir -Destination $OutputDir -Recurse -Force
}

# 5. Copiar Aplicacao (Backend e Frontend)
Write-Host "[5/5] Copiando aplicacao compilada..." -ForegroundColor Yellow
# Backend
$BackendOut = Join-Path $OutputDir "backend"
New-Item -ItemType Directory -Path $BackendOut | Out-Null
Copy-Item -Path (Join-Path $RootDir "backend\dist") -Destination $BackendOut -Recurse -Force
Copy-Item -Path (Join-Path $RootDir "backend\prisma") -Destination $BackendOut -Recurse -Force
Copy-Item -Path (Join-Path $RootDir "backend\package.json") -Destination $BackendOut -Force
Copy-Item -Path (Join-Path $RootDir "backend\.env") -Destination $BackendOut -Force
Copy-Item -Path (Join-Path $RootDir "backend\node_modules") -Destination $BackendOut -Recurse -Force

# Frontend
$FrontendOut = Join-Path $OutputDir "frontend"
New-Item -ItemType Directory -Path $FrontendOut | Out-Null
Copy-Item -Path (Join-Path $RootDir "frontend\.next") -Destination $FrontendOut -Recurse -Force
Copy-Item -Path (Join-Path $RootDir "frontend\public") -Destination $FrontendOut -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $RootDir "frontend\package.json") -Destination $FrontendOut -Force
Copy-Item -Path (Join-Path $RootDir "frontend\node_modules") -Destination $FrontendOut -Recurse -Force

# Scripts
$ScriptsOut = Join-Path $OutputDir "scripts"
New-Item -ItemType Directory -Path $ScriptsOut | Out-Null
Copy-Item -Path (Join-Path $RootDir "scripts\start-all.ps1") -Destination $ScriptsOut -Force
Copy-Item -Path (Join-Path $RootDir "scripts\stop-all.ps1") -Destination $ScriptsOut -Force

# Arquivos executaveis (.bat) da raiz do pacote
Copy-Item -Path (Join-Path $RootDir "INICIAR-HINTLINK.bat") -Destination $OutputDir -Force
Copy-Item -Path (Join-Path $RootDir "PARAR-HINTLINK.bat") -Destination $OutputDir -Force
Copy-Item -Path (Join-Path $RootDir "INSTALAR-HINTLINK.bat") -Destination $OutputDir -Force

# Criar LEIAME com instrucoes claras
$LeiameContent = @"
====================================================================
  🎓 HINTLINK - MONITORIAS UNIVERSITARIAS SOB DEMANDA (UFABC)
====================================================================
  Instrucoes para demonstracao em computadores da universidade
====================================================================

Este pacote e 100% portatil e autocontido:
  • NAO requer permissao de Administrador.
  • NAO requer Docker, Git, Node.js ou banco de dados previamente instalados.
  • Funciona diretamente a partir de um Pen Drive ou pasta local.

COMO USAR:
1. Para INICIAR o sistema:
   De 2 cliques no arquivo: 'INICIAR-HINTLINK.bat'
   O sistema ligara o banco de dados, a API e a interface web,
   e abrira automaticamente o navegador em: http://localhost:3000

2. CONTAS DE DEMONSTRACAO PRE-CADASTRADAS:
   • Monitor (com materias aprovadas):
       E-mail: monitor@aluno.ufabc.edu.br  |  Senha: 123456
   • Aluno:
       E-mail: aluno@aluno.ufabc.edu.br    |  Senha: 123456
   • Gabryel (Monitor):
       E-mail: gabryel.m@aluno.ufabc.edu.br |  Senha: 123456

3. Para ENCERRAR o sistema:
   Pressione qualquer tecla na janela do console ou de 2 cliques em:
   'PARAR-HINTLINK.bat'

====================================================================
"@

$LeiamePath = Join-Path $OutputDir "LEIAME-DEMONSTRACAO.txt"
$LeiameContent | Out-File -FilePath $LeiamePath -Encoding utf8

Write-Host ""
Write-Host "====================================================================" -ForegroundColor Green
Write-Host "   PACOTE PORTATIL CRIADO COM SUCESSO!                             " -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Green
Write-Host " Pasta gerada em: dist-portable\Hintlink                             " -ForegroundColor Cyan
Write-Host ""
Write-Host " Como usar no dia da demonstracao na faculdade:                     " -ForegroundColor White
Write-Host "   1. Copie a pasta 'Hintlink' para o seu Pen Drive.                " -ForegroundColor Yellow
Write-Host "   2. No computador da universidade, abra o Pen Drive.              " -ForegroundColor Yellow
Write-Host "   3. De 2 cliques em 'INICIAR-HINTLINK.bat' e pronto!              " -ForegroundColor Yellow
Write-Host "====================================================================" -ForegroundColor Green
Write-Host ""
