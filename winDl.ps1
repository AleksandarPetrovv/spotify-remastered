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

$prevTheme = (spicetify config current_theme 2>$null)
if ($prevTheme) { $prevTheme = $prevTheme.Trim() }
$customDir = Join-Path $env:LOCALAPPDATA "spotify-remastered"
if (-not (Test-Path $customDir)) { New-Item -ItemType Directory -Path $customDir | Out-Null }
$prevThemeFile = Join-Path $customDir "prev-theme.txt"
if ($prevTheme -and $prevTheme -ne "Hazy" -and -not (Test-Path $prevThemeFile)) { Set-Content $prevThemeFile -Value $prevTheme -Encoding UTF8 }

@"
spicetify-existed-before=$spicetifyExistedBefore

this file tells the uninstall script whether spicetify was already on your pc before you installed spotify remastered.
if the value above is false, the uninstall script will fully remove spicetify from your system.
if the value above is true, the uninstall script will only remove the hazy theme and lyrics-plus custom app, keeping your spicetify installation intact.
"@ | Set-Content (Join-Path $customDir "spicetify-status.txt") -Encoding UTF8

@"
this folder is used by spotify remastered. please do not delete it or any of its files while spotify remastered is installed.

here is what each file does:

- spotify-remastered-updater.ps1: runs on startup to keep spicetify applied after spotify updates itself.
- spicetify-status.txt: stores whether spicetify was already on your pc before you installed spotify remastered. the uninstall script reads this to know whether to fully remove spicetify or just remove the theme and custom app.
- prev-theme.txt: if this file exists it stores the name of your previous spicetify theme so it can be restored when you uninstall spotify remastered.
- about-this-folder.txt: this file.
"@ | Set-Content (Join-Path $customDir "about-this-folder.txt") -Encoding UTF8

spicetify config inject_css 1
spicetify config replace_colors 1
spicetify config overwrite_assets 1
spicetify config inject_theme_js 1
spicetify config current_theme Hazy
spicetify config custom_apps lyrics-plus
spicetify restore 2>$null
spicetify backup apply
spicetify apply

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$helperScript = Join-Path $customDir "spotify-remastered-updater.ps1"
$vbsLauncher = Join-Path $customDir "spotify-remastered-updater.vbs"
$startupVbs = Join-Path $startupDir "Spotify Remastered Updater.vbs"
$oldShortcut = Join-Path $startupDir "Spotify Remastered Updater.lnk"
Remove-Item $oldShortcut -Force -ErrorAction SilentlyContinue

$wshell = New-Object -ComObject WScript.Shell
$popupResponse = $wshell.Popup("do you want spotify to launch every time you run your pc?", 0, "Spotify Remastered Setup", 4 + 32 + 256)

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