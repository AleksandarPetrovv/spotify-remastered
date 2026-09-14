$support = Join-Path $env:LOCALAPPDATA 'spotify-remastered'
$dependencies = Join-Path $support 'dependencies'
New-Item -ItemType Directory -Force -Path $dependencies | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $support 'data') | Out-Null
$ytdlp = $null
$candidates = @((Join-Path $dependencies 'yt-dlp.exe'), (Get-Command yt-dlp -ErrorAction SilentlyContinue).Source, (Join-Path $dependencies 'downloader\Scripts\yt-dlp.exe'))
foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $version = & $candidate --version 2>$null
        if ($LASTEXITCODE -eq 0 -and "$version" -match '^202[6-9]\.') { $ytdlp = $candidate; break }
    }
}
if (-not $ytdlp) {
    $ytdlp = Join-Path $dependencies 'yt-dlp.exe'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe' -OutFile $ytdlp -TimeoutSec 120
    & $ytdlp --version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The link downloader could not be installed.' }
}
$runtime = $null
foreach ($name in @('deno','node')) {
    $candidate = (Get-Command $name -ErrorAction SilentlyContinue).Source
    if ($candidate) {
        $version = & $candidate --version 2>$null
        if ($LASTEXITCODE -eq 0 -and (($name -eq 'deno' -and "$version" -match 'deno [2-9]') -or ($name -eq 'node' -and "$version" -match '^v(2[0-9]|[3-9][0-9])\.'))) { $runtime = "$($name):$candidate"; break }
    }
}
if (-not $runtime) {
    $deno = Join-Path $dependencies 'deno.exe'
    if (-not (Test-Path -LiteralPath $deno)) {
        $archive = Join-Path $dependencies 'deno.zip'
        try {
            Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip' -OutFile $archive -TimeoutSec 120
            Expand-Archive -LiteralPath $archive -DestinationPath $dependencies -Force
        } finally { if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force } }
    }
    $runtime = "deno:$deno"
}
@{ ytdlp = $ytdlp; runtime = $runtime } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $support 'data\download-tools.json') -Encoding UTF8
