@echo off
title Encerrar Hintlink - UFABC
chcp 65001 > nul
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-all.ps1"
