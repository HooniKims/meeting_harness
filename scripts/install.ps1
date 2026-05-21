param(
  [string]$Repo = "HooniKims/meeting_harness",
  [string]$Branch = "main",
  [string]$SkillSource = "",
  [switch]$SkipSkill,
  [switch]$SkipSetup,
  [switch]$SkipPythonDeps,
  [switch]$Force,
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

if (-not $SkillSource) {
  $SkillSource = $Repo
}

$InstallRoot = Join-Path $env:USERPROFILE ".meeting-harness"
$AppDir = Join-Path $InstallRoot "app"
$BinDir = Join-Path $InstallRoot "bin"
$VenvDir = Join-Path $InstallRoot "venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$CmdPath = Join-Path $BinDir "meeting-harness.cmd"

function Step($Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function HasCommand($Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Confirm-Step($Message) {
  if ($Yes) { return $true }
  $answer = Read-Host "$Message [Y/n]"
  return $answer -eq "" -or $answer -match "^(y|Y|yes|YES)$"
}

function SkillInstalled($Name) {
  try {
    $json = npx -y skills@latest ls -g --json 2>$null
    if (-not $json) { return $false }
    $items = $json | ConvertFrom-Json
    return $null -ne ($items | Where-Object { $_.name -eq $Name })
  } catch {
    return $false
  }
}

function Invoke-BasePython([string[]]$Arguments) {
  if (HasCommand "python") {
    & python @Arguments
    return $LASTEXITCODE
  }
  if (HasCommand "py") {
    & py -3 @Arguments
    return $LASTEXITCODE
  }
  throw "Python 실행 파일을 찾을 수 없습니다."
}

function HasVenvPythonPackage($Name) {
  & $VenvPython -m pip show $Name *> $null
  return $LASTEXITCODE -eq 0
}

function Ensure-Venv() {
  if ($Force -and (Test-Path $VenvDir)) {
    Remove-Item -LiteralPath $VenvDir -Recurse -Force
  }
  if (-not (Test-Path $VenvPython)) {
    Step "하네스 전용 Python 가상환경을 만듭니다."
    $exitCode = Invoke-BasePython -Arguments @("-m", "venv", $VenvDir)
    if ($exitCode -ne 0) {
      throw "Python 가상환경 생성에 실패했습니다."
    }
  } else {
    Step "하네스 전용 Python 가상환경이 이미 있습니다. 건너뜁니다."
  }
}

function Ensure-Path($PathToAdd) {
  $current = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($current) {
    $parts = $current -split ";" | Where-Object { $_ }
  }
  if ($parts -notcontains $PathToAdd) {
    [Environment]::SetEnvironmentVariable("Path", ($parts + $PathToAdd) -join ";", "User")
    $env:Path = "$env:Path;$PathToAdd"
    Step "PATH에 추가했습니다: $PathToAdd"
  }
}

function Install-AppFromGitHub() {
  if ((Test-Path $CmdPath) -and (Test-Path $AppDir) -and -not $Force) {
    Step "meeting-harness 앱이 이미 설치되어 있습니다. 건너뜁니다."
    return
  }

  Step "GitHub에서 meeting-harness를 다운로드합니다."
  $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("meeting-harness-" + [System.Guid]::NewGuid().ToString("N"))
  $zipPath = Join-Path $tempRoot "source.zip"
  $extractDir = Join-Path $tempRoot "source"
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

  $zipUrl = "https://github.com/$Repo/archive/refs/heads/$Branch.zip"
  Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force

  $sourceDir = Get-ChildItem -LiteralPath $extractDir -Directory | Select-Object -First 1
  if (-not $sourceDir) {
    throw "GitHub ZIP 압축 해제 결과를 찾을 수 없습니다."
  }

  New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
  if (Test-Path $AppDir) {
    Remove-Item -LiteralPath $AppDir -Recurse -Force
  }
  Copy-Item -LiteralPath $sourceDir.FullName -Destination $AppDir -Recurse

  New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
  $entry = Join-Path $AppDir "bin\meeting-harness.js"
  $cmd = "@echo off`r`nset `"MEETING_HARNESS_PYTHON=$VenvPython`"`r`nnode `"$entry`" %*`r`n"
  Set-Content -LiteralPath $CmdPath -Value $cmd -Encoding ASCII
  Ensure-Path $BinDir

  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}

Step "meeting-harness 설치를 시작합니다."

if (-not (HasCommand "node")) {
  Step "Node.js가 필요합니다."
  if (-not (HasCommand "winget")) {
    throw "Node.js가 없고 winget도 찾을 수 없습니다. https://nodejs.org 에서 Node.js LTS를 설치한 뒤 다시 실행하세요."
  }
  if (Confirm-Step "Node.js LTS를 winget으로 설치할까요?") {
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  } else {
    throw "Node.js 설치가 취소되었습니다."
  }
}

if (-not (HasCommand "npm")) {
  throw "npx skills installer 실행에 필요한 npm을 찾을 수 없습니다. Node.js LTS 설치가 정상 완료되었는지 확인하세요."
}

Install-AppFromGitHub

if (-not $SkipPythonDeps) {
  if ((-not (HasCommand "python")) -and (-not (HasCommand "py"))) {
    Step "Python이 필요합니다."
    if (-not (HasCommand "winget")) {
      throw "Python이 없고 winget도 찾을 수 없습니다. https://python.org 에서 Python을 설치한 뒤 다시 실행하세요."
    }
    if (Confirm-Step "Python을 winget으로 설치할까요?") {
      winget install Python.Python.3.13 --accept-source-agreements --accept-package-agreements
    } else {
      throw "Python 설치가 취소되었습니다."
    }
  }

  if (-not (HasCommand "ffmpeg")) {
    Step "ffmpeg가 필요합니다."
    if (-not (HasCommand "winget")) {
      throw "ffmpeg가 없고 winget도 찾을 수 없습니다. ffmpeg를 설치한 뒤 다시 실행하세요."
    }
    if (Confirm-Step "ffmpeg를 winget으로 설치할까요?") {
      winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
    } else {
      throw "ffmpeg 설치가 취소되었습니다."
    }
  }

  Ensure-Venv

  $packages = @("faster-whisper", "python-docx", "reportlab", "pymupdf", "pypdf")
  $missing = @()
  foreach ($package in $packages) {
    if (-not (HasVenvPythonPackage $package)) { $missing += $package }
  }
  if ($missing.Count -gt 0) {
    Step "하네스 전용 가상환경에 Python 패키지를 설치합니다: $($missing -join ', ')"
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install $missing
  } else {
    Step "하네스 전용 가상환경에 필수 Python 패키지가 이미 설치되어 있습니다. 건너뜁니다."
  }
}

if (-not $SkipSkill) {
  if ((SkillInstalled "meeting-harness") -and -not $Force) {
    Step "meeting-harness skill이 이미 설치되어 있습니다. 건너뜁니다."
  } else {
    Step "meeting-harness skill을 설치합니다."
    npx -y skills@latest add $SkillSource -g --skill meeting-harness --agent '*' -y
  }
}

if (-not $SkipSetup) {
  Step "환경 점검을 실행합니다."
  & $CmdPath setup
}

Step "설치가 끝났습니다."
Write-Host "새 터미널을 열면 meeting-harness 명령을 바로 사용할 수 있습니다."
Write-Host "회의 파일이 있는 폴더에서 Codex/Claude에게 다음처럼 요청하세요."
Write-Host '$meeting-harness 이 폴더의 회의 녹화 파일로 회의록 작성해줘.'
