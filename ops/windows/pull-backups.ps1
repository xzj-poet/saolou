param(
  [string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'CampusSweepBackup/config.json'),
  [scriptblock]$ListRemote,
  [scriptblock]$DownloadFile
)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'CampusSweepBackup.psm1') -Force
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.RemoteDirectory -match "['`"`r`n]") { throw '远端备份目录包含不支持的字符。' }
$remoteTarget = "$($config.SshUser)@$($config.Server)"
$escapeSftp = { param([string]$Value) '"' + $Value.Replace('"', '\"') + '"' }
$showWarning = {
  param([string]$Message)
  if ($IsWindows -and [Environment]::UserInteractive) {
    try {
      Add-Type -AssemblyName System.Windows.Forms
      $icon = New-Object System.Windows.Forms.NotifyIcon
      $icon.Icon = [System.Drawing.SystemIcons]::Warning
      $icon.Visible = $true
      $icon.ShowBalloonTip(10000, '校园扫楼备份', $Message, [System.Windows.Forms.ToolTipIcon]::Warning)
      Start-Sleep -Milliseconds 200
      $icon.Dispose()
      return
    } catch { }
  }
  Write-Warning $Message
}
$mutex = Enter-BackupMutex -Name 'CampusSweepBackupPull'
try {
  if (-not $ListRemote) {
    $ListRemote = { param($configuration) ssh -i $configuration.IdentityFile "$($configuration.SshUser)@$($configuration.Server)" "find '$($configuration.RemoteDirectory)' -maxdepth 1 -type f -name 'campus-sweep-*.manifest.json' -printf '%f\n'" | ForEach-Object { [pscustomobject]@{ Stem = ($_ -replace '\.manifest\.json$', ''); RemoteDirectory = $configuration.RemoteDirectory } }
  }
  if (-not $DownloadFile) {
    $DownloadFile = {
      param($remoteSet, $fileName, $temporaryPath)
      $batch = [IO.Path]::GetTempFileName()
      try {
        $remoteFile = "$($remoteSet.RemoteDirectory)/$fileName"
        "get $(& $escapeSftp $remoteFile) $(& $escapeSftp $temporaryPath)" | Set-Content -LiteralPath $batch -NoNewline -Encoding ascii
        & sftp -i $config.IdentityFile -b $batch $remoteTarget
        if ($LASTEXITCODE -ne 0) { throw "SFTP 下载失败：$fileName" }
      } finally {
        Remove-Item -LiteralPath $batch -Force -ErrorAction SilentlyContinue
      }
    }
  }
  $remoteSets = @(& $ListRemote $config)
  $result = Sync-BackupSets -RemoteSets $remoteSets -DestinationDirectory $config.LocalDirectory -DownloadFile $DownloadFile
  Remove-ExpiredBackupSets -Directory $config.LocalDirectory
  $state = @{ lastAttemptAt = [datetime]::UtcNow.ToString('o'); lastSuccessAt = if ($result.Downloaded.Count -gt 0) { [datetime]::UtcNow.ToString('o') } else { (Read-BackupClientState -Path $config.StatePath).lastSuccessAt }; lastDownloaded = @($result.Downloaded); lastQuarantined = @($result.Quarantined) }
  Write-BackupClientState -Path $config.StatePath -State $state
  if ($result.Quarantined.Count -gt 0 -or (Test-BackupClientOverdue -State ([pscustomobject]$state))) { & $showWarning '异机备份需要检查。'; exit 1 }
  $result | ConvertTo-Json -Compress
} finally { Exit-BackupMutex -Mutex $mutex }
