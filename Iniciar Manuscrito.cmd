@echo off
chcp 65001 >nul
title Manuscrito
cd /d "%~dp0"
echo Iniciando Manuscrito...
node serve.js
echo.
echo El servidor se detuvo. Pulsa una tecla para cerrar.
pause >nul
