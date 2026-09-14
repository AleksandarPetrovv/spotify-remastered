param([string]$SpicetifyPath)
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
