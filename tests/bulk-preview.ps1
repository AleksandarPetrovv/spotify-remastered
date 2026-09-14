$ErrorActionPreference = 'Stop'
$script:collectionMetadataTool = $null
Add-Type -AssemblyName System.Web
$repo = Split-Path $PSScriptRoot
$source = [IO.File]::ReadAllText((Join-Path $repo 'hazy\extensions\link-helper.ps1'))
$ast = [Management.Automation.Language.Parser]::ParseInput($source,[ref]$null,[ref]$null)
foreach ($name in @('Get-LinkUrl','Update-Link')) {
    $node = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name },$true)
    Invoke-Expression $node.Extent.Text
}
if ((Get-LinkUrl 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLtest' $true) -ne 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLtest') { throw 'collection context was discarded' }
if ((Get-LinkUrl 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLtest') -ne 'https://www.youtube.com/watch?v=jNQXAC9IVRw') { throw 'single context changed' }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('bulk-preview-test-' + [Guid]::NewGuid().ToString('N'))
$expectedRoot = [IO.Path]::GetFullPath($testRoot)
try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    $process = [pscustomobject]@{ HasExited=$true; ExitCode=0 }
    $process | Add-Member ScriptMethod Refresh {}
    $process | Add-Member ScriptMethod WaitForExit {}
    $info = @{_type='playlist'; title='mix'; extractor='youtube:tab'; entries=@(@{id='jNQXAC9IVRw';title='first'},@{id='dQw4w9WgXcQ';title='second'})}
    $info | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $testRoot 'stdout.log') -Encoding UTF8
    $job = @{Status='previewing';Dir=$testRoot;Process=$process}
    Update-Link $job
    if ($job.Status -ne 'ready' -or $job.Entries.Count -ne 2 -or $job.Entries[0].title -ne 'first') { throw 'collection preview/order failed' }
    $info.extractor='soundcloud:set'
    $info.entries=@(@{url='https://api.soundcloud.com/tracks/123';title='song'})
    $info | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $testRoot 'stdout.log') -Encoding UTF8
    $job = @{Status='previewing';Dir=$testRoot;Process=$process}
    Update-Link $job
    if ($job.Status -ne 'ready' -or $job.Source -ne 'SoundCloud' -or $job.Entries.Count -ne 1) { throw 'soundcloud preview failed' }
    Write-Output 'bulk preview: youtube context/order and soundcloud entries passed'
} finally {
    if ([IO.Path]::GetFullPath($testRoot) -ne $expectedRoot -or -not $expectedRoot.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase)) { throw 'invalid fixture cleanup' }
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
