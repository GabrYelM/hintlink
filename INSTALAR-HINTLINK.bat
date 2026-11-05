@echo off
title Instalador Hintlink - Monitorias UFABC
chcp 65001 > nul
cd /d "%~dp0"

echo.
echo ====================================================================
echo   🎓 HINTLINK - INSTALADOR PORTÁTIL (UFABC)
echo   Configurando ambiente para demonstração...
echo ====================================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-portable.ps1"

echo.
set /p START_NOW="Deseja iniciar o Hintlink agora? (S/N) [S]: "
if /i "%START_NOW%"=="" set START_NOW=S
if /i "%START_NOW%"=="S" (
    echo.
    echo Iniciando o sistema e abrindo o navegador...
    start "" "%~dp0INICIAR-HINTLINK.bat"
    exit /b 0
)

echo.
echo Para iniciar o sistema mais tarde, use o atalho na Área de Trabalho
echo ou dê 2 cliques no arquivo 'INICIAR-HINTLINK.bat'.
echo.
pause
