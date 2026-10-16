@echo off
chcp 65001 >nul
setlocal
title LawnGame2D 版本更新部署
cd /d "%~dp0game"

echo ==========================================
echo   LawnGame2D 版本更新：部署到 claude.ai
echo   https://claude.ai/artifact/NTjSKzmHiqXQzyPyk1cU5j
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js，請先安裝 Node.js 20 以上版本：https://nodejs.org/
  pause
  exit /b 1
)
where claude >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Claude Code（claude 指令）。上傳到 claude.ai 要用 Claude Code，請先安裝並登入。
  pause
  exit /b 1
)

echo [1/4] 檢查套件...
call npm install --prefer-offline --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo [錯誤] 套件安裝失敗，請確認網路連線後再試一次。
  pause
  exit /b 1
)

echo [2/4] 建置遊戲...
call npm run build --silent
if errorlevel 1 (
  echo [錯誤] 建置失敗，請看上面的錯誤訊息。
  pause
  exit /b 1
)

echo [3/4] 比對上次部署的檔案...
node scripts\release-prepare.mjs
if errorlevel 2 (
  echo 沒有變動，不需要部署。
  pause
  exit /b 0
)
if errorlevel 1 (
  echo [錯誤] 準備部署失敗。
  pause
  exit /b 1
)

if "%LAWN_RELEASE_DRYRUN%"=="1" (
  echo [測試] 只準備不上傳。給 Claude 的指示在 game\web\release\prompt.txt
  pause
  exit /b 0
)

echo [4/4] 請 Claude 上傳到 Artifact（檔案多時要幾分鐘，請勿關閉視窗）...
claude -p --allowedTools Artifact --output-format text < web\release\prompt.txt > web\release\claude-output.txt 2>&1
type web\release\claude-output.txt
echo.
findstr /C:"RELEASE_OK" web\release\claude-output.txt >nul
if errorlevel 1 (
  echo [錯誤] 部署沒有完成，請看上面 Claude 的回報。這次的檔案清單沒有記錄，下次會重新上傳。
  pause
  exit /b 1
)
node scripts\release-prepare.mjs --commit

echo.
echo 完成！重新整理 https://claude.ai/artifact/NTjSKzmHiqXQzyPyk1cU5j 就是新版本。
pause
