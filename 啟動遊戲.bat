@echo off
chcp 65001 >nul
setlocal
title LawnGame2D 遊戲
cd /d "%~dp0game"

echo ==========================================
echo   LawnGame2D 遊戲啟動
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js，請先安裝 Node.js 20 以上版本：https://nodejs.org/
  pause
  exit /b 1
)

echo [1/3] 檢查套件...
call npm install --prefer-offline --no-audit --no-fund --loglevel=error
if errorlevel 1 (
  echo [錯誤] 套件安裝失敗，請確認網路連線後再試一次。
  pause
  exit /b 1
)

echo [2/3] 產生測試美術...
call npm run gen --silent -w @lawn/placeholder-art
if errorlevel 1 (
  echo [錯誤] 產生測試內容失敗。
  pause
  exit /b 1
)

echo [3/3] 啟動遊戲伺服器，瀏覽器會自動開啟。
echo       關閉這個視窗即可停止遊戲。
echo.
echo   操作：←→ 移動  ↑↓ 爬梯／進傳送點  Space 跳  ↓+Space 下跳
echo         Z 攻擊（按住連擊）  X C 技能  Shift 翻滾
echo         Q E 調整押注  1-4 切換職業  F1 顯示碰撞
echo.

if "%LAWN_NO_OPEN%"=="1" (
  call npm run dev -w @lawn/web
) else (
  call npm run dev -w @lawn/web -- --open
)

pause
