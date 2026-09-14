param([string]$Root, [string]$Job)
$ErrorActionPreference = 'Stop'
$token = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$probe.Start()
$port = $probe.LocalEndpoint.Port
$probe.Stop()
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()
$state = @{ status = 'ready'; stage = 0; message = 'Ready to uninstall'; log = (Join-Path $Job 'worker.log') }
@{ url = "http://127.0.0.1:$port"; token = $token } | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $Job 'session.json') -Encoding UTF8
$process = $null
$preparing = $false
$deadline = [DateTime]::UtcNow.AddMinutes(30)
function Update-UninstallState {
    if (-not $process) { return }
    if (Test-Path -LiteralPath $state.log) {
        foreach ($line in @(Get-Content -LiteralPath $state.log -ErrorAction SilentlyContinue)) {
            if ($line -match '^SR_STAGE:(\d+):(.*)$') { $state.stage = [int]$Matches[1]; $state.message = $Matches[2] }
        }
    }
    if ($process.HasExited) {
        $process.WaitForExit()
        if ($state.status -eq 'running' -and $process.ExitCode -eq 0) { $script:deadline = [DateTime]::UtcNow.AddSeconds(15) }
        if ($process.ExitCode -eq 0 -and $preparing) { $state.status = 'prepared'; $state.stage = 2; $state.message = 'Ready. Finish uninstall will close Spotify, restore its files and remove this installation.' }
        elseif ($process.ExitCode -eq 0) { $state.status = 'complete'; $state.stage = 6; $state.message = 'Spotify Remastered removed.' }
        else { $state.status = 'error'; $state.message = 'Removal stopped. ' + (Get-Content -LiteralPath (Join-Path $Job 'error.log') -Raw -ErrorAction SilentlyContinue) }
    }
    $state | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $Job 'status.json') -Encoding UTF8
}
try {
    while ([DateTime]::UtcNow -lt $deadline -or ($process -and -not $process.HasExited)) {
        $pending = $listener.BeginGetContext($null, $null)
        while (-not $pending.AsyncWaitHandle.WaitOne(200)) {
            Update-UninstallState
            if ([DateTime]::UtcNow -ge $deadline -and (-not $process -or $process.HasExited)) { break }
        }
        if (-not $pending.IsCompleted) { break }
        $ctx = $listener.EndGetContext($pending)
        $pending.AsyncWaitHandle.Close()
        $valid = $ctx.Request.QueryString['token'] -ceq $token
        if ($valid -and $ctx.Request.HttpMethod -eq 'POST' -and $ctx.Request.Url.AbsolutePath -eq '/open-songs') {
            $songs = Join-Path $Root 'local songs'
            if ((Test-Path -LiteralPath $songs -PathType Container) -and -not ((Get-Item -LiteralPath $songs).Attributes -band [IO.FileAttributes]::ReparsePoint)) { Start-Process -FilePath 'explorer.exe' -ArgumentList ('"' + $songs + '"') }
        }
        if ($valid -and $ctx.Request.HttpMethod -eq 'POST' -and (($ctx.Request.Url.AbsolutePath -eq '/check' -and $state.status -eq 'ready') -or ($ctx.Request.Url.AbsolutePath -eq '/start' -and $state.status -eq 'prepared'))) {
            $script = Join-Path $Job 'winDel.ps1'
            $preparing = $ctx.Request.Url.AbsolutePath -eq '/check'
            $deleteArgument = if ($preparing) { ' -PrepareOnly' } elseif ($ctx.Request.QueryString['deleteSongs'] -eq '1') { ' -DeleteLocalSongs' } else { '' }
            $process = Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $script + '"' + $deleteArgument) -WindowStyle Hidden -PassThru -RedirectStandardOutput $state.log -RedirectStandardError (Join-Path $Job 'error.log')
            $null = $process.Handle
            $state.status = if ($preparing) { 'checking' } else { 'running' }
            $state.message = if ($preparing) { 'Checking restoration tools' } else { 'Finishing uninstall' }
        }
        Update-UninstallState
        $state | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $Job 'status.json') -Encoding UTF8
        $ctx.Response.Headers.Add('Access-Control-Allow-Origin', 'https://xpui.app.spotify.com')
        $ctx.Response.Headers.Add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        $ctx.Response.Headers.Add('Access-Control-Allow-Headers', 'Content-Type')
        $body = if ($ctx.Request.HttpMethod -eq 'OPTIONS') { '{}' } elseif ($valid) { $state | ConvertTo-Json -Compress } else { $ctx.Response.StatusCode = 403; '{"status":"error","message":"Invalid uninstall session."}' }
        $bytes = [Text.Encoding]::UTF8.GetBytes($body)
        $ctx.Response.ContentType = 'application/json'
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.Close()
    }
} finally {
    $listener.Close()
    if ($state.status -in @('ready', 'prepared', 'complete')) {
        $resolved = [IO.Path]::GetFullPath($Job)
        $temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
        if ($resolved.StartsWith($temporaryRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf) -like 'spotify-remastered-uninstall-*') { Remove-Item -LiteralPath $resolved -Recurse -Force }
    }
}
