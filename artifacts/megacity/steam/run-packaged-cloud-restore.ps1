$ErrorActionPreference = "Stop"

$steamDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $steamDir
$e2ePath = Join-Path $projectDir "e2e\packagedCloudRestore.e2e.mjs"
$releaseExecutable = Join-Path $steamDir "dist\win-unpacked\game.exe"
$logPath = Join-Path $steamDir "packaged-cloud-restore.log"

if (-not [Environment]::Is64BitOperatingSystem) {
  throw "The packaged Steam Cloud check requires a Windows x64 release runner."
}
if (-not (Test-Path -LiteralPath $releaseExecutable -PathType Leaf)) {
  throw "The x64 release executable was not produced at $releaseExecutable."
}

$env:MEGACITY_RUN_PACKAGED_CLOUD_RESTORE = "1"
$env:MEGACITY_RELEASE_EXECUTABLE = $releaseExecutable
$env:MEGACITY_E2E_REQUIRE_STEAMWORKS = "1"

try {
  Write-Host "Running packaged Steam Cloud restore against $releaseExecutable"
  Write-Host "Recording smoke output in $logPath"
  & node $e2ePath 2>&1 | Tee-Object -FilePath $logPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Packaged Steam Cloud restore failed with exit code $exitCode. See $logPath."
  }
}
finally {
  Remove-Item Env:MEGACITY_RUN_PACKAGED_CLOUD_RESTORE -ErrorAction SilentlyContinue
  Remove-Item Env:MEGACITY_RELEASE_EXECUTABLE -ErrorAction SilentlyContinue
  Remove-Item Env:MEGACITY_E2E_REQUIRE_STEAMWORKS -ErrorAction SilentlyContinue
}