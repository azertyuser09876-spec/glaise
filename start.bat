@echo off
chcp 65001 >nul
title Glaise - serveur
cd /d "%~dp0"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"
set "NODE=node"
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
if exist "%~dp0node\node.exe" set "NODE=%~dp0node\node.exe"
rem Le jeu s'ouvre dans sa propre fenetre (Edge ou Chrome en mode application).
rem Cette console reste le serveur : la fermer arrete la partie.
set "FENETRE=1"
"%NODE%" server.js %PORT%
if errorlevel 1 (
  echo.
  echo  Le serveur s'est arrete avec une erreur.
  echo  Si Node.js est introuvable : copiez node.exe a cote de start.bat
  echo  ou dans un dossier "node", ou ajoutez-le au PATH.
)
pause
