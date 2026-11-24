import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { LaptopFrame } from './DeviceFrames'
import { Reveal } from './Reveal'
import { prefersReducedMotion, usePageVisible } from './useReveal'
import { tourVideo, type TourId } from './landingData'

interface Step { n: string; title: string; text: string; tour: TourId }

const STEPS: Step[] = [
  { n: '01', title: 'A intimação chega sozinha', text: 'Importada do DJEN pela sua OAB, todo dia. Você não procura nada.', tour: 'intimacoes' },
  { n: '02', title: 'O prazo já vem calculado', text: 'Dias úteis, feriados do tribunal, data interna e data fatal.', tour: 'prazos' },
  { n: '03', title: 'A equipe sabe o que fazer', text: 'Vira tarefa com responsável, entra na agenda e avisa antes de vencer.', tour: 'painel' },
]

/**
 * Uma única história rolada: a tela fica fixa e troca conforme você desce
 * (intimação → prazo → tarefa). No celular vira uma lista simples, sem fixar nada.
 */
export function StoryScroll() {
  const wrap = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [p, setP] = useState(0)
  const visible = usePageVisible()

  useEffect(() => {
    let raf = 0
    const calc = () => {
      raf = 0
      const el = wrap.current
      if (!el || window.innerWidth < 1024) return
      const r = el.getBoundingClientRect()
      const total = r.height - window.innerHeight
      const prog = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0
      setP(prog)
      setStep(Math.min(STEPS.length - 1, Math.floor(prog * STEPS.length)))
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(calc) }
    calc()
    window.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('scroll', on); window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf) }
  }, [])

  function goTo(i: number) {
    const el = wrap.current
    if (!el) return
    const total = el.offsetHeight - window.innerHeight
    const top = el.getBoundingClientRect().top + window.scrollY + total * ((i + 0.5) / STEPS.length)
    window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  // fração dentro do passo atual, para a tela "respirar" entre trocas
  const local = Math.min(1, Math.max(0, p * STEPS.length - step))

  return (
    <section id="demonstracao" className="relative border-t border-[color:var(--lh-divider)]">
      {/* ── Desktop: palco fixo ── */}
      <div ref={wrap} className="hidden lg:block relative" style={{ height: `${STEPS.length * 65 + 35}vh` }}>
        <div className="sticky top-0 h-screen flex items-center overflow-hidden">
          <div className="max-w-7xl w-full mx-auto px-8 grid grid-cols-12 gap-12 items-center">
            <div className="col-span-5">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">Como funciona</span>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-[-0.03em]" style={{ textWrap: 'balance' } as React.CSSProperties}>
                Do aviso ao prazo cumprido, <span className="text-[#1677FF]">sem planilha.</span>
              </h2>
              <ol className="mt-10 relative">
                <span aria-hidden className="absolute left-[15px] top-2 bottom-2 w-px bg-white/10" />
                <span aria-hidden className="absolute left-[15px] top-2 w-px bg-[#1677FF] origin-top"
                  style={{ height: 'calc(100% - 1rem)', transform: `scaleY(${p})` }} />
                {STEPS.map((s, i) => {
                  const on = i === step
                  return (
                    <li key={s.n} className="relative pl-12 pb-8 last:pb-0">
                      <button type="button" onClick={() => goTo(i)} aria-current={on ? 'step' : undefined} className="text-left group">
                        <span className={cn('absolute left-0 top-0 w-[31px] h-[31px] rounded-full grid place-items-center text-[11px] font-bold font-mono border transition-all duration-500',
                          i <= step ? 'bg-[#1677FF] border-[#1677FF] text-white' : 'bg-[#020711] border-white/20 text-[color:var(--lh-muted)]')}>{s.n}</span>
                        <span className={cn('block font-display text-xl font-semibold tracking-[-0.02em] transition-all duration-500',
                          on ? 'text-white translate-x-0' : 'text-[color:var(--lh-muted)] group-hover:text-white')}>{s.title}</span>
                        <span className="block overflow-hidden transition-all duration-500 ease-out text-[color:var(--lh-muted)] leading-relaxed"
                          style={{ maxHeight: on ? 64 : 0, opacity: on ? 1 : 0, marginTop: on ? 6 : 0 }}>{s.text}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>

            <div className="col-span-7" style={{ perspective: 1600 }}>
              <div style={{ transform: `rotateY(${(-7 + p * 7).toFixed(2)}deg) rotateX(${(3 - p * 3).toFixed(2)}deg) scale(${(0.94 + p * 0.06).toFixed(3)})`, transformOrigin: 'center', willChange: 'transform' }}>
                <LaptopFrame>
                  <div className="relative aspect-[16/10] bg-[#06152D]">
                    {STEPS.map((s, i) => {
                      const v = tourVideo(s.tour)
                      const on = i === step
                      return (
                        <div key={s.tour} aria-hidden={!on} className="absolute inset-0 transition-[opacity,transform] duration-700 ease-out"
                          style={{ opacity: on ? 1 : 0, transform: on ? `scale(${1 + local * 0.025})` : 'scale(1.05)' }}>
                          <img src={v.poster} alt="" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover object-top" />
                          {on && visible && (
                            <video key={s.tour} poster={v.poster} muted autoPlay loop playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover object-top">
                              <source src={v.src} type="video/mp4" />
                              <source src={v.src.replace(/\.mp4$/, '.webm')} type="video/webm" />
                            </video>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </LaptopFrame>
                <p className="mt-4 text-center text-[11px] text-[color:var(--lh-muted)] opacity-70">Gravação real, escritório de demonstração com dados fictícios.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Celular/tablet: lista simples ── */}
      <div className="lg:hidden px-5 sm:px-8 py-16 sm:py-20 max-w-2xl mx-auto">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">Como funciona</span>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-[-0.03em]" style={{ textWrap: 'balance' } as React.CSSProperties}>
          Do aviso ao prazo cumprido, <span className="text-[#1677FF]">sem planilha.</span>
        </h2>
        <div className="mt-10 space-y-12">
          {STEPS.map(s => {
            const v = tourVideo(s.tour)
            return (
              <Reveal key={s.n}>
                <div className="rounded-xl overflow-hidden border border-white/10 bg-[#06152D] aspect-[16/10]">
                  <img src={v.poster} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover object-top" />
                </div>
                <p className="mt-4 font-mono text-xs text-[#1677FF] font-bold">{s.n}</p>
                <h3 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-1.5 text-[color:var(--lh-muted)] leading-relaxed">{s.text}</p>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
