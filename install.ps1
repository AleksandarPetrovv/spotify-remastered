Stop-Process -Name Spotify -Force -ErrorAction SilentlyContinue
Stop-Process -Name SpotifyWebHelper -Force -ErrorAction SilentlyContinue
Get-Process | Where-Object {$_.ProcessName -like "*spotify*"} | Stop-Process -Force -ErrorAction SilentlyContinue

$tempZip = "$env:TEMP\spotify-remastered.zip"
$tempExtract = "$env:TEMP\spotify-remastered"

Invoke-WebRequest "https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/heads/main.zip" -OutFile $tempZip

if (Test-Path $tempExtract) {
Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue
}

Expand-Archive $tempZip -DestinationPath $tempExtract -Force

$repo = Join-Path $tempExtract "spotify-remastered-main"

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
Invoke-WebRequest "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | Invoke-Expression
Start-Sleep 2
}

Remove-Item -Recurse -Force "$env:APPDATA\spicetify\Themes\Hazy" -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $repo "hazy") "$env:APPDATA\spicetify\Themes\Hazy"

Remove-Item -Recurse -Force "$env:APPDATA\spicetify\CustomApps\lyrics-plus" -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$env:APPDATA\spicetify\CustomApps\lyrics-plus" -Force | Out-Null
Copy-Item -Recurse (Join-Path $repo "lyrics-plus") "$env:APPDATA\spicetify\CustomApps\lyrics-plus"

spicetify config inject_css 1
spicetify config replace_colors 1
spicetify config overwrite_assets 1
spicetify config inject_theme_js 1
spicetify config current_theme Hazy
spicetify config custom_apps lyrics-plus

spicetify backup apply
spicetify apply

$taskName = "SpicetifyRepairAgent"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-WindowStyle Hidden -Command spicetify backup apply; spicetify apply"
$trigger = New-ScheduledTaskTrigger -AtLogOn
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Force

Remove-Item $tempZip -Force
Remove-Item -Recurse -Force $tempExtract