param([switch]$NoListen)

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$script:downloads = @{}
$script:playlists = @{}
$script:singleOrder = 0
$script:lastLogCleanup = [DateTime]::MinValue

function Clear-DownloadLogs {
    if (([DateTime]::UtcNow - $script:lastLogCleanup).TotalMinutes -lt 10) { return }
    $script:lastLogCleanup = [DateTime]::UtcNow
    $root = Join-Path $env:LOCALAPPDATA 'spotify-remastered\cache\download-logs'
    if (-not (Test-Path -LiteralPath $root)) { return }
    $active = @($script:downloads.Values | Where-Object { $_.Status -eq 'downloading' } | ForEach-Object { $_.JobDir })
    foreach ($batch in $script:playlists.Values) { $active += @($batch.Active.Values | ForEach-Object { $_.JobDir }) }
    $jobs = @(Get-ChildItem -LiteralPath $root -Directory | Where-Object { $_.Name -match '^[a-f0-9]{32}$' -and $_.FullName -notin $active } | Sort-Object LastWriteTime -Descending)
    for ($i = 0; $i -lt $jobs.Count; $i++) {
        if ($i -ge 20 -or $jobs[$i].LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7)) {
            if ($jobs[$i].Parent.FullName -eq [IO.Path]::GetFullPath($root)) {
                Remove-Item -LiteralPath $jobs[$i].FullName -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

function Stop-Download($dl) {
    if ($dl.Process -and -not $dl.Process.HasExited) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $dl.Process.Id /T /F 2>&1 | Out-Null
    }
}

function Start-Download($trackId, $folder, $spotdl, $ffmpeg, $jobsDir, $fileName = $null) {
    if ($trackId -notmatch '^[a-zA-Z0-9]{22}$') { throw 'Invalid Spotify track ID.' }
    if (-not (Test-Path -LiteralPath $spotdl -PathType Leaf)) { throw 'The song downloader is missing. Please reinstall Spotify Remastered.' }
    if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) { throw 'FFmpeg is missing.' }
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw 'The download folder does not exist.' }
    $jobDir = Join-Path $jobsDir ([Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $jobDir -Force | Out-Null
    # relative output avoids spotdl sanitizing dots in parent directory names.
    $output = '{title}.{output-ext}'
    $argsText = "download `"https://open.spotify.com/track/$trackId`" --output `"$output`" --ffmpeg `"$ffmpeg`" --format mp3 --audio youtube-music youtube --max-retries 2"
    $runner = Join-Path $env:LOCALAPPDATA 'spotify-remastered\scripts\download-runner.py'
    $python = Join-Path ([System.IO.Path]::GetDirectoryName($spotdl)) 'python.exe'
    $executable = $spotdl
    if ((Test-Path -LiteralPath $runner -PathType Leaf) -and (Test-Path -LiteralPath $python -PathType Leaf)) {
        $executable = $python
        $argsText = "`"$runner`" $argsText"
    }
    # drain both streams to logs; unread redirected pipes can deadlock.
    $proc = Start-Process -FilePath $executable -ArgumentList $argsText -WorkingDirectory $jobDir -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $jobDir 'stdout.log') -RedirectStandardError (Join-Path $jobDir 'stderr.log')
    $processHandle = $proc.Handle
    return @{ Process = $proc; Status = 'downloading'; Message = $null; StartedAt = [DateTime]::UtcNow;
        JobDir = $jobDir; Folder = $folder; FileName = $fileName; TimeoutSeconds = 600; CompletedAt = $null }
}

function Update-Download($dl) {
    if ($dl.Status -ne 'downloading') { return }
    $dl.Process.Refresh()
    if ($dl.Process.HasExited) {
        $dl.Process.WaitForExit()
        # spotdl can exit zero after provider errors; require audio from this job.
        $files = @(Get-ChildItem -LiteralPath $dl.JobDir -File -Filter '*.mp3' | Where-Object { $_.Length -gt 0 })
        if ($dl.Process.ExitCode -ne 0 -or $files.Count -eq 0) {
            $dl.Status = 'error'
            $dl.Message = 'The song could not be downloaded. Please try again; details are in the download logs.'
        } else {
            try {
                foreach ($file in $files) {
                    $name = if ($dl.FileName) { $dl.FileName } else { $file.Name }
                    Move-Item -LiteralPath $file.FullName -Destination (Join-Path $dl.Folder $name) -Force -ErrorAction Stop
                }
                $dl.Status = 'done'
            } catch {
                $dl.Status = 'error'
                $dl.Message = 'The download finished, but the file could not be saved to the chosen folder.'
            }
        }
    } elseif (([DateTime]::UtcNow - $dl.StartedAt).TotalSeconds -ge $dl.TimeoutSeconds) {
        Stop-Download $dl
        $dl.Status = 'error'
        $dl.Message = 'Download timed out after 10 minutes. Please try again.'
    }
    if ($dl.Status -ne 'downloading') { $dl.CompletedAt = [DateTime]::UtcNow }
}

function Update-Singles {
    foreach ($dl in @($script:downloads.Values)) { Update-Download $dl }
    if (@($script:downloads.Values | Where-Object { $_.Status -eq 'downloading' }).Count -gt 0) { return }
    $next = $script:downloads.Values | Where-Object { $_.Status -eq 'queued' } | Sort-Object Order | Select-Object -First 1
    if (-not $next) { return }
    try {
        $script:downloads[$next.Id] = Start-Download $next.Id $next.Folder $next.Tools.Spotdl $next.Tools.FFmpeg $next.Tools.JobsDir
    } catch {
        $next.Status = 'error'
        $next.Message = $_.Exception.Message
        $next.CompletedAt = [DateTime]::UtcNow
    }
}

function Safe-Name($name) {
    $value = [regex]::Replace([string]$name, '[<>:"/\\|?*\x00-\x1f]', '_').Trim().TrimEnd('.')
    if (-not $value) { $value = 'Playlist' }
    if ($value -match '^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)') { $value = '_' + $value }
    if ($value.Length -gt 80) { $value = $value.Substring(0, 80).TrimEnd('.') }
    return $value
}

function Select-DownloadFolder {
    $form = New-Object System.Windows.Forms.Form
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    try {
        $form.TopMost = $true
        $form.Size = New-Object System.Drawing.Size(1, 1)
        $form.StartPosition = 'CenterScreen'
        $form.FormBorderStyle = 'None'
        $form.Opacity = 0
        $form.Show()
        [WinHelper]::SetForegroundWindow($form.Handle) | Out-Null
        $dialog.ValidateNames = $false
        $dialog.CheckFileExists = $false
        $dialog.CheckPathExists = $true
        $dialog.FileName = 'Select Folder'
        $dialog.Title = 'Select download location'
        if ($dialog.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
            return [System.IO.Path]::GetDirectoryName($dialog.FileName)
        }
    } finally { $dialog.Dispose(); $form.Dispose() }
}

function Get-Downloader {
    $customDir = Join-Path $env:LOCALAPPDATA 'spotify-remastered'
    $spotdl = Join-Path $customDir 'dependencies\spotdl.exe'
    $pythonSpotdl = Join-Path $customDir 'dependencies\downloader\Scripts\spotdl.exe'
    if (Test-Path -LiteralPath $pythonSpotdl -PathType Leaf) { $spotdl = $pythonSpotdl }
    New-Item -ItemType Directory -Force -Path (Join-Path $customDir 'dependencies') | Out-Null
    $ffmpeg = Join-Path $customDir 'dependencies\ffmpeg.exe'
    if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) {
        $existing = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
        if (-not $existing) { $existing = Join-Path $env:USERPROFILE '.spotdl\ffmpeg.exe' }
        $temporary = Join-Path $customDir 'dependencies\ffmpeg.pending.exe'
        try {
            if (Test-Path -LiteralPath $existing -PathType Leaf) {
                Copy-Item -LiteralPath $existing -Destination $temporary -ErrorAction Stop
            } else {
                $arch = if ([Environment]::Is64BitOperatingSystem) { 'x64' } else { 'ia32' }
                Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/eugeneware/ffmpeg-static/releases/download/b4.4/win32-$arch" -OutFile $temporary -TimeoutSec 120
            }
            $encoders = & $temporary -hide_banner -encoders 2>&1
            if ($LASTEXITCODE -ne 0 -or ($encoders | Out-String) -notmatch '\blibmp3lame\b') { throw 'FFmpeg is not compatible with MP3 downloads.' }
            Move-Item -LiteralPath $temporary -Destination $ffmpeg -Force -ErrorAction Stop
        } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
    }
    return @{ Spotdl = $spotdl; FFmpeg = $ffmpeg; JobsDir = (Join-Path $customDir 'cache\download-logs') }
}

function Start-Playlist($body, $folder, $tools) {
    $tracks = @($body.tracks)
    if ($body.id -notmatch '^[a-zA-Z0-9]{22}$' -or $tracks.Count -eq 0 -or $tracks.Count -gt 10000) { throw 'Invalid or empty playlist.' }
    foreach ($track in $tracks) {
        if ($track.id -notmatch '^[a-zA-Z0-9]{22}$') { throw 'Invalid Spotify track ID in playlist.' }
    }
    $destination = Join-Path $folder (Safe-Name $body.name)
    New-Item -ItemType Directory -Path $destination -Force -ErrorAction Stop | Out-Null
    $indexDir = Join-Path $tools.JobsDir 'playlist-index'
    New-Item -ItemType Directory -Path $indexDir -Force | Out-Null
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($destination.ToLowerInvariant()))).Replace('-', '') }
    finally { $sha.Dispose() }
    $indexPath = Join-Path $indexDir ($key + '.json')
    $index = @{}
    if (Test-Path -LiteralPath $indexPath) {
        try {
            $stored = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8 | ConvertFrom-Json
            foreach ($property in $stored.PSObject.Properties) {
                if ([System.IO.Path]::GetFileName([string]$property.Value) -eq $property.Value) { $index[$property.Name] = [string]$property.Value }
            }
        } catch {}
    }
    $reserved = @{}
    foreach ($id in $index.Keys) { $reserved[$index[$id]] = $id }
    $queue = New-Object System.Collections.Queue
    $seen = @{}
    $skipped = 0
    foreach ($track in $tracks) {
        if ($seen.ContainsKey($track.id)) { $skipped++; continue }
        $seen[$track.id] = $true
        $base = Safe-Name $track.name
        $name = if ($index.ContainsKey($track.id)) { $index[$track.id] } else { $base + '.mp3' }
        $suffix = 2
        while ($reserved.ContainsKey($name) -and $reserved[$name] -ne $track.id) {
            $name = $base + ' (' + $suffix + ').mp3'
            $suffix++
        }
        $reserved[$name] = $track.id
        $path = Join-Path $destination $name
        if ((Test-Path -LiteralPath $path -PathType Leaf) -and (Get-Item -LiteralPath $path).Length -gt 0) { $index[$track.id] = $name; $skipped++; continue }
        $queue.Enqueue(@{ Id = $track.id; Name = $track.name; FileName = $name })
    }
    return @{ Status = 'downloading'; Queue = $queue; Active = @{}; Saved = 0; Skipped = $skipped;
        Total = $tracks.Count; Name = $body.name; Id = $body.id; Failed = (New-Object System.Collections.ArrayList); Folder = $destination;
        Tools = $tools; Index = $index; IndexPath = $indexPath; CompletedAt = $null }
}

function Update-Playlist($batch) {
    if ($batch.Status -ne 'downloading') { return }
    foreach ($id in @($batch.Active.Keys)) {
        $entry = $batch.Active[$id]
        Update-Download $entry.Download
        if ($entry.Download.Status -eq 'downloading') { continue }
        if ($entry.Download.Status -eq 'done') {
            $batch.Saved++
            $batch.Index[$id] = $entry.Track.FileName
            try { $batch.Index | ConvertTo-Json -Compress | Set-Content -LiteralPath $batch.IndexPath -Encoding UTF8 -ErrorAction Stop } catch {}
        }
        else { $batch.Failed.Add(@{ id = $id; name = $entry.Track.Name; message = $entry.Download.Message }) | Out-Null }
        $batch.Active.Remove($id)
    }
    while ($batch.Active.Count -lt 1 -and $batch.Queue.Count -gt 0) {
        $track = $batch.Queue.Dequeue()
        try {
            $dl = Start-Download $track.Id $batch.Folder $batch.Tools.Spotdl $batch.Tools.FFmpeg $batch.Tools.JobsDir $track.FileName
            $batch.Active[$track.Id] = @{ Download = $dl; Track = $track }
        } catch { $batch.Failed.Add(@{ id = $track.Id; name = $track.Name; message = $_.Exception.Message }) | Out-Null }
    }
    if ($batch.Queue.Count -eq 0 -and $batch.Active.Count -eq 0) {
        $batch.Status = 'done'
        $batch.CompletedAt = [DateTime]::UtcNow
    }
}

function Stop-Playlist($batch) {
    foreach ($entry in @($batch.Active.Values)) { Stop-Download $entry.Download }
    $batch.Active.Clear()
    $batch.Queue.Clear()
    $batch.Status = 'cancelled'
    $batch.CompletedAt = [DateTime]::UtcNow
}

function Playlist-Status($batch) {
    return @{ status = $batch.Status; saved = $batch.Saved; skipped = $batch.Skipped; total = $batch.Total;
        failed = @($batch.Failed.ToArray()); folder = $batch.Folder;
        current = @($batch.Active.Values | ForEach-Object { $_.Track.Name }); currentIds = @($batch.Active.Keys) }
}

$linkModule = Join-Path $PSScriptRoot 'link-helper.ps1'
if (Test-Path -LiteralPath $linkModule) { . $linkModule }
if ($NoListen) { return }
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:27382/")
$listener.Start()

function Respond($ctx, $body) {
    $buf = [System.Text.Encoding]::UTF8.GetBytes($body)
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentType = "application/json"
    $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $ctx.Response.ContentLength64 = $buf.Length
    $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    $ctx.Response.Close()
}

try { while ($listener.IsListening) {
    $pending = $listener.BeginGetContext($null, $null)
    while (-not $pending.AsyncWaitHandle.WaitOne(1000)) {
        Update-Singles
        foreach ($batch in @($script:playlists.Values)) { Update-Playlist $batch }
        Clear-DownloadLogs
        if (Get-Command Clear-LinkJobs -ErrorAction SilentlyContinue) { Clear-LinkJobs }
    }
    if (Get-Command Update-LocalCatalogue -ErrorAction SilentlyContinue) { Update-LocalCatalogue }
    $ctx = $listener.EndGetContext($pending)
    $pending.AsyncWaitHandle.Close()
    foreach ($id in @($script:downloads.Keys)) {
        $dl = $script:downloads[$id]
        Update-Download $dl
        if ($dl.CompletedAt -and ([DateTime]::UtcNow - $dl.CompletedAt).TotalMinutes -gt 30) {
            $script:downloads.Remove($id)
        }
    }
    Update-Singles
    foreach ($id in @($script:playlists.Keys)) {
        $batch = $script:playlists[$id]
        Update-Playlist $batch
        if ($batch.CompletedAt -and ([DateTime]::UtcNow - $batch.CompletedAt).TotalMinutes -gt 30) { $script:playlists.Remove($id) }
    }
    if ($ctx.Request.HttpMethod -eq 'OPTIONS') {
        $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        $ctx.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
        Respond $ctx '{}'
        continue
    }
    $route = $ctx.Request.Url.AbsolutePath
    if ($route -in @('/link-preview', '/link-download', '/link-status', '/link-cancel', '/link-folder', '/link-local')) {
        Handle-Link $ctx $route
        continue
    }

    switch ($route) {
        "/open-folder" {
            try {
                $id = $ctx.Request.QueryString['id']
                $records = if ($ctx.Request.QueryString['kind'] -eq 'playlist') { $script:playlists } else { $script:downloads }
                if (-not $id -or -not $records.ContainsKey($id)) { throw 'The download folder is no longer available.' }
                $folder = $records[$id].Folder
                if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw 'The download folder no longer exists.' }
                Invoke-Item -LiteralPath $folder -ErrorAction Stop
                Respond $ctx '{"status":"opened"}'
            } catch { Respond $ctx (@{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress) }
        }
        "/playlist" {
            try {
                if ($ctx.Request.HttpMethod -ne 'POST' -or $ctx.Request.ContentLength64 -gt 2097152) { throw 'Invalid playlist request.' }
                $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
                try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
                if ($body.id -notmatch '^[a-zA-Z0-9]{22}$') { throw 'Invalid Spotify playlist ID.' }
                $batchId = if ($body.kind -eq 'album') { 'album-' + $body.id } else { $body.id }
                if ($script:playlists.ContainsKey($batchId) -and $script:playlists[$batchId].Status -eq 'downloading') {
                    Respond $ctx '{"status":"already_downloading"}'
                    break
                }
                $folder = Select-DownloadFolder
                if (-not $folder) { Respond $ctx '{"status":"no_folder"}'; break }
                $batch = Start-Playlist $body $folder (Get-Downloader)
                $script:playlists[$batchId] = $batch
                Update-Playlist $batch
                Respond $ctx '{"status":"started"}'
            } catch { Respond $ctx (@{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress) }
        }
        "/playlist-status" {
            $id = $ctx.Request.QueryString['id']
            if ($id -and $script:playlists.ContainsKey($id)) {
                Update-Playlist $script:playlists[$id]
                Respond $ctx ((Playlist-Status $script:playlists[$id]) | ConvertTo-Json -Depth 5 -Compress)
            } else { Respond $ctx '{"status":"idle"}' }
        }
        "/playlist-cancel" {
            $id = $ctx.Request.QueryString['id']
            if ($id -and $script:playlists.ContainsKey($id)) { Stop-Playlist $script:playlists[$id] }
            Respond $ctx '{"status":"cancelled"}'
        }

        "/download" {
            $trackId = $ctx.Request.QueryString["id"]
            if ($trackId -notmatch '^[a-zA-Z0-9]{22}$') {
                Respond $ctx '{"status":"error","message":"Invalid Spotify track ID."}'
                break
            }

            if ($script:downloads.ContainsKey($trackId) -and $script:downloads[$trackId].Status -in @('downloading', 'queued')) {
                Respond $ctx '{"status":"already_downloading"}'
                break
            }

            try {
            $downloadFolder = Select-DownloadFolder
            if (-not $downloadFolder) { Respond $ctx '{"status":"no_folder"}'; break }
            $tools = Get-Downloader
            $script:singleOrder++
            $script:downloads[$trackId] = @{ Id = $trackId; Folder = $downloadFolder; Tools = $tools; Order = $script:singleOrder;
                Status = 'queued'; Message = $null; CompletedAt = $null; Process = $null }
            Update-Singles

            Respond $ctx (@{ status = 'started'; jobStatus = $script:downloads[$trackId].Status } | ConvertTo-Json -Compress)
            } catch {
                Respond $ctx (@{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress)
            }
        }

        "/status" {
            Update-Singles
            $trackId = $ctx.Request.QueryString["id"]
            if ($trackId -and $script:downloads.ContainsKey($trackId)) {
                $dl = $script:downloads[$trackId]
                Update-Download $dl
                Respond $ctx (@{ status = $dl.Status; message = $dl.Message } | ConvertTo-Json -Compress)
            } else {
                Respond $ctx '{"status":"idle"}'
            }
        }

        "/cancel" {
            $trackId = $ctx.Request.QueryString["id"]
            if ($trackId -and $script:downloads.ContainsKey($trackId)) {
                $dl = $script:downloads[$trackId]
                Stop-Download $dl
                $dl.Status = 'cancelled'
                $dl.CompletedAt = [DateTime]::UtcNow
            }
            Respond $ctx '{"status":"cancelled"}'
        }

        default {
            $buf = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
            $ctx.Response.StatusCode = 404
            $ctx.Response.ContentLength64 = $buf.Length
            $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
            $ctx.Response.Close()
        }
    }
} } finally {
    foreach ($dl in @($script:downloads.Values)) { Stop-Download $dl }
    foreach ($batch in @($script:playlists.Values)) { Stop-Playlist $batch }
    if ($script:localCatalogueJob) {
        try { if (-not $script:localCatalogueJob.Process.HasExited) { $script:localCatalogueJob.Process.Kill() } } catch {}
        foreach ($client in $script:localCatalogueJob.Clients) { try { $client.Response.Close() } catch {} }
        $script:localCatalogueJob.Process.Dispose()
    }
    $listener.Close()
}
