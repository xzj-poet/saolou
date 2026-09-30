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
Assert-Contains 'class="admin-building-card"' 'School accordions must contain clickable building cards.'
Assert-Contains 'data-open-blueprint="3"' 'Clicking a building card must open its dormitory blueprint.'
Assert-Contains 'data-action="add-school"' 'The school level must provide an add-school action.'
Assert-Contains 'data-action="edit-building-name"' 'Buildings must support renaming.'
Assert-Contains 'data-action="edit-building-note"' 'Buildings must support optional notes.'
Assert-Contains 'data-action="dormitory-management"' 'Building menus must provide one centralized dormitory-management entry.'
Assert-Contains 'data-menu-trigger="school"' 'School cards must expose a three-dot action menu.'
Assert-Contains 'data-menu-trigger="building"' 'Building cards must expose a three-dot action menu.'
Assert-Contains 'class="context-menu school-menu"' 'The school action menu must be a compact popover.'
Assert-Contains 'class="context-menu building-menu"' 'The building action menu must be a compact popover.'
Assert-Contains 'data-action="edit-school-name"' 'School menus must support renaming.'
Assert-Contains 'data-action="delete-or-disable-school"' 'School menus must combine safe delete and disable.'
Assert-Contains 'data-action="delete-or-disable-building"' 'Building menus must combine safe delete and disable.'
Assert-Contains 'event\.stopPropagation\(\)' 'Opening a three-dot menu must not toggle its accordion.'
Assert-Contains "event\.key==='Escape'" 'The open action menu must close when Escape is pressed.'

$nativeMenuCount = ([regex]::Matches($html, '<details class="menu-shell">')).Count
if ($nativeMenuCount -ne 5) {
    $failures.Add("Every school and building action menu must use an independent native disclosure; found $nativeMenuCount.")
}

if ($html -match 'class="floor-node"|data-menu-trigger="dormitory"|class="context-menu dormitory-menu"') {
    $failures.Add('Floor accordions and floor-level dormitory action menus must be removed.')
}

Assert-Contains 'data-protected="true"' 'Dormitories with sweep records must be protected from deletion.'
Assert-Contains 'data-delete-policy="children-disable"' 'Schools and buildings with children must be protected from deletion.'
Assert-Contains 'URLSearchParams\(window\.location\.search\)' 'The prototype must support direct scene links for review.'
Assert-Contains "searchParams\.get\('menu'\)" 'The prototype must support direct-open action menus for visual review.'
Assert-Contains 'id="adminModal"[^>]*role="dialog"' 'Admin menu actions must open one shared accessible dialog.'
Assert-Contains 'id="admin-form-add-school"' 'The add-school action must have a form.'
Assert-Contains 'id="admin-form-edit-school-name"' 'The edit-school action must have a form.'
Assert-Contains 'id="admin-form-add-building"' 'The add-building action must have a form.'
Assert-Contains 'id="admin-form-edit-building-name"' 'The edit-building action must have a form.'
Assert-Contains 'id="admin-form-edit-building-note"' 'The building-note action must have a form.'
Assert-Contains 'id="admin-form-add-dorm-single"' 'The single-dorm action must have a form.'
Assert-Contains 'id="admin-form-add-dorm-batch"' 'The batch-dorm action must have a form.'
Assert-Contains 'id="admin-form-dormitory-management"' 'Centralized dormitory management must have a unified form.'
Assert-Contains 'data-dorm-manager-tab="single"' 'Dormitory management must provide single-add mode.'
Assert-Contains 'data-dorm-manager-tab="batch"' 'Dormitory management must provide batch-add mode.'
Assert-Contains 'data-dorm-manager-tab="delete"' 'Dormitory management must provide delete-or-disable mode.'
Assert-Contains 'data-dorm-manager-summary' 'Dormitory management must summarize delete versus disable results.'
Assert-Contains 'id="admin-form-delete-or-disable"' 'Delete-or-disable actions must have a confirmation view.'
Assert-Contains 'data-batch-preview' 'Batch dorm creation must show a generated-room preview.'
Assert-Contains "searchParams\.get\('action'\)" 'The prototype must support direct-open admin action dialogs for review.'
Assert-Contains "searchParams\.get\('managerTab'\)" 'The prototype must support direct-open dormitory-management tabs for review.'
Assert-Contains 'openAdminModal\(actionName' 'Admin actions must use the shared dialog without changing accordion context.'
Assert-Contains 'id="blueprintModal"[^>]*role="dialog"' 'A building blueprint must open in an accessible dialog.'
Assert-Contains 'class="blueprint-floor"[^>]*data-floor="2"' 'The blueprint must group dormitories by floor without accordions.'
Assert-Contains 'class="blueprint-room protected"[^>]*data-protected="true"' 'The blueprint must show rooms protected by sweep records.'
Assert-Contains 'data-room-state="active"' 'The blueprint must distinguish active rooms.'
Assert-Contains 'openBlueprint\(buildingId' 'Building cards must open the blueprint without navigating away.'
Assert-Contains 'renderBlueprintRooms\(buildingId' 'Each building blueprint must render its own room structure.'
Assert-Contains 'data-blueprint-note=' 'Each building blueprint must use the selected building note.'
Assert-Contains "searchParams\.get\('blueprint'\)" 'The prototype must support direct-open blueprints for review.'
Assert-Contains 'data-building-card="3"[^>]*data-floor-count="1"[^>]*data-dorm-count="2"[^>]*data-count-source="dormitories"' 'Agent building cards must derive floor and dorm counts from dormitory data.'
Assert-Contains 'data-building-matrix="3"[^>]*data-floor-count="1"[^>]*data-dorm-count="2"[^>]*data-count-source="dormitories"' 'The building matrix must use the same derived counts.'
Assert-Contains 'data-building-id="3"[^>]*data-floor-count="1"[^>]*data-dorm-count="2"[^>]*data-count-source="dormitories"' 'Admin building counts must derive from dormitory data.'
Assert-Contains 'data-floor="2"' 'The 3-building example must contain the derived second-floor group.'
Assert-Contains 'data-room-no="201"' 'The 3-building example must contain room 201.'
Assert-Contains 'data-room-no="202"' 'The 3-building example must contain room 202.'

if ($html -match 'data-count-source="note"') {
    $failures.Add('Building notes must never be used as the source of counts.')
}

$blueprintFloorCount = ([regex]::Matches($html, 'class="blueprint-floor" data-floor="2"')).Count
if ($blueprintFloorCount -ne 1) {
    $failures.Add("The 3-building admin blueprint must derive exactly 1 floor; found $blueprintFloorCount.")
}

if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_ -ErrorAction Continue }
    exit 1
}

Write-Host 'PASS: prototype layout contract'
