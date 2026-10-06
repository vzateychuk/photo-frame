#!/usr/bin/env bash
# Конвертация RAW и TIFF → JPEG рядом с исходником.
# После успешной проверки результата исходник удаляется (если не --keep).
#
# Поддержка: .nef .cr2 .arw .dng .orf .rw2 .tif .tiff (без учёта регистра)
#
# Зависимости:
#   - ImageMagick (`convert`) — для TIFF и сборки JPEG из PPM
#   - dcraw — для RAW (лучше качество, чем «сырой» ImageMagick на NEF/CR2)
#
# Примеры:
#   ./scripts/convert-raw-tiff-to-jpeg.sh /media/vez/EXT256G/Photos
#   ./scripts/convert-raw-tiff-to-jpeg.sh --dry-run /path/to/Photos
#   ./scripts/convert-raw-tiff-to-jpeg.sh --keep /path/to/Photos

set -euo pipefail

# Построчный вывод сразу в терминал (иначе при буферизации кажется,
# что сообщения появляются только в конце).
if [[ -t 1 ]] && command -v stdbuf >/dev/null; then
  if [[ -z "${CONVERT_RAW_LINEBUF:-}" ]]; then
    export CONVERT_RAW_LINEBUF=1
    exec stdbuf -oL -eL -- "$0" "$@"
  fi
fi

log() { printf '%s\n' "$*"; }

DRY_RUN=0
KEEP=0
QUALITY=92
ROOT=""

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --keep) KEEP=1; shift ;;
    --quality)
      QUALITY="${2:?}"
      shift 2
      ;;
    -h|--help) usage 0 ;;
    -*)
      echo "Неизвестный флаг: $1" >&2
      usage 1
      ;;
    *)
      ROOT="$1"
      shift
      ;;
  esac
done

if [[ -z "$ROOT" ]]; then
  echo "Укажите каталог с фото." >&2
  usage 1
fi
if [[ ! -d "$ROOT" ]]; then
  echo "Каталог не найден: $ROOT" >&2
  exit 1
fi

command -v convert >/dev/null || {
  echo "Нужен ImageMagick (команда convert)." >&2
  exit 1
}
command -v dcraw >/dev/null || {
  echo "Нужен dcraw для RAW." >&2
  exit 1
}

is_raw() {
  case "$1" in
    nef|cr2|arw|dng|orf|rw2) return 0 ;;
    *) return 1 ;;
  esac
}
is_tiff() {
  case "$1" in
    tif|tiff) return 0 ;;
    *) return 1 ;;
  esac
}

convert_one() {
  local src="$1"
  local label="${2:-}"
  local ext="${src##*.}"
  ext="$(printf '%s' "$ext" | tr '[:upper:]' '[:lower:]')"
  local dir base dest tmp
  dir="$(dirname -- "$src")"
  base="$(basename -- "$src")"
  base="${base%.*}"
  dest="${dir}/${base}.jpg"
  tmp="${dir}/.${base}.convert.$$.jpg"

  if [[ -e "$dest" ]]; then
    log "${label}SKIP (уже есть JPEG): $src → $dest"
    return 0
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "${label}DRY-RUN: $src → $dest"
    return 0
  fi

  log "${label}CONVERT start: $src → $dest"
  if is_raw "$ext"; then
    if ! dcraw -c -w -q 3 "$src" | convert - -quality "$QUALITY" "jpeg:$tmp"; then
      rm -f -- "$tmp"
      echo "${label}FAIL (dcraw/convert): $src" >&2
      return 1
    fi
  elif is_tiff "$ext"; then
    if ! convert "$src" -quality "$QUALITY" "jpeg:$tmp"; then
      rm -f -- "$tmp"
      echo "${label}FAIL (convert): $src" >&2
      return 1
    fi
  else
    log "${label}SKIP (неподдерживаемый тип): $src"
    return 0
  fi

  if [[ ! -s "$tmp" ]]; then
    rm -f -- "$tmp"
    echo "${label}FAIL (пустой результат): $src" >&2
    return 1
  fi

  if ! identify -quiet "$tmp" >/dev/null 2>&1; then
    rm -f -- "$tmp"
    echo "${label}FAIL (результат не JPEG): $src" >&2
    return 1
  fi

  mv -f -- "$tmp" "$dest"

  if [[ "$KEEP" -eq 0 ]]; then
    rm -f -- "$src"
    log "${label}OK + deleted: $src"
  else
    log "${label}OK (kept source): $src"
  fi
}

ok=0
fail=0

log "Сканирование (по Samba может занять время): $ROOT"
mapfile -d '' files < <(
  find "$ROOT" -type f \( \
    -iname '*.nef' -o -iname '*.cr2' -o -iname '*.arw' -o -iname '*.dng' -o \
    -iname '*.orf' -o -iname '*.rw2' -o -iname '*.tif' -o -iname '*.tiff' \
  \) -print0 | sort -z
)

if [[ ${#files[@]} -eq 0 ]]; then
  log "Файлов RAW/TIFF не найдено в: $ROOT"
  exit 0
fi

total=${#files[@]}
log "Найдено файлов: $total"
log "quality=$QUALITY dry-run=$DRY_RUN keep=$KEEP"
log ""

i=0
for src in "${files[@]}"; do
  [[ -z "$src" ]] && continue
  i=$((i + 1))
  label="[$i/$total] "
  set +e
  convert_one "$src" "$label"
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    ok=$((ok + 1))
  else
    fail=$((fail + 1))
  fi
done

log ""
log "Готово. обработано_ok=$ok ошибок=$fail"
[[ "$fail" -eq 0 ]]
