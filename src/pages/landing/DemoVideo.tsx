import { useEffect, useRef, useState } from 'react'
import { Maximize2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react'
import { cn } from '@/lib/utils'

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** MP4 (H.264 + AAC) primeiro — Safari/iOS e quase todo navegador; WebM
 *  (VP9 + Opus) para quem não tem H.264. Legenda WebVTT da narração. Os três
 *  arquivos ficam lado a lado em public/demo com o mesmo nome. */
function VideoSources({ src }: { src: string }) {
  return (
    <>
      <source src={src} type="video/mp4" />
      <source src={src.replace(/\.mp4$/, '.webm')} type="video/webm" />
      <track kind="captions" src={src.replace(/\.mp4$/, '.vtt')} srcLang="pt-BR" label="Português" default />
    </>
  )
}

/** Moldura de navegador (bolinhas + barra de endereço) em volta de uma tela do app. */
export function BrowserFrame({ path, children, className }: { path: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl sm:rounded-2xl overflow-hidden border border-white/10 bg-[#0b1322]', className)}
      style={{ boxShadow: '0 40px 100px -24px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03)' }}>
      <div className="flex items-center gap-3 px-3 sm:px-4 h-8 sm:h-9 border-b border-white/[0.06] bg-[#0e1729]">
        <div className="flex gap-1.5 flex-shrink-0" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]/80" />
        </div>
        <div className="flex-1 min-w-0 flex justify-center">
          <span className="truncate max-w-xs w-full text-center text-[10px] sm:text-[11px] text-[#A7B0C0] bg-white/[0.05] rounded-md px-3 py-0.5">
            legalhubgestor.vercel.app{path}
          </span>
        </div>
        <span className="w-10 flex-shrink-0" aria-hidden />
      </div>
      {children}
    </div>
  )
}

interface DemoVideoProps {
  src: string
  poster: string
  label: string
  /** Toca sozinho (mudo) quando visível. Desligado se o usuário pede menos movimento. */
  autoPlay?: boolean
  loop?: boolean
  /** Controlado pelo pai (ex.: o tour mantém o som ligado ao trocar de aba). */
  muted?: boolean
  onMutedChange?: (muted: boolean) => void
  onEnded?: () => void
  onProgress?: (fraction: number) => void
  aspect?: string
  /** Botão "Ouvir narração" em versão compacta (telas pequenas, ex.: moldura de celular). */
  compact?: boolean
  className?: string
}

/**
 * Vídeo de demonstração narrado: toca mudo e legendado quando visível (só
 * baixa quando chega perto da tela, pausa fora dela, respeita
 * prefers-reduced-motion); "Ouvir narração" liga o som e recomeça do início;
 * tela cheia abre com controles e som.
 */
export function DemoVideo({ src, poster, label, autoPlay = true, loop = true, muted: mutedProp, onMutedChange, onEnded, onProgress, aspect = '16 / 10', compact = false, className }: DemoVideoProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [near, setNear] = useState(false)
  const [visible, setVisible] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [userPaused, setUserPaused] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [mutedState, setMutedState] = useState(true)
  const muted = mutedProp ?? mutedState
  const setMuted = (m: boolean) => { setMutedState(m); onMutedChange?.(m) }
  const reduced = prefersReducedMotion()
  const shouldAutoPlay = !userPaused && ((autoPlay && !reduced) || !muted)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const nearObs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); nearObs.disconnect() } }, { rootMargin: '400px' })
    const visObs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 })
    nearObs.observe(el)
    visObs.observe(el)
    return () => { nearObs.disconnect(); visObs.disconnect() }
  }, [])

  // Troca de vídeo (tour): recomeça do zero e libera a pausa manual
  useEffect(() => { setUserPaused(false) }, [src])

  useEffect(() => {
    const v = videoRef.current
    if (v) v.muted = muted
  }, [muted, near, src])

  useEffect(() => {
    const v = videoRef.current
    if (!v || !near) return
    if (visible && shouldAutoPlay && !expanded) {
      v.play().catch(() => {
        // Navegador barrou som sem gesto do usuário (ex.: Safari ao trocar de
        // vídeo): volta para mudo e segue tocando com legenda.
        if (!v.muted) { v.muted = true; setMuted(true); v.play().catch(() => {}) }
      })
    } else if (!visible || expanded) v.pause()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, shouldAutoPlay, near, src, expanded])

  function toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { setUserPaused(false); v.play().catch(() => {}) }
    else { setUserPaused(true); v.pause() }
  }

  function enableSound() {
    const v = videoRef.current
    setMuted(false)
    setUserPaused(false)
    if (!v) return
    v.muted = false
    v.currentTime = 0
    v.play().catch(() => { v.muted = true; setMuted(true) })
  }

  return (
    <>
      <div ref={wrapRef} className={cn('relative group bg-[#06152D] overflow-hidden', className)} style={{ aspectRatio: aspect }}>
        {near ? (
          <video
            ref={videoRef}
            key={src}
            poster={poster}
            muted
            playsInline
            loop={loop}
            preload="metadata"
            aria-label={label}
            className="lh-demo-video absolute inset-0 w-full h-full object-cover object-top"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => onEnded?.()}
            onTimeUpdate={e => {
              const v = e.currentTarget
              if (v.duration) onProgress?.(v.currentTime / v.duration)
            }}
          >
            <VideoSources src={src} />
          </video>
        ) : (
          <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover object-top" loading="lazy" />
        )}

        {!playing && (
          <button
            onClick={toggle}
            className="absolute inset-0 flex items-center justify-center bg-[#020711]/25 hover:bg-[#020711]/10 transition-colors"
            aria-label={`Reproduzir vídeo: ${label}`}
          >
            <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#0B5CFF] flex items-center justify-center shadow-[0_10px_40px_rgba(11,92,255,0.55)]">
              <Play className="w-6 h-6 text-white translate-x-0.5" fill="currentColor" />
            </span>
          </button>
        )}

        {near && muted && (
          <button onClick={enableSound} aria-label={`Ouvir narração: ${label}`}
            className={cn('absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-[#0B5CFF] text-white font-semibold shadow-[0_6px_20px_rgba(11,92,255,0.5)] hover:brightness-110 transition',
              compact ? 'p-2' : 'pl-2.5 pr-3.5 py-1.5 text-xs')}>
            <Volume2 className={compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
            {!compact && 'Ouvir narração'}
          </button>
        )}

        <div className={cn('absolute bottom-2.5 right-2.5 flex gap-1.5 transition-opacity', playing ? 'opacity-0 group-hover:opacity-100 focus-within:opacity-100' : 'opacity-100')}>
          {!muted && (
            <button onClick={() => setMuted(true)} aria-label="Silenciar narração"
              className="w-8 h-8 rounded-lg bg-[#020711]/75 backdrop-blur border border-white/10 flex items-center justify-center text-white hover:bg-[#020711]">
              <VolumeX className="w-3.5 h-3.5" />
            </button>
          )}
          {playing && (
            <button onClick={toggle} aria-label="Pausar vídeo"
              className="w-8 h-8 rounded-lg bg-[#020711]/75 backdrop-blur border border-white/10 flex items-center justify-center text-white hover:bg-[#020711]">
              <Pause className="w-3.5 h-3.5" fill="currentColor" />
            </button>
          )}
          <button onClick={() => setExpanded(true)} aria-label="Ver em tela cheia, com som"
            className="w-8 h-8 rounded-lg bg-[#020711]/75 backdrop-blur border border-white/10 flex items-center justify-center text-white hover:bg-[#020711]">
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && <VideoLightbox src={src} poster={poster} label={label} onClose={() => setExpanded(false)} />}
    </>
  )
}

function VideoLightbox({ src, poster, label, onClose }: { src: string; poster: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={label}
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-8 bg-[#020711]/90 backdrop-blur-sm animate-fade-in"
      onClick={onClose}>
      <div className="relative w-full max-w-6xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} autoFocus aria-label="Fechar vídeo"
          className="absolute -top-11 right-0 w-9 h-9 rounded-full border border-white/15 flex items-center justify-center text-white hover:bg-white/10">
          <X className="w-4 h-4" />
        </button>
        {/* Aberto por clique: pode tocar com som */}
        <video poster={poster} controls autoPlay playsInline className="lh-demo-video lh-demo-video-lg w-full max-h-[80vh] rounded-xl border border-white/10 bg-black">
          <VideoSources src={src} />
        </video>
        <p className="mt-3 text-center text-xs text-[#A7B0C0]">{label} · dados fictícios de um escritório de demonstração</p>
      </div>
    </div>
  )
}
