#!/bin/sh
# Copia clipes gravados (out/<clipe>.mp4) para public/demo: MP4 + WebM (VP9) +
# pôster JPG (frame de 2,5s, depois da animação de entrada do app).
# Uso: ./publish.sh dashboard:painel processos:processos ...
set -e
D=$(cd "$(dirname "$0")" && pwd)
F=$(node -e "console.log(require('ffmpeg-static'))")
OUT=$D/../../public/demo
for pair in "$@"; do
  src=${pair%%:*}; dst=${pair##*:}
  cp "$D/out/$src.mp4" "$OUT/$dst.mp4"
  "$F" -y -loglevel error -ss 2.5 -i "$OUT/$dst.mp4" -frames:v 1 -q:v 5 "$OUT/$dst.jpg"
  "$F" -y -loglevel error -i "$OUT/$dst.mp4" -c:v libvpx-vp9 -b:v 0 -crf 40 -row-mt 1 -deadline good -cpu-used 4 -an "$OUT/$dst.webm"
  echo "$dst ok"
done
