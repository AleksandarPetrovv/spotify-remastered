$script:linkJobs = @{}
$script:linkRoot = Join-Path $env:LOCALAPPDATA 'spotify-remastered'
$script:lastLinkCleanup = [DateTime]::MinValue

function Quote-LinkMetadata($value) {
    $quote = [string][char]39
    $escapedQuote = $quote + [char]34 + $quote + [char]34 + $quote
    return $quote + $value.Replace('\', '\\').Replace($quote, $escapedQuote) + $quote
}

function Link-IndexPath($url) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($url))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
    $dir = Join-Path $script:linkRoot 'data\import-index'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    return Join-Path $dir "$key.json"
}

function Save-LinkIndex($job) {
    $path = Link-IndexPath $job.Url
    @{ File = $job.File; Title = $job.Title; Artist = $job.Artist; Duration = $job.Duration; Source = $job.Source; Cover = $job.Cover } | ConvertTo-Json -Compress | Set-Content -LiteralPath "$path.tmp" -Encoding UTF8
    Move-Item -LiteralPath "$path.tmp" -Destination $path -Force
}

function Find-SavedLink($job) {
    $folder = Join-Path $script:linkRoot 'Local Songs'
    $path = Link-IndexPath $job.Url
    if (Test-Path -LiteralPath $path) {
        $record = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($record.File)) -eq $folder -and (Test-Path -LiteralPath $record.File) -and (Get-Item -LiteralPath $record.File).Length -gt 0) { return $record }
    }
    if (-not (Test-Path -LiteralPath $folder)) { return }
    $ffmpeg = (Get-Downloader).FFmpeg
    foreach ($file in @(Get-ChildItem -LiteralPath $folder -File -Filter '*.mp3')) {
        $process = New-Object Diagnostics.Process
        $process.StartInfo.FileName = $ffmpeg
        $process.StartInfo.Arguments = "-v error -i `"$($file.FullName)`" -f ffmetadata -"
        $process.StartInfo.UseShellExecute = $false
        $process.StartInfo.CreateNoWindow = $true
        $process.StartInfo.RedirectStandardOutput = $true
        $process.StartInfo.RedirectStandardError = $true
        $process.StartInfo.StandardOutputEncoding = [Text.Encoding]::UTF8
        try {
            $process.Start() | Out-Null
            $out = $process.StandardOutput.ReadToEndAsync()
            $err = $process.StandardError.ReadToEndAsync()
            if (-not $process.WaitForExit(10000)) { $process.Kill(); continue }
            if ($process.ExitCode -ne 0) { continue }
            $tags = @{}
            foreach ($line in ($out.Result -split "`n")) {
                if ($line -match '^([^=]+)=(.*)$') { $tags[$Matches[1]] = [regex]::Replace($Matches[2].TrimEnd("`r"), '\\(.)', '$1') }
            }
            if ($tags.purl -eq $job.Url -or $tags.comment -eq $job.Url) {
                return @{ File = $file.FullName; Title = $tags.title; Artist = $tags.artist; Duration = $job.Duration; Source = $job.Source; Cover = $job.Cover }
            }
        } finally { $process.Dispose() }
    }
}

function Clear-LinkJobs {
    foreach ($job in @($script:linkJobs.Values)) { Update-Link $job }
    foreach ($job in @($script:linkJobs.Values)) {
        if ($job.Status -eq 'ready' -and ([DateTime]::UtcNow - $job.StartedAt).TotalMinutes -gt 30) { $job.Status = 'cancelled' }
    }
    if (([DateTime]::UtcNow - $script:lastLinkCleanup).TotalMinutes -lt 10) { return }
    $script:lastLinkCleanup = [DateTime]::UtcNow
    $root = Join-Path $script:linkRoot 'cache\import-logs'
    if (-not (Test-Path -LiteralPath $root)) { return }
    $active = @($script:linkJobs.Values | Where-Object { $_.Status -in @('previewing', 'downloading', 'ready') } | ForEach-Object { $_.Dir })
    $jobs = @(Get-ChildItem -LiteralPath $root -Directory | Where-Object { $_.Name -match '^[a-f0-9]{32}$' -and $_.FullName -notin $active } | Sort-Object LastWriteTime -Descending)
    for ($i = 0; $i -lt $jobs.Count; $i++) {
        if ($i -ge 20 -or $jobs[$i].LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-7)) {
            if ($jobs[$i].Parent.FullName -eq [IO.Path]::GetFullPath($root)) { Remove-Item -LiteralPath $jobs[$i].FullName -Recurse -Force -ErrorAction SilentlyContinue }
        }
    }
}

function Get-LinkUrl($value) {
    $url = $null
    if (-not [Uri]::TryCreate([string]$value, [UriKind]::Absolute, [ref]$url) -or $url.Scheme -ne 'https' -or $url.UserInfo -or $url.Port -ne 443) { throw 'Paste a valid HTTPS YouTube or SoundCloud song link.' }
    $hostName = $url.DnsSafeHost.ToLowerInvariant()
    if ($hostName -in @('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com')) {
        $id = [System.Web.HttpUtility]::ParseQueryString($url.Query)['v']
        if ($url.AbsolutePath -match '^/(shorts|embed)/([A-Za-z0-9_-]{11})/?$') { $id = $Matches[2] }
        if ($id -notmatch '^[A-Za-z0-9_-]{11}$') { throw 'Use a single YouTube video link.' }
        return "https://www.youtube.com/watch?v=$id"
    }
    if ($hostName -eq 'youtu.be' -and $url.AbsolutePath -match '^/([A-Za-z0-9_-]{11})/?$') { return "https://www.youtube.com/watch?v=$($Matches[1])" }
    throw 'Use a single YouTube or SoundCloud song link, rather than a playlist or profile.'
}

function Start-LinkProcess($job, $arguments) {
    $config = Get-Content -LiteralPath (Join-Path $script:linkRoot 'data\download-tools.json') -Raw | ConvertFrom-Json
    $exe = $config.ytdlp
    $arguments = "--js-runtimes `"$($config.runtime)`" $arguments"
    if (-not (Test-Path -LiteralPath $exe)) { throw 'The link downloader is missing. Reinstall Spotify Remastered.' }
    $process = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $job.Dir -PassThru -WindowStyle Hidden -RedirectStandardOutput (Join-Path $job.Dir 'stdout.log') -RedirectStandardError (Join-Path $job.Dir 'stderr.log')
    $handle = $process.Handle
    $job.Process = $process
    $job.StartedAt = [DateTime]::UtcNow
}

function Update-Link($job) {
    if ($job.Status -notin @('previewing', 'downloading')) { return }
    $job.Process.Refresh()
    if (-not $job.Process.HasExited) {
        if (([DateTime]::UtcNow - $job.StartedAt).TotalSeconds -gt 600) {
            Stop-Download $job
            $job.Status = 'error'; $job.Message = 'The download timed out. Details are in the import logs.'
        }
        return
    }
    $job.Process.WaitForExit()
    try {
        if ($job.Process.ExitCode -ne 0) {
            $detail = (Get-Content -LiteralPath (Join-Path $job.Dir 'stderr.log') -Encoding UTF8 | Where-Object { $_ -match '^ERROR:' } | Select-Object -Last 1)
            if (-not $detail) { $detail = 'The source could not be downloaded. See the import logs for details.' }
            throw $detail
        }
        if ($job.Status -eq 'previewing') {
            $info = Get-Content -LiteralPath (Join-Path $job.Dir 'stdout.log') -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($info._type -in @('playlist', 'multi_video') -or $info.is_live -or $info.live_status -in @('is_live', 'is_upcoming') -or -not $info.duration) { throw 'Use a finished, single song upload.' }
            $job.Title = if ($info.track) { $info.track } else { $info.title }
            $job.Artist = if ($info.artist) { $info.artist } else { $info.uploader }
            $job.Duration = $info.duration
            $job.Cover = $info.thumbnail
            $job.Source = if ($info.extractor -like '*soundcloud*') { 'SoundCloud' } else { 'YouTube' }
            $job.Status = 'ready'
        } else {
            $audio = Join-Path $job.Dir 'audio.mp3'
            if (-not (Test-Path -LiteralPath $audio) -or (Get-Item -LiteralPath $audio).Length -eq 0) { throw 'The downloader produced no MP3 file.' }
            $folder = Join-Path $script:linkRoot 'Local Songs'
            New-Item -ItemType Directory -Force -Path $folder | Out-Null
            $base = Safe-Name $job.Title
            $target = Join-Path $folder "$base.mp3"
            $suffix = 2
            while (Test-Path -LiteralPath $target) { $target = Join-Path $folder "$base ($suffix).mp3"; $suffix++ }
            Move-Item -LiteralPath $audio -Destination $target -ErrorAction Stop
            $job.Folder = $folder
            $job.File = $target
            $job.Status = 'done'
            Save-LinkIndex $job
        }
    } catch { $job.Status = 'error'; $job.Message = $_.Exception.Message }
}

function Handle-Link($ctx, $route) {
    try {
        Add-Type -AssemblyName System.Web
        $body = $null
        if ($route -in @('/link-preview', '/link-download')) {
            if ($ctx.Request.HttpMethod -ne 'POST' -or $ctx.Request.ContentLength64 -lt 1 -or $ctx.Request.ContentLength64 -gt 8192) { throw 'Invalid import request.' }
            $reader = New-Object System.IO.StreamReader($ctx.Request.InputStream, [Text.Encoding]::UTF8)
            try { $body = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        }
        foreach ($entry in @($script:linkJobs.Values)) { Update-Link $entry }
        $id = if ($body) { $body.id } else { $ctx.Request.QueryString['id'] }
        $job = if ($id -and $script:linkJobs.ContainsKey($id)) { $script:linkJobs[$id] } else { $null }
        if ($route -eq '/link-preview') {
            if (@($script:linkJobs.Values | Where-Object { $_.Status -in @('previewing', 'downloading') }).Count) { throw 'Another link import is running. Finish or cancel it first.' }
            $url = Get-LinkUrl $body.url
            $id = [Guid]::NewGuid().ToString('N')
            $dir = Join-Path $script:linkRoot "cache\import-logs\$id"
            New-Item -ItemType Directory -Force -Path $dir | Out-Null
            $job = @{ Id = $id; Dir = $dir; Url = $url; Status = 'previewing'; Message = $null }
            Start-LinkProcess $job "--ignore-config --no-playlist --skip-download --dump-single-json --socket-timeout 20 --retries 2 -- `"$url`""
            $script:linkJobs[$id] = $job
        } elseif (-not $job) { throw 'This import is no longer available. Paste the link again.' }
        elseif ($route -eq '/link-download') {
            if ($job.Status -ne 'ready') { throw 'Wait for the song preview first.' }
            $saved = Find-SavedLink $job
            if ($saved) {
                foreach ($key in @('File','Title','Artist','Duration','Source','Cover')) { $job[$key] = $saved.$key }
                $job.Folder = Join-Path $script:linkRoot 'Local Songs'
                $job.Status = 'done'; $job.Reused = $true
                Save-LinkIndex $job
            } else {
            $title = ([string]$body.title).Trim(); $artist = ([string]$body.artist).Trim()
            if (-not $title -or -not $artist -or $title.Length -gt 200 -or $artist.Length -gt 200 -or "$title$artist" -match '[\x00-\x1f]') { throw 'Enter a title and artist of up to 200 characters.' }
            $tools = Get-Downloader
            $titleArg = Quote-LinkMetadata $title
            $artistArg = Quote-LinkMetadata $artist
            # a config file keeps user metadata out of the process command line.
            @("--replace-in-metadata title '^.*$' $titleArg", '--parse-metadata title:meta_title',
                "--replace-in-metadata uploader '^.*$' $artistArg", '--parse-metadata uploader:meta_artist',
                '--parse-metadata %(extractor_key)s:meta_album') | Set-Content -LiteralPath (Join-Path $job.Dir 'metadata.conf') -Encoding UTF8
            $argsText = "--ignore-config --config-locations metadata.conf --no-playlist -x --audio-format mp3 --audio-quality 0 --ffmpeg-location `"$($tools.FFmpeg)`" --embed-metadata --embed-thumbnail --convert-thumbnails jpg -o audio.%(ext)s --socket-timeout 20 --retries 2 -- `"$($job.Url)`""
            $job.Title = $title; $job.Artist = $artist
            $job.Status = 'downloading'
            Start-LinkProcess $job $argsText
            }
        } elseif ($route -eq '/link-cancel') {
            if ($job.Status -in @('previewing', 'downloading', 'ready')) { Stop-Download $job; $job.Status = 'cancelled' }
        } elseif ($route -eq '/link-folder') {
            if (-not $job.Folder) { throw 'The song has not been saved yet.' }
            Invoke-Item -LiteralPath $job.Folder
        }
        Respond $ctx (@{ id = $job.Id; status = $job.Status; reused = [bool]$job.Reused; message = $job.Message; title = $job.Title; artist = $job.Artist; duration = $job.Duration; cover = $job.Cover; source = $job.Source; folder = $job.Folder } | ConvertTo-Json -Compress)
    } catch { Respond $ctx (@{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress) }
}
