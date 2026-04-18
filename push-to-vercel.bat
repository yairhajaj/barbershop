@echo off
chcp 65001 > nul
title Deploying to Vercel...
cd /d "%~dp0"

echo.
echo ========================================
echo   Deploying OPENFRMT Changes to Vercel
echo ========================================
echo.

echo [1/4] Adding files...
git add src/hooks/useBusinessSettings.js ^
        src/lib/openfrmt.js ^
        src/pages/admin/finance/AccountantTab.jsx ^
        src/pages/admin/finance/SettingsTab.jsx ^
        supabase/migrations/033_tax_registration.sql ^
        tax-authority-submission/
if errorlevel 1 goto :error

echo.
echo [2/4] Checking what will be committed...
git status --short
echo.

echo [3/4] Creating commit...
git commit -m "feat: OPENFRMT 1.31 compliance + tax authority registration UI"
if errorlevel 1 (
    echo.
    echo WARNING: No changes to commit, or commit failed.
    echo This is OK if everything is already committed.
    echo.
)

echo.
echo [4/4] Pushing to GitHub...
git push
if errorlevel 1 goto :error

echo.
echo ========================================
echo   SUCCESS! Vercel will deploy in ~2 min
echo ========================================
echo.
echo Check deployment status at:
echo https://vercel.com/dashboard
echo.
pause
exit /b 0

:error
echo.
echo ========================================
echo   ERROR - Something went wrong
echo ========================================
echo.
echo Copy the error message above and send it
echo to Claude in the Cowork chat.
echo.
pause
exit /b 1
