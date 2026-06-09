function Get-SpicetifyConfigDir {
    if ($env:SPICETIFY_CONFIG -and (Test-Path $env:SPICETIFY_CONFIG)) {
        return $env:SPICETIFY_CONFIG
    }
    try {
        $p = (& spicetify path userdata 2>$null | Select-Object -Last 1)
        if ($p) { $p = $p.Trim() }
        if ($p -and (Test-Path $p)) { return $p }
    } catch { }
    $candidates = @(
        (Join-Path $env:APPDATA 'spicetify'),
        (Join-Path $env:LOCALAPPDATA 'spicetify')
    )
    foreach ($c in $candidates) {
        if (Test-Path (Join-Path $c 'config-xpui.ini')) { return $c }
    }
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    throw "Could not locate Spicetify config directory."
}

Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue

$tempZip = "$env:TEMP\spotify-remastered.zip"
$tempExtract = "$env:TEMP\spotify-remastered"
Invoke-WebRequest "https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/heads/main.zip" -OutFile $tempZip
if (-not (Test-Path $tempZip)) { throw "Download failed." }
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue }
Expand-Archive $tempZip -DestinationPath $tempExtract -Force
$repo = Join-Path $tempExtract "spotify-remastered-main"
if (-not (Test-Path $repo)) { throw "Extracted repo folder not found at $repo." }

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Invoke-WebRequest "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | Invoke-Expression
    Start-Sleep 2
}

$cfg = Get-SpicetifyConfigDir
$themesDir = Join-Path $cfg "Themes"
$appsDir = Join-Path $cfg "CustomApps"
$hazyDest = Join-Path $themesDir "Hazy"
$lpDest = Join-Path $appsDir "lyrics-plus"

Remove-Item -Recurse -Force $hazyDest -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $repo "hazy") $hazyDest
Remove-Item -Recurse -Force $lpDest -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $repo "lyrics-plus") $lpDest

spicetify config inject_css 1
spicetify config replace_colors 1
spicetify config overwrite_assets 1
spicetify config inject_theme_js 1
spicetify config current_theme Hazy
spicetify config custom_apps lyrics-plus
spicetify backup apply
spicetify apply
Start-Sleep 4
spicetify restart

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$helperScript = "$env:APPDATA\spicetify-hazy-reapply.ps1"
$shortcutPath = Join-Path $startupDir "Spicetify Hazy - Auto Reapply.lnk"
@'
Start-Sleep -Seconds 10
$spice = (Get-Command spicetify -ErrorAction SilentlyContinue).Source
if ($spice) {
    $job = Start-Job -ScriptBlock { & $using:spice upgrade }
    Wait-Job $job -Timeout 60 | Out-Null
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
}
Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue
spicetify apply
Start-Sleep -Seconds 5
Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue
'@ | Set-Content $helperScript -Encoding UTF8
if (-not (Test-Path $shortcutPath)) {
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut($shortcutPath)
    $pwsh = (Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source ?? (Get-Command powershell.exe -ErrorAction SilentlyContinue).Source ?? "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $s.TargetPath = $pwsh
    $s.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$helperScript`""
    $s.WorkingDirectory = $env:USERPROFILE
    $s.Description = "Re-applies Spicetify Hazy after Spotify updates revert it"
    $s.Save()
}

Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue

spicetify apply
Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue
spicetify restart