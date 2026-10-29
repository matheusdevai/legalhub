// Narração: sintetiza cada fala com a voz do macOS (AVSpeechSynthesizer via
// ./tts, compilado de tts.swift), com cache por texto+voz, e gera as legendas
// WebVTT a partir das falas posicionadas no tempo do vídeo.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')

const TTS = path.join(__dirname, 'tts')
const CACHE = path.join(__dirname, 'tts-cache')
// Luciana Premium quando instalada (Ajustes → Acessibilidade → Conteúdo Falado);
// senão a Luciana compacta. VOICE_ID sobrepõe.
const VOICES = ['com.apple.voice.premium.pt-BR.Luciana', 'com.apple.voice.enhanced.pt-BR.Luciana', 'com.apple.voice.compact.pt-BR.Luciana']
const RATE = process.env.VOICE_RATE || '0.52'

let voiceId = process.env.VOICE_ID
function pickVoice() {
  if (voiceId) return voiceId
  const probe = path.join(CACHE, 'probe.txt')
  fs.mkdirSync(CACHE, { recursive: true })
  fs.writeFileSync(probe, 'teste')
  for (const v of VOICES) {
    try { execFileSync(TTS, [v, probe, path.join(CACHE, 'probe.caf')], { stdio: 'pipe' }); voiceId = v; break } catch {}
  }
  if (!voiceId) throw new Error('nenhuma voz Luciana disponível')
  console.log('voz:', voiceId)
  return voiceId
}

function durationOf(file) {
  const out = execFileSync('afinfo', [file]).toString()
  return parseFloat(out.match(/estimated duration: ([\d.]+)/)[1])
}

function synth(text) {
  const voice = pickVoice()
  const key = crypto.createHash('sha1').update(voice + '|' + RATE + '|' + text).digest('hex').slice(0, 16)
  const file = path.join(CACHE, key + '.caf')
  if (!fs.existsSync(file)) {
    const txt = path.join(CACHE, key + '.txt')
    fs.writeFileSync(txt, text)
    execFileSync(TTS, [voice, txt, file, RATE], { stdio: 'pipe' })
  }
  return { file, dur: durationOf(file) }
}

function vttTime(s) {
  const ms = Math.round(s * 1000)
  const hh = String(Math.floor(ms / 3600000)).padStart(2, '0')
  const mm = String(Math.floor(ms / 60000) % 60).padStart(2, '0')
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, '0')
  return `${hh}:${mm}:${ss}.${String(ms % 1000).padStart(3, '0')}`
}

const MAX_CUE = 64

/** Quebra uma frase longa em trechos de até MAX_CUE caracteres, preferindo vírgula/dois-pontos. */
function splitLong(sentence) {
  if (sentence.length <= MAX_CUE) return [sentence]
  const chunks = sentence.split(/(?<=[,:;])\s+/)
  const out = []
  let cur = ''
  for (const ch of chunks) {
    if (cur && (cur + ' ' + ch).length > MAX_CUE) { out.push(cur); cur = ch } else cur = cur ? cur + ' ' + ch : ch
  }
  if (cur) out.push(cur)
  // Trecho ainda longo (sem vírgula): corta no espaço mais perto do meio
  return out.flatMap(c => {
    if (c.length <= MAX_CUE + 12) return [c]
    const mid = c.lastIndexOf(' ', Math.ceil(c.length / 2))
    return [c.slice(0, mid), c.slice(mid + 1)]
  })
}

/** Uma fala vira 1+ trechos de legenda (frases e pedaços curtos), com tempo proporcional ao tamanho. */
function splitCue(c) {
  const parts = c.text.match(/[^.!?]+[.!?]+|[^.!?]+$/g).map(s => s.trim()).filter(Boolean).flatMap(splitLong)
  const total = parts.reduce((s, p) => s + p.length, 0)
  let t = c.start
  return parts.map(p => {
    const d = c.dur * (p.length / total)
    const cue = { text: p, start: t, end: t + d }
    t += d
    return cue
  })
}

function buildVtt(cues) {
  const lines = ['WEBVTT', '']
  for (const c of cues) for (const p of splitCue(c)) lines.push(`${vttTime(p.start)} --> ${vttTime(p.end)}`, p.text, '')
  return lines.join('\n')
}

module.exports = { synth, buildVtt, splitCue }
