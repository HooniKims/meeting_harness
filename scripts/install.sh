#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-HooniKims/meeting_harness}"
BRANCH="${BRANCH:-main}"
SKILL_SOURCE="${SKILL_SOURCE:-$REPO}"
SKIP_SKILL="${SKIP_SKILL:-0}"
SKIP_SETUP="${SKIP_SETUP:-0}"
SKIP_PYTHON_DEPS="${SKIP_PYTHON_DEPS:-0}"
FORCE="${FORCE:-0}"
YES="${YES:-0}"

INSTALL_ROOT="${HOME}/.meeting-harness"
APP_DIR="${INSTALL_ROOT}/app"
BIN_DIR="${INSTALL_ROOT}/bin"
VENV_DIR="${INSTALL_ROOT}/venv"
VENV_PYTHON="${VENV_DIR}/bin/python"
LAUNCHER="${BIN_DIR}/meeting-harness"
NPM_CACHE_DIR="${INSTALL_ROOT}/npm-cache"
FFMPEG_TOOL_DIR="${INSTALL_ROOT}/tools/ffmpeg"
FFMPEG_BIN="${BIN_DIR}/ffmpeg"
FFMPEG_STATIC_VERSION="${FFMPEG_STATIC_VERSION:-5.3.0}"

step() {
  printf "\n==> %s\n" "$1"
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

confirm() {
  if [ "$YES" = "1" ]; then
    return 0
  fi
  printf "%s [Y/n] " "$1"
  read -r answer
  [ -z "$answer" ] || [ "$answer" = "y" ] || [ "$answer" = "Y" ] || [ "$answer" = "yes" ] || [ "$answer" = "YES" ]
}

run_python() {
  if has_command python3; then
    python3 "$@"
  else
    python "$@"
  fi
}

has_venv_python_package() {
  "$VENV_PYTHON" -m pip show "$1" >/dev/null 2>&1
}

ensure_venv() {
  if [ "$FORCE" = "1" ] && [ -d "$VENV_DIR" ]; then
    rm -rf "$VENV_DIR"
  fi

  if [ ! -x "$VENV_PYTHON" ]; then
    step "하네스 전용 Python 가상환경을 만듭니다."
    run_python -m venv "$VENV_DIR"
  else
    step "하네스 전용 Python 가상환경이 이미 있습니다. 건너뜁니다."
  fi
}

install_ffmpeg_with_npm() {
  if ! has_command npm; then
    echo "npm을 찾을 수 없어 ffmpeg 자동 설치를 계속할 수 없습니다."
    return 1
  fi

  step "npm으로 ffmpeg를 설치합니다."
  mkdir -p "$BIN_DIR" "$NPM_CACHE_DIR"
  npm install \
    --cache "$NPM_CACHE_DIR" \
    --prefix "$FFMPEG_TOOL_DIR" \
    "ffmpeg-static@${FFMPEG_STATIC_VERSION}"

  ffmpeg_static_bin="${FFMPEG_TOOL_DIR}/node_modules/ffmpeg-static/ffmpeg"
  if [ ! -x "$ffmpeg_static_bin" ]; then
    echo "ffmpeg-static 설치 결과에서 실행 파일을 찾을 수 없습니다: $ffmpeg_static_bin"
    return 1
  fi

  ln -sf "$ffmpeg_static_bin" "$FFMPEG_BIN"
  export PATH="${BIN_DIR}:$PATH"
}

ensure_ffmpeg() {
  if has_command ffmpeg; then
    return 0
  fi

  step "ffmpeg가 필요합니다."
  if has_command brew; then
    if confirm "Homebrew로 ffmpeg를 설치할까요?"; then
      if brew install ffmpeg; then
        return 0
      fi
      echo "Homebrew ffmpeg 설치에 실패했습니다. npm fallback을 시도합니다."
    else
      echo "Homebrew 설치를 건너뛰고 npm fallback을 시도합니다."
    fi
  fi

  install_ffmpeg_with_npm
}

skill_installed() {
  npx -y skills@latest ls -g --json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const x=JSON.parse(s);process.exit(x.some(i=>i.name==='meeting-harness')?0:1)}catch{process.exit(1)}})"
}

ensure_path_line() {
  shell_file="$1"
  mkdir -p "$(dirname "$shell_file")"
  touch "$shell_file"
  line="export PATH=\"${BIN_DIR}:\$PATH\""
  if ! grep -F "$line" "$shell_file" >/dev/null 2>&1; then
    printf "\n# meeting-harness\n%s\n" "$line" >> "$shell_file"
    step "PATH 설정을 추가했습니다: $shell_file"
  fi
}

install_app_from_github() {
  if [ -x "$LAUNCHER" ] && [ -d "$APP_DIR" ] && [ "$FORCE" != "1" ]; then
    step "meeting-harness 앱이 이미 설치되어 있습니다. 최신 버전으로 갱신합니다."
  else
    step "GitHub에서 meeting-harness를 다운로드합니다."
  fi

  temp_root="$(mktemp -d)"
  zip_path="${temp_root}/source.zip"
  extract_dir="${temp_root}/source"
  mkdir -p "$extract_dir"

  zip_url="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.zip"
  if has_command curl; then
    curl -fsSL "$zip_url" -o "$zip_path"
  else
    run_python -c "import urllib.request; urllib.request.urlretrieve('$zip_url', '$zip_path')"
  fi

  if has_command unzip; then
    unzip -q "$zip_path" -d "$extract_dir"
  else
    run_python -m zipfile -e "$zip_path" "$extract_dir"
  fi

  source_dir="$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [ -z "$source_dir" ]; then
    echo "GitHub ZIP 압축 해제 결과를 찾을 수 없습니다."
    exit 1
  fi

  mkdir -p "$INSTALL_ROOT"
  rm -rf "$APP_DIR"
  cp -R "$source_dir" "$APP_DIR"

  mkdir -p "$BIN_DIR"
  cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
export MEETING_HARNESS_PYTHON="${VENV_PYTHON}"
node "${APP_DIR}/bin/meeting-harness.js" "\$@"
EOF
  chmod +x "$LAUNCHER"

  case "${SHELL:-}" in
    */zsh) ensure_path_line "${HOME}/.zshrc" ;;
    */bash) ensure_path_line "${HOME}/.bashrc" ;;
    *) ensure_path_line "${HOME}/.profile" ;;
  esac
  export PATH="${BIN_DIR}:$PATH"

  rm -rf "$temp_root"
}

step "meeting-harness 설치를 시작합니다."

if ! has_command node; then
  step "Node.js가 필요합니다."
  if has_command brew; then
    if confirm "Homebrew로 Node.js를 설치할까요?"; then
      brew install node
    else
      echo "Node.js 설치가 취소되었습니다."
      exit 1
    fi
  else
    echo "Node.js가 없고 자동 설치 도구를 찾지 못했습니다. https://nodejs.org 에서 Node.js LTS를 설치한 뒤 다시 실행하세요."
    exit 1
  fi
fi

if ! has_command npm; then
  echo "npx skills installer 실행에 필요한 npm을 찾을 수 없습니다. Node.js LTS 설치가 정상 완료되었는지 확인하세요."
  exit 1
fi

install_app_from_github

if [ "$SKIP_PYTHON_DEPS" != "1" ]; then
  if ! has_command python3 && ! has_command python; then
    step "Python이 필요합니다."
    if has_command brew; then
      if confirm "Homebrew로 Python을 설치할까요?"; then
        brew install python
      else
        echo "Python 설치가 취소되었습니다."
        exit 1
      fi
    else
      echo "Python이 없고 자동 설치 도구를 찾지 못했습니다. https://python.org 에서 Python을 설치한 뒤 다시 실행하세요."
      exit 1
    fi
  fi

  ensure_ffmpeg

  ensure_venv

  missing=()
  for package in faster-whisper python-docx reportlab pymupdf pypdf; do
    if ! has_venv_python_package "$package"; then
      missing+=("$package")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    step "하네스 전용 가상환경에 Python 패키지를 설치합니다: ${missing[*]}"
    "$VENV_PYTHON" -m pip install --upgrade pip
    "$VENV_PYTHON" -m pip install "${missing[@]}"
  else
    step "하네스 전용 가상환경에 필수 Python 패키지가 이미 설치되어 있습니다. 건너뜁니다."
  fi
fi

if [ "$SKIP_SKILL" != "1" ]; then
  if skill_installed && [ "$FORCE" != "1" ]; then
    step "meeting-harness skill이 이미 설치되어 있습니다. 최신 버전으로 갱신합니다."
  else
    step "meeting-harness skill을 설치합니다."
  fi
  npx -y skills@latest add "$SKILL_SOURCE" -g --skill meeting-harness --agent '*' -y
fi

if [ "$SKIP_SETUP" != "1" ]; then
  step "환경 점검을 실행합니다."
  "$LAUNCHER" setup
fi

step "설치가 끝났습니다."
echo "새 터미널을 열면 meeting-harness 명령을 바로 사용할 수 있습니다."
echo "회의 파일이 있는 폴더에서 Codex/Claude에게 다음처럼 요청하세요."
echo '$meeting-harness 이 폴더의 회의 녹화 파일로 회의록 작성해줘.'
