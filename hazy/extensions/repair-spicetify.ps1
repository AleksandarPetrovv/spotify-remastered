param([string]$SpicetifyPath, [switch]$Restore)
$recordPath = Join-Path $PSScriptRoot '..\data\wrapper-repair.json'
if ($Restore) {
    if (Test-Path -LiteralPath $recordPath) {
        $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
        if (Test-Path -LiteralPath $record.path) {
            $content = [IO.File]::ReadAllText($record.path)
            if ($content.Contains($record.after)) { [IO.File]::WriteAllText($record.path, $content.Replace($record.after, $record.before), (New-Object Text.UTF8Encoding($false))) }
        }
        Remove-Item -LiteralPath $recordPath -Force
    }
    return
}
if (-not $SpicetifyPath) { $SpicetifyPath = (Get-Command spicetify -ErrorAction SilentlyContinue).Source }
if (-not $SpicetifyPath) { return }
$wrapper = Join-Path (Split-Path $SpicetifyPath) 'jsHelper\spicetifyWrapper.js'
if (-not (Test-Path -LiteralPath $wrapper)) { return }
$source = [IO.File]::ReadAllText($wrapper)
if (-not $source.Contains('*:not([data-scroll-optimized])')) { return }
$pattern = '(?<v>[A-Za-z_$][\w$]*)\[1\]>=2&&\k<v>\[2\]>=57'
$matchesFound = [regex]::Matches($source, $pattern)
if ($matchesFound.Count -ne 1) { return }
$updated = [regex]::Replace($source, $pattern, [Text.RegularExpressions.MatchEvaluator]{ param($m)
    $v = $m.Groups['v'].Value
    return "($v[0]>1||($v[0]===1&&($v[1]>2||($v[1]===2&&$v[2]>=57))))"
})
[IO.File]::WriteAllText($wrapper, $updated, (New-Object Text.UTF8Encoding($false)))
$v = $matchesFound[0].Groups['v'].Value
@{path=$wrapper;before=$matchesFound[0].Value;after="($v[0]>1||($v[0]===1&&($v[1]>2||($v[1]===2&&$v[2]>=57))))"} | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding UTF8
