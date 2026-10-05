$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$script:tests = 0
function Assert-True([bool]$Condition, [string]$Message) { $script:tests += 1; if (-not $Condition) { throw "Assertion failed: $Message" } }
function Assert-Equal($Actual, $Expected, [string]$Message) { $script:tests += 1; if ($Actual -ne $Expected) { throw "Assertion failed: $Message. Expected '$Expected', got '$Actual'." } }
function New-Set([string]$Directory, [string]$Stem) {
  $dump = Join-Path $Directory "$Stem.dump.enc"
  [IO.File]::WriteAllText($dump, 'encrypted')
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dump).Hash.ToLowerInvariant()
  [IO.File]::WriteAllText((Join-Path $Directory "$Stem.dump.enc.sha256"), "$hash  $Stem.dump.enc`n")
  [IO.File]::WriteAllText((Join-Path $Directory "$Stem.manifest.json"), (@{ formatVersion = 1; encryptedSha256 = $hash } | ConvertTo-Json -Compress))
}

$root = Join-Path ([IO.Path]::GetTempPath()) ("campus-restore-client-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
try {
  $backups = Join-Path $root 'backups'
  New-Item -ItemType Directory -Path $backups | Out-Null
  $oldStem = 'campus-sweep-20261004T000000Z'
  $newStem = 'campus-sweep-20261005T010203Z'
  New-Set $backups $oldStem
  New-Set $backups $newStem
  $configPath = Join-Path $root 'config.json'
  @{ Server = 'example.internal'; SshUser = 'backup'; IdentityFile = (Join-Path $root 'id_ed25519'); RemoteDirectory = '/srv/campus/backups'; LocalDirectory = $backups; StatePath = (Join-Path $root 'state.json') } | ConvertTo-Json | Set-Content -LiteralPath $configPath
  [IO.File]::WriteAllText((Join-Path $root 'id_ed25519'), 'test-key')

  $events = [Collections.Generic.List[string]]::new()
  $upload = { param($set, $incoming, $id) $events.Add("upload:$($set.Stem):$($incoming):$($id)") }
  $invoke = { param($id, $stem) $events.Add("invoke:$($stem):$($id)"); (@{ formatVersion = 1; mode = 'verify'; backupStem = $stem; status = 'success'; checks = @('schema') } | ConvertTo-Json -Compress) }
  $cleanup = { param($id) $events.Add("cleanup:$($id)") }
  $result = & (Join-Path $repoRoot 'ops/windows/verify-backup.ps1') -ConfigPath $configPath -UploadSet $upload -InvokeRemote $invoke -CleanupRemote $cleanup
  Assert-Equal $result.backupStem $newStem 'newest valid local set is selected by default'
  Assert-True ($events[0] -match "^upload:${newStem}:/srv/campus/backups/incoming/[a-f0-9]{32}:[a-f0-9]{32}$") 'upload uses a random incoming directory'
  Assert-True ($events[1] -match "^invoke:${newStem}:[a-f0-9]{32}$") 'server invocation follows upload'
  Assert-True ($events[2] -match '^cleanup:[a-f0-9]{32}$') 'remote cleanup follows success'
  $state = Get-Content -LiteralPath (Join-Path $root 'state.json') -Raw | ConvertFrom-Json
  Assert-Equal $state.lastRestoreStem $newStem 'successful drill updates the restored stem'
  Assert-True ($null -ne $state.lastRestoreSuccessAt) 'successful drill records success time'
  Import-Module (Join-Path $repoRoot 'ops/windows/CampusSweepBackup.psm1') -Force
  Assert-True (Test-BackupRestoreOverdue -State $state -Now ([datetime]'2026-11-10T00:00:00Z')) 'a successful drill older than the monthly interval is overdue'
  Assert-True (-not (Test-BackupRestoreOverdue -State $state -Now ([datetime]'2026-10-20T00:00:00Z'))) 'a recent successful drill is not overdue'

  $events.Clear()
  $failedInvoke = { param($id, $stem) $events.Add("invoke:$($stem):$($id)"); throw 'remote verify failed' }
  try { & (Join-Path $repoRoot 'ops/windows/verify-backup.ps1') -ConfigPath $configPath -Stem $oldStem -UploadSet $upload -InvokeRemote $failedInvoke -CleanupRemote $cleanup | Out-Null; throw 'expected failure' } catch { }
  $failedState = Get-Content -LiteralPath (Join-Path $root 'state.json') -Raw | ConvertFrom-Json
  Assert-Equal $failedState.lastRestoreStem $newStem 'failed drill does not replace last successful stem'
  Assert-True (($events | Where-Object { $_ -match '^cleanup:' }).Count -eq 1) 'remote cleanup runs after failure'

  $incompleteStem = 'campus-sweep-20261005T020304Z'
  [IO.File]::WriteAllText((Join-Path $backups "$incompleteStem.dump.enc"), 'partial')
  $eventCount = $events.Count
  try { & (Join-Path $repoRoot 'ops/windows/verify-backup.ps1') -ConfigPath $configPath -Stem $incompleteStem -UploadSet $upload -InvokeRemote $invoke -CleanupRemote $cleanup | Out-Null; throw 'expected incomplete set failure' } catch { }
  Assert-Equal $events.Count $eventCount 'incomplete explicit selection is rejected before transport'

  $eventCount = $events.Count
  try { & (Join-Path $repoRoot 'ops/windows/verify-backup.ps1') -ConfigPath $configPath -Stem 'campus-sweep-20261005T010203Z;whoami' -UploadSet $upload -InvokeRemote $invoke -CleanupRemote $cleanup | Out-Null; throw 'expected invalid stem failure' } catch { }
  Assert-Equal $events.Count $eventCount 'command injection stem is rejected before transport'

  $emptyBackups = Join-Path $root 'empty-backups'
  New-Item -ItemType Directory -Path $emptyBackups | Out-Null
  $emptyConfigPath = Join-Path $root 'empty-config.json'
  @{ Server = 'example.internal'; SshUser = 'backup'; IdentityFile = (Join-Path $root 'id_ed25519'); RemoteDirectory = '/srv/campus/backups'; LocalDirectory = $emptyBackups; StatePath = (Join-Path $root 'empty-state.json') } | ConvertTo-Json | Set-Content -LiteralPath $emptyConfigPath
  $eventCount = $events.Count
  $skipped = & (Join-Path $repoRoot 'ops/windows/verify-backup.ps1') -ConfigPath $emptyConfigPath -SkipIfUnavailable -UploadSet $upload -InvokeRemote $invoke -CleanupRemote $cleanup
  Assert-Equal $skipped.status 'skipped' 'scheduled drill skips instead of failing when no valid local set exists'
  Assert-Equal $events.Count $eventCount 'scheduled skip does not start remote transport'

  Write-Output "PASS $script:tests assertions"
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
