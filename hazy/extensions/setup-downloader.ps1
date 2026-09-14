param([string]$Root = (Join-Path $env:LOCALAPPDATA 'spotify-remastered'))
$ErrorActionPreference = 'Stop'
$dependencies = Join-Path $Root 'dependencies'
New-Item -ItemType Directory -Path $dependencies -Force | Out-Null
$python = $null
$candidates = @((Join-Path $dependencies 'downloader\Scripts\python.exe'))
if (Test-Path -LiteralPath (Join-Path $dependencies 'python')) {
    $candidates += @(Get-ChildItem -LiteralPath (Join-Path $dependencies 'python') -Filter 'python.exe' -File -Recurse | Select-Object -ExpandProperty FullName)
}
foreach ($name in @('python3.exe','python.exe')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command -and $command.Source -notlike '*WindowsApps*') { $candidates += $command.Source }
    elseif ($command) {
        $packages = @(Get-AppxPackage -Name 'PythonSoftwareFoundation.Python.*' -ErrorAction SilentlyContinue)
        foreach ($package in $packages) {
            $candidates += Join-Path $env:LOCALAPPDATA ("Microsoft\WindowsApps\" + $package.PackageFamilyName + '\python.exe')
        }
    }
}
foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
    try { & $candidate -c 'import sys,venv; sys.exit(not ((3,11) <= sys.version_info[:2] <= (3,13)))' 2>$null }
    catch { continue }
    if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
}
if (-not $python) {
    $uv = Join-Path $dependencies 'uv\uv.exe'
    if (-not (Test-Path -LiteralPath $uv)) {
        $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'aarch64' } else { 'x86_64' }
        $archive = Join-Path $dependencies 'uv.zip'
        try {
            Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/astral-sh/uv/releases/latest/download/uv-$arch-pc-windows-msvc.zip" -OutFile $archive
            Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $dependencies 'uv') -Force
        } finally { if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force } }
    }
    $previousUvRoot = $env:UV_PYTHON_INSTALL_DIR
    try {
        $env:UV_PYTHON_INSTALL_DIR = Join-Path $dependencies 'python'
        & $uv python install 3.12 --no-bin --no-registry
        $installExit = $LASTEXITCODE
        foreach ($directory in @(Get-ChildItem -LiteralPath $env:UV_PYTHON_INSTALL_DIR -Directory -ErrorAction SilentlyContinue)) {
            if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
            $candidate = Join-Path $directory.FullName 'python.exe'
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
            try { & $candidate -c 'import sys,venv; sys.exit(not ((3,11) <= sys.version_info[:2] <= (3,13)))' 2>$null }
            catch { continue }
            if ($LASTEXITCODE -eq 0) { $python = $candidate; break }
        }
        if (-not $python) { throw "Could not install a working managed Python runtime (uv exit $installExit)." }
    } finally { $env:UV_PYTHON_INSTALL_DIR = $previousUvRoot }
}
& $python (Join-Path $PSScriptRoot 'setup-downloader.py') $Root
if ($LASTEXITCODE -ne 0) { throw 'Downloader dependency setup failed.' }
