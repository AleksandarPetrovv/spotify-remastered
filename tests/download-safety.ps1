$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$tokens = $null
$errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $repo 'hazy\extensions\download-helper.ps1'), [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw ($errors | Out-String) }
$names = @('Move-DownloadAudio','Safe-Name','Get-DownloadIndexPath','Read-DownloadIndex','Save-DownloadIndex','Start-Playlist','Update-Download','Update-Singles')
foreach ($definition in $ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -in $names }, $true)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
function Assert($condition, $message) { if (-not $condition) { throw $message } }
$testRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) ('spotify-download-test-' + [Guid]::NewGuid().ToString('N'))))
$expectedRoot = $testRoot
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $output = Join-Path $testRoot 'output'
    $job = Join-Path $testRoot 'job'
    $logs = Join-Path $testRoot 'logs'
    New-Item -ItemType Directory -Path $output,$job,$logs | Out-Null
    [IO.File]::WriteAllText((Join-Path $output 'song.mp3'), 'unrelated')
    [IO.File]::WriteAllText((Join-Path $job 'song.mp3'), 'downloaded')
    $process = [pscustomobject]@{ HasExited = $true; ExitCode = 0 }
    $process | Add-Member ScriptMethod Refresh {}
    $process | Add-Member ScriptMethod WaitForExit {}
    $identifier = 'A' * 22
    $indexPath = Get-DownloadIndexPath $output $logs
    $download = @{ Status = 'downloading'; SharedWorker = $false; Process = $process; Stdout = $null;
        JobDir = $job; Folder = $output; FileName = $null; TrackId = $identifier; IndexPath = $indexPath; CompletedAt = $null }
    Update-Download $download
    Assert ($download.Status -eq 'done') 'single download did not complete'
    Assert ([IO.File]::ReadAllText((Join-Path $output 'song.mp3')) -eq 'unrelated') 'existing audio was overwritten'
    Assert ([IO.File]::ReadAllText((Join-Path $output 'song (2).mp3')) -eq 'downloaded') 'new audio was not saved separately'
    Assert ((Read-DownloadIndex $indexPath)[$identifier] -eq 'song (2).mp3') 'single index has the wrong final name'

    $script:downloads = @{ $identifier = @{ Id = $identifier; Status = 'queued'; Folder = $output;
        Tools = @{ JobsDir = $logs }; Process = $null; Order = 1; CompletedAt = $null } }
    Update-Singles
    Assert ($script:downloads[$identifier].Status -eq 'done') 'repeat single download was not reused'

    $playlistFolder = Join-Path $output 'playlist (.mp3)'
    New-Item -ItemType Directory -Path $playlistFolder | Out-Null
    [IO.File]::WriteAllText((Join-Path $playlistFolder 'song.mp3'), 'unrelated playlist audio')
    $body = @{ id = 'B' * 22; name = 'playlist'; tracks = @(@{ id = $identifier; name = 'song' }) }
    $batch = Start-Playlist $body $output @{ JobsDir = $logs }
    Assert ($batch.Skipped -eq 0 -and $batch.Queue.Count -eq 1) 'unindexed audio was incorrectly counted saved'
    Assert ($batch.Queue.Peek().FileName -eq 'song (2).mp3') 'unrelated playlist filename was not reserved separately'

    $caseBody = @{ id = 'C' * 22; name = 'case playlist'; tracks = @(@{ id = $identifier; name = 'Song' }, @{ id = 'D' * 22; name = 'song' }) }
    $caseBatch = Start-Playlist $caseBody $output @{ JobsDir = $logs }
    $first = $caseBatch.Queue.Dequeue().FileName
    $second = $caseBatch.Queue.Dequeue().FileName
    Assert ($first -ine $second) 'case-equivalent track names collided'
    $caseFolder = $caseBatch.Folder
    [IO.File]::WriteAllText((Join-Path $caseFolder 'Song.mp3'), 'legacy ambiguous audio')
    Save-DownloadIndex $caseBatch.IndexPath @{ $identifier = 'Song.mp3'; ('D' * 22) = 'song.mp3' }
    $ambiguous = Start-Playlist $caseBody $output @{ JobsDir = $logs }
    Assert ($ambiguous.Skipped -eq 0 -and $ambiguous.Queue.Count -eq 2) 'ambiguous legacy index incorrectly identified existing audio'
    foreach ($format in @('mp3','wav','ogg','flac')) {
        $formatBody = @{id='E'*22;name='formats';format=$format;tracks=@(@{id=$identifier;name='song'})}
        $formatBatch = Start-Playlist $formatBody $output @{JobsDir=$logs}
        $track = $formatBatch.Queue.Peek()
        Assert ([IO.Path]::GetExtension($track.FileName) -eq ('.'+$format)) 'incorrect format extension'
        [IO.File]::WriteAllText((Join-Path $formatBatch.Folder $track.FileName),'saved audio')
        Save-DownloadIndex $formatBatch.IndexPath @{ $identifier=$track.FileName }
        $repeat = Start-Playlist $formatBody $output @{JobsDir=$logs}
        Assert ($repeat.Skipped -eq 1) 'repeat format download was not skipped'
    }
    $script:testStarted = @()
    function Start-Download($trackId,$folder,$spotdl,$ffmpeg,$jobsDir,$fileName,$format) {
        $script:testStarted += $format
        $process = [pscustomobject]@{HasExited=$false}
        $process | Add-Member ScriptMethod Refresh {}
        return @{Status='downloading';Format=$format;Process=$process;SharedWorker=$false;StartedAt=[DateTime]::UtcNow;TimeoutSeconds=600}
    }
    $script:downloads = @{}
    $parallelId = 'Z' * 22
    foreach($format in @('mp3','flac')) {
        $key=$parallelId+'-'+$format
        $script:downloads[$key]=@{Id=$parallelId;Key=$key;Folder=$output;Tools=@{JobsDir=$logs};Order=1;Status='queued';Format=$format}
    }
    Update-Singles
    Assert ($script:testStarted.Count -eq 2) 'different formats did not start independently'
    Update-Singles
    Assert ($script:testStarted.Count -eq 2) 'active same-format jobs were started again'
    Write-Output 'windows download safety: existing safety and four format scenarios passed'
} finally {
    if ([IO.Path]::GetFullPath($testRoot) -ne $expectedRoot -or -not $testRoot.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase)) { throw 'invalid test cleanup path' }
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
