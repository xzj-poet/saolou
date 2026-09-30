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

Assert-Contains 'class="admin-data-tree"' 'Admin basic data must use a nested data tree.'
Assert-Contains 'class="tree-node school-node"' 'The data tree must have school accordions.'
Assert-Contains 'class="tree-node building-node"' 'School accordions must contain building accordions.'
Assert-Contains 'class="floor-node"' 'Building accordions must group dormitories by floor.'
Assert-Contains 'data-action="add-school"' 'The school level must provide an add-school action.'
Assert-Contains 'data-action="edit-building-name"' 'Buildings must support renaming.'
Assert-Contains 'data-action="edit-building-note"' 'Buildings must support optional notes.'
Assert-Contains 'data-action="add-dorm-single"' 'Dormitories must support single add.'
Assert-Contains 'data-action="add-dorm-batch"' 'Dormitories must support batch add.'
Assert-Contains 'data-menu-trigger="school"' 'School cards must expose a three-dot action menu.'
Assert-Contains 'data-menu-trigger="building"' 'Building cards must expose a three-dot action menu.'
Assert-Contains 'data-menu-trigger="dormitory"' 'Floor cards must expose a three-dot dormitory action menu.'
Assert-Contains 'class="context-menu school-menu"' 'The school action menu must be a compact popover.'
Assert-Contains 'class="context-menu building-menu"' 'The building action menu must be a compact popover.'
Assert-Contains 'class="context-menu dormitory-menu"' 'The dormitory action menu must be a compact popover.'
Assert-Contains 'data-action="edit-school-name"' 'School menus must support renaming.'
Assert-Contains 'data-action="delete-or-disable-school"' 'School menus must combine safe delete and disable.'
Assert-Contains 'data-action="delete-or-disable-building"' 'Building menus must combine safe delete and disable.'
Assert-Contains 'data-action="delete-or-disable-dormitory"' 'Dormitory menus must enter safe delete or disable mode.'
Assert-Contains 'data-dorm-selection-mode="inactive"' 'Dormitory checkboxes must stay hidden until selection mode starts.'
Assert-Contains 'event\.stopPropagation\(\)' 'Opening a three-dot menu must not toggle its accordion.'
Assert-Contains "event\.key==='Escape'" 'The open action menu must close when Escape is pressed.'

$nativeMenuCount = ([regex]::Matches($html, '<details class="menu-shell">')).Count
if ($nativeMenuCount -ne 6) {
    $failures.Add("Every school, building, and floor action menu must use an independent native disclosure; found $nativeMenuCount.")
}

Assert-Contains 'data-delete-policy="record-disable"' 'Dormitories with sweep records must be protected from deletion.'
Assert-Contains 'data-delete-policy="children-disable"' 'Schools and buildings with children must be protected from deletion.'
Assert-Contains 'URLSearchParams\(window\.location\.search\)' 'The prototype must support direct scene links for review.'
Assert-Contains "searchParams\.get\('menu'\)" 'The prototype must support direct-open action menus for visual review.'
Assert-Contains 'data-building-card="3"[^>]*data-floor-count="1"[^>]*data-dorm-count="2"[^>]*data-count-source="dormitories"' 'Agent building cards must derive floor and dorm counts from dormitory data.'
Assert-Contains 'data-building-matrix="3"[^>]*data-floor-count="1"[^>]*data-dorm-count="2"[^>]*data-count-source="dormitories"' 'The building matrix must use the same derived counts.'
Assert-Contains 'data-building-id="3"[^>]*data-floor-count="1"[^>]*data-dorm-count="2"[^>]*data-count-source="dormitories"' 'Admin building counts must derive from dormitory data.'
Assert-Contains 'data-floor="2"' 'The 3-building example must contain the derived second-floor group.'
Assert-Contains 'data-room-no="201"' 'The 3-building example must contain room 201.'
Assert-Contains 'data-room-no="202"' 'The 3-building example must contain room 202.'

if ($html -match 'data-count-source="note"') {
    $failures.Add('Building notes must never be used as the source of counts.')
}

$floorNodeCount = ([regex]::Matches($html, 'class="floor-node"')).Count
if ($floorNodeCount -ne 1) {
    $failures.Add("The 3-building admin example must derive exactly 1 floor; found $floorNodeCount.")
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    exit 1
}

Write-Host 'PASS: prototype layout contract'
