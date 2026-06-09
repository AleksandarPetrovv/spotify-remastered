Write-Host ""
Write-Host "=== spotify remastered ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "downloading files..." -ForegroundColor Yellow

$tempPath = [System.IO.Path]::GetTempPath()
$repoZip = Join-Path $tempPath "spotify-remastered.zip"
$extractPath = Join-Path $tempPath "spotify-remastered"

Invoke-WebRequest -UseBasicParsing "https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/heads/main.zip" -OutFile $repoZip

if (Test-Path $extractPath) {
Remove-Item -Recurse -Force $extractPath
}

Expand-Archive -Path $repoZip -DestinationPath $extractPath -Force

$repoRoot = Join-Path $extractPath "spotify-remastered-main"

if (Get-Command spicetify -ErrorAction SilentlyContinue) {
Write-Host "spicetify is already installed, skipping" -ForegroundColor Green
} else {
Write-Host "spicetify not found, installing it now..." -ForegroundColor Yellow

Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | Invoke-Expression

$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Write-Host "couldn't find spicetify after install. close this window, open a new powershell, and run the command again." -ForegroundColor Red

    Remove-Item -Force $repoZip -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $extractPath -ErrorAction SilentlyContinue

    exit 1
}

Write-Host "spicetify installed!" -ForegroundColor Green

}

$hazyPath = "$env:APPDATA\spicetify\Themes\Hazy"

Write-Host "installing hazy theme..." -ForegroundColor Yellow
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/Astromations/Hazy/main/install.ps1" | Invoke-Expression
Write-Host "hazy theme installed!" -ForegroundColor Green

Write-Host "applying custom hazy css..." -ForegroundColor Yellow
Copy-Item -Force (Join-Path $repoRoot "hazy\user.css") (Join-Path $hazyPath "user.css")

Write-Host "installing modified lyrics plus..." -ForegroundColor Yellow
$customAppsPath = "$env:LOCALAPPDATA\spicetify\CustomApps\lyrics-plus"

if (Test-Path $customAppsPath) {
Remove-Item -Recurse -Force $customAppsPath
}

Copy-Item -Recurse (Join-Path $repoRoot "lyrics-plus") $customAppsPath

spicetify config custom_apps lyrics-plus

Remove-Item -Force $repoZip -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force $extractPath -ErrorAction SilentlyContinue

Write-Host "applying everything..." -ForegroundColor Yellow
spicetify apply

Write-Host ""
Write-Host "all done, enjoy :)" -ForegroundColor Green