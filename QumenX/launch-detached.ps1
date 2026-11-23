$ErrorActionPreference = 'Stop'
$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = 'C:\Users\Gamer\capcut-target'
$env:PATH = 'C:\Users\Gamer\AppData\Local\Microsoft\WinGet\Packages\BrechtSanders.WinLibs.MCF.UCRT_Microsoft.Winget.Source_8wekyb3d8bbwe\mingw64\bin;C:\Users\Gamer\.cargo\bin;' + $env:PATH
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'

$root = $PSScriptRoot

# Start Vite dev server detached if not already listening
$listening = netstat -ano | Select-String ':5173\s+.*LISTENING'
if (-not $listening) {
  Write-Output 'Starting Vite...'
  $vite = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c node_modules\.bin\vite.cmd --host 127.0.0.1' -WorkingDirectory $root -PassThru -WindowStyle Hidden
  Write-Output "Vite PID: $($vite.Id)"
} else {
  Write-Output "Vite already listening: $listening"
}

# Wait for port 5173
for ($i = 0; $i -lt 60; $i++) {
  if (netstat -ano | Select-String ':5173\s+.*LISTENING') { break }
  Start-Sleep -Milliseconds 500
}

# Start the built app detached
$exe = 'C:\Users\Gamer\capcut-target\debug\qumenx.exe'
$app = Start-Process -FilePath $exe -WorkingDirectory $root -PassThru
Write-Output "App PID: $($app.Id)"
Start-Sleep -Seconds 3
$app.Refresh()
Write-Output "App hasExited: $($app.HasExited)  MainWindowTitle: $($app.MainWindowTitle)  Handle: $($app.MainWindowHandle)"
