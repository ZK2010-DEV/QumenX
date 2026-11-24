$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = 'C:\Users\Gamer\capcut-target'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$root = 'D:\OpenCode Projects\AppDevelopment\QumenX'

Write-Output 'Starting Vite...'
$viteOut = Join-Path $root 'e2e-vite-stdout.log'
$viteErr = Join-Path $root 'e2e-vite-stderr.log'
$v = Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules\vite\bin\vite.js --host 127.0.0.1' -WorkingDirectory $root -PassThru -WindowStyle Hidden -RedirectStandardOutput $viteOut -RedirectStandardError $viteErr
for ($i = 0; $i -lt 60; $i++) {
  if (netstat -ano | Select-String ':5173\s+.*LISTENING') { break }
  Start-Sleep -Milliseconds 500
}
# Give Vite a moment to finish module graph warm-up before WebView2 loads it.
Start-Sleep -Seconds 3

Write-Output 'Starting QumenX...'
$app = Start-Process -FilePath 'C:\Users\Gamer\capcut-target\debug\qumenx.exe' -WorkingDirectory $root -PassThru -RedirectStandardError (Join-Path $root 'app-stderr.log') -RedirectStandardOutput (Join-Path $root 'app-stdout.log')
Write-Output "App PID: $($app.Id)"

Write-Output 'Running QumenX E2E suite...'
& node cdp-qmenx-e2e.mjs
$code = $LASTEXITCODE
Write-Output "E2E exit: $code"

Write-Output 'Cleaning up...'
if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
if (-not $v.HasExited) { Stop-Process -Id $v.Id -Force }
exit $code
