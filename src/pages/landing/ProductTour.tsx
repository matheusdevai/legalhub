import { useRef, useState } from 'react'
import { BarChart3, Bell, CalendarDays, CheckCircle2, DollarSign, FolderOpen, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrowserFrame, DemoVideo } from './DemoVideo'
import { TOUR, tourVideo, type TourId } from './landingData'

const ICONS: Record<TourId, typeof BarChart3> = {
  painel: BarChart3,
  intimacoes: Bell,
  processos: FolderOpen,
  financeiro: DollarSign,
  agenda: CalendarDays,
  ia: Sparkles,
}

/**
 * Tour com abas: cada aba toca o vídeo daquela área do sistema. Sem interação
 * o tour avança sozinho ao fim de cada vídeo; depois que a pessoa escolhe uma
 * aba, o vídeo dela fica em loop e o avanço automático para.
 */
export function ProductTour() {
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [autoAdvance, setAutoAdvance] = useState(true)
  const chipsRef = useRef<HTMLDivElement>(null)
  const item = TOUR[index]
  const video = tourVideo(item.id)

  function select(i: number, fromUser: boolean) {
    if (fromUser) setAutoAdvance(false)
    setIndex(i)
    setProgress(0)
    const chip = chipsRef.current?.children[i] as HTMLElement | undefined
    chip?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-start">
      {/* Abas — chips com rolagem horizontal no celular, lista vertical no desktop */}
      <div className="lg:col-span-4 min-w-0">
        <div ref={chipsRef} role="tablist" aria-label="Áreas do sistema"
          className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible snap-x -mx-5 px-5 scroll-px-5 sm:mx-0 sm:px-0 sm:scroll-px-0 pb-1 lg:pb-0 [scrollbar-width:none]">
          {TOUR.map((t, i) => {
            const Icon = ICONS[t.id]
            const active = i === index
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                aria-controls="tour-panel"
                onClick={() => select(i, true)}
                className={cn(
                  'relative snap-start flex-shrink-0 lg:w-full text-left rounded-xl lg:rounded-2xl border transition-all overflow-hidden',
                  'px-3.5 py-2.5 lg:px-5 lg:py-4',
                  active ? 'border-[#1677FF]/40 bg-[#0B5CFF]/[0.08]' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                )}
              >
                <span className="flex items-center gap-2.5 lg:gap-3">
                  <span className={cn('w-7 h-7 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors',
                    active ? 'bg-[#0B5CFF] text-white' : 'bg-white/[0.06] text-[#A7B0C0]')}>
                    <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  </span>
                  <span className={cn('text-sm font-semibold whitespace-nowrap', active ? 'text-white' : 'text-[#A7B0C0]')}>{t.label}</span>
                </span>
                <span className={cn('hidden lg:grid transition-all duration-300', active ? 'grid-rows-[1fr] mt-2' : 'grid-rows-[0fr]')}>
                  <span className="overflow-hidden text-xs text-[#A7B0C0] leading-relaxed pl-12">{t.description}</span>
                </span>
                {active && autoAdvance && (
                  <span className="absolute left-0 bottom-0 h-0.5 bg-[#1677FF] transition-[width] duration-200 ease-linear" style={{ width: `${progress * 100}%` }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div id="tour-panel" role="tabpanel" aria-label={item.title} className="lg:col-span-8 min-w-0">
        <BrowserFrame path={item.path}>
          <DemoVideo
            src={video.src}
            poster={video.poster}
            label={`Demonstração: ${item.label}`}
            loop={!autoAdvance}
            onProgress={setProgress}
            onEnded={() => { if (autoAdvance) select((index + 1) % TOUR.length, false) }}
          />
        </BrowserFrame>
        <div key={item.id} className="mt-6 animate-fade-in">
          <h3 className="font-serif text-xl sm:text-2xl font-semibold text-white">{item.title}</h3>
          <p className="mt-2 text-sm text-[#A7B0C0] leading-relaxed lg:hidden">{item.description}</p>
          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {item.bullets.map(b => (
              <li key={b} className="flex items-start gap-2 text-sm text-[#cfd6e2] leading-snug">
                <CheckCircle2 className="w-4 h-4 text-[#1677FF] flex-shrink-0 mt-0.5" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
