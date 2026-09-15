# MEGACITY -> Steam uploader (self-diagnosing)
# Run with:   powershell -ExecutionPolicy Bypass -File .\upload-to-steam.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$log  = Join-Path $root "steam-log.txt"

Write-Host ""
Write-Host "=== MEGACITY -> Steam uploader ===" -ForegroundColor Cyan
Write-Host ""

# Robust unzip helper. Windows PowerShell's built-in Expand-Archive can fail on
# large folders, so we use .NET's extractor instead.
function Expand-ZipRobust([string]$ZipPath, [string]$Dest) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    if (Test-Path $Dest) { Remove-Item $Dest -Recurse -Force }
    [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $Dest)
}

# 1) Make sure the game files are unpacked (first run unpacks them)
$game = Join-Path $root "game"
if (-not (Test-Path (Join-Path $game "game.exe"))) {
    $inner = Join-Path $root "megacity-desktop-windows.zip"
    if (-not (Test-Path $inner)) {
        Write-Host "ERROR: game files not found (megacity-desktop-windows.zip is missing)." -ForegroundColor Red
        Write-Host "Re-extract the whole zip and run this script from inside that folder."
        Read-Host "Press Enter to close"; exit 1
    }
    Write-Host "Unpacking the game (first run only, this can take a minute)..." -ForegroundColor Yellow
    Expand-ZipRobust $inner $game

    # Steam requires the executable to be named game.exe: it must match your
    # Launch Option, and Valve's "Public Default Branch Includes 'game.exe'"
    # checklist item scans for exactly this name. The packaged build ships as
    # MEGACITY.exe, so rename it here. Electron locates its resources/ by folder,
    # not by the exe's name, so the game still launches normally.
    $oldExe = Join-Path $game "MEGACITY.exe"
    $newExe = Join-Path $game "game.exe"
    if (Test-Path $oldExe) {
        if (Test-Path $newExe) { Remove-Item $newExe -Force }
        Rename-Item -Path $oldExe -NewName "game.exe" -Force
        Write-Host "Renamed MEGACITY.exe -> game.exe" -ForegroundColor Yellow
    }
}

# 2) Download SteamCMD (Valve's uploader) if we don't have it yet
$steamcmdDir = Join-Path $root "steamcmd"
$steamcmdExe = Join-Path $steamcmdDir "steamcmd.exe"
if (-not (Test-Path $steamcmdExe)) {
    Write-Host "Downloading SteamCMD (Valve's uploader)..." -ForegroundColor Yellow
    $zip = Join-Path $root "steamcmd.zip"
    Invoke-WebRequest -Uri "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip" -OutFile $zip
    Expand-ZipRobust $zip $steamcmdDir
    Remove-Item $zip -Force
}

# 3) Write the SteamPipe build script (with absolute paths so it works anywhere)
$out = Join-Path $root "output"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$gameFwd = ($game -replace '\\','/')
$outFwd  = ($out  -replace '\\','/')
$desc = "MEGACITY - uploaded " + (Get-Date -Format 'yyyy-MM-dd HH:mm')
$vdf = @"
"AppBuild"
{
    "AppID" "4633600"
    "Desc" "$desc"
    "ContentRoot" "$gameFwd"
    "BuildOutput" "$outFwd"
    "Depots"
    {
        "4633601"
        {
            "FileMapping"
            {
                "LocalPath" "*"
                "DepotPath" "."
                "recursive" "1"
            }
            "FileExclusion" "*.pdb"
        }
    }
}
"@
$vdfPath = Join-Path $root "app_build_win.vdf"
Set-Content -Path $vdfPath -Value $vdf -Encoding ASCII

# 4) Warm up SteamCMD on its own. The very first time SteamCMD runs it updates
#    itself and exits with a non-zero code (the "code 7" you saw). Doing it here,
#    with no login and no upload, means that self-update can never be mistaken
#    for an upload failure.
Write-Host "Preparing SteamCMD (it may update itself the first time - this is normal)..." -ForegroundColor Yellow
& $steamcmdExe +quit | Out-Null
Write-Host ""

# 5) Sign in. This is the step that asks for your password and Steam Guard code,
#    so we keep it visible (not saved to a log). Once you sign in successfully,
#    SteamCMD remembers you for the upload step below.
$user = Read-Host "Enter your Steamworks (Steam) username"
Write-Host ""
Write-Host "Step 1 of 2: signing in to Steam..." -ForegroundColor Yellow
Write-Host "If asked, type your password (it stays hidden as you type) and your Steam Guard code." -ForegroundColor Yellow
Write-Host ""
& $steamcmdExe +login $user +quit
Write-Host ""

# 6) Upload. You are signed in now, so there is no prompt here and we can safely
#    save everything SteamCMD prints to steam-log.txt so the result is readable.
Write-Host "Step 2 of 2: uploading the build to Steam (App 4633600, depot 4633601)..." -ForegroundColor Yellow
Write-Host "This can take several minutes. Progress is shown below." -ForegroundColor Yellow
Write-Host ""
& $steamcmdExe +login $user +run_app_build "$vdfPath" +quit 2>&1 | Tee-Object -FilePath $log
$logText = ""
if (Test-Path $log) { $logText = Get-Content $log -Raw }

# 7) Plain-English result (based on what SteamCMD actually reported)
Write-Host ""
Write-Host "----------------------------------------------------" -ForegroundColor Cyan
if ($logText -match "Successfully finished AppID") {
    Write-Host "SUCCESS - the new build uploaded to Steam." -ForegroundColor Green
    Write-Host ""
    Write-Host "ONE LAST STEP, or players keep getting the old build:" -ForegroundColor Cyan
    Write-Host "  1. Go to  https://partner.steamgames.com  and open MEGACITY (App 4633600)."
    Write-Host "  2. Open  SteamPipe -> Builds."
    Write-Host "  3. Find the build you just uploaded (newest, at the top of the list)."
    Write-Host "  4. In its 'Set build live on branch' box choose  default,  then Publish."
    Write-Host "  5. Check  Installation -> General -> Launch Options  points to  game.exe."
    Write-Host ""
    Write-Host "Until you set it live on 'default', Steam keeps giving players the old build."
} elseif ($logText -match "Invalid Password" -or $logText -match "Login Failure" -or $logText -match "Two-factor" -or $logText -match "RateLimit") {
    Write-Host "PROBLEM: Steam did not accept your sign-in." -ForegroundColor Red
    Write-Host "Fix: run this script again and re-enter your password and Steam Guard code carefully."
    Write-Host "(If it says rate limit, wait a few minutes before trying again.)"
} elseif ($logText -match "No subscription" -or $logText -match "Access Denied" -or $logText -match "Permission") {
    Write-Host "PROBLEM: this account cannot upload to MEGACITY (App 4633600)." -ForegroundColor Red
    Write-Host "Fix: sign in with the Steamworks account that owns / publishes MEGACITY."
} elseif ($logText -match "Invalid Parameter" -or $logText -match "Failed to") {
    Write-Host "PROBLEM: Steam rejected the app or depot (Invalid Parameter)." -ForegroundColor Red
    Write-Host "Usually means depot 4633601 under App 4633600 is not set up yet,"
    Write-Host "or the signed-in account cannot publish to it."
    Write-Host "Check both at  https://partner.steamgames.com."
} else {
    Write-Host "The upload did NOT report success." -ForegroundColor Red
    Write-Host "The full log will open now - please send me the last 20 lines so I can read the reason."
}
Write-Host "----------------------------------------------------" -ForegroundColor Cyan
Write-Host ""
Write-Host "Full log saved to: $log" -ForegroundColor Gray

# Open the log in Notepad so it is easy to read and share
try { Start-Process notepad.exe $log } catch {}

Write-Host ""
Read-Host "Press Enter to close"
