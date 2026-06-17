Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:27382/")
$listener.Start()

$script:downloads = @{}

function Respond($ctx, $body) {
    $buf = [System.Text.Encoding]::UTF8.GetBytes($body)
    $ctx.Response.StatusCode = 200
    $ctx.Response.ContentType = "application/json"
    $ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*")
    $ctx.Response.ContentLength64 = $buf.Length
    $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    $ctx.Response.Close()
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $route = $ctx.Request.Url.AbsolutePath

    switch ($route) {
        "/download" {
            $trackId = $ctx.Request.QueryString["id"]
            if (-not $trackId) {
                Respond $ctx '{"status":"error"}'
                break
            }

            if ($script:downloads.ContainsKey($trackId) -and $script:downloads[$trackId].Status -eq "downloading") {
                Respond $ctx '{"status":"already_downloading"}'
                break
            }

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

            $customDir = Join-Path $env:LOCALAPPDATA "spotify-remastered"
            $spotdl = Join-Path $customDir "spotdl.exe"
            $ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue).Source
            if (-not $ffmpeg) {
                $ffmpeg = Join-Path $env:USERPROFILE ".spotdl\ffmpeg.exe"
                if (-not (Test-Path $ffmpeg)) {
                    & $spotdl --download-ffmpeg 2>&1 | Out-Null
                    $ffmpeg = Join-Path $env:USERPROFILE ".spotdl\ffmpeg.exe"
                }
            }

            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = $spotdl
            $psi.Arguments = "download `"https://open.spotify.com/track/$trackId`" --output `"$downloadFolder/{title}.{output-ext}`" --ffmpeg `"$ffmpeg`""
            $psi.UseShellExecute = $false
            $psi.CreateNoWindow = $true
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $proc = [System.Diagnostics.Process]::Start($psi)

            $script:downloads[$trackId] = @{ Process = $proc; Status = "downloading" }

            Respond $ctx '{"status":"started"}'
        }

        "/status" {
            $trackId = $ctx.Request.QueryString["id"]
            if ($trackId -and $script:downloads.ContainsKey($trackId)) {
                $dl = $script:downloads[$trackId]
                if ($dl.Status -eq "downloading" -and $dl.Process -ne $null -and $dl.Process.HasExited) {
                    $dl.Status = "done"
                }
                Respond $ctx "{`"status`":`"$($dl.Status)`"}"
            } else {
                Respond $ctx '{"status":"idle"}'
            }
        }

        "/cancel" {
            $trackId = $ctx.Request.QueryString["id"]
            if ($trackId -and $script:downloads.ContainsKey($trackId)) {
                $dl = $script:downloads[$trackId]
                if ($dl.Process -ne $null -and -not $dl.Process.HasExited) {
                    try { $dl.Process.Kill() } catch {}
                }
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
}
