$ErrorActionPreference = "Stop"

$steamDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $steamDir
$e2ePath = Join-Path $projectDir "e2e\packagedRailModulesReload.e2e.mjs"
$releaseExecutable = Join-Path $steamDir "dist\win-unpacked\game.exe"
$logPath = Join-Path $steamDir "packaged-rail-modules.log"
$evidencePath = Join-Path $steamDir "packaged-rail-modules-evidence.json"
$startedAt = (Get-Date).ToUniversalTime().ToString("o")
$passed = $false
$failureMessage = $null

# Never let an evidence file from an earlier checkout make a skipped or failed
# Windows run look current.
Remove-Item -LiteralPath $evidencePath -Force -ErrorAction SilentlyContinue

New-Item -ItemType File -Path $logPath -Force | Out-Null
$env:MEGACITY_REQUIRE_PACKAGED_RAIL_MODULES = "1"
$env:MEGACITY_RELEASE_EXECUTABLE = $releaseExecutable

try {
  if (-not [Environment]::Is64BitOperatingSystem) {
    throw "The packaged rail-module check requires a Windows x64 release runner."
  }
  if (-not (Test-Path -LiteralPath $releaseExecutable -PathType Leaf)) {
    throw "The x64 release executable was not produced at $releaseExecutable."
  }

  Write-Host "Running packaged rail-module save/reload smoke test against $releaseExecutable"
  Write-Host "Recording smoke output in $logPath"
  & node $e2ePath 2>&1 | Tee-Object -FilePath $logPath
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Packaged rail-module smoke test failed with exit code $exitCode. See $logPath."
  }
  $passed = $true
}
catch {
  $failureMessage = ($_ | Out-String).Trim()
  $_ | Out-String | Tee-Object -FilePath $logPath -Append | Out-Host
  throw
}
finally {
  Remove-Item Env:MEGACITY_REQUIRE_PACKAGED_RAIL_MODULES -ErrorAction SilentlyContinue
  Remove-Item Env:MEGACITY_RELEASE_EXECUTABLE -ErrorAction SilentlyContinue

  $logText = if (Test-Path -LiteralPath $logPath -PathType Leaf) {
    Get-Content -LiteralPath $logPath -Raw
  } else {
    ""
  }
  $testedCommit = $env:GITHUB_SHA
  if ([string]::IsNullOrWhiteSpace($testedCommit)) {
    $testedCommit = (& git -C $projectDir rev-parse HEAD 2>$null | Out-String).Trim()
  }
  $evidence = [ordered]@{
    schemaVersion = 1
    test = "packaged-rail-modules"
    status = if ($passed) { "passed" } else { "failed" }
    runnerResult = if ($passed) { "passed" } else { "failed" }
    testedCommit = $testedCommit
    runner = [ordered]@{
      os = "windows"
      architecture = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
      nodeVersion = (& node --version 2>$null | Out-String).Trim()
    }
    normalSteamSavesUntouched = $logText -match "normal Steam save/profile keys unchanged"
    temporaryProfileRemoved = $logText -match "temporary profile removed:"
    logCaptured = -not [string]::IsNullOrWhiteSpace($logText)
    releaseExecutable = $releaseExecutable
    startedAt = $startedAt
    completedAt = (Get-Date).ToUniversalTime().ToString("o")
    failure = $failureMessage
  }
  $evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath -Encoding utf8
  Write-Host "Packaged rail-module evidence written to $evidencePath"
}