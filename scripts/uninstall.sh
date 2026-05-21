#!/usr/bin/env bash
set -euo pipefail

YES="${YES:-0}"
SKIP_SKILL="${SKIP_SKILL:-0}"

INSTALL_ROOT="${HOME}/.meeting-harness"
BIN_DIR="${INSTALL_ROOT}/bin"

step() {
  printf "\n==> %s\n" "$1"
}

confirm() {
  if [ "$YES" = "1" ]; then
    return 0
  fi
  printf "%s [y/N] " "$1"
  read -r answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ] || [ "$answer" = "yes" ] || [ "$answer" = "YES" ]
}

has_command() {
  command -v "$1" >/dev/null 2>&1
}

remove_path_line() {
  shell_file="$1"
  [ -f "$shell_file" ] || return 0
  temp_file="$(mktemp)"
  awk '
    BEGIN { skip=0 }
    /^# meeting-harness$/ { skip=1; next }
    skip == 1 && $0 ~ /\\.meeting-harness\\/bin/ { skip=0; next }
    { print }
  ' "$shell_file" > "$temp_file"
  mv "$temp_file" "$shell_file"
}

step "meeting-harness 제거를 시작합니다."

if ! confirm "설치 폴더와 PATH 등록을 삭제할까요? 작업 폴더와 원본 미디어 파일은 삭제하지 않습니다."; then
  echo "제거가 취소되었습니다."
  exit 1
fi

if [ "$SKIP_SKILL" != "1" ] && has_command npx; then
  step "meeting-harness skill 제거를 시도합니다."
  npx -y skills@latest remove meeting-harness -g -y || true
fi

remove_path_line "${HOME}/.zshrc"
remove_path_line "${HOME}/.bashrc"
remove_path_line "${HOME}/.profile"
step "shell PATH 설정을 정리했습니다."

if [ -d "$INSTALL_ROOT" ]; then
  rm -rf "$INSTALL_ROOT"
  step "설치 폴더를 삭제했습니다: $INSTALL_ROOT"
else
  step "설치 폴더가 없습니다. 건너뜁니다."
fi

step "제거가 끝났습니다."
echo "이미 만들어진 회의 작업 폴더와 원본 파일은 삭제하지 않았습니다."
echo "새 터미널을 열면 meeting-harness 명령이 더 이상 잡히지 않습니다."
