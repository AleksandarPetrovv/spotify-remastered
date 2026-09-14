param([switch]$DeleteLocalSongs, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'spotify-remastered'
if ((Get-Item -LiteralPath $root -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to uninstall through a linked support directory.' }
$common = Join-Path $root 'scripts\installer-common.ps1'
if (-not (Test-Path -LiteralPath $common)) {
    throw 'This installation needs the updated setup scripts before removal. No files have been deleted.'
}
. $common
function Stop-SpotifyForRestore {
    foreach ($spotifyProcess in @(Get-Process Spotify -ErrorAction SilentlyContinue)) {
        if (-not $spotifyProcess.HasExited) {
            $spotifyProcess.Kill()
            if (-not $spotifyProcess.WaitForExit(20000)) { throw 'Spotify did not close. Recovery files were retained.' }
        }
    }
}
if ($PrepareOnly) {
    Write-Output 'SR_STAGE:0:Checking restoration tools'
    $spice = (Get-Command spicetify -CommandType Application -ErrorAction Stop).Source
    $cfg = Get-RemasteredConfig $spice
    $python = Join-Path $root 'dependencies\downloader\Scripts\python.exe'
    $stateTool = Join-Path $root 'scripts\install-state.py'
    Write-Output 'SR_STAGE:1:Checking saved configuration and recovery files'
    Invoke-Checked $python $stateTool check $root $cfg
    Write-Output 'SR_STAGE:2:Ready to finish uninstall'
    exit 0
}
Write-Output 'SR_STAGE:3:Stopping background helpers and closing Spotify'
Stop-RemasteredHelpers $root
$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
foreach ($file in @('Spotify Remastered Updater.vbs','Spotify Remastered Updater.lnk','Spotify Remastered Download Helper.vbs')) { Remove-ManagedPath $startup $file }
try {
    $spice = (Get-Command spicetify -CommandType Application -ErrorAction Stop).Source
    $cfg = Get-RemasteredConfig $spice
} catch { throw 'Background helpers and startup entries were removed. Spicetify is unavailable; repair it to finish restoring Spotify. User files and recovery records were retained.' }
$python = Join-Path $root 'dependencies\downloader\Scripts\python.exe'
$stateTool = Join-Path $root 'scripts\install-state.py'
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $stateTool)) {
    throw 'The restoration tools are missing. Repair setup before uninstalling; user data has been kept.'
}
Invoke-Checked $python $stateTool capture $root $cfg 'true'
$state = Get-Content -LiteralPath (Join-Path $root 'data\install-state.json') -Raw | ConvertFrom-Json
$spotifyPath = [regex]::Match([IO.File]::ReadAllText((Join-Path $cfg 'config-xpui.ini')), '(?m)^spotify_path\s*=\s*([^\r\n]+)').Groups[1].Value.Trim()
Stop-SpotifyForRestore
Write-Output 'SR_STAGE:4:Restoring Spotify and previous configuration'
try {
    $restoreSource = [IO.File]::ReadAllText($stateTool)
    if ($restoreSource.Contains('def restore_spicetify(')) {
        Invoke-Checked $python $stateTool spicetify-restore $root $cfg $spice
    } else {
        $updatedStateTool = Join-Path $root 'cache\uninstall-install-state.py'
        New-Item -ItemType Directory -Path (Split-Path $updatedStateTool) -Force | Out-Null
        Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/AleksandarPetrovv/spotify-remastered/cli/hazy/extensions/install-state.py' -OutFile $updatedStateTool
        if (-not ([IO.File]::ReadAllText($updatedStateTool).Contains('def restore_spicetify('))) { throw 'The updated recovery helper is not available yet. Recovery files were retained.' }
        Invoke-Checked $python $updatedStateTool spicetify-restore $root $cfg $spice
    }
} catch {
    Write-Host 'Restoration could not finish. Recovery files were retained. Repair Spotify and rerun uninstall.' -ForegroundColor Yellow
    Write-Host $_.Exception.Message
    exit 1
}
Stop-SpotifyForRestore
Invoke-Checked $python $stateTool restore $root $cfg
& (Join-Path $root 'scripts\repair-spicetify.ps1') -Restore
Invoke-Checked $python $stateTool spotx-restore $root $spotifyPath
if ($state.existed) {
    Invoke-Checked $spice backup apply -n
} else {
    $binaryDirectory = Split-Path $spice
    $allowed = @((Join-Path $env:LOCALAPPDATA 'spicetify'), (Join-Path $env:LOCALAPPDATA 'Programs\spicetify'))
    if ($binaryDirectory -notin $allowed) { throw 'Spicetify uses a custom installation path; restored Spotify and retained its CLI for manual removal.' }
    if ($cfg -notin @((Join-Path $env:APPDATA 'spicetify'), (Join-Path $env:LOCALAPPDATA 'spicetify'), $binaryDirectory)) { throw 'Custom Spicetify configuration retained for manual cleanup; Spotify has been restored.' }
    $userPath = [Environment]::GetEnvironmentVariable('PATH','User')
    $entries = $userPath -split ';' | Where-Object { $_.TrimEnd('\') -ine $binaryDirectory.TrimEnd('\') }
    [Environment]::SetEnvironmentVariable('PATH', ($entries -join ';'), 'User')
    Remove-ManagedPath (Split-Path $binaryDirectory) (Split-Path $binaryDirectory -Leaf)
    if ($cfg -ne $binaryDirectory) { Remove-ManagedPath (Split-Path $cfg) (Split-Path $cfg -Leaf) }
}
Write-Output 'SR_STAGE:5:Finishing cleanup'
Invoke-Checked $python $stateTool complete $root
if ($DeleteLocalSongs) { Remove-ManagedPath $root 'local songs' }
foreach ($name in @('dependencies', 'cache', 'data', 'backups', 'scripts', 'about-this-folder.txt', 'spotdl.exe', 'ffmpeg.exe', 'yt-dlp.exe', 'deno.exe')) { Remove-ManagedPath $root $name }
foreach ($item in @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue)) {
    if ($item.Name -match '^(lyrics-plus-backup-|theme-backup-|settings-uninstall-backup-)') { Remove-ManagedPath $root $item.Name }
}
if (-not (Get-ChildItem -LiteralPath $root -Force | Select-Object -First 1)) { Remove-Item -LiteralPath $root -Force }
Write-Host 'Spotify Remastered removed.'
