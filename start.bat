@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist server\node_modules call npm install --prefix server
if not exist client\node_modules call npm install --prefix client
if not exist client\dist call npm run build --prefix client
start "" http://localhost:4100
node server\index.js
pause
