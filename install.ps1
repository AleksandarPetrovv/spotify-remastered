Stop-Process -Name Spotify -Force -ErrorAction SilentlyContinue

$tempZip = "$env:TEMP\spotify-remastered.zip"
$tempExtract = "$env:TEMP\spotify-remastered"

Invoke-WebRequest "https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/heads/main.zip" -OutFile $tempZip

if (Test-Path $tempExtract) {
Remove-Item -Recurse -Force $tempExtract
}

Expand-Archive $tempZip -DestinationPath $tempExtract -Force

$repo = Join-Path $tempExtract "spotify-remastered-main"

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
Invoke-WebRequest "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | Invoke-Expression
Start-Sleep 2
}

$theme = "$env:APPDATA\spicetify\Themes\Hazy"
$app = "$env:APPDATA\spicetify\CustomApps\lyrics-plus"

Remove-Item -Recurse -Force $theme -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $app -ErrorAction SilentlyContinue

New-Item -ItemType Directory -Path $theme -Force | Out-Null
New-Item -ItemType Directory -Path $app -Force | Out-Null

Copy-Item -Recurse (Join-Path $repo "lyrics-plus") $app
Copy-Item -Force (Join-Path $repo "hazy\user.css") (Join-Path $theme "user.css")

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
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -RunLevel Highest -Force

Remove-Item $tempZip -Force
Remove-Item -Recurse -Force $tempExtract