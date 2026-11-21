import { cn } from '@/lib/utils'

/**
 * Molduras de aparelho desenhadas em CSS (nada de imagem de terceiros) para as
 * gravações do sistema. A tela define a proporção pelo próprio vídeo; a
 * moldura só soma borda/base, então não há salto de layout.
 */

export function LaptopFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      {/* Tampa */}
      <div className="relative mx-[4.5%] rounded-t-[14px] sm:rounded-t-[18px] bg-[#1a2030] p-[1.6%] pb-[2.2%] border border-white/[0.08]"
        style={{ boxShadow: '0 40px 80px -30px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(255,255,255,0.03)' }}>
        <span aria-hidden className="absolute top-[0.7%] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#0c1018] ring-1 ring-white/10" />
        <div className="relative rounded-[4px] overflow-hidden bg-[#06152D]">{children}</div>
      </div>
      {/* Base */}
      <div aria-hidden className="relative h-3 sm:h-4 rounded-b-[12px] sm:rounded-b-[16px] bg-gradient-to-b from-[#2a3142] to-[#141925] border-x border-b border-white/[0.06]">
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-[14%] h-1 sm:h-1.5 rounded-b-md bg-[#0e121b]" />
      </div>
    </div>
  )
}

export function PhoneFrame({ children, className, small = false }: { children: React.ReactNode; className?: string; /** Versão menor, sobreposta ao notebook. */ small?: boolean }) {
  return (
    <div className={cn('bg-[#0f1522] overflow-hidden border-[#0f1522]',
      small ? 'rounded-[1.5rem] sm:rounded-[2rem] border-[5px] sm:border-[7px]' : 'rounded-[2.6rem] border-[10px]', className)}
      style={{ boxShadow: '0 40px 90px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)' }}>
      <div className={cn('relative overflow-hidden', small ? 'rounded-[1.15rem] sm:rounded-[1.55rem]' : 'rounded-[1.9rem]')}>
        {children}
        <div className={cn('absolute left-1/2 -translate-x-1/2 rounded-full bg-black pointer-events-none', small ? 'top-1.5 w-9 sm:w-12 h-2.5 sm:h-3.5' : 'top-2 w-20 h-5')} aria-hidden />
      </div>
    </div>
  )
}
