$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$common = [IO.File]::ReadAllText((Join-Path $repo 'hazy\extensions\installer-common.ps1'))
$ast = [Management.Automation.Language.Parser]::ParseInput($common, [ref]$null, [ref]$null)
$function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Remove-ManagedPath' }, $true)
Invoke-Expression $function.Extent.Text
$source = [IO.File]::ReadAllText((Join-Path $repo 'winDel.ps1'))
$cleanup = $source.Substring($source.IndexOf('if ($DeleteLocalSongs)'))
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('spotify-uninstall-test-' + [Guid]::NewGuid().ToString('N'))
$expectedRoot = [IO.Path]::GetFullPath($testRoot)
try {
    $root = Join-Path $testRoot 'support'
    foreach ($name in @('dependencies','cache','data','backups','scripts','local songs','theme-backup-test','unrelated')) {
        $path = Join-Path $root $name
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        [IO.File]::WriteAllText((Join-Path $path 'file'), 'fixture')
    }
    [IO.File]::WriteAllText((Join-Path $root 'about-this-folder.txt'), 'fixture')
    Invoke-Expression $cleanup
    foreach ($name in @('dependencies','cache','data','backups','scripts','theme-backup-test','about-this-folder.txt')) {
        if (Test-Path -LiteralPath (Join-Path $root $name)) { throw "managed files remained: $name" }
    }
    foreach ($name in @('local songs','unrelated')) {
        if (-not (Test-Path -LiteralPath (Join-Path (Join-Path $root $name) 'file'))) { throw "user file removed: $name" }
    }
    $DeleteLocalSongs = $true
    Invoke-Expression $cleanup
    if (Test-Path -LiteralPath (Join-Path $root 'local songs')) { throw 'confirmed songs were not removed' }
    if (-not (Test-Path -LiteralPath (Join-Path $root 'unrelated'))) { throw 'unrelated files were removed' }
    $root = Join-Path $testRoot 'empty-support'
    New-Item -ItemType Directory -Path (Join-Path $root 'dependencies') -Force | Out-Null
    Invoke-Expression $cleanup
    if (Test-Path -LiteralPath $root) { throw 'empty support directory remained' }
    Write-Output 'uninstall cleanup: 2 scenarios passed'
} finally {
    if ([IO.Path]::GetFullPath($testRoot) -ne $expectedRoot -or -not $expectedRoot.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase)) { throw 'invalid fixture cleanup' }
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
