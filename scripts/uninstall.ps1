param(
  [switch]$Yes,
  [switch]$SkipSkill
)

$ErrorActionPreference = "Stop"

$InstallRoot = Join-Path $env:USERPROFILE ".meeting-harness"
$BinDir = Join-Path $InstallRoot "bin"

function Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Confirm-Step($Message) {
  if ($Yes) { return $true }
  $answer = Read-Host "$Message [y/N]"
  return $answer -match "^(y|Y|yes|YES)$"
}

function HasCommand($Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

Step "meeting-harness 제거를 시작합니다."

if (-not (Confirm-Step "설치 폴더와 PATH 등록을 삭제할까요? 작업 폴더와 원본 미디어 파일은 삭제하지 않습니다.")) {
  throw "제거가 취소되었습니다."
}

if (-not $SkipSkill -and (HasCommand "npx")) {
  Step "meeting-harness skill 제거를 시도합니다."
  try {
    npx -y skills@latest remove meeting-harness -g -y
  } catch {
    Write-Host "skill 제거를 건너뜁니다: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

$current = [Environment]::GetEnvironmentVariable("Path", "User")
if ($current) {
  $parts = $current -split ";" | Where-Object { $_ -and $_ -ne $BinDir }
  [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")
  $env:Path = (($env:Path -split ";") | Where-Object { $_ -and $_ -ne $BinDir }) -join ";"
  Step "사용자 PATH에서 제거했습니다: $BinDir"
}

if (Test-Path $InstallRoot) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
  Step "설치 폴더를 삭제했습니다: $InstallRoot"
} else {
  Step "설치 폴더가 없습니다. 건너뜁니다."
}

Step "제거가 끝났습니다."
Write-Host "이미 만들어진 회의 작업 폴더와 원본 파일은 삭제하지 않았습니다."
Write-Host "새 PowerShell 창을 열면 meeting-harness 명령이 더 이상 잡히지 않습니다."
