$ErrorActionPreference = "Stop"

$steamDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $steamDir
$e2ePath = Join-Path $projectDir "e2e\desktopProfileTmpCleanup.e2e.mjs"
$releaseExecutable = Join-Path $steamDir "dist\win-unpacked\game.exe"
$logPath = Join-Path $steamDir "packaged-profile-tmp-cleanup.log"

if (-not [Environment]::Is64BitOperatingSystem) {
  throw "The packaged profile cleanup check requires a Windows x64 release runner."
}
if (-not (Test-Path -LiteralPath $releaseExecutable -PathType Leaf)) {
  throw "The x64 release executable was not produced at $releaseExecutable."
}

$env:MEGACITY_RUN_PACKAGED_PROFILE_TMP_CLEANUP = "1"
$env:MEGACITY_RELEASE_EXECUTABLE = $releaseExecutable

try {
  Write-Host "Running packaged profile-slot cleanup against $releaseExecutable"
  Write-Host "Recording smoke output in $logPath"
  & node $e2ePath 2>&1 | Tee-Object -FilePath $logPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Packaged profile-slot cleanup failed with exit code $exitCode. See $logPath."
  }
}
finally {
  Remove-Item Env:MEGACITY_RUN_PACKAGED_PROFILE_TMP_CLEANUP -ErrorAction SilentlyContinue
  Remove-Item Env:MEGACITY_RELEASE_EXECUTABLE -ErrorAction SilentlyContinue
}