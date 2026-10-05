$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Import-Module (Join-Path $repoRoot 'ops/windows/CampusSweepBackup.psm1') -Force

$script:tests = 0
function Assert-True([bool]$Condition, [string]$Message) {
  $script:tests += 1
  if (-not $Condition) { throw "Assertion failed: $Message" }
}
function Assert-Equal($Actual, $Expected, [string]$Message) {
  $script:tests += 1
  if ($Actual -ne $Expected) { throw "Assertion failed: $Message. Expected '$Expected', got '$Actual'." }
}
function New-TemporaryDirectory {
  $path = Join-Path ([System.IO.Path]::GetTempPath()) ("campus-backup-" + [Guid]::NewGuid().ToString('N'))
  [void](New-Item -ItemType Directory -Path $path -Force)
  return $path
}
function New-BackupSet([string]$Directory, [string]$Stem, [string]$Content = 'encrypted') {
  $dump = Join-Path $Directory "$Stem.dump.enc"
  [System.IO.File]::WriteAllText($dump, $Content)
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dump).Hash.ToLowerInvariant()
  [System.IO.File]::WriteAllText((Join-Path $Directory "$Stem.dump.enc.sha256"), "$hash  $Stem.dump.enc`n")
  [System.IO.File]::WriteAllText((Join-Path $Directory "$Stem.manifest.json"), (@{ formatVersion = 1; encryptedSha256 = $hash } | ConvertTo-Json -Compress))
}

$root = New-TemporaryDirectory
try {
  $source = Join-Path $root 'source'
  $destination = Join-Path $root 'destination'
  $state = Join-Path $root 'state.json'
  New-Item -ItemType Directory -Path $source, $destination | Out-Null
  $validStem = 'campus-sweep-20261005T010203Z'
  New-BackupSet $source $validStem

  Assert-True (Test-BackupStem $validStem) 'valid UTC stem is accepted'
  foreach ($invalid in @('../campus-sweep-20261005T010203Z', 'campus-sweep-20261005T010203Z;whoami', 'campus-sweep-99999999T999999Z')) {
    Assert-True (-not (Test-BackupStem $invalid)) "invalid stem $invalid is rejected"
  }

  [System.IO.File]::WriteAllText((Join-Path $source 'campus-sweep-20261005T020304Z.dump.enc'), 'partial')
  $sets = @(Get-CompleteBackupSet -Directory $source)
  Assert-Equal $sets.Count 1 'only manifest-ready trios are listed'
  Assert-Equal $sets[0].Stem $validStem 'complete set keeps its stem'

  $download = {
    param($RemoteSet, $FileName, $TemporaryPath)
    Copy-Item -LiteralPath (Join-Path $RemoteSet.RemoteDirectory $FileName) -Destination $TemporaryPath
  }
  $sync = Sync-BackupSets -RemoteSets @([pscustomobject]@{ Stem = $validStem; RemoteDirectory = $source }) -DestinationDirectory $destination -DownloadFile $download
  Assert-Equal $sync.Downloaded.Count 1 'valid remote set downloads once'
  Assert-True (Test-Path -LiteralPath (Join-Path $destination "$validStem.manifest.json")) 'manifest is published after validation'
  Assert-True (-not (Get-ChildItem -LiteralPath $destination -Filter '*.partial' -ErrorAction SilentlyContinue)) 'partial files are not retained after success'

  $again = Sync-BackupSets -RemoteSets @([pscustomobject]@{ Stem = $validStem; RemoteDirectory = $source }) -DestinationDirectory $destination -DownloadFile $download
  Assert-Equal $again.Skipped.Count 1 'already validated set is skipped'

  $brokenStem = 'campus-sweep-20261005T030405Z'
  New-BackupSet $source $brokenStem 'source-content'
  [System.IO.File]::WriteAllText((Join-Path $source "$brokenStem.dump.enc"), 'tampered-content')
  $broken = Sync-BackupSets -RemoteSets @([pscustomobject]@{ Stem = $brokenStem; RemoteDirectory = $source }) -DestinationDirectory $destination -DownloadFile $download
  Assert-Equal $broken.Quarantined.Count 1 'checksum mismatch is quarantined'
  Assert-True (Test-Path -LiteralPath (Join-Path $destination 'quarantine')) 'quarantine directory is created'

  $oldStem = 'campus-sweep-20260801T000000Z'
  New-BackupSet $destination $oldStem
  $newStem = 'campus-sweep-20261004T000000Z'
  New-BackupSet $destination $newStem
  Remove-ExpiredBackupSets -Directory $destination -Now ([datetime]'2026-10-05T12:00:00Z') -RetentionDays 30
  Assert-True (-not (Test-Path -LiteralPath (Join-Path $destination "$oldStem.manifest.json"))) 'expired complete set is removed'
  Assert-True (Test-Path -LiteralPath (Join-Path $destination "$newStem.manifest.json")) 'recent complete set remains'
  $lastOnly = Join-Path $root 'last-only'
  New-Item -ItemType Directory -Path $lastOnly | Out-Null
  New-BackupSet $lastOnly $oldStem
  Remove-ExpiredBackupSets -Directory $lastOnly -Now ([datetime]'2030-01-01T00:00:00Z') -RetentionDays 30
  Assert-True (Test-Path -LiteralPath (Join-Path $lastOnly "$oldStem.manifest.json")) 'last valid set is never removed'

  Write-BackupClientState -Path $state -State @{ lastSuccessAt = '2026-10-05T01:02:03Z'; lastRestoreSuccessAt = $null }
  $readState = Read-BackupClientState -Path $state
  Assert-Equal ([datetime]$readState.lastSuccessAt).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') '2026-10-05T01:02:03Z' 'state round trips atomically'
  Assert-True (-not (Get-ChildItem -LiteralPath $root -Filter '*.tmp' -Recurse -ErrorAction SilentlyContinue)) 'state temporary file is not retained'
  Assert-True ((Test-BackupClientOverdue -State $readState -Now ([datetime]'2026-10-07T02:00:00Z'))) '48-hour overdue state is detected'

  $mutex = Enter-BackupMutex -Name ('CampusSweepBackupTest-' + [Guid]::NewGuid().ToString('N'))
  try {
    Assert-True ($null -ne $mutex) 'mutex acquisition succeeds'
  } finally {
    Exit-BackupMutex -Mutex $mutex
  }

  $identity = Join-Path $root 'id_ed25519'
  [System.IO.File]::WriteAllText($identity, 'test-key')
  $savedLocalAppData = $env:LOCALAPPDATA
  try {
    $env:LOCALAPPDATA = $root
    $secureRecoveryKey = ConvertTo-SecureString 'recovery-key-not-in-config' -AsPlainText -Force
    & (Join-Path $repoRoot 'ops/windows/setup-backup-client.ps1') -Server 'example.internal' -SshUser 'backup' -IdentityFile $identity -RemoteDirectory '/srv/campus/backups' -LocalDirectory (Join-Path $root 'offsite') -RecoveryKey $secureRecoveryKey | Out-Null
    $configText = Get-Content -LiteralPath (Join-Path $root 'CampusSweepBackup/config.json') -Raw
    Assert-True ($configText -notmatch 'recovery-key-not-in-config') 'client config never stores the recovery key'
    Assert-True (Test-Path -LiteralPath (Join-Path $root 'CampusSweepBackup/recovery-key.dpapi')) 'recovery key is stored separately with DPAPI'
  } finally {
    $env:LOCALAPPDATA = $savedLocalAppData
  }

  $taskScript = Join-Path $repoRoot 'ops/windows/install-backup-task.ps1'
  $taskOne = & $taskScript -ConfigPath (Join-Path $root 'CampusSweepBackup/config.json') -WhatIf | ConvertTo-Json -Compress
  $taskTwo = & $taskScript -ConfigPath (Join-Path $root 'CampusSweepBackup/config.json') -WhatIf | ConvertTo-Json -Compress
  Assert-Equal $taskOne $taskTwo 'repeated task installation renders the same current-user definition'
  Assert-True (($taskOne | ConvertFrom-Json).StartWhenAvailable) 'task definition starts missed runs when available'

  Write-Output "PASS $script:tests assertions"
} finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
