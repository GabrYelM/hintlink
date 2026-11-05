@echo off
title Gerador de Pacote Portátil - Hintlink UFABC
chcp 65001 > nul
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\gerar-pacote.ps1"

echo.
pause
