$ErrorActionPreference = "Stop"

$steamDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $steamDir
$e2ePath = Join-Path $projectDir "e2e\productionChainsLegacy.e2e.mjs"
$releaseExecutable = Join-Path $steamDir "dist\win-unpacked\game.exe"
$logPath = Join-Path $steamDir "packaged-production-chains-legacy.log"

# Create the artifact before validation so runner or packaging failures still
# leave a useful log for the release workflow to upload.
New-Item -ItemType File -Path $logPath -Force | Out-Null

$env:MEGACITY_RUN_PACKAGED_PRODUCTION_CHAINS_LEGACY = "1"
$env:MEGACITY_RELEASE_EXECUTABLE = $releaseExecutable

try {
  if (-not [Environment]::Is64BitOperatingSystem) {
    throw "The packaged legacy production check requires a Windows x64 release runner."
  }
  if (-not (Test-Path -LiteralPath $releaseExecutable -PathType Leaf)) {
    throw "The x64 release executable was not produced at $releaseExecutable."
  }

  Write-Host "Running packaged legacy production smoke test against $releaseExecutable"
  Write-Host "Recording smoke output in $logPath"
  & node $e2ePath 2>&1 | Tee-Object -FilePath $logPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Packaged legacy production smoke test failed with exit code $exitCode. See $logPath."
  }
}
catch {
  $_ | Out-String | Tee-Object -FilePath $logPath -Append | Out-Host
  throw
}
finally {
  Remove-Item Env:MEGACITY_RUN_PACKAGED_PRODUCTION_CHAINS_LEGACY -ErrorAction SilentlyContinue
  Remove-Item Env:MEGACITY_RELEASE_EXECUTABLE -ErrorAction SilentlyContinue
}