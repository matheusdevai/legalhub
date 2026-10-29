#!/bin/sh
# Copia clipes gravados (out/<clipe>.mp4 + .vtt + .jpg) para public/demo e gera
# o WebM (VP9 + Opus). Uso: ./publish.sh painel processos ...  (ou origem:destino)
set -e
D=$(cd "$(dirname "$0")" && pwd)
F=$(node -e "console.log(require('ffmpeg-static'))")
OUT=${DEMO_OUT:-$D/../../public/demo}
for pair in "$@"; do
  src=${pair%%:*}; dst=${pair##*:}
  cp "$D/out/$src.mp4" "$OUT/$dst.mp4"
  cp "$D/out/$src.jpg" "$OUT/$dst.jpg"
  [ -f "$D/out/$src.vtt" ] && cp "$D/out/$src.vtt" "$OUT/$dst.vtt"
  "$F" -y -loglevel error -i "$OUT/$dst.mp4" -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 4 -c:a libopus -b:a 64k "$OUT/$dst.webm"
  echo "$dst ok"
done
