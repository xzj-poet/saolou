$ErrorActionPreference = 'Stop'

$prototypePath = Join-Path $PSScriptRoot '..\docs\prototype\campus-sweep-saas-prototype.html'
$html = Get-Content -Raw -LiteralPath $prototypePath
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-Contains {
    param(
        [string]$Pattern,
        [string]$Message
    )

    if ($html -notmatch $Pattern) {
        $failures.Add($Message)
    }
}

Assert-Contains '\.back\{[^}]*background:#eef1f4' 'Back buttons must use a light-gray background.'
Assert-Contains '\.back\{[^}]*min-height:48px' 'Back buttons must have a minimum 48px tap height.'
Assert-Contains '\.back\{[^}]*border-radius:12px' 'Back buttons must use rounded rectangles.'

Assert-Contains 'id="building"' 'A dedicated building selection page is required.'
Assert-Contains 'class="building-card"[^>]*data-jump="matrix"' 'A full building card must open the matrix.'
Assert-Contains 'class="building-progress"' 'Building cards must show coverage progress.'
Assert-Contains 'class="building-counts"' 'Building cards must show covered, pending, and unvisited counts.'

$buildingCardCount = ([regex]::Matches($html, 'class="building-card"')).Count
if ($buildingCardCount -lt 3) {
    $failures.Add("The building page must show at least 3 buildings; found $buildingCardCount.")
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    exit 1
}

Write-Host 'PASS: prototype layout contract'
