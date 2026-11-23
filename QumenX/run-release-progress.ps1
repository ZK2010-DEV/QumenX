$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9222'
$root = 'D:\OpenCode Projects\AppDevelopment\QumenX'
$exe = 'C:\Users\Gamer\capcut-target\release\qumenx.exe'
Write-Output "Starting RELEASE app: $exe"
$app = Start-Process -FilePath $exe -WorkingDirectory $root -PassThru
Write-Output "App PID: $($app.Id)"
Start-Sleep -Seconds 3
& node cdp-progress.mjs
Write-Output "Release progress test exit: $LASTEXITCODE"
if (-not $app.HasExited) { Stop-Process -Id $app.Id -Force }
