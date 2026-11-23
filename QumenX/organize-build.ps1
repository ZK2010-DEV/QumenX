<#
.SYNOPSIS
  Organizes Windows artifacts produced by `tauri build` into the repository release tree.

.DESCRIPTION
  Run after a successful Tauri build (build-tauri.cmd calls this automatically).
  Copies MSI / NSIS installers, portable archives and the raw executable from
  CARGO_TARGET_DIR into releases/windows/... without renaming them, regenerates
  SHA256SUMS.txt, refreshes releases/latest/latest.json, and mirrors the
  frontend production build from QumenX/dist into builds/production.

  Missing artifact categories are warnings, not errors. No npm dependencies
  are required; this uses only PowerShell and Get-FileHash.

.PARAMETER TargetDir
  Cargo target directory. Defaults to $env:CARGO_TARGET_DIR, then the
  machine-specific space-free path used by build-tauri.cmd.

.PARAMETER Version
  Release version. Defaults to the version in QumenX/package.json.
#>
[CmdletBinding()]
param(
  [string]$TargetDir = $env:CARGO_TARGET_DIR,
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Info { param([string]$Message) Write-Host "[organize-build] $Message" }
function Write-Skip { param([string]$Message) Write-Warning "[organize-build] $Message" }

$appDir = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($appDir)) { $appDir = (Get-Location).Path }
$repoRoot = Split-Path -Parent $appDir

if ([string]::IsNullOrWhiteSpace($TargetDir)) {
  $TargetDir = 'C:\Users\Gamer\capcut-target'
}

if ([string]::IsNullOrWhiteSpace($Version)) {
  try {
    $pkg = Get-Content -LiteralPath (Join-Path $appDir 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $Version = [string]$pkg.version
  } catch {
    Write-Skip "Could not read package.json version; falling back to 1.0.0. $($_.Exception.Message)"
    $Version = '1.0.0'
  }
}

$productName = 'QumenX'
try {
  $tauriConf = Get-Content -LiteralPath (Join-Path $appDir 'src-tauri\tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($tauriConf.productName) { $productName = [string]$tauriConf.productName }
} catch {
  Write-Skip "Could not read productName from tauri.conf.json; using $productName."
}

$releaseDir = Join-Path $TargetDir 'release'
$bundleDir = Join-Path $releaseDir 'bundle'
$installersDir = Join-Path $repoRoot 'releases\windows\installers'
$portableDir = Join-Path $repoRoot 'releases\windows\portable'
$executablesDir = Join-Path $repoRoot 'releases\windows\executables'
$checksumsDir = Join-Path $repoRoot 'releases\windows\checksums'
$latestDir = Join-Path $repoRoot 'releases\latest'
$notesDir = Join-Path $repoRoot 'releases\release-notes'
$productionDir = Join-Path $repoRoot 'builds\production'

foreach ($dir in @($installersDir, $portableDir, $executablesDir, $checksumsDir, $latestDir, $notesDir, $productionDir)) {
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}

# Pick freshest artifacts, preferring filenames that carry this release version.
function Get-FreshArtifacts {
  param(
    [string]$Path,
    [string[]]$Extensions,
    [string]$WantedVersion,
    [string[]]$NameHints,
    [switch]$Recurse
  )

  if (-not (Test-Path -LiteralPath $Path)) { return @() }
  $found = @(Get-ChildItem -LiteralPath $Path -File -Recurse:$Recurse -ErrorAction SilentlyContinue |
    Where-Object { $Extensions -contains $_.Extension.ToLowerInvariant() })
  if ($found.Count -eq 0) { return @() }

  if (-not [string]::IsNullOrWhiteSpace($WantedVersion)) {
    $versioned = @($found | Where-Object { $_.Name -like "*$WantedVersion*" })
    if ($versioned.Count -gt 0) { $found = $versioned }
  }

  if ($NameHints -and $NameHints.Count -gt 0) {
    $hinted = @($found | Where-Object {
      $lower = $_.Name.ToLowerInvariant()
      @($NameHints | Where-Object { $lower -like "*$($_.ToLowerInvariant())*" }).Count -gt 0
    })
    if ($hinted.Count -gt 0) { $found = $hinted }
  }

  return @($found | Sort-Object LastWriteTime -Descending | Select-Object -First 4)
}

function Copy-ArtifactSet {
  param([object[]]$Files, [string]$Destination)
  $copied = @()
  foreach ($file in $Files) {
    $target = Join-Path $Destination $file.Name
    try {
      Copy-Item -LiteralPath $file.FullName -Destination $target -Force -ErrorAction Stop
      $copied += Get-Item -LiteralPath $target -ErrorAction Stop
    } catch {
      Write-Skip "Could not copy '$($file.Name)': $($_.Exception.Message)"
    }
  }
  return $copied
}

Write-Info "Version: $Version | Cargo target: $TargetDir"

if (-not (Test-Path -LiteralPath $releaseDir)) {
  Write-Skip "Cargo release directory not found: $releaseDir (keeping already organized artifacts)."
}

$msiFiles = @(Get-FreshArtifacts -Path (Join-Path $bundleDir 'msi') -Extensions @('.msi') -WantedVersion $Version)
$nsisFiles = @(Get-FreshArtifacts -Path (Join-Path $bundleDir 'nsis') -Extensions @('.exe') -WantedVersion $Version)
$portableFiles = @(Get-FreshArtifacts -Path $bundleDir -Extensions @('.zip', '.7z') -WantedVersion $Version -Recurse)
$exeNameHint = @($productName.ToLowerInvariant(), 'qumenx')
$exeFiles = @(Get-FreshArtifacts -Path $releaseDir -Extensions @('.exe') -WantedVersion '' -NameHints $exeNameHint)

$copied = @()
$copied += @(Copy-ArtifactSet -Files $msiFiles -Destination $installersDir)
$copied += @(Copy-ArtifactSet -Files $nsisFiles -Destination $installersDir)
$copied += @(Copy-ArtifactSet -Files $portableFiles -Destination $portableDir)
$copied += @(Copy-ArtifactSet -Files $exeFiles -Destination $executablesDir)

foreach ($category in @(
  @{ Name = 'MSI installers'; Count = $msiFiles.Count },
  @{ Name = 'NSIS installers'; Count = $nsisFiles.Count },
  @{ Name = 'portable archives'; Count = $portableFiles.Count },
  @{ Name = 'raw executables'; Count = $exeFiles.Count }
)) {
  if ($category.Count -eq 0) { Write-Skip "No $($category.Name) found in $TargetDir; skipping." }
}
Write-Info "Copied $($copied.Count) artifact(s) into releases/windows."

# Rebuild checksums from everything currently organized under releases/windows.
$binaryFiles = @()
foreach ($dir in @($installersDir, $portableDir, $executablesDir)) {
  $binaryFiles += @(Get-ChildItem -LiteralPath $dir -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne '.gitkeep' })
}
$binaryFiles = @($binaryFiles | Sort-Object FullName)

$checksumLines = @(
  "# QumenX $Version - SHA256 checksums",
  '# Format: <sha256>  <path relative to repository root>',
  ''
)
$artifacts = @()
foreach ($file in $binaryFiles) {
  $relative = $file.FullName.Substring($repoRoot.Length + 1).Replace('\', '/')
  $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $checksumLines += "$hash  $relative"

  $parentName = (Split-Path -Parent $file.FullName | Split-Path -Leaf).ToLowerInvariant()
  $kind = switch ($parentName) {
    'installers' { if ($file.Extension -eq '.msi') { 'msi' } else { 'nsis' } }
    'portable' { 'portable' }
    default { 'executable' }
  }
  $artifacts += [ordered]@{
    kind = $kind
    name = $file.Name
    path = $relative
    sha256 = $hash
    bytes = $file.Length
  }
}
$checksumPath = Join-Path $checksumsDir 'SHA256SUMS.txt'
[IO.File]::WriteAllText($checksumPath, (($checksumLines -join "`r`n") + "`r`n"), $utf8NoBom)
Write-Info "Wrote $checksumPath ($($artifacts.Count) artifact(s))."

$released = Get-Date -Format 'yyyy-MM-dd'
$latestPath = Join-Path $latestDir 'latest.json'
if (Test-Path -LiteralPath $latestPath) {
  try {
    $old = Get-Content -LiteralPath $latestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($old.version -eq $Version -and $old.released) { $released = [string]$old.released }
  } catch {
    Write-Skip "Existing latest.json could not be parsed; regenerating it."
  }
}

$notesRelative = "releases/release-notes/v$Version.md"
$notesPath = Join-Path $repoRoot ($notesRelative -replace '/', '\')
if (-not (Test-Path -LiteralPath $notesPath)) {
  $starter = @(
    "# QumenX v$Version",
    '',
    'Release notes for this build. See documentation/verification-report.md for verification details.',
    '',
    '## Artifacts',
    ''
  )
  foreach ($artifact in $artifacts) { $starter += "- $($artifact.name) ($($artifact.kind))" }
  [IO.File]::WriteAllText($notesPath, (($starter -join "`r`n") + "`r`n"), $utf8NoBom)
  Write-Info "Created starter release notes: $notesRelative"
}

$manifest = [ordered]@{
  product = $productName
  version = $Version
  released = $released
  platform = 'windows-x86_64'
  checksums = 'releases/windows/checksums/SHA256SUMS.txt'
  releaseNotes = $notesRelative
  artifacts = @($artifacts)
}
[IO.File]::WriteAllText($latestPath, ((($manifest | ConvertTo-Json -Depth 6)) + "`r`n"), $utf8NoBom)
Write-Info 'Updated releases/latest/latest.json.'

# Mirror the frontend production build (dist) into builds/production.
# dist never contains node_modules, but exclude it explicitly for safety.
$distDir = Join-Path $appDir 'dist'
if (-not (Test-Path -LiteralPath $distDir)) {
  Write-Skip "Frontend dist directory not found: $distDir (skipping web assets copy)."
} else {
  try {
    $placeholderPath = Join-Path $productionDir '.gitkeep'
    if (-not (Test-Path -LiteralPath $placeholderPath)) {
      [IO.File]::WriteAllText($placeholderPath, '', $utf8NoBom)
    }
    Get-ChildItem -LiteralPath $productionDir -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -ne '.gitkeep' } |
      Remove-Item -Recurse -Force -ErrorAction Stop
    $distItems = @(Get-ChildItem -LiteralPath $distDir -Force |
      Where-Object { $_.Name -ne 'node_modules' })
    foreach ($item in $distItems) {
      Copy-Item -LiteralPath $item.FullName -Destination $productionDir -Recurse -Force -ErrorAction Stop
    }
    Write-Info "Copied $($distItems.Count) production web asset(s) into builds/production."
  } catch {
    Write-Skip "Could not refresh builds/production: $($_.Exception.Message)"
  }
}

Write-Info 'Organization complete.'
exit 0
