param([string]$ConfigPath = (Join-Path $env:LOCALAPPDATA 'CampusSweepBackup/config.json'), [switch]$WhatIf)
$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'pull-backups.ps1'
$taskName = 'Campus Sweep Backup Pull'
$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoProfile -File `"$scriptPath`" -ConfigPath `"$ConfigPath`""
$triggers = @((New-ScheduledTaskTrigger -AtLogOn), (New-ScheduledTaskTrigger -Daily -At 04:00))
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
if ($WhatIf) { [pscustomobject]@{ TaskName = $taskName; Arguments = $action.Arguments; Triggers = $triggers.Count; StartWhenAvailable = $settings.StartWhenAvailable }; exit 0 }
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Force | Out-Null
Write-Output "已安装任务计划：$taskName"
