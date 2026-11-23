$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = 'C:\Users\Gamer\capcut-target'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$root = 'D:\OpenCode Projects\AppDevelopment\QumenX'

Write-Output 'Starting Vite...'
$v = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c node_modules\.bin\vite.cmd --host 127.0.0.1' -WorkingDirectory $root -PassThru -WindowStyle Hidden
for ($i = 0; $i -lt 60; $i++) {
  if (netstat -ano | Select-String ':5173\s+.*LISTENING') { break }
  Start-Sleep -Milliseconds 500
}

Write-Output 'Starting app...'
$app = Start-Process -FilePath 'C:\Users\Gamer\capcut-target\debug\qumenx.exe' -WorkingDirectory $root -PassThru
Write-Output "App PID: $($app.Id)"

Write-Output 'Running CDP E2E tests...'
& node cdp-e2e.mjs
Write-Output "E2E exit: $LASTEXITCODE"

Write-Output 'Cleaning up...'
if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
if (-not $v.HasExited) { Stop-Process -Id $v.Id -Force }
