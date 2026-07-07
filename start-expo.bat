@echo off
cd /d "%~dp0mobile"
echo ============================================
echo   Starting Expo dev server for Backyard
echo   Scan the QR code below with Expo Go
echo   (leave this window open while testing)
echo ============================================
echo.
npx expo start
echo.
echo Expo dev server stopped.
pause
