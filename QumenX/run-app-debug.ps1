$env:RUSTUP_TOOLCHAIN = 'stable-x86_64-pc-windows-gnu'
$env:CARGO_TARGET_DIR = 'C:\Users\Gamer\capcut-target'
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$root = 'D:\OpenCode Projects\AppDevelopment\QumenX'

$listening = netstat -ano | Select-String ':5173\s+.*LISTENING'
if (-not $listening) {
  Write-Output 'Starting Vite...'
  $v = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c node_modules\.bin\vite.cmd --host 127.0.0.1' -WorkingDirectory $root -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 10
}

Write-Output 'Starting app in foreground...'
& 'C:\Users\Gamer\capcut-target\debug\qumenx.exe'
Write-Output "APP EXIT CODE: $LASTEXITCODE"
