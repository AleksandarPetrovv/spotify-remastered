param([string]$SourceDirectory, [Nullable[bool]]$Premium, [Nullable[bool]]$OpenAtLogin)
$ErrorActionPreference = 'Stop'
function Invoke-Spice {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $script:spiceExe @args
        $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($exitCode -ne 0) { throw "Spicetify failed with exit code $exitCode." }
}


function Save-RemasteredRuntime {
    param([string]$Root, [string]$Backup)
    $scripts = Join-Path $Root 'scripts'
    New-Item -ItemType Directory -Path $Backup -Force | Out-Null
    if (Test-Path -LiteralPath $scripts -PathType Container) { Copy-Item -LiteralPath $scripts -Destination (Join-Path $Backup 'scripts') -Recurse }
    $startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
    $names = @('Spotify Remastered Updater.vbs','Spotify Remastered Updater.lnk','Spotify Remastered Download Helper.vbs')
    $saved = @()
    foreach ($name in $names) {
        $file = Join-Path $startup $name
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            New-Item -ItemType Directory -Path (Join-Path $Backup 'startup') -Force | Out-Null
            Copy-Item -LiteralPath $file -Destination (Join-Path (Join-Path $Backup 'startup') $name)
            $saved += $name
        }
    }
    $commands = @(Get-CimInstance Win32_Process | ForEach-Object { [string]$_.CommandLine })
    return @{ Backup = $Backup; Startup = $startup; Names = $names; Saved = $saved;
        HelperRunning = @($commands | Where-Object { $_.IndexOf((Join-Path $scripts 'download-helper.ps1'), [StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0;
        UpdaterRunning = @($commands | Where-Object { $_.IndexOf((Join-Path $scripts 'spotify-remastered-updater.ps1'), [StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0 }
}

function Restore-RemasteredRuntime {
    param([string]$Root, $State)
    Stop-RemasteredHelpers $Root
    $scripts = Join-Path $Root 'scripts'
    $previous = Join-Path $State.Backup 'scripts'
    if (Test-Path -LiteralPath $previous -PathType Container) {
        Remove-ManagedPath $Root 'scripts'
        Copy-Item -LiteralPath $previous -Destination $scripts -Recurse
    }
    foreach ($name in $State.Names) {
        if ($name -in $State.Saved) {
            Copy-Item -LiteralPath (Join-Path (Join-Path $State.Backup 'startup') $name) -Destination (Join-Path $State.Startup $name) -Force
        } else { Remove-ManagedPath $State.Startup $name }
    }
    foreach ($item in @(@{ Run = $State.HelperRunning; Name = 'download-helper.vbs' }, @{ Run = $State.UpdaterRunning; Name = 'spotify-remastered-updater.vbs' })) {
        $launcher = Join-Path $scripts $item.Name
        if ($item.Run -and (Test-Path -LiteralPath $launcher -PathType Leaf)) { Start-Process 'wscript.exe' -ArgumentList "`"$launcher`"" -WindowStyle Hidden }
    }
}

$killJob = $null
$runtimeState = $null
$runtimeStopped = $false
$installSucceeded = $false
$retainRuntimeBackup = $false

try {

$tempExtract = Join-Path $env:TEMP ('spotify-remastered-' + [Guid]::NewGuid().ToString('N'))
$tempZip = $tempExtract + '.zip'

if ($SourceDirectory) {
    $sourceRoot = (Resolve-Path -LiteralPath $SourceDirectory -ErrorAction Stop).Path
    $repo = Join-Path $tempExtract 'repository'
    New-Item -ItemType Directory -Path $repo -Force | Out-Null
    foreach ($name in @('hazy', 'lyrics-plus', 'winDel.ps1', 'macDel.sh')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination $repo -Recurse -ErrorAction Stop }
} else {
Invoke-WebRequest -Uri 'https://github.com/AleksandarPetrovv/spotify-remastered/archive/refs/tags/v1.8.zip' -OutFile $tempZip

if (-not (Test-Path $tempZip)) { throw "Download failed." }
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue }
Expand-Archive $tempZip -DestinationPath $tempExtract -Force
$inner = (Get-ChildItem -Path $tempExtract -Directory)[0].FullName
Rename-Item -Path $inner -NewName "repository"
$repo = Join-Path $tempExtract "repository"
}
if (-not (Test-Path $repo)) { throw "Extracted repo folder not found at $repo." }
foreach ($file in @('hazy\extensions\installer-common.ps1','hazy\extensions\setup-downloader.ps1','hazy\extensions\setup-downloader.py','hazy\extensions\downloader-requirements.txt','hazy\extensions\install-state.py','hazy\extensions\about-this-folder.txt','hazy\extensions\link-import.js','hazy\extensions\local-catalogue.ps1','lyrics-plus\components\PlaybarButton.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $repo $file))) { throw "The release archive is missing $file. Publish a current release before installing." }
}
. (Join-Path $repo 'hazy\extensions\installer-common.ps1')
$customDir = Join-Path $env:LOCALAPPDATA 'spotify-remastered'
$runtimeState = Save-RemasteredRuntime $customDir (Join-Path $tempExtract 'previous-runtime')

if (-not (Get-Command spicetify -ErrorAction SilentlyContinue)) {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    $spiceInstaller = "$env:TEMP\spicetify-install.ps1"
    Invoke-WebRequest "https://raw.githubusercontent.com/spicetify/cli/main/install.ps1" -OutFile $spiceInstaller
    $content = Get-Content $spiceInstaller -Raw
    $content = $content -replace '(?s)#region Marketplace.*?#endregion Marketplace', ''
    $content | Set-Content $spiceInstaller -Encoding UTF8
    powershell -ExecutionPolicy Bypass -File $spiceInstaller
    if ($LASTEXITCODE -ne 0) { throw 'Spicetify installation failed.' }
    Start-Sleep 2
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
    $spicetifyExistedBefore = $false
} else {
    $spicetifyExistedBefore = $true
}

$script:spiceExe = (Get-Command spicetify -CommandType Application -ErrorAction Stop).Source
Invoke-Spice | Out-Null
$cfg = Get-RemasteredConfig $script:spiceExe
foreach ($folder in @('dependencies','scripts','data','cache')) { New-Item -ItemType Directory -Path (Join-Path $customDir $folder) -Force | Out-Null }
foreach ($file in @('setup-downloader.ps1','setup-downloader.py','downloader-requirements.txt','install-state.py','installer-common.ps1')) {
    Copy-Item -LiteralPath (Join-Path $repo "hazy\extensions\$file") -Destination (Join-Path $customDir "scripts\$file") -Force
}
& (Join-Path $customDir 'scripts\setup-downloader.ps1') -Root $customDir
. (Join-Path $repo 'hazy\extensions\download-helper.ps1') -NoListen
Get-Downloader | Out-Null
& (Join-Path $repo 'hazy\extensions\setup-link-tools.ps1')
$runtimeStopped = $true
Stop-RemasteredHelpers $customDir
Get-Process Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
$killJob = Start-Job -ScriptBlock { while ($true) { Get-Process Spotify -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 500 } }
$managedPython = Join-Path $customDir 'dependencies\downloader\Scripts\python.exe'
Invoke-Checked $managedPython (Join-Path $customDir 'scripts\install-state.py') capture $customDir $cfg ([string]$spicetifyExistedBefore)
$themesDir = Join-Path $cfg "Themes"
$appsDir = Join-Path $cfg "CustomApps"
if (-not (Test-Path $themesDir)) { New-Item -ItemType Directory -Path $themesDir | Out-Null }
if (-not (Test-Path $appsDir)) { New-Item -ItemType Directory -Path $appsDir | Out-Null }
$hazyDest = Join-Path $themesDir "Hazy"
$lpDest = Join-Path $appsDir "lyrics-plus"

Remove-ManagedPath $cfg 'Themes\Hazy'
Copy-Item -Recurse (Join-Path $repo "hazy") $hazyDest
Remove-ManagedPath $cfg 'CustomApps\lyrics-plus'
Copy-Item -Recurse (Join-Path $repo "lyrics-plus") $lpDest

$extensionsDir = Join-Path $cfg "Extensions"
if (-not (Test-Path $extensionsDir)) { New-Item -ItemType Directory -Path $extensionsDir | Out-Null }
Copy-Item (Join-Path $repo "hazy\extensions\download.js") (Join-Path $extensionsDir "download.js") -Force
Copy-Item (Join-Path $repo 'hazy\extensions\link-import.js') (Join-Path $extensionsDir 'link-import.js') -Force
Copy-Item (Join-Path $repo 'lyrics-plus\components\PlaybarButton.js') (Join-Path $extensionsDir 'lyrics-plus-button.js') -Force

$prevTheme = (spicetify config current_theme 2>$null)
if ($prevTheme) { $prevTheme = $prevTheme.Trim() }
$customDir = Join-Path $env:LOCALAPPDATA "spotify-remastered"
if (-not (Test-Path $customDir)) { New-Item -ItemType Directory -Path $customDir | Out-Null }
foreach ($folder in @('dependencies', 'scripts', 'data', 'cache')) { New-Item -ItemType Directory -Force -Path (Join-Path $customDir $folder) | Out-Null }
$prevThemeFile = Join-Path $customDir "data\prev-theme.txt"
if ($prevTheme -and $prevTheme -ne "Hazy" -and -not (Test-Path $prevThemeFile)) { Set-Content $prevThemeFile -Value $prevTheme -Encoding UTF8 }

if (-not (Test-Path -LiteralPath (Join-Path $customDir 'data\spicetify-status.txt'))) {
@"
spicetify-existed-before=$spicetifyExistedBefore

this file tells the uninstall script whether spicetify was already on your pc before you installed spotify remastered.
if the value above is false, the uninstall script will fully remove spicetify from your system.
if the value above is true, the uninstall script will only remove the hazy theme and lyrics-plus custom app, keeping your spicetify installation intact.
"@ | Set-Content (Join-Path $customDir "data\spicetify-status.txt") -Encoding UTF8
}

Copy-Item -LiteralPath (Join-Path $repo 'hazy\extensions\about-this-folder.txt') -Destination (Join-Path $customDir 'about-this-folder.txt') -Force


Copy-Item (Join-Path $repo "hazy\extensions\download-helper.ps1") (Join-Path $customDir "scripts\download-helper.ps1") -Force
Copy-Item (Join-Path $repo "hazy\extensions\download-runner.py") (Join-Path $customDir "scripts\download-runner.py") -Force
foreach ($file in @('link-helper.ps1','setup-link-tools.ps1','local-catalogue.ps1','repair-spicetify.ps1')) { Copy-Item (Join-Path $repo "hazy\extensions\$file") (Join-Path $customDir "scripts\$file") -Force }

Copy-Item (Join-Path $repo 'winDel.ps1') (Join-Path $customDir 'scripts\winDel.ps1') -Force
if (Test-Path -LiteralPath (Join-Path $repo 'hazy\extensions\collection_metadata.py')) { Copy-Item (Join-Path $repo 'hazy\extensions\collection_metadata.py') (Join-Path $customDir 'scripts\collection_metadata.py') -Force }
if (Test-Path -LiteralPath (Join-Path $repo 'hazy\extensions\uninstall-helper.py')) { Copy-Item (Join-Path $repo 'hazy\extensions\uninstall-helper.py') (Join-Path $customDir 'scripts\uninstall-helper.py') -Force }
if (Test-Path -LiteralPath (Join-Path $repo 'hazy\extensions\uninstall-worker.ps1')) { Copy-Item (Join-Path $repo 'hazy\extensions\uninstall-worker.ps1') (Join-Path $customDir 'scripts\uninstall-worker.ps1') -Force }
$dlHelperScript = Join-Path $customDir "scripts\download-helper.ps1"
$dlPwsh = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$q = '""'
$dlVbsContent = 'CreateObject("WScript.Shell").Run "' + $q + $dlPwsh + $q + ' -ExecutionPolicy Bypass -STA -File ' + $q + $dlHelperScript + $q + '", 0, False'
$dlVbs = Join-Path $customDir "scripts\download-helper.vbs"
$dlVbsContent | Set-Content $dlVbs -Encoding Unicode
$dlStartupVbs = Join-Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup" "Spotify Remastered Download Helper.vbs"
Copy-Item $dlVbs $dlStartupVbs -Force

$wshell = New-Object -ComObject WScript.Shell
$premiumResponse = if ($null -ne $Premium) { if ($Premium) { 6 } else { 7 } } else { $wshell.Popup("Do you have Spotify Premium?", 0, "Spotify Remastered Setup", 4 + 32 + 256) }

$spotxFlags = @('-podcasts_off', '-block_update_off', '-confirm_spoti_recomended_over', '-defender_exclusions_off')
if ($premiumResponse -eq 6) { $spotxFlags += '-premium' }
$spotifyPath = [regex]::Match([IO.File]::ReadAllText((Join-Path $cfg 'config-xpui.ini')), '(?m)^spotify_path\s*=\s*([^\r\n]+)').Groups[1].Value.Trim()
if (-not (Test-Path -LiteralPath $spotifyPath -PathType Container)) { throw 'Could not locate Spotify for patch backup.' }
if (Test-Path -LiteralPath (Join-Path $cfg 'Backup\xpui.spa')) { Invoke-Spice restore -n }
if ((Test-Path -LiteralPath (Join-Path $customDir 'data\spotx-state.json')) -and (Select-String -LiteralPath (Join-Path $customDir 'scripts\install-state.py') -SimpleMatch 'def check_restore' -Quiet)) {
    Get-Process Spotify -ErrorAction SilentlyContinue | Stop-Process -Force
    Invoke-Checked $managedPython (Join-Path $customDir 'scripts\install-state.py') spotx-restore $customDir $spotifyPath
    Invoke-Checked $managedPython (Join-Path $customDir 'scripts\install-state.py') spotx-reset $customDir $spotifyPath
}
Invoke-Checked $managedPython (Join-Path $customDir 'scripts\install-state.py') spotx-before $customDir $spotifyPath
$spotxScript = Join-Path $tempExtract 'spotx.ps1'
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/SpotX-Official/SpotX/refs/heads/main/run.ps1' -OutFile $spotxScript
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $spotxScript @spotxFlags
if ($LASTEXITCODE -ne 0) { throw 'SpotX setup failed; restoration records have been kept.' }
Invoke-Checked $managedPython (Join-Path $customDir 'scripts\install-state.py') spotx-after $customDir $spotifyPath

Invoke-Spice config inject_css 1
Invoke-Spice config replace_colors 1
Invoke-Spice config overwrite_assets 1
Invoke-Spice config inject_theme_js 1
Invoke-Spice config current_theme Hazy
Invoke-Spice config custom_apps lyrics-plus
Invoke-Spice config extensions download.js
Invoke-Spice config extensions link-import.js
Invoke-Spice config extensions lyrics-plus-button.js
& (Join-Path $env:LOCALAPPDATA 'spotify-remastered\scripts\repair-spicetify.ps1')
Invoke-Spice backup apply
Invoke-Spice apply

$startupDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup"
$helperScript = Join-Path $customDir "scripts\spotify-remastered-updater.ps1"
$vbsLauncher = Join-Path $customDir "scripts\spotify-remastered-updater.vbs"
$startupVbs = Join-Path $startupDir "Spotify Remastered Updater.vbs"
$oldShortcut = Join-Path $startupDir "Spotify Remastered Updater.lnk"
Remove-Item $oldShortcut -Force -ErrorAction SilentlyContinue

$popupResponse = if ($null -ne $OpenAtLogin) { if ($OpenAtLogin) { 6 } else { 7 } } else { $wshell.Popup("Do you want Spotify to open every time you turn on your PC?", 0, "Spotify Remastered Setup", 4 + 32 + 256) }

$helperScriptContent = @'
param([string]$SpicetifyPath, [switch]$KeepClosed)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$cache = Join-Path $root 'cache'
New-Item -ItemType Directory -Path $cache -Force | Out-Null
$mutex = New-Object Threading.Mutex($false, 'Local\SpotifyRemasteredUpdater')
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { return }
    $script:log = Join-Path $cache 'startup.log'
    if ((Test-Path $script:log) -and (Get-Item $script:log).Length -gt 262144) {
        Move-Item -LiteralPath $script:log -Destination "$script:log.1" -Force
    }
    function Write-StartupLog([string]$Message) {
        Add-Content -LiteralPath $script:log -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
    }
    if (-not $SpicetifyPath -or -not (Test-Path -LiteralPath $SpicetifyPath)) {
        $SpicetifyPath = (Get-Command spicetify -CommandType Application -ErrorAction SilentlyContinue).Source
        if (-not $SpicetifyPath) { $SpicetifyPath = Join-Path $env:LOCALAPPDATA 'spicetify\spicetify.exe' }
    }
    function Invoke-StartupSpice([string]$Arguments) {
        $info = New-Object Diagnostics.ProcessStartInfo
        $info.FileName = $SpicetifyPath
        $info.Arguments = $Arguments
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $process = New-Object Diagnostics.Process
        $process.StartInfo = $info
        try {
            $null = $process.Start()
            $stdout = $process.StandardOutput.ReadToEndAsync()
            $stderr = $process.StandardError.ReadToEndAsync()
            if (-not $process.WaitForExit(180000)) {
                $stop = New-Object Diagnostics.ProcessStartInfo
                $stop.FileName = Join-Path $env:SystemRoot 'System32\taskkill.exe'
                $stop.Arguments = "/PID $($process.Id) /T /F"
                $stop.UseShellExecute = $false
                $stop.CreateNoWindow = $true
                $killer = [Diagnostics.Process]::Start($stop)
                try { $killer.WaitForExit() } finally { $killer.Dispose() }
                throw "$Arguments timed out"
            }
            Write-StartupLog "$Arguments`: $($stdout.GetAwaiter().GetResult()) $($stderr.GetAwaiter().GetResult())"
            if ($process.ExitCode -ne 0) { throw "$Arguments exited with code $($process.ExitCode)" }
        } finally { $process.Dispose() }
    }
    $upgraded = $false
    $applied = $false
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        if ($attempt -gt 1) { Start-Sleep -Seconds (15 * ($attempt - 1)) }
        if (-not $upgraded) {
            try { Invoke-StartupSpice 'upgrade'; $upgraded = $true }
            catch { Write-StartupLog "upgrade attempt $attempt failed: $_" }
        }
        if (-not $applied -or $upgraded) {
            try {
                Get-Process Spotify -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                & (Join-Path $PSScriptRoot 'repair-spicetify.ps1') -SpicetifyPath $SpicetifyPath
                Invoke-StartupSpice 'backup apply -n'
                $applied = $true
            } catch { $applied = $false; Write-StartupLog "apply attempt $attempt failed: $_" }
        }
        if ($upgraded -and $applied) { break }
    }
    if (-not $applied) { throw 'customization could not be applied after three attempts' }
    if (-not $KeepClosed) { Invoke-StartupSpice 'restart' }
    Write-StartupLog "startup finished; upgrade successful: $upgraded; customization applied: $applied"
} catch {
    if ($script:log) { Write-StartupLog "startup failed: $_" }
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
'@

$helperScriptContent | Set-Content $helperScript -Encoding UTF8

$pwshPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

$q = '""'
$updaterArgs = ' -SpicetifyPath ' + $q + $script:spiceExe + $q
if ($popupResponse -ne 6) { $updaterArgs += ' -KeepClosed' }
$vbsLine = 'CreateObject("WScript.Shell").Run "' + $q + $pwshPath + $q + ' -NoProfile -ExecutionPolicy Bypass -File ' + $q + $helperScript + $q + $updaterArgs + '", 0, False'
$vbsLine | Set-Content $vbsLauncher -Encoding Unicode

Copy-Item $vbsLauncher $startupVbs -Force


Invoke-Spice apply

if ($killJob) {
    Stop-Job $killJob -ErrorAction SilentlyContinue
    Remove-Job $killJob -Force -ErrorAction SilentlyContinue
    $killJob = $null
}

Start-Process 'wscript.exe' -ArgumentList "`"$dlVbs`"" -WindowStyle Hidden
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { $response = Invoke-RestMethod 'http://127.0.0.1:27382/health' -TimeoutSec 2; if ($response.service -eq 'spotify-remastered' -and $response.status -eq 'ready') { $ready = $true; break } } catch {}
    Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'The download listener did not start. Installation records were kept for repair.' }

try { Start-Process "spotify" } catch {
    try { Start-Process "$env:APPDATA\Spotify\Spotify.exe" } catch { }
}

$installSucceeded = $true
} finally {
    if ($killJob) {
        Stop-Job $killJob -ErrorAction SilentlyContinue
        Remove-Job $killJob -Force -ErrorAction SilentlyContinue
    }
    if (-not $installSucceeded -and $runtimeState) {
        try {
            if ($runtimeStopped) { Restore-RemasteredRuntime $customDir $runtimeState }
            else {
                $previousScripts = Join-Path $runtimeState.Backup 'scripts'
                if (Test-Path -LiteralPath $previousScripts) { Get-ChildItem -LiteralPath $previousScripts -Force | Copy-Item -Destination (Join-Path $customDir 'scripts') -Recurse -Force }
            }
        } catch { Write-Warning "Could not restore the previous helper runtime: $_. Runtime backup retained at $($runtimeState.Backup)."; $retainRuntimeBackup = $true }
    }
    if (Get-Command Remove-ManagedPath -ErrorAction SilentlyContinue) {
        if (-not $retainRuntimeBackup -and $tempExtract -and (Test-Path -LiteralPath $tempExtract)) { Remove-ManagedPath $env:TEMP ([IO.Path]::GetFileName($tempExtract)) }
        if ($tempZip -and (Test-Path -LiteralPath $tempZip)) { Remove-ManagedPath $env:TEMP ([IO.Path]::GetFileName($tempZip)) }
    }
}
Start-Sleep -Seconds 3
exit
