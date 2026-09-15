MEGACITY - Upload to Steam (Windows)
====================================

This uploads the current MEGACITY Windows build to Steam (App ID 4633600).

WHAT YOU NEED FIRST
- A Steamworks account that owns MEGACITY and can upload/publish builds.
- Your Steam username + password, and your phone for the Steam Guard code.

STEPS
1. Right-click this zip -> "Extract All...".
2. Open the extracted folder until you can see:
      START-UPLOAD.cmd
      upload-to-steam.ps1
      megacity-desktop-windows.zip
3. Double-click START-UPLOAD.cmd.
   You do not need to open a browser, search for PowerShell, or type a command.
4. The uploader will ask for your Steamworks username, password, and Steam Guard
   code when needed.

It runs in three short parts:
     - Preparing SteamCMD  (the first time, it updates itself - this is normal
       and is NOT an error, even though older versions looked like one).
     - Step 1 of 2: sign in - type your username, then your password and Steam
       Guard code if asked.
     - Step 2 of 2: upload - this can take several minutes; progress is shown.
At the end it prints a plain-English result and opens steam-log.txt (the full
   record) in Notepad. If anything went wrong, send me the last 20 lines of that
   file and I can tell you exactly why.

AFTER A SUCCESSFUL UPLOAD (this part is required, or nothing changes for players)
- Go to  https://partner.steamgames.com  -> MEGACITY (App 4633600)
- Open  SteamPipe -> Builds. Find the build you just uploaded (newest, at top).
- In "Set build live on branch" choose  default,  then Publish.
- In  Installation -> General -> Launch Options, make sure the Executable is
  game.exe.
- Uploading alone does NOT change what players (or you) download. Until you set
  the new build live on "default", Steam keeps handing out the old build.

WHAT'S IN THIS BUILD
- This is the latest game: the filled-out top navigation bar, the World Map
  legibility/zoom fixes, controller and keyboard tab shortcuts, and the ecology
  and balance fixes. Your currently installed Steam copy (June 28) has none of
  these yet - they arrive when this build is uploaded and set live.

NOTES
- The script downloads Valve's uploader (SteamCMD) automatically the first time,
  and unpacks the game automatically. You don't install anything by hand.
- steam-log.txt is safe to delete; it's just the record of the last run.
- If double-clicking is unavailable, the fallback command is:
      powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\upload-to-steam.ps1
