import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { prefersReducedMotion, useInView, usePageVisible } from './useReveal'

const FPS = 30
const FRAME_MS = 1000 / FPS
const GRID = 44            // px entre as linhas da grade
const LINK_DIST = 132      // distância máx. para ligar dois pontos
const MAX_NODES = 54

interface Node { x: number; y: number; vx: number; vy: number }
interface Pulse { horizontal: boolean; line: number; pos: number; speed: number; len: number }

/**
 * Fundo tecnológico leve em <canvas>: grade fina + pontos que derivam devagar
 * ligados por linhas finas + alguns "sinais" correndo pela grade. Sem blur,
 * sem glow. 30 fps, DPR limitado a 1,5, pausa fora da viewport e com a aba
 * oculta; com "reduzir movimento" desenha um quadro só. Ocupa o pai
 * (absolute inset-0) — o pai precisa ser `relative`.
 */
export function TechBackdrop({ className, density = 1, fade = 'radial' }: {
  className?: string
  /** Multiplica a quantidade de pontos (0.5 = metade). */
  density?: number
  /** Máscara de borda: some nas laterais/base para não brigar com o conteúdo. */
  fade?: 'radial' | 'bottom' | 'none'
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const inView = useInView(canvasRef, { rootMargin: '120px' })
  const pageVisible = usePageVisible()
  const running = inView && pageVisible

  // Estado da simulação fica fora do React (nada de setState por quadro).
  const sim = useRef<{ w: number; h: number; dpr: number; nodes: Node[]; pulses: Pulse[] }>({ w: 0, h: 0, dpr: 1, nodes: [], pulses: [] })

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const seed = () => {
      const { w, h } = sim.current
      const count = Math.min(MAX_NODES, Math.round((w * h) / 22000 * density))
      sim.current.nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
      }))
      const cols = Math.ceil(w / GRID), rows = Math.ceil(h / GRID)
      sim.current.pulses = Array.from({ length: 4 }, (_, i) => {
        const horizontal = i % 2 === 0
        return {
          horizontal,
          line: Math.floor(Math.random() * (horizontal ? rows : cols)),
          pos: Math.random() * (horizontal ? w : h),
          speed: 0.9 + Math.random() * 1.1,
          len: 60 + Math.random() * 80,
        }
      })
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(1.5, window.devicePixelRatio || 1)
      sim.current.w = rect.width
      sim.current.h = rect.height
      sim.current.dpr = dpr
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      seed()
      draw(0)
    }

    const draw = (step: number) => {
      const { w, h, nodes, pulses } = sim.current
      ctx.clearRect(0, 0, w, h)

      // Grade fina
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(148, 170, 210, 0.055)'
      ctx.beginPath()
      for (let x = (w % GRID) / 2; x <= w; x += GRID) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h) }
      for (let y = (h % GRID) / 2; y <= h; y += GRID) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5) }
      ctx.stroke()

      // Sinais correndo pela grade
      for (const p of pulses) {
        p.pos += p.speed * step
        const limit = p.horizontal ? w : h
        if (p.pos - p.len > limit) {
          p.pos = -p.len * Math.random()
          p.line = Math.floor(Math.random() * Math.ceil((p.horizontal ? h : w) / GRID))
        }
        const offset = ((p.horizontal ? h : w) % GRID) / 2 + p.line * GRID
        const grad = p.horizontal
          ? ctx.createLinearGradient(p.pos - p.len, 0, p.pos, 0)
          : ctx.createLinearGradient(0, p.pos - p.len, 0, p.pos)
        grad.addColorStop(0, 'rgba(22, 119, 255, 0)')
        grad.addColorStop(1, 'rgba(22, 119, 255, 0.55)')
        ctx.strokeStyle = grad
        ctx.beginPath()
        if (p.horizontal) { ctx.moveTo(p.pos - p.len, Math.round(offset) + 0.5); ctx.lineTo(p.pos, Math.round(offset) + 0.5) }
        else { ctx.moveTo(Math.round(offset) + 0.5, p.pos - p.len); ctx.lineTo(Math.round(offset) + 0.5, p.pos) }
        ctx.stroke()
      }

      // Pontos + ligações
      for (const n of nodes) {
        n.x += n.vx * step; n.y += n.vy * step
        if (n.x < -10) n.x = w + 10; else if (n.x > w + 10) n.x = -10
        if (n.y < -10) n.y = h + 10; else if (n.y > h + 10) n.y = -10
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 > LINK_DIST * LINK_DIST) continue
          const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.22
          ctx.strokeStyle = `rgba(22, 119, 255, ${alpha.toFixed(3)})`
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
        }
      }
      ctx.fillStyle = 'rgba(167, 196, 255, 0.55)'
      for (const n of nodes) { ctx.fillRect(n.x - 1, n.y - 1, 2, 2) }
    }

    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)
    if (prefersReducedMotion() || !running) return () => ro?.disconnect()

    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const elapsed = now - last
      if (elapsed < FRAME_MS) return
      last = now - (elapsed % FRAME_MS)
      draw(Math.min(3, elapsed / FRAME_MS))
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro?.disconnect() }
  }, [running, density])

  const mask = fade === 'radial'
    ? 'radial-gradient(ellipse 75% 70% at 50% 40%, black 35%, transparent 100%)'
    : fade === 'bottom' ? 'linear-gradient(to bottom, black 55%, transparent)' : undefined

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 w-full h-full', className)}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    />
  )
}
