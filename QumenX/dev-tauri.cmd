@echo off
set "RUSTUP_TOOLCHAIN=stable-x86_64-pc-windows-gnu"
set "CARGO_TARGET_DIR=C:\Users\Gamer\capcut-target"
set "PATH=C:\Users\Gamer\AppData\Local\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.MCF.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin;C:\Users\Gamer\.cargo\bin;%PATH%"
cd /d "%~dp0"
node_modules\.bin\tauri.cmd dev %*
