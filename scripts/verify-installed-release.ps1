param(
  [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Version)) {
  $Version = node -p "require('./package.json').version"
}

$setup = Resolve-Path "dist/FLYXORA-Setup-$Version.exe"
Get-Process FLYXORA -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$install = Start-Process -FilePath $setup -ArgumentList '/S' -PassThru -Wait
if ($install.ExitCode -ne 0) {
  throw "FLYXORA setup failed with exit code $($install.ExitCode)."
}
Start-Sleep -Seconds 3

$exe = Join-Path $env:LOCALAPPDATA 'Programs\FLYXORA\FLYXORA.exe'
if (!(Test-Path $exe)) {
  $candidate = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Filter 'FLYXORA.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
  if (!$candidate) {
    throw 'Installed FLYXORA.exe was not found below LocalAppData\Programs.'
  }
  $exe = $candidate.FullName
}
Write-Host "Installed executable: $exe"

$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$desktopLink = Join-Path $desktop 'FLYXORA.lnk'
$startLink = Join-Path $programs 'FLYXORA.lnk'
if (!(Test-Path $desktopLink)) { throw "Desktop shortcut missing: $desktopLink" }
if (!(Test-Path $startLink)) { throw "Start Menu shortcut missing: $startLink" }

$shell = New-Object -ComObject WScript.Shell
$desktopTarget = $shell.CreateShortcut($desktopLink).TargetPath
$startTarget = $shell.CreateShortcut($startLink).TargetPath
if (!(Test-Path $desktopTarget)) { throw "Desktop shortcut target missing: $desktopTarget" }
if (!(Test-Path $startTarget)) { throw "Start Menu shortcut target missing: $startTarget" }
if ((Split-Path $desktopTarget -Leaf) -ne 'FLYXORA.exe') { throw "Desktop shortcut target is not FLYXORA.exe: $desktopTarget" }
if ((Split-Path $startTarget -Leaf) -ne 'FLYXORA.exe') { throw "Start Menu shortcut target is not FLYXORA.exe: $startTarget" }
Write-Host 'Installed desktop and Start Menu shortcuts are valid.'

$debugPort = 9444
$process = Start-Process -FilePath $exe -ArgumentList @('--demo', "--remote-debugging-port=$debugPort") -PassThru
try {
  Start-Sleep -Seconds 5
  $process.Refresh()
  if ($process.HasExited) {
    throw "Installed FLYXORA exited during startup with code $($process.ExitCode)."
  }
  node scripts/verify-packaged-renderer.mjs $debugPort
  if ($LASTEXITCODE -ne 0) {
    throw 'Installed FLYXORA renderer health check failed.'
  }
  Write-Host 'Installed FLYXORA process + renderer smoke test passed.'
} finally {
  Get-Process FLYXORA -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
