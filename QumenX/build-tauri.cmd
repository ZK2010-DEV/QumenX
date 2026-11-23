@echo off
setlocal
set "RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu"
set "CARGO_TARGET_DIR=C:\Users\Gamer\capcut-target"
set "PATH=C:\Users\Gamer\AppData\Local\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.MCF.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin;C:\Users\Gamer\.cargo\bin;%PATH%"
cd /d "%~dp0"

rem Tauri computes its bundle path from src-tauri\target\release, while Cargo
rem uses the no-space CARGO_TARGET_DIR above. Link the two so the bundler can
rem find the GNU-built binary without moving generated files into the repo.
set "RELEASE_LINK=%~dp0src-tauri\target\release"
if not exist "%~dp0src-tauri\target" mkdir "%~dp0src-tauri\target"
if exist "%RELEASE_LINK%" (
  fsutil reparsepoint query "%RELEASE_LINK%" >nul 2>&1
  if errorlevel 1 (
    rmdir /s /q "%RELEASE_LINK%"
  ) else (
    rmdir "%RELEASE_LINK%"
  )
)
mklink /J "%RELEASE_LINK%" "%CARGO_TARGET_DIR%\release" >nul

call node_modules\.bin\tauri.cmd build --runner "%~dp0src-tauri\cargo-gnu.cmd" %*
set "BUILD_EXIT=%ERRORLEVEL%"

if not "%BUILD_EXIT%"=="0" (
  echo [build-tauri] Tauri build failed with exit code %BUILD_EXIT%; skipping artifact organization.
  endlocal & exit /b %BUILD_EXIT%
)

echo [build-tauri] Build succeeded; organizing Windows artifacts...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0organize-build.ps1" -TargetDir "%CARGO_TARGET_DIR%"
set "ORG_EXIT=%ERRORLEVEL%"
if not "%ORG_EXIT%"=="0" (
  echo [build-tauri] Artifact organizer exited with code %ORG_EXIT% ^(build itself succeeded^).
)

endlocal & exit /b %BUILD_EXIT%
