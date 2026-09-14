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

function Stop-Download($dl) {
    if ($dl.Process -and -not $dl.Process.HasExited) {
        & "$env:SystemRoot\System32\taskkill.exe" /PID $dl.Process.Id /T /F 2>&1 | Out-Null
    }
}

function Start-Download($trackId, $folder, $spotdl, $ffmpeg, $jobsDir) {
    if ($trackId -notmatch '^[a-zA-Z0-9]{22}$') { throw 'Invalid Spotify track ID.' }
    if (-not (Test-Path -LiteralPath $spotdl -PathType Leaf)) { throw 'The song downloader is missing. Please reinstall Spotify Remastered.' }
    if (-not (Test-Path -LiteralPath $ffmpeg -PathType Leaf)) { throw 'FFmpeg is missing.' }
    if (-not (Test-Path -LiteralPath $folder -PathType Container)) { throw 'The download folder does not exist.' }
    $jobDir = Join-Path $jobsDir ([Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $jobDir -Force | Out-Null
    # relative output avoids spotdl sanitizing dots in parent directory names.
    $output = '{title}.{output-ext}'
    $argsText = "download `"https://open.spotify.com/track/$trackId`" --output `"$output`" --ffmpeg `"$ffmpeg`" --format mp3 --audio youtube-music youtube --max-retries 2"
    # drain both streams to logs; unread redirected pipes can deadlock.
    $proc = Start-Process -FilePath $spotdl -ArgumentList $argsText -WorkingDirectory $jobDir -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $jobDir 'stdout.log') -RedirectStandardError (Join-Path $jobDir 'stderr.log')
    $processHandle = $proc.Handle
    return @{ Process = $proc; Status = 'downloading'; Message = $null; StartedAt = [DateTime]::UtcNow;
        JobDir = $jobDir; Folder = $folder; TimeoutSeconds = 600; CompletedAt = $null }
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
                    Move-Item -LiteralPath $file.FullName -Destination (Join-Path $dl.Folder $file.Name) -Force -ErrorAction Stop
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
        foreach ($dl in @($script:downloads.Values)) { Update-Download $dl }
    }
    $ctx = $listener.EndGetContext($pending)
    $pending.AsyncWaitHandle.Close()
    foreach ($id in @($script:downloads.Keys)) {
        $dl = $script:downloads[$id]
        Update-Download $dl
        if ($dl.CompletedAt -and ([DateTime]::UtcNow - $dl.CompletedAt).TotalMinutes -gt 30) {
            $script:downloads.Remove($id)
        }
    }
    $route = $ctx.Request.Url.AbsolutePath

    switch ($route) {
        "/download" {
            $trackId = $ctx.Request.QueryString["id"]
            if ($trackId -notmatch '^[a-zA-Z0-9]{22}$') {
                Respond $ctx '{"status":"error","message":"Invalid Spotify track ID."}'
                break
            }

            if ($script:downloads.ContainsKey($trackId) -and $script:downloads[$trackId].Status -eq "downloading") {
                Respond $ctx '{"status":"already_downloading"}'
                break
            }

            try {
            $tempForm = New-Object System.Windows.Forms.Form
            $tempForm.TopMost = $true
            $tempForm.Size = New-Object System.Drawing.Size(1, 1)
            $tempForm.StartPosition = "CenterScreen"
            $tempForm.FormBorderStyle = "None"
            $tempForm.Opacity = 0
            $tempForm.Show()
            [WinHelper]::SetForegroundWindow($tempForm.Handle) | Out-Null

            $ofd = New-Object System.Windows.Forms.OpenFileDialog
            $ofd.ValidateNames = $false
            $ofd.CheckFileExists = $false
            $ofd.CheckPathExists = $true
            $ofd.FileName = "Select Folder"
            $ofd.Title = "Select download location"
            $result = $ofd.ShowDialog($tempForm)
            $tempForm.Close()
            $tempForm.Dispose()

            if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
                Respond $ctx '{"status":"no_folder"}'
                break
            }
            $downloadFolder = [System.IO.Path]::GetDirectoryName($ofd.FileName)
            $ofd.Dispose()

            $customDir = Join-Path $env:LOCALAPPDATA "spotify-remastered"
            $spotdl = Join-Path $customDir "spotdl.exe"
            $pythonSpotdl = Join-Path $customDir 'downloader\Scripts\spotdl.exe'
            if (Test-Path -LiteralPath $pythonSpotdl -PathType Leaf) { $spotdl = $pythonSpotdl }
            $ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
            if (-not $ffmpeg) {
                $ffmpeg = Join-Path $env:USERPROFILE ".spotdl\ffmpeg.exe"
                if (-not (Test-Path $ffmpeg)) {
                    $setup = Start-Process -FilePath $spotdl -ArgumentList '--download-ffmpeg' -PassThru -WindowStyle Hidden
                    if (-not $setup.WaitForExit(120000)) {
                        Stop-Download @{ Process = $setup }
                        throw 'FFmpeg setup timed out.'
                    }
                    $ffmpeg = Join-Path $env:USERPROFILE ".spotdl\ffmpeg.exe"
                }
            }

            $script:downloads[$trackId] = Start-Download $trackId $downloadFolder $spotdl $ffmpeg (Join-Path $customDir 'download-logs')

            Respond $ctx '{"status":"started"}'
            } catch {
                Respond $ctx (@{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress)
            }
        }

        "/status" {
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
                $script:downloads.Remove($trackId)
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
    $listener.Close()
}
