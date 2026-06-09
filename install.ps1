powershell
Write-Host ""
Write-Host "=== spotify remastered ===" -ForegroundColor Cyan
Write-Host ""

Write-Host "downloading files..." -ForegroundColor Yellow
$repoZip = "$env:TEMP\spotify-remastered.zip"
$extractPath = "$env:TEMP\spotify-remastered"

Invoke-WebRequest -UseBasicParsing "https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/heads/main.zip" -OutFile $repoZip

if (Test-Path $extractPath) {
    Remove-Item -Recurse -Force $extractPath
}

Expand-Archive -Path $repoZip -DestinationPath $extractPath -Force

$repoRoot = "$extractPath\spotify-remastered-main"

if (Get-Command spicetify -ErrorAction SilentlyContinue) {
    Write-Host "spicetify is already installed, skipping" -ForegroundColor Green
} else {
    Write-Host "spicetify not found, installing it now..." -ForegroundColor Yellow

    Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" | Invoke-Expression

    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "User") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "Machine")

    if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
        Write-Host "couldn't find spicetify after install. close this window, open a new powershell, and run the command again." -ForegroundColor Red

        Remove-Item -Force $repoZip
        Remove-Item -Recurse -Force $extractPath

        exit 1
    }

    Write-Host "spicetify installed!" -ForegroundColor Green
}

$hazyPath = "$env:APPDATA\spicetify\Themes\Hazy"

Write-Host "installing hazy theme..." -ForegroundColor Yellow
Invoke-WebRequest -UseBasicParsing "https://raw.githubusercontent.com/Astromations/Hazy/main/install.ps1" | Invoke-Expression
Write-Host "hazy theme installed!" -ForegroundColor Green

Write-Host "applying custom hazy files..." -ForegroundColor Yellow
Copy-Item -Force "$repoRoot\hazy\color.ini" "$hazyPath\color.ini"
Copy-Item -Force "$repoRoot\hazy\theme.js" "$hazyPath\theme.js"
Copy-Item -Force "$repoRoot\hazy\user.css" "$hazyPath\user.css"

Write-Host "installing modified lyrics plus..." -ForegroundColor Yellow
$customAppsPath = "$env:LOCALAPPDATA\spicetify\CustomApps\lyrics-plus"

if (Test-Path $customAppsPath) {
    Remove-Item -Recurse -Force $customAppsPath
}

Copy-Item -Recurse "$repoRoot\lyrics-plus" $customAppsPath

spicetify config custom_apps lyrics-plus

Remove-Item -Force $repoZip
Remove-Item -Recurse -Force $extractPath

Write-Host "applying everything..." -ForegroundColor Yellow
spicetify apply

Write-Host ""
Write-Host "all done, enjoy :)" -ForegroundColor Green