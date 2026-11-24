import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Play } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tourVideo } from './landingData'
import { BENTO, type BentoItem } from './motionData'
import { canHover, revealStyle, STAGGER_MS, useInView, usePrefersReducedMotion, useReveal } from './useReveal'

const SPAN: Record<BentoItem['span'], string> = {
  big: 'sm:col-span-2 sm:row-span-2',
  wide: 'sm:col-span-2',
  tall: 'sm:row-span-2',
  one: '',
}

// Tela recolhida: aparece só a parte de cima da gravação, saindo da base do bloco.
const CLIP_COLLAPSED: Record<BentoItem['span'], string> = {
  big: 'inset(46% 7% -1px 7% round 14px 14px 0 0)',
  wide: 'inset(40% 5% -1px 54% round 12px 12px 0 0)',
  tall: 'inset(46% 7% -1px 7% round 12px 12px 0 0)',
  one: 'inset(60% 7% -1px 7% round 12px 12px 0 0)',
}
const CLIP_OPEN = 'inset(0% 0% 0% 0% round 16px)'
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return !!c?.saveData
}

function BentoTile({ item, index, sectionVisible }: { item: BentoItem; index: number; sectionVisible: boolean }) {
  const tileRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const reduced = usePrefersReducedMotion()
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [touch, setTouch] = useState(false)
  const [mounted, setMounted] = useState(false)
  // No toque não há hover: o bloco que cruza a faixa central da tela abre sozinho.
  const inCenter = useInView(tileRef, { rootMargin: '-38% 0px -38% 0px' })
  const onScreen = useInView(tileRef, { threshold: 0.35 })
  const video = tourVideo(item.video)

  useEffect(() => { setTouch(!canHover()) }, [])

  const open = hover || focused || pinned || (touch && inCenter && !reduced)
  const shouldPlay = open && onScreen && (pinned || (!reduced && !saveData()))

  // O <video> só nasce na 1ª abertura (nada baixa antes) e fica montado depois.
  useEffect(() => { if (open) setMounted(true) }, [open])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    if (shouldPlay) v.play().catch(() => {})
    else v.pause()
  }, [shouldPlay, mounted])

  return (
    <article
      ref={tileRef}
      className={cn('group relative rounded-2xl border bg-[color:var(--lh-card)] lh-card overflow-hidden transition-colors duration-300',
        open ? 'border-[#1677FF]/40' : 'border-[color:var(--lh-border)]', SPAN[item.span])}
      style={revealStyle(sectionVisible, (index % 4) * STAGGER_MS + Math.floor(index / 4) * 40, reduced)}
      onPointerEnter={e => { if (e.pointerType === 'mouse') setHover(true) }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setHover(false) }}
    >
      {/* Texto */}
      <div className="relative p-5 sm:p-6 transition-[opacity,transform] duration-300"
        style={{ opacity: open ? 0 : 1, transform: open && !reduced ? 'translate3d(0,-8px,0)' : 'none' }}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-base sm:text-[17px] font-semibold tracking-[-0.01em] text-[color:var(--lh-fg)]">{item.title}</h3>
          {item.span !== 'one' && <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--lh-muted)] whitespace-nowrap pt-1">{item.path}</span>}
        </div>
        <p className={cn('mt-1.5 text-sm text-[color:var(--lh-muted)] leading-relaxed', item.span === 'big' ? 'max-w-md' : item.span === 'wide' ? 'max-w-[50%]' : '')}>{item.description}</p>
      </div>

      {/* Tela com a gravação real: recolhida embaixo, expande cobrindo o bloco */}
      <div aria-hidden className="absolute inset-0 bg-[#06152D] overflow-hidden"
        style={{
          clipPath: open ? CLIP_OPEN : CLIP_COLLAPSED[item.span],
          transition: reduced ? 'none' : `clip-path 620ms ${EASE}`,
        }}>
        <img src={video.poster} alt="" loading="lazy" decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-700"
          style={{ transform: open && !reduced ? 'scale(1)' : 'scale(1.04)', transitionTimingFunction: EASE }} />
        {mounted && (
          <video ref={videoRef} poster={video.poster} muted playsInline loop preload="metadata"
            className="absolute inset-0 w-full h-full object-cover object-top">
            <source src={video.src} type="video/mp4" />
            <source src={video.src.replace(/\.mp4$/, '.webm')} type="video/webm" />
          </video>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 pt-16 transition-opacity duration-300"
          style={{ opacity: open ? 1 : 0, background: 'linear-gradient(to top, rgba(2,7,17,0.92), rgba(2,7,17,0.55) 55%, transparent)', transitionDelay: open ? '180ms' : '0ms' }}>
          <p className="font-display text-base font-semibold text-white">{item.title}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#A7B0C0]">gravação real · dados fictícios</p>
        </div>
      </div>

      {/* Controle acessível: foco abre, clique fixa aberto (e toca, mesmo com "reduzir movimento") */}
      <button type="button" aria-pressed={pinned}
        aria-label={`${pinned ? 'Fechar' : 'Ver'} a gravação de ${item.title}`}
        className="absolute inset-0 w-full h-full rounded-2xl cursor-pointer"
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onClick={() => setPinned(p => !p)}>
        <span className={cn('absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300',
          open ? 'opacity-100 bg-white/10 text-white border border-white/15' : 'opacity-0')}>
          {pinned ? <ArrowUpRight className="w-3.5 h-3.5 rotate-180" /> : <Play className="w-3 h-3 translate-x-px" fill="currentColor" />}
        </span>
      </button>
    </article>
  )
}

/**
 * Grade "bento" das funcionalidades: cada bloco mostra o começo da gravação
 * real daquela área; com o mouse em cima (ou foco, ou no celular quando o
 * bloco passa pelo meio da tela) a tela expande e o vídeo toca mudo. Só
 * clip-path/opacity/transform — o bloco nunca muda de tamanho (CLS zero).
 */
export function FeatureBento() {
  const { ref, visible } = useReveal<HTMLDivElement>(0.05)
  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 auto-rows-[250px] sm:auto-rows-[236px] lg:auto-rows-[228px] gap-4">
      {BENTO.map((item, i) => <BentoTile key={item.id} item={item} index={i} sectionVisible={visible} />)}
    </div>
  )
}
