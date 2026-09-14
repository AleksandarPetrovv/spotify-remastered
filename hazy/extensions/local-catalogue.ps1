param([string]$Root, [string]$FFmpeg, [string]$OutputPath)
$ErrorActionPreference = 'Stop'
$active = New-Object 'System.Collections.Generic.List[object]'
try {
    $folder = Join-Path $Root 'Local Songs'
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    $cachePath = Join-Path $Root 'cache\local-catalogue.json'
    $previous = @{}
    if (Test-Path -LiteralPath $cachePath) {
        try { foreach ($entry in @(Get-Content -LiteralPath $cachePath -Raw -Encoding UTF8 | ConvertFrom-Json)) { $previous[$entry.path] = $entry } } catch {}
    }
    $covers = @{}
    foreach ($index in @(Get-ChildItem -LiteralPath (Join-Path $Root 'data\import-index') -Filter '*.json' -ErrorAction SilentlyContinue)) {
        try { $record = Get-Content -LiteralPath $index.FullName -Raw -Encoding UTF8 | ConvertFrom-Json; $covers[$record.File] = $record.Cover } catch {}
    }
    $files = @(Get-ChildItem -LiteralPath $folder -File -Filter '*.mp3' | Where-Object { $_.Length -gt 0 })
    $entries = @{}
    $queue = New-Object 'System.Collections.Generic.Queue[object]'
    foreach ($file in $files) {
        $stamp = "$($file.Length):$($file.LastWriteTimeUtc.Ticks)"
        if ($previous.ContainsKey($file.FullName) -and $previous[$file.FullName].stamp -eq $stamp) {
            $entries[$file.FullName] = $previous[$file.FullName]
        } else { $queue.Enqueue(@{ File = $file; Stamp = $stamp }) }
    }
    while ($queue.Count -or $active.Count) {
        while ($queue.Count -and $active.Count -lt 2) {
            $item = $queue.Dequeue()
            $process = New-Object Diagnostics.Process
            $process.StartInfo.FileName = $FFmpeg
            $process.StartInfo.Arguments = "-hide_banner -i `"$($item.File.FullName)`" -f ffmetadata -"
            $process.StartInfo.UseShellExecute = $false
            $process.StartInfo.CreateNoWindow = $true
            $process.StartInfo.RedirectStandardOutput = $true
            $process.StartInfo.RedirectStandardError = $true
            $process.StartInfo.StandardOutputEncoding = [Text.Encoding]::UTF8
            $process.StartInfo.StandardErrorEncoding = [Text.Encoding]::UTF8
            try {
                $process.Start() | Out-Null
                $item.Process = $process
                $item.Out = $process.StandardOutput.ReadToEndAsync()
                $item.Err = $process.StandardError.ReadToEndAsync()
                $item.Start = [DateTime]::UtcNow
                $active.Add($item)
            } catch { $process.Dispose() }
        }
        foreach ($item in @($active.ToArray())) {
            $process = $item.Process
            if (-not $process.HasExited -and ([DateTime]::UtcNow - $item.Start).TotalSeconds -lt 10) { continue }
            try {
                if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit(); continue }
                if ($process.ExitCode -ne 0) { continue }
                $tags = @{}
                foreach ($line in ($item.Out.Result -split "`n")) {
                    if ($line -match '^([^=]+)=(.*)$') { $tags[$Matches[1]] = [regex]::Replace($Matches[2].TrimEnd("`r"), '\\(.)', '$1') }
                }
                $duration = 0
                if ($item.Err.Result -match 'Duration: (\d+):(\d+):(\d+(?:\.\d+)?)') { $duration = [double]$Matches[1]*3600 + [double]$Matches[2]*60 + [double]::Parse($Matches[3], [Globalization.CultureInfo]::InvariantCulture) }
                $entries[$item.File.FullName] = @{ path = $item.File.FullName; stamp = $item.Stamp; tags = $tags; duration = $duration }
            } finally { $process.Dispose(); $active.Remove($item) | Out-Null }
        }
        if ($active.Count) { Start-Sleep -Milliseconds 25 }
    }
    $songs = @()
    foreach ($file in $files) {
        $entry = $entries[$file.FullName]
        if (-not $entry) { continue }
        $songs += @{ title = $(if ($entry.tags.title) { $entry.tags.title } else { $file.BaseName }); artist = [string]$entry.tags.artist; source = [string]$entry.tags.album; duration = $entry.duration; cover = $covers[$file.FullName]; folder = $folder }
    }
    $cacheJson = ConvertTo-Json -InputObject @($entries.Values) -Depth 6 -Compress
    [IO.File]::WriteAllText("$cachePath.tmp", $cacheJson, (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath "$cachePath.tmp" -Destination $cachePath -Force
    $payload = @{ status = 'done'; songs = @($songs); folder = $folder }
} catch { $payload = @{ status = 'error'; message = 'Could not read local songs. Try again.' } }
finally {
    foreach ($item in $active) { try { if (-not $item.Process.HasExited) { $item.Process.Kill() }; $item.Process.Dispose() } catch {} }
}
[IO.File]::WriteAllText($OutputPath, ($payload | ConvertTo-Json -Depth 6 -Compress), (New-Object Text.UTF8Encoding($false)))
