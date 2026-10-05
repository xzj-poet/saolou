param(
  [Parameter(Mandatory)][string]$Server,
  [Parameter(Mandatory)][string]$SshUser,
  [Parameter(Mandatory)][string]$IdentityFile,
  [Parameter(Mandatory)][string]$RemoteDirectory,
  [Parameter(Mandatory)][string]$LocalDirectory,
  [Parameter(Mandatory)][securestring]$RecoveryKey
)
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw '此脚本只能在 Windows 上使用 DPAPI 保护恢复密钥。' }
if ($RemoteDirectory -match "['`"`r`n]") { throw '远端备份目录包含不支持的字符。' }
$stateDirectory = Join-Path $env:LOCALAPPDATA 'CampusSweepBackup'
New-Item -ItemType Directory -Path $stateDirectory, $LocalDirectory -Force | Out-Null
$config = @{ Server = $Server; SshUser = $SshUser; IdentityFile = (Resolve-Path -LiteralPath $IdentityFile).Path; RemoteDirectory = $RemoteDirectory; LocalDirectory = (Resolve-Path -LiteralPath $LocalDirectory).Path; StatePath = (Join-Path $stateDirectory 'state.json') }
$config | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateDirectory 'config.json') -Encoding utf8
$RecoveryKey | ConvertFrom-SecureString | Set-Content -LiteralPath (Join-Path $stateDirectory 'recovery-key.dpapi') -Encoding utf8
Write-Output "已创建异机备份客户端配置：$stateDirectory"
