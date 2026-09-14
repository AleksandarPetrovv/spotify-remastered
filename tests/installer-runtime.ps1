$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'winDl.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
. (Join-Path $repo 'hazy\extensions\installer-common.ps1')
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in @('Save-RemasteredRuntime','Restore-RemasteredRuntime') }, $true)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert($condition, $message) { if (-not $condition) { throw $message } }
$testRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('spotify-runtime-test-' + [Guid]::NewGuid().ToString('N'))))
$expectedRoot = $testRoot
$previousAppData = $env:APPDATA
$previousLocalAppData = $env:LOCALAPPDATA
$script:launches = @()
$script:stops = 0
function Start-Process { param($FilePath, $ArgumentList, $WindowStyle) $script:launches += @{ File = $FilePath; Arguments = $ArgumentList; Style = $WindowStyle } }
function Stop-RemasteredHelpers { param($Root) $script:stops++ }
function Get-CimInstance { param($ClassName) [pscustomobject]@{ CommandLine = $script:fakeCommand } }
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $env:APPDATA = Join-Path $testRoot 'roaming'
    $env:LOCALAPPDATA = Join-Path $testRoot 'local'
    $root = Join-Path $testRoot 'support'
    $scripts = Join-Path $root 'scripts'
    $startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
    New-Item -ItemType Directory -Path $scripts,$startup | Out-Null
    [IO.File]::WriteAllText((Join-Path $scripts 'download-helper.ps1'), 'old helper')
    [IO.File]::WriteAllText((Join-Path $scripts 'download-helper.vbs'), 'old launcher')
    [IO.File]::WriteAllText((Join-Path $startup 'Spotify Remastered Download Helper.vbs'), 'old startup')
    $script:fakeCommand = 'powershell -File "' + (Join-Path $scripts 'download-helper.ps1') + '"'
    $state = Save-RemasteredRuntime $root (Join-Path $testRoot 'backup')
    [IO.File]::WriteAllText((Join-Path $scripts 'download-helper.ps1'), 'new helper')
    [IO.File]::WriteAllText((Join-Path $scripts 'new-only.ps1'), 'new helper file')
    [IO.File]::WriteAllText((Join-Path $startup 'Spotify Remastered Download Helper.vbs'), 'new startup')
    [IO.File]::WriteAllText((Join-Path $startup 'Spotify Remastered Updater.vbs'), 'new updater')
    Restore-RemasteredRuntime $root $state
    Assert ([IO.File]::ReadAllText((Join-Path $scripts 'download-helper.ps1')) -eq 'old helper') 'previous helper was not restored'
    Assert (-not (Test-Path -LiteralPath (Join-Path $scripts 'new-only.ps1'))) 'stale helper file remained after rollback'
    Assert ([IO.File]::ReadAllText((Join-Path $startup 'Spotify Remastered Download Helper.vbs')) -eq 'old startup') 'previous startup preference was not restored'
    Assert (-not (Test-Path -LiteralPath (Join-Path $startup 'Spotify Remastered Updater.vbs'))) 'new startup entry was not removed'
    Assert ($script:stops -eq 1 -and $script:launches.Count -eq 1 -and $script:launches[0].Style -eq 'Hidden') 'previous helper was not restarted safely'

    $uninstallRoot = Join-Path $env:LOCALAPPDATA 'spotify-remastered'
    $uninstallScripts = Join-Path $uninstallRoot 'scripts'
    New-Item -ItemType Directory -Path $uninstallScripts | Out-Null
    @'
function Stop-RemasteredHelpers { param($Root) [IO.File]::WriteAllText((Join-Path $Root 'stopped'), 'yes') }
function Remove-ManagedPath {
    param($Root, $Relative)
    $path = [IO.Path]::GetFullPath((Join-Path $Root $Relative))
    if (-not $path.StartsWith([IO.Path]::GetFullPath($Root) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'invalid fixture path' }
    [IO.File]::Delete($path)
}
'@ | Set-Content -LiteralPath (Join-Path $uninstallScripts 'installer-common.ps1')
    function Get-Command { param($Name, $CommandType, $ErrorAction) throw 'simulated missing cli' }
    $failedSafely = $false
    try { & (Join-Path $repo 'winDel.ps1') }
    catch { $failedSafely = $_.Exception.Message -like '*Background helpers and startup entries were removed*' }
    Assert $failedSafely 'missing cli did not report partial cleanup'
    Assert (Test-Path -LiteralPath (Join-Path $uninstallRoot 'stopped')) 'missing-cli uninstall did not stop owned helper'
    Assert (-not (Test-Path -LiteralPath (Join-Path $startup 'Spotify Remastered Download Helper.vbs'))) 'missing-cli uninstall left startup entry'
    Assert (Test-Path -LiteralPath $uninstallScripts) 'missing-cli uninstall removed recovery tooling'
    Write-Output 'windows installer recovery: 2 scenarios passed'
} finally {
    $env:APPDATA = $previousAppData
    $env:LOCALAPPDATA = $previousLocalAppData
    if ([IO.Path]::GetFullPath($testRoot) -ne $expectedRoot -or -not $testRoot.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase)) { throw 'invalid test cleanup path' }
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
