export function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #060c18 0%, #0a1628 50%, #0d1f3c 100%)' }}
    >
      {/* Glow radial de fundo */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(6,182,212,0.07) 0%, transparent 70%)',
        }}
      />

      {/* Anéis pulsantes */}
      <div className="relative flex items-center justify-center mb-10">
        <span
          className="absolute rounded-full border border-cyan-400/10"
          style={{ width: 220, height: 220, animation: 'lhPulse 2.4s ease-out infinite' }}
        />
        <span
          className="absolute rounded-full border border-cyan-400/15"
          style={{ width: 170, height: 170, animation: 'lhPulse 2.4s ease-out 0.4s infinite' }}
        />
        <span
          className="absolute rounded-full border border-cyan-400/20"
          style={{ width: 130, height: 130, animation: 'lhPulse 2.4s ease-out 0.8s infinite' }}
        />

        {/* Logo */}
        <div
          className="relative flex items-center justify-center rounded-3xl overflow-hidden"
          style={{
            width: 96,
            height: 96,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(8px)',
            animation: 'lhLogoFloat 3s ease-in-out infinite',
          }}
        >
          <img
            src="/logomarca.png"
            alt="LegalHub"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '0% 50%',
            }}
          />
        </div>
      </div>

      {/* Nome + tagline */}
      <p
        className="text-white font-bold tracking-widest uppercase text-sm"
        style={{ letterSpacing: '0.25em', animation: 'lhFadeIn 0.8s ease-out both' }}
      >
        LegalHub
      </p>
      <p
        className="text-cyan-400/60 text-[11px] tracking-widest uppercase mt-1.5"
        style={{ letterSpacing: '0.2em', animation: 'lhFadeIn 0.8s ease-out 0.15s both' }}
      >
        Gestão Jurídica Inteligente
      </p>

      {/* Barra de progresso */}
      <div
        className="mt-10 rounded-full overflow-hidden"
        style={{
          width: 160,
          height: 2,
          background: 'rgba(255,255,255,0.06)',
          animation: 'lhFadeIn 0.8s ease-out 0.3s both',
        }}
      >
        <div
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, rgba(6,182,212,0.3), rgba(6,182,212,0.9), rgba(6,182,212,0.3))',
            animation: 'lhBar 1.6s ease-in-out infinite',
          }}
        />
      </div>

      <style>{`
        @keyframes lhPulse {
          0%   { transform: scale(0.85); opacity: 0.6; }
          60%  { transform: scale(1.05); opacity: 0.15; }
          100% { transform: scale(1.15); opacity: 0; }
        }
        @keyframes lhLogoFloat {
          0%, 100% { transform: translateY(0px);  box-shadow: 0 8px 32px rgba(6,182,212,0.10); }
          50%       { transform: translateY(-6px); box-shadow: 0 16px 48px rgba(6,182,212,0.18); }
        }
        @keyframes lhFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        @keyframes lhBar {
          0%   { width: 0%;   margin-left: 0%;   }
          50%  { width: 60%;  margin-left: 20%;  }
          100% { width: 0%;   margin-left: 100%; }
        }
      `}</style>
    </div>
  )
}
