Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-BackupStem {
  param([Parameter(Mandatory)][string]$Stem)
  if ($Stem -notmatch '^campus-sweep-(\d{8}T\d{6}Z)$') { return $false }
  $parsed = [datetime]::MinValue
  return [datetime]::TryParseExact($Matches[1], 'yyyyMMddTHHmmssZ', [cultureinfo]::InvariantCulture, [globalization.DateTimeStyles]::AssumeUniversal, [ref]$parsed)
}

function Get-CompleteBackupSet {
  param([Parameter(Mandatory)][string]$Directory)
  if (-not (Test-Path -LiteralPath $Directory)) { return @() }
  Get-ChildItem -LiteralPath $Directory -File -Filter 'campus-sweep-*.manifest.json' | ForEach-Object {
    $stem = $_.Name -replace '\.manifest\.json$', ''
    if ((Test-BackupStem $stem) -and (Test-Path -LiteralPath (Join-Path $Directory "$stem.dump.enc")) -and (Test-Path -LiteralPath (Join-Path $Directory "$stem.dump.enc.sha256"))) {
      [pscustomobject]@{ Stem = $stem; DumpPath = (Join-Path $Directory "$stem.dump.enc"); ManifestPath = $_.FullName; ChecksumPath = (Join-Path $Directory "$stem.dump.enc.sha256") }
    }
  } | Sort-Object Stem
}

function Test-BackupSet {
  param([Parameter(Mandatory)]$Set)
  try {
    if (-not (Test-BackupStem $Set.Stem)) { return [pscustomobject]@{ IsValid = $false; Reason = 'invalid-stem' } }
    $manifest = Get-Content -LiteralPath $Set.ManifestPath -Raw | ConvertFrom-Json
    $line = (Get-Content -LiteralPath $Set.ChecksumPath -Raw).Trim()
    if ($line -notmatch "^([a-f0-9]{64})  $([regex]::Escape($Set.Stem))\.dump\.enc$") { return [pscustomobject]@{ IsValid = $false; Reason = 'invalid-checksum' } }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Set.DumpPath).Hash.ToLowerInvariant()
    $expected = $Matches[1]
    if ($actual -ne $expected -or $manifest.encryptedSha256 -ne $expected) { return [pscustomobject]@{ IsValid = $false; Reason = 'checksum-mismatch' } }
    return [pscustomobject]@{ IsValid = $true; Reason = 'valid' }
  } catch {
    return [pscustomobject]@{ IsValid = $false; Reason = 'unreadable' }
  }
}

function Move-ToQuarantine {
  param([string]$DestinationDirectory, [string]$Stem, [string[]]$Paths)
  $quarantine = Join-Path $DestinationDirectory 'quarantine'
  New-Item -ItemType Directory -Path $quarantine -Force | Out-Null
  $target = Join-Path $quarantine ("$Stem-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  foreach ($path in $Paths) { if (Test-Path -LiteralPath $path) { Move-Item -LiteralPath $path -Destination $target } }
}

function Sync-BackupSets {
  param(
    [Parameter(Mandatory)][object[]]$RemoteSets,
    [Parameter(Mandatory)][string]$DestinationDirectory,
    [Parameter(Mandatory)][scriptblock]$DownloadFile
  )
  New-Item -ItemType Directory -Path $DestinationDirectory -Force | Out-Null
  $result = [ordered]@{ Downloaded = @(); Skipped = @(); Quarantined = @() }
  foreach ($remoteSet in $RemoteSets) {
    $stem = [string]$remoteSet.Stem
    if (-not (Test-BackupStem $stem)) { $result.Quarantined += $stem; continue }
    $existing = Get-CompleteBackupSet -Directory $DestinationDirectory | Where-Object Stem -eq $stem | Select-Object -First 1
    if ($existing -and (Test-BackupSet $existing).IsValid) { $result.Skipped += $stem; continue }
    $temporary = @()
    try {
      foreach ($fileName in @("$stem.dump.enc", "$stem.dump.enc.sha256", "$stem.manifest.json")) {
        $partial = Join-Path $DestinationDirectory ".${fileName}.partial"
        Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
        & $DownloadFile $remoteSet $fileName $partial
        $temporary += $partial
      }
      $candidate = [pscustomobject]@{ Stem = $stem; DumpPath = $temporary[0]; ChecksumPath = $temporary[1]; ManifestPath = $temporary[2] }
      if (-not (Test-BackupSet $candidate).IsValid) { throw 'Downloaded set failed validation.' }
      Move-Item -LiteralPath $temporary[0] -Destination (Join-Path $DestinationDirectory "$stem.dump.enc")
      Move-Item -LiteralPath $temporary[1] -Destination (Join-Path $DestinationDirectory "$stem.dump.enc.sha256")
      Move-Item -LiteralPath $temporary[2] -Destination (Join-Path $DestinationDirectory "$stem.manifest.json")
      $result.Downloaded += $stem
    } catch {
      Move-ToQuarantine -DestinationDirectory $DestinationDirectory -Stem $stem -Paths $temporary
      $result.Quarantined += $stem
    }
  }
  return [pscustomobject]$result
}

function Get-StemTime([string]$Stem) {
  [void](Test-BackupStem $Stem) || (throw 'Invalid backup stem.')
  return [datetime]::ParseExact(($Stem -replace '^campus-sweep-', ''), 'yyyyMMddTHHmmssZ', [cultureinfo]::InvariantCulture, [globalization.DateTimeStyles]::AssumeUniversal)
}

function Remove-ExpiredBackupSets {
  param([Parameter(Mandatory)][string]$Directory, [datetime]$Now = [datetime]::UtcNow, [int]$RetentionDays = 30)
  $sets = @(Get-CompleteBackupSet -Directory $Directory | Where-Object { (Test-BackupSet $_).IsValid })
  if ($sets.Count -le 1) { return }
  $cutoff = $Now.ToUniversalTime().AddDays(-$RetentionDays)
  foreach ($set in $sets | Sort-Object Stem | Select-Object -SkipLast 1) {
    if ((Get-StemTime $set.Stem) -lt $cutoff) {
      Remove-Item -LiteralPath $set.DumpPath, $set.ChecksumPath, $set.ManifestPath -Force
    }
  }
}

function Read-BackupClientState {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{} }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Write-BackupClientState {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][hashtable]$State)
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $temporary = Join-Path $directory ('.' + [IO.Path]::GetFileName($Path) + '.tmp')
  $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -NoNewline -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination $Path -Force
}

function Test-BackupClientOverdue {
  param($State, [datetime]$Now = [datetime]::UtcNow)
  if (-not $State.lastSuccessAt) { return $true }
  return ($Now.ToUniversalTime() - [datetime]::Parse($State.lastSuccessAt).ToUniversalTime()).TotalHours -gt 48
}

function Enter-BackupMutex {
  param([Parameter(Mandatory)][string]$Name)
  $mutex = [Threading.Mutex]::new($false, $Name)
  if (-not $mutex.WaitOne(0)) { $mutex.Dispose(); throw 'Another backup pull is already running.' }
  return $mutex
}

function Exit-BackupMutex { param($Mutex) if ($Mutex) { $Mutex.ReleaseMutex(); $Mutex.Dispose() } }

Export-ModuleMember -Function Test-BackupStem, Get-CompleteBackupSet, Test-BackupSet, Sync-BackupSets, Remove-ExpiredBackupSets, Read-BackupClientState, Write-BackupClientState, Test-BackupClientOverdue, Enter-BackupMutex, Exit-BackupMutex
