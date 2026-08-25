# Wrapper for Task Scheduler: runs ingest.py and appends timestamped output to a log file.
$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $PSScriptRoot "logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$logFile = Join-Path $logDir "ingest.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Set-Location $repoRoot
"===== $timestamp =====" | Out-File -FilePath $logFile -Append -Encoding utf8
python "$repoRoot\rankedstats\ingest.py" *>> $logFile
