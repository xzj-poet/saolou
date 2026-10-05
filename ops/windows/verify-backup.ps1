param(
  [string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'CampusSweepBackup/config.json'),
  [string]$Stem,
  [scriptblock]$UploadSet,
  [scriptblock]$InvokeRemote,
  [scriptblock]$CleanupRemote
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'CampusSweepBackup.psm1') -Force
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.RemoteDirectory -match "['`"`r`n]") { throw '远端备份目录包含不支持的字符。' }
$validSets = @(Get-CompleteBackupSet -Directory $config.LocalDirectory | Where-Object { (Test-BackupSet $_).IsValid } | Sort-Object Stem)
if ($Stem) {
  if (-not (Test-BackupStem $Stem)) { throw '恢复备份名称无效。' }
  $selected = $validSets | Where-Object Stem -eq $Stem | Select-Object -First 1
} else {
  $selected = $validSets | Select-Object -Last 1
}
if (-not $selected) { throw '没有可用于恢复演练的完整本地备份。' }

$restoreId = [guid]::NewGuid().ToString('N')
if ($restoreId -notmatch '^[a-f0-9]{32}$') { throw '无法生成恢复标识。' }
$incomingDirectory = "$($config.RemoteDirectory)/incoming/$restoreId"
$target = "$($config.SshUser)@$($config.Server)"
$state = Read-BackupClientState -Path $config.StatePath
$stateHash = @{}
foreach ($property in $state.PSObject.Properties) { $stateHash[$property.Name] = $property.Value }
$stateHash.lastRestoreAttemptAt = [datetime]::UtcNow.ToString('o')
Write-BackupClientState -Path $config.StatePath -State $stateHash

if (-not $UploadSet) {
  $UploadSet = {
    param($set, $incoming, $id)
    $batch = [IO.Path]::GetTempFileName()
    try {
      $escape = { param([string]$Value) '"' + $Value.Replace('"', '\"') + '"' }
      $lines = @("mkdir $(& $escape $incoming)")
      foreach ($path in @($set.DumpPath, $set.ChecksumPath, $set.ManifestPath)) {
        $lines += "put $(& $escape $path) $(& $escape ($incoming + '/' + [IO.Path]::GetFileName($path)))"
      }
      $lines | Set-Content -LiteralPath $batch -Encoding ascii
      & sftp -i $config.IdentityFile -b $batch $target
      if ($LASTEXITCODE -ne 0) { throw 'SFTP 上传恢复备份失败。' }
    } finally { Remove-Item -LiteralPath $batch -Force -ErrorAction SilentlyContinue }
  }
}
if (-not $InvokeRemote) {
  $InvokeRemote = {
    param($id, $backupStem)
    $applicationDirectory = if ($config.ApplicationDirectory) { $config.ApplicationDirectory } else { Split-Path -Parent $config.RemoteDirectory }
    if ($applicationDirectory -match "['`"`r`n]") { throw '应用目录包含不支持的字符。' }
    $remoteBackup = "$($config.RemoteDirectory)/incoming/$id/$backupStem.dump.enc"
    $remoteReport = "$($config.RemoteDirectory)/incoming/$id/report.json"
    & ssh -i $config.IdentityFile $target "cd '$applicationDirectory' && ./ops/server/restore-backup.sh verify --backup '$remoteBackup' --report '$remoteReport'"
    if ($LASTEXITCODE -ne 0) { throw '服务器恢复演练失败。' }
    & ssh -i $config.IdentityFile $target "cat '$remoteReport'"
    if ($LASTEXITCODE -ne 0) { throw '无法读取服务器恢复报告。' }
  }
}
if (-not $CleanupRemote) {
  $CleanupRemote = { param($id) & ssh -i $config.IdentityFile $target "rm -rf '$($config.RemoteDirectory)/incoming/$id'" | Out-Null }
}

try {
  & $UploadSet $selected $incomingDirectory $restoreId
  $reportText = & $InvokeRemote $restoreId $selected.Stem
  $report = ($reportText -join "`n") | ConvertFrom-Json
  if ($report.formatVersion -ne 1 -or $report.mode -ne 'verify' -or $report.backupStem -ne $selected.Stem -or $report.status -ne 'success' -or -not $report.checks) {
    throw '服务器恢复报告无效。'
  }
  $reportDirectory = Join-Path $config.LocalDirectory 'restore-reports'
  New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
  $reportPath = Join-Path $reportDirectory "restore-$($selected.Stem)-$restoreId.json"
  $reportText | Set-Content -LiteralPath $reportPath -Encoding utf8
  $stateHash.lastRestoreSuccessAt = [datetime]::UtcNow.ToString('o')
  $stateHash.lastRestoreStem = $selected.Stem
  $stateHash.lastRestoreReport = $reportPath
  Write-BackupClientState -Path $config.StatePath -State $stateHash
  [pscustomobject]@{ backupStem = $selected.Stem; reportPath = $reportPath; status = 'success' }
} finally {
  & $CleanupRemote $restoreId
}
