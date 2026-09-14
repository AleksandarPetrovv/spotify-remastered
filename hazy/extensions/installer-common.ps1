$ErrorActionPreference = 'Stop'

function Stop-RemasteredHelpers {
    param([string]$Root)
    $processes = @(Get-CimInstance Win32_Process)
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    $prefix = [regex]::Escape([IO.Path]::GetFullPath($Root).TrimEnd('\') + '\scripts\').Replace('\\', '[\\/]')
    foreach ($process in $processes) {
        if ($process.ProcessId -eq $PID) { continue }
        if ($process.CommandLine -match ($prefix + '(download-helper\.ps1|download-runner\.py|link-helper\.ps1|local-catalogue\.ps1|spotify-remastered-updater\.ps1)("|\s|$)')) {
            $ids.Add([int]$process.ProcessId) | Out-Null
        }
    }
    do {
        $count = $ids.Count
        foreach ($process in $processes) {
            if ($process.ProcessId -ne $PID -and $ids.Contains([int]$process.ParentProcessId)) { $ids.Add([int]$process.ProcessId) | Out-Null }
        }
    } while ($ids.Count -gt $count)
    foreach ($id in $ids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
}

function Remove-ManagedPath {
    param([string]$Root, [string]$Relative)
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    $target = [IO.Path]::GetFullPath((Join-Path $base $Relative))
    if (-not $target.StartsWith($base + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to delete outside the managed directory.' }
    if (Test-Path -LiteralPath $target) {
        $item = Get-Item -LiteralPath $target -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to recursively delete a linked directory.' }
        Remove-Item -LiteralPath $target -Recurse -Force
    }
}

function Invoke-Checked {
    param([string]$Command, [Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE." }
}

function Get-RemasteredConfig {
    param([string]$Spice)
    $path = (& $Spice -c | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Could not locate Spicetify configuration.' }
    return Split-Path $path
}
