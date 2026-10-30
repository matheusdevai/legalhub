import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/** Dados de quem responde pelo LegalHub — usados nos dois documentos legais. */
export const LEGAL_ENTITY = {
  name: 'Agência Raiz Digital Tech',
  product: 'LegalHub',
  site: 'legalhubgestor.vercel.app',
  privacyEmail: 'contatoraizdigitaltech@gmail.com',
  city: 'João Pessoa/PB',
}

/** Data da última revisão dos textos — atualizar sempre que mudar o conteúdo. */
export const LEGAL_UPDATED_AT = '29 de outubro de 2026'

export interface LegalSection {
  id: string
  title: string
  body: React.ReactNode
}

/**
 * Página de documento legal (Política de Privacidade / Termos de Uso): fundo
 * claro, sumário com âncoras e seções numeradas, legível no celular.
 */
export function LegalDocument({ title, intro, sections, otherLink }: {
  title: string
  intro: React.ReactNode
  sections: LegalSection[]
  otherLink: { to: string; label: string }
}) {
  useEffect(() => {
    const prev = document.title
    document.title = `${title} · ${LEGAL_ENTITY.product}`
    window.scrollTo(0, 0)
    return () => { document.title = prev }
  }, [title])

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-700">
      <header className="bg-[#020711]">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" aria-label="LegalHub, página inicial">
            <span className="w-8 h-8 rounded-lg overflow-hidden bg-[#06152D]">
              <img src="/logomarca.png" alt="" className="w-full h-full object-cover" style={{ objectPosition: '0% 50%' }} />
            </span>
            <span className="text-white font-bold tracking-tight">LegalHub</span>
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm text-[#A7B0C0] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar ao site
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-10 sm:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#1677FF]">Documento legal</p>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Última atualização: {LEGAL_UPDATED_AT}</p>

        <div className="mt-6 text-[15px] leading-relaxed space-y-3">{intro}</div>

        <nav aria-label="Sumário" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <p className="text-sm font-semibold text-slate-900 mb-3">Sumário</p>
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-slate-600 hover:text-[#0B5CFF] transition-colors">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">{i + 1}. {s.title}</h2>
              <div className="mt-3 text-[15px] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:text-slate-900 [&_a]:text-[#0B5CFF] [&_a]:underline">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t border-slate-200 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm">
          <p className="text-slate-500">
            Dúvidas? Escreva para <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`} className="text-[#0B5CFF] underline">{LEGAL_ENTITY.privacyEmail}</a>.
          </p>
          <Link to={otherLink.to} className="text-[#0B5CFF] font-medium hover:underline">{otherLink.label} →</Link>
        </div>
      </main>
    </div>
  )
}
