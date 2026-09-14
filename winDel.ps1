$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'spotify-remastered'
$common = Join-Path $root 'scripts\installer-common.ps1'
if (-not (Test-Path -LiteralPath $common)) {
    throw 'This installation needs the updated setup scripts before removal. No files have been deleted.'
}
. $common
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
Get-Process Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
Invoke-Checked $spice restore
Invoke-Checked $python $stateTool restore $root $cfg
& (Join-Path $root 'scripts\repair-spicetify.ps1') -Restore
Invoke-Checked $python $stateTool spotx-restore $root $spotifyPath
if ($state.existed) {
    Invoke-Checked $spice backup apply
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
Invoke-Checked $python $stateTool complete $root
Remove-ManagedPath $root 'scripts'
Write-Host 'Spotify Remastered removed. local songs, indexes, reusable dependencies and recovery records were preserved.'
