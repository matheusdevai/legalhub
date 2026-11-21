import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, CheckCircle2, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AI_SCRIPT } from './motionData'
import { Reveal } from './Reveal'
import { TechBackdrop } from './TechBackdrop'
import { usePrefersReducedMotion, useReveal } from './useReveal'

type ToolState = 'hidden' | 'running' | 'done'
type Decision = 'pending' | 'confirmed' | 'cancelled'

interface ShowState {
  typedQuestion: number
  sent: boolean
  thinking: boolean
  tools: ToolState[]
  answerWords: number
  proposal: boolean
  finished: boolean
}

const QUESTION = AI_SCRIPT.question
const ANSWER_WORDS = AI_SCRIPT.answer.map(p => p.split(' '))
const TOTAL_WORDS = ANSWER_WORDS.reduce((n, p) => n + p.length, 0)

const INITIAL: ShowState = { typedQuestion: 0, sent: false, thinking: false, tools: AI_SCRIPT.toolCalls.map(() => 'hidden'), answerWords: 0, proposal: false, finished: false }
const FINAL: ShowState = { typedQuestion: QUESTION.length, sent: true, thinking: false, tools: AI_SCRIPT.toolCalls.map(() => 'done'), answerWords: TOTAL_WORDS, proposal: true, finished: true }

/** Palavras já "digitadas" de cada parágrafo da resposta. */
function visibleParagraphs(words: number): string[] {
  const out: string[] = []
  let left = words
  for (const p of ANSWER_WORDS) {
    if (left <= 0) break
    out.push(p.slice(0, left).join(' '))
    left -= p.length
  }
  return out
}

function ToolCall({ name, args, result, state }: { name: string; args: string; result: string; state: ToolState }) {
  if (state === 'hidden') return null
  return (
    <div className="lh-ai-in flex items-start gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
      <span className="mt-0.5 w-4 h-4 flex items-center justify-center flex-shrink-0">
        {state === 'running'
          ? <Loader2 className="w-3.5 h-3.5 text-[#1677FF] animate-spin motion-reduce:animate-none" />
          : <Check className="w-3.5 h-3.5 text-[#34d399]" />}
      </span>
      <div className="min-w-0 font-mono text-[11px] sm:text-xs leading-relaxed">
        <p className="text-[#cfd6e2] break-words"><span className="text-[#1677FF]">{name}</span><span className="text-[#A7B0C0]">({args})</span></p>
        <p className={cn('text-[#A7B0C0] transition-opacity duration-300', state === 'done' ? 'opacity-100' : 'opacity-0')}>→ {result}</p>
      </div>
    </div>
  )
}

function ProposalCard({ decision, onDecide }: { decision: Decision; onDecide: (d: Decision) => void }) {
  const p = AI_SCRIPT.proposal
  return (
    <div className="lh-ai-in rounded-2xl border border-[#1677FF]/35 bg-[#0b1220] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
        <p className="text-xs font-semibold text-white">Criar tarefa</p>
        <span className="font-mono text-[10px] text-[#A7B0C0]">{p.tool}</span>
      </div>
      <div className="px-4 py-3 space-y-1 text-xs text-[#cfd6e2]">
        <p className="text-sm font-semibold text-white">{p.title}</p>
        <p>Vencimento: {p.due}</p>
        <p>Responsável: {p.assignee}</p>
        <p>Prioridade: {p.priority}</p>
      </div>
      <div className="px-4 pb-4" aria-live="polite">
        {decision === 'pending' && (
          <>
            <div className="flex gap-2">
              <button type="button" onClick={() => onDecide('confirmed')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#0B5CFF] hover:brightness-110 active:scale-[0.98] transition">
                <Check className="w-3.5 h-3.5" /> Confirmar
              </button>
              <button type="button" onClick={() => onDecide('cancelled')}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-[#cfd6e2] border border-white/15 hover:bg-white/[0.06] active:scale-[0.98] transition">
                <X className="w-3.5 h-3.5" /> Cancelar
              </button>
            </div>
            <p className="mt-2.5 text-[11px] text-[#A7B0C0]">Nada é gravado até você confirmar.</p>
          </>
        )}
        {decision === 'confirmed' && (
          <p className="flex items-center gap-2 text-xs font-semibold text-[#34d399]">
            <CheckCircle2 className="w-4 h-4" /> Tarefa criada e atribuída a você. <span className="font-normal text-[#A7B0C0]">(Demonstração: nada foi gravado.)</span>
          </p>
        )}
        {decision === 'cancelled' && (
          <p className="flex items-center gap-2 text-xs text-[#A7B0C0]"><X className="w-4 h-4" /> Proposta cancelada. Nenhuma tarefa foi criada.</p>
        )}
      </div>
    </div>
  )
}

/**
 * Demonstração "cinematográfica" do LegalHub Assistente: a pergunta é digitada,
 * o assistente mostra as consultas que faz (as mesmas tools do backend real)
 * e termina propondo uma tarefa num card de Confirmar/Cancelar — como no
 * sistema, onde a IA nunca grava sozinha. Começa quando aparece na tela; com
 * "reduzir movimento" mostra direto o resultado final.
 */
export function AiShowcase({ onCta }: { onCta: () => void }) {
  const { ref, visible } = useReveal<HTMLDivElement>(0.35)
  const reduced = usePrefersReducedMotion()
  const [show, setShow] = useState<ShowState>(INITIAL)
  const [decision, setDecision] = useState<Decision>('pending')
  const [run, setRun] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    if (reduced) { setShow(FINAL); return }
    let cancelled = false
    const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    const set = (patch: Partial<ShowState> | ((s: ShowState) => Partial<ShowState>)) => {
      if (!cancelled) setShow(s => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
    }

    ;(async () => {
      setShow(INITIAL)
      setDecision('pending')
      await sleep(450)
      for (let i = 1; i <= QUESTION.length; i++) {
        if (cancelled) return
        set({ typedQuestion: i })
        await sleep(QUESTION[i - 1] === ' ' ? 55 : 26 + Math.random() * 22)
      }
      await sleep(380)
      set({ sent: true, thinking: true })
      await sleep(700)
      for (let t = 0; t < AI_SCRIPT.toolCalls.length; t++) {
        set(s => ({ thinking: false, tools: s.tools.map((x, k) => (k === t ? 'running' : x)) }))
        await sleep(900)
        set(s => ({ tools: s.tools.map((x, k) => (k === t ? 'done' : x)) }))
        await sleep(320)
      }
      for (let w = 1; w <= TOTAL_WORDS; w++) {
        if (cancelled) return
        set({ answerWords: w })
        await sleep(38 + Math.random() * 30)
      }
      await sleep(500)
      set({ proposal: true, finished: true })
    })()

    return () => { cancelled = true }
  }, [visible, reduced, run])

  // Mantém o fim da conversa à vista (só rola a caixa do chat, nunca a página).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [show, decision])

  const typing = show.typedQuestion > 0 && !show.sent
  const paragraphs = visibleParagraphs(show.answerWords)

  return (
    <section id="ia" className="relative py-20 sm:py-28 px-5 sm:px-8 border-t border-[color:var(--lh-divider)] overflow-hidden">
      <style>{`
        @keyframes lh-ai-in { from { opacity: 0; transform: translate3d(0, 8px, 0) } to { opacity: 1; transform: none } }
        .lh-ai-in { animation: lh-ai-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both }
        @keyframes lh-caret { 50% { opacity: 0 } }
        .lh-caret { animation: lh-caret 1s steps(1) infinite }
        @media (prefers-reduced-motion: reduce) { .lh-ai-in, .lh-caret { animation: none } }
      `}</style>
      <TechBackdrop density={0.8} />

      <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-14 items-center">
        <Reveal className="lg:col-span-5">
          <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">LegalHub Assistente</span>
          <h2 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-[-0.03em] text-white" style={{ textWrap: 'balance' } as React.CSSProperties}>
            Pergunte como perguntaria a um colega. <span className="text-[#1677FF]">Quem decide é você.</span>
          </h2>
          <p className="mt-4 text-[#A7B0C0] leading-relaxed">
            O Assistente consulta prazos, tarefas, agenda, processos e clientes do seu escritório e mostra exatamente o que consultou.
            Quando sugere criar uma tarefa ou lembrete, ele só propõe: nada é gravado sem o seu clique em Confirmar.
          </p>
          <ul className="mt-6 space-y-3">
            {[
              'Vê só os dados do seu escritório, com as permissões da sua função',
              'Cada consulta fica visível na conversa',
              'Tarefas e lembretes só com a sua confirmação',
            ].map(item => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-[#cfd6e2]">
                <CheckCircle2 className="w-4 h-4 text-[#1677FF] flex-shrink-0 mt-0.5" />
                {item}
              </li>
            ))}
          </ul>
          <button onClick={onCta}
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white bg-[#0B5CFF] hover:brightness-110 active:scale-[0.98] transition">
            Testar o Assistente grátis <ArrowRight className="w-4 h-4" />
          </button>
        </Reveal>

        <Reveal delay={120} className="lg:col-span-7">
          <div ref={ref} className="rounded-2xl border border-white/10 bg-[#070d19] overflow-hidden" style={{ boxShadow: '0 40px 100px -30px rgba(0,0,0,0.8)' }}>
            {/* Cabeçalho do chat */}
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 h-12 border-b border-white/[0.06] bg-[#0b1220]">
              <div className="flex items-center gap-2.5">
                <span className="w-7 h-7 rounded-lg bg-[#0B5CFF] flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-white" /></span>
                <span className="text-sm font-semibold text-white">LegalHub Assistente</span>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#A7B0C0]">dados fictícios</span>
            </div>

            {/* Conversa — altura fixa: mensagens novas não empurram a página */}
            <div ref={scrollRef} className="h-[420px] sm:h-[360px] overflow-y-auto px-4 sm:px-5 py-5 space-y-4 [scrollbar-width:thin]">
              <p className="sr-only">
                Demonstração: a pessoa pergunta “{QUESTION}”. O Assistente consulta {AI_SCRIPT.toolCalls.map(t => t.name).join(' e ')}, responde
                “{AI_SCRIPT.answer.join(' ')}” e propõe criar a tarefa “{AI_SCRIPT.proposal.title}”, que só é gravada se a pessoa clicar em Confirmar.
              </p>
              <div aria-hidden={!show.finished} className="space-y-4">
              {show.typedQuestion > 0 && (
                <div className="flex justify-end">
                  <p className="max-w-[85%] rounded-2xl rounded-br-md bg-[#0B5CFF] px-4 py-2.5 text-sm text-white leading-relaxed">
                    {QUESTION.slice(0, show.typedQuestion)}
                    {typing && <span className="lh-caret ml-0.5 inline-block w-[2px] h-4 align-[-2px] bg-white/90" aria-hidden />}
                  </p>
                </div>
              )}

              {show.sent && (
                <div className="flex gap-3">
                  <span className="mt-0.5 w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center flex-shrink-0"><Sparkles className="w-3.5 h-3.5 text-[#1677FF]" /></span>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    {show.thinking && (
                      <p className="lh-ai-in flex items-center gap-1.5 text-xs text-[#A7B0C0]" aria-label="Pensando">
                        {[0, 1, 2].map(i => <span key={i} className="w-1.5 h-1.5 rounded-full bg-[#A7B0C0] animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />)}
                      </p>
                    )}
                    {AI_SCRIPT.toolCalls.map((t, i) => <ToolCall key={t.name} {...t} state={show.tools[i]} />)}
                    {paragraphs.map((p, i) => (
                      <p key={i} className="text-sm text-[#e3e8f0] leading-relaxed">{p}</p>
                    ))}
                    {show.proposal && (
                      <>
                        <p className="lh-ai-in text-sm text-[#e3e8f0] leading-relaxed">{AI_SCRIPT.proposalIntro}</p>
                        <ProposalCard decision={decision} onDecide={setDecision} />
                      </>
                    )}
                  </div>
                </div>
              )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-white/[0.06] text-[11px] text-[#A7B0C0]">
              <span>Consultas filtradas pelo seu escritório e pela sua função</span>
              <button type="button" onClick={() => setRun(r => r + 1)} disabled={!show.finished || reduced}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 hover:bg-white/[0.06] disabled:opacity-0 transition-opacity">
                <RotateCcw className="w-3 h-3" /> Repetir
              </button>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
