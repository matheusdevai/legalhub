import { ArrowUpRight } from 'lucide-react'
import { CountUp } from './Reveal'
import { TRIAL_DAYS } from './landingData'
import { revealStyle, STAGGER_MS, useReveal } from './useReveal'

// Perfis de acesso que existem no sistema para a equipe (o Portal do Cliente é à parte).
const STAFF_ROLES = ['administrador', 'advogado', 'estagiário', 'financeiro']

/**
 * Faixa de confiança: três garantias concretas do sistema — isolamento por
 * escritório, o que acontece quando o teste vence (somente leitura, nada some)
 * e LGPD, com links para a Política de Privacidade e os Termos. Números só os
 * que a própria página já afirma (dias de teste, perfis de acesso).
 */
export function TrustStrip() {
  const { ref, visible, reduced } = useReveal<HTMLDivElement>(0.2)

  const items = [
    {
      label: 'Isolamento',
      big: <CountUp value={STAFF_ROLES.length} />,
      unit: 'perfis de acesso',
      title: 'Cada escritório só vê os próprios dados',
      text: `A separação entre escritórios é aplicada no banco de dados. Dentro do escritório, ${STAFF_ROLES.join(', ').replace(/, ([^,]*)$/, ' e $1')} veem só o que cabe à função.`,
    },
    {
      label: 'Fim do teste',
      big: <CountUp value={TRIAL_DAYS} />,
      unit: 'dias grátis, sem cartão',
      title: 'Não assinou? Nada se perde',
      text: 'Ao fim do teste o escritório entra em modo somente leitura: seus dados continuam disponíveis para consulta e exportação, e voltam a ser editáveis ao assinar.',
    },
    {
      label: 'LGPD',
      big: <span>LGPD</span>,
      unit: 'regras públicas',
      title: 'Tratamento de dados por escrito',
      text: 'Consentimento registrado no cadastro do cliente, conexão sempre criptografada e regras de uso publicadas.',
      links: true,
    },
  ]

  return (
    <section id="confianca" aria-label="Segurança e confiança" className="relative border-y border-[color:var(--lh-divider)] bg-[#05070c] px-5 sm:px-8">
      <div ref={ref} className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 md:divide-x divide-y md:divide-y-0 divide-white/[0.07]">
        {items.map((it, i) => (
          <div key={it.label} className="py-8 md:py-10 md:px-8 first:md:pl-0 last:md:pr-0" style={revealStyle(visible, i * STAGGER_MS * 1.5, reduced)}>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#1677FF]">{it.label}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold tracking-[-0.04em] text-white leading-none">{it.big}</span>
              <span className="text-xs text-[#A7B0C0]">{it.unit}</span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-white">{it.title}</h3>
            <p className="mt-1.5 text-sm text-[#A7B0C0] leading-relaxed">{it.text}</p>
            {it.links && (
              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <a href="/privacidade" className="inline-flex items-center gap-1 text-[#cfd6e2] underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-[#1677FF] transition-colors">
                  Política de Privacidade <ArrowUpRight className="w-3 h-3" />
                </a>
                <a href="/termos" className="inline-flex items-center gap-1 text-[#cfd6e2] underline decoration-white/20 underline-offset-4 hover:text-white hover:decoration-[#1677FF] transition-colors">
                  Termos de Uso <ArrowUpRight className="w-3 h-3" />
                </a>
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
