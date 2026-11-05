@echo off
title Hintlink - Monitorias Sob Demanda (UFABC)
chcp 65001 > nul
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-all.ps1"
