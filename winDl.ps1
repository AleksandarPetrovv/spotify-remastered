function Get-SpicetifyConfigDir {
    if ($env:SPICETIFY_CONFIG -and (Test-Path $env:SPICETIFY_CONFIG)) { return $env:SPICETIFY_CONFIG }
    try {
        $p = (& spicetify path userdata 2>$null | Select-Object -Last 1)
        if ($p) { $p = $p.Trim() }
        if ($p -and (Test-Path $p)) { return $p }
    } catch { }
    $candidates = @( (Join-Path $env:APPDATA 'spicetify'), (Join-Path $env:LOCALAPPDATA 'spicetify') )
    foreach ($c in $candidates) { if (Test-Path (Join-Path $c 'config-xpui.ini')) { return $c } }
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    throw "Could not locate Spicetify config directory."
}

Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue
$killJob = Start-Job -ScriptBlock { while ($true) { Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 } }

try {

$tempZip = "$env:TEMP\spotify-remastered.zip"
$tempExtract = "$env:TEMP\spotify-remastered"

$latestRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/AleksandarPetrovv/spotify-remastered/releases/latest"
Invoke-WebRequest -Uri $latestRelease.zipball_url -OutFile $tempZip

if (-not (Test-Path $tempZip)) { throw "Download failed." }
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue }
Expand-Archive $tempZip -DestinationPath $tempExtract -Force
$inner = (Get-ChildItem -Path $tempExtract -Directory)[0].FullName
Rename-Item -Path $inner -NewName "repository"
$repo = Join-Path $tempExtract "repository"
if (-not (Test-Path $repo)) { throw "Extracted repo folder not found at $repo." }

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    $spiceInstaller = "$env:TEMP\spicetify-install.ps1"
    Invoke-WebRequest "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" -OutFile $spiceInstaller
    $content = Get-Content $spiceInstaller -Raw
    $content = $content -replace '(?s)#region Marketplace.*?#endregion Marketplace', ''
    $content | Set-Content $spiceInstaller -Encoding UTF8
    powershell -ExecutionPolicy Bypass -File $spiceInstaller
    Start-Sleep 2
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $spicetifyExistedBefore = $false
} else {
    $spicetifyExistedBefore = $true
}

spicetify | Out-Null
$cfg = Get-SpicetifyConfigDir
$themesDir = Join-Path $cfg "Themes"
$appsDir = Join-Path $cfg "CustomApps"
if (-not (Test-Path $themesDir)) { New-Item -ItemType Directory -Path $themesDir | Out-Null }
if (-not (Test-Path $appsDir)) { New-Item -ItemType Directory -Path $appsDir | Out-Null }
$hazyDest = Join-Path $themesDir "Hazy"
$lpDest = Join-Path $appsDir "lyrics-plus"

Remove-Item -Recurse -Force $hazyDest -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $repo "hazy") $hazyDest
Remove-Item -Recurse -Force $lpDest -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $repo "lyrics-plus") $lpDest

$extensionsDir = Join-Path $cfg "Extensions"
if (-not (Test-Path $extensionsDir)) { New-Item -ItemType Directory -Path $extensionsDir | Out-Null }
Copy-Item (Join-Path $repo "hazy\extensions\download.js") (Join-Path $extensionsDir "download.js") -Force
Copy-Item (Join-Path $repo 'hazy\extensions\link-import.js') (Join-Path $extensionsDir 'link-import.js') -Force

$prevTheme = (spicetify config current_theme 2>$null)
if ($prevTheme) { $prevTheme = $prevTheme.Trim() }
$customDir = Join-Path $env:LOCALAPPDATA "spotify-remastered"
if (-not (Test-Path $customDir)) { New-Item -ItemType Directory -Path $customDir | Out-Null }
foreach ($folder in @('dependencies', 'scripts', 'data', 'cache')) { New-Item -ItemType Directory -Force -Path (Join-Path $customDir $folder) | Out-Null }
$prevThemeFile = Join-Path $customDir "data\prev-theme.txt"
if ($prevTheme -and $prevTheme -ne "Hazy" -and -not (Test-Path $prevThemeFile)) { Set-Content $prevThemeFile -Value $prevTheme -Encoding UTF8 }

@"
spicetify-existed-before=$spicetifyExistedBefore

this file tells the uninstall script whether spicetify was already on your pc before you installed spotify remastered.
if the value above is false, the uninstall script will fully remove spicetify from your system.
if the value above is true, the uninstall script will only remove the hazy theme and lyrics-plus custom app, keeping your spicetify installation intact.
"@ | Set-Content (Join-Path $customDir "data\spicetify-status.txt") -Encoding UTF8

@"
this folder is used by spotify remastered. please do not delete it or its required files while spotify remastered is installed.

here is what each file and folder does (optional items may not be present):

- dependencies: download tools and their runtime dependencies.
- scripts: background helpers and their launchers.
- data: installer records needed to restore your previous setup.
- cache: temporary download jobs, troubleshooting logs and saved-file indexes.
- dependencies/spotdl.exe: standalone song downloader used when the python downloader is unavailable.
- dependencies/ffmpeg.exe: converts audio to mp3. an existing compatible copy is reused; a download is needed only when none is available.
- dependencies/downloader: optional python runtime and download dependencies, including the working alternate-upload fallback. keep this folder when present.
- scripts/download-helper.ps1: background download listener on port 27382; handles songs, playlists and albums, progress, cancellation and destination folders.
- scripts/download-helper.vbs: launches the download helper without opening a terminal. a startup-folder copy launches it when you sign in.
- scripts/download-runner.py: adds alternate-upload fallback to the python song downloader.
- scripts/local-catalogue.ps1: reuses unchanged local-song metadata and reads new files in the background.
- scripts/repair-spicetify.ps1: preserves the scrolling compatibility fix when spicetify is applied or updated.
- scripts/link-helper.ps1: downloads youtube/soundcloud audio into local songs, tracks import jobs and reports source errors.
- scripts/setup-link-tools.ps1: finds compatible installed download tools and only downloads missing tools into dependencies.
- dependencies/yt-dlp.exe: optional managed link downloader. an existing compatible yt-dlp installation is used instead when available.
- dependencies/deno.exe: optional javascript runtime for youtube extraction, installed only when no compatible deno or node installation is available.
- data/download-tools.json: records the downloader and javascript runtime selected on this computer.
- data/import-index: links imported source urls to their saved mp3 files and metadata, so the same link can reuse its download. keep this folder.
- cache/import-logs: temporary link import jobs and troubleshooting logs, limited to 20 inactive jobs and 7 days. these are not your saved songs.
- scripts/spotify-remastered-updater.ps1: reapplies spicetify after spotify updates.
- scripts/spotify-remastered-updater.vbs: launches the updater without opening a terminal; also has a startup-folder copy.
- data/spicetify-status.txt: records whether spicetify was installed before spotify remastered, so uninstall can preserve an existing installation.
- data/prev-theme.txt: optional record of your previous theme for restoration during uninstall.
- cache/download-logs: temporary jobs and error logs, limited to 20 inactive jobs and 7 days. its playlist-index subfolder records saved songs for repeat-download skipping; keep that index.
- local songs: local mp3 storage for link imports, when available. playlist entries reference these files; moving or deleting songs can break playback.
- about-this-folder.txt: this file.
"@ | Set-Content (Join-Path $customDir "about-this-folder.txt") -Encoding UTF8

$spotdlRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/spotDL/spotify-downloader/releases/latest"
$spotdlAsset = $spotdlRelease.assets | Where-Object { $_.name -like "*win32*" } | Select-Object -First 1
if ($spotdlAsset) {
    Invoke-WebRequest -Uri $spotdlAsset.browser_download_url -OutFile (Join-Path $customDir "dependencies\spotdl.exe")
}

Copy-Item (Join-Path $repo "hazy\extensions\download-helper.ps1") (Join-Path $customDir "scripts\download-helper.ps1") -Force
Copy-Item (Join-Path $repo "hazy\extensions\download-runner.py") (Join-Path $customDir "scripts\download-runner.py") -Force
. (Join-Path $customDir 'scripts\download-helper.ps1') -NoListen
Get-Downloader | Out-Null
foreach ($file in @('link-helper.ps1','setup-link-tools.ps1','local-catalogue.ps1','repair-spicetify.ps1')) { Copy-Item (Join-Path $repo "hazy\extensions\$file") (Join-Path $customDir "scripts\$file") -Force }
& (Join-Path $customDir 'scripts\setup-link-tools.ps1')

$dlHelperScript = Join-Path $customDir "scripts\download-helper.ps1"
$pwshCmd = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if ($pwshCmd) { $dlPwsh = $pwshCmd.Source }
else {
    $ps5 = Get-Command powershell.exe -ErrorAction SilentlyContinue
    if ($ps5) { $dlPwsh = $ps5.Source } else { $dlPwsh = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" }
}
$q = '""'
$dlVbsContent = 'CreateObject("WScript.Shell").Run "' + $q + $dlPwsh + $q + ' -ExecutionPolicy Bypass -STA -File ' + $q + $dlHelperScript + $q + '", 0, False'
$dlVbs = Join-Path $customDir "scripts\download-helper.vbs"
$dlVbsContent | Set-Content $dlVbs -Encoding ASCII
$dlStartupVbs = Join-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup" "Spotify Remastered Download Helper.vbs"
Copy-Item $dlVbs $dlStartupVbs -Force
Start-Process "wscript.exe" -ArgumentList "`"$dlVbs`"" -WindowStyle Hidden

$wshell = New-Object -ComObject WScript.Shell
$premiumResponse = $wshell.Popup("Do you have Spotify Premium?", 0, "Spotify Remastered Setup", 4 + 32 + 256)

$spotxFlags = "-podcasts_off -block_update_off"
if ($premiumResponse -eq 6) { $spotxFlags += " -premium" }
try { iex "& { $(iwr -useb 'https://raw.githubusercontent.com/SpotX-Official/SpotX/refs/heads/main/run.ps1') } -confirm_spoti_recomended_over $spotxFlags" } catch { }

spicetify config inject_css 1
spicetify config replace_colors 1
spicetify config overwrite_assets 1
spicetify config inject_theme_js 1
spicetify config current_theme Hazy
spicetify config custom_apps lyrics-plus
spicetify config extensions download.js
spicetify config extensions link-import.js
spicetify restore 2>$null
& (Join-Path $env:LOCALAPPDATA 'spotify-remastered\scripts\repair-spicetify.ps1')
spicetify backup apply
spicetify apply

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$helperScript = Join-Path $customDir "scripts\spotify-remastered-updater.ps1"
$vbsLauncher = Join-Path $customDir "scripts\spotify-remastered-updater.vbs"
$startupVbs = Join-Path $startupDir "Spotify Remastered Updater.vbs"
$oldShortcut = Join-Path $startupDir "Spotify Remastered Updater.lnk"
Remove-Item $oldShortcut -Force -ErrorAction SilentlyContinue

$popupResponse = $wshell.Popup("Do you want Spotify to open every time you turn on your PC?", 0, "Spotify Remastered Setup", 4 + 32 + 256)

$helperScriptContent = @'
Start-Sleep -Seconds 10
$spice = (Get-Command spicetify -ErrorAction SilentlyContinue).Source
if ($spice) {
    $job = Start-Job -ScriptBlock { & $using:spice upgrade }
    Wait-Job $job -Timeout 60 | Out-Null
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}
Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue
& (Join-Path $env:LOCALAPPDATA 'spotify-remastered\scripts\repair-spicetify.ps1')
spicetify backup apply
Start-Sleep -Seconds 5
'@

if ($popupResponse -ne 6) {
    $helperScriptContent += "`r`nGet-Process | Where-Object {`$_.ProcessName -like '*spotify*'} | Stop-Process -Force -ErrorAction SilentlyContinue"
}

$helperScriptContent | Set-Content $helperScript -Encoding UTF8

$pwshCmd = Get-Command pwsh.exe -ErrorAction SilentlyContinue
if ($pwshCmd) { $pwshPath = $pwshCmd.Source }
else {
    $ps5 = Get-Command powershell.exe -ErrorAction SilentlyContinue
    if ($ps5) { $pwshPath = $ps5.Source } else { $pwshPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" }
}

$q = '""'
$vbsLine = 'CreateObject("WScript.Shell").Run "' + $q + $pwshPath + $q + ' -ExecutionPolicy Bypass -File ' + $q + $helperScript + $q + '", 0, False'
$vbsLine | Set-Content $vbsLauncher -Encoding ASCII

Copy-Item $vbsLauncher $startupVbs -Force

Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue

spicetify apply

} finally {
    Stop-Job $killJob -ErrorAction SilentlyContinue
    Remove-Job $killJob -Force -ErrorAction SilentlyContinue
}

try { Start-Process "spotify" } catch {
    try { Start-Process "$env:APPDATA\Spotify\Spotify.exe" } catch { }
}

Start-Sleep -Seconds 3
exit
