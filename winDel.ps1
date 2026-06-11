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
    return $null
}

Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue
$killJob = Start-Job -ScriptBlock { while ($true) { Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 } }

$customDir = Join-Path $env:LOCALAPPDATA "spotify-remastered"
$statusFile = Join-Path $customDir "spicetify-status.txt"
$fullWipe = $false
if (Test-Path $statusFile) {
    $statusContent = Get-Content $statusFile -Raw
    if ($statusContent -match 'spicetify-existed-before=False') { $fullWipe = $true }
}
$prevThemeFile = Join-Path $customDir "prev-theme.txt"
$prevTheme = if (Test-Path $prevThemeFile) { (Get-Content $prevThemeFile -Raw).Trim() } else { $null }

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startupDir "Spotify Remastered Updater.lnk"
Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $customDir -ErrorAction SilentlyContinue

if (Get-Command spicetify -ErrorAction SilentlyContinue) {
    spicetify restore
    $cfg = Get-SpicetifyConfigDir
    if ($cfg) {
        Remove-Item -Recurse -Force (Join-Path $cfg "Themes\Hazy") -ErrorAction SilentlyContinue
        Remove-Item -Recurse -Force (Join-Path $cfg "CustomApps\lyrics-plus") -ErrorAction SilentlyContinue
    }
    spicetify config custom_apps lyrics-plus-
    if ($prevTheme) {
        spicetify config current_theme $prevTheme
    } else {
        spicetify config current_theme " "
        spicetify config inject_theme_js 0
    }
    spicetify apply

    if ($fullWipe) {
        spicetify restore backup
        $spicetifyPaths = @(
            (Join-Path $env:LOCALAPPDATA 'spicetify'),
            (Join-Path $env:APPDATA 'spicetify'),
            (Join-Path $env:LOCALAPPDATA 'Programs\spicetify')
        )
        foreach ($p in $spicetifyPaths) { Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue }

        $spiceBin = (Get-Command spicetify -ErrorAction SilentlyContinue).Source
        if ($spiceBin) { Remove-Item -Force $spiceBin -ErrorAction SilentlyContinue }

        $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
        $cleaned = ($userPath -split ";") | Where-Object { $_ -notmatch "spicetify" } | Where-Object { $_ -ne "" }
        [System.Environment]::SetEnvironmentVariable("PATH", ($cleaned -join ";"), "User")
    }
}

Stop-Job $killJob -ErrorAction SilentlyContinue
Remove-Job $killJob -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 3
exit