interface LogoProps {
  size?: number
  showText?: boolean
  className?: string
}

export function Logo({ size = 36, showText = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 100 115" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hexBorder" x1="0" y1="0" x2="100" y2="115" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="lGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#c4b5fd" />
          </linearGradient>
          <linearGradient id="fGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e879f9" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        {/* Hex border */}
        <polygon points="50,4 96,28 96,87 50,111 4,87 4,28" fill="url(#hexBorder)" />
        {/* Hex inner */}
        <polygon points="50,11 89,32 89,83 50,104 11,83 11,32" fill="#1e1b4b" />
        {/* Blue bottom edge */}
        <polygon points="50,104 89,83 89,87 50,111 11,87 11,83" fill="#3b82f6" opacity="0.7" />
        {/* L letter */}
        <rect x="22" y="30" width="9" height="46" rx="2" fill="url(#lGrad)" />
        <rect x="22" y="67" width="26" height="9" rx="2" fill="url(#lGrad)" />
        {/* F letter */}
        <rect x="55" y="30" width="23" height="8" rx="2" fill="url(#fGrad)" />
        <rect x="55" y="30" width="9" height="46" rx="2" fill="url(#fGrad)" />
        <rect x="55" y="51" width="18" height="7" rx="2" fill="url(#fGrad)" />
      </svg>
      {showText && (
        <span className="font-bold text-xl bg-gradient-to-r from-primary-700 via-primary-500 to-accent-500 bg-clip-text text-transparent tracking-tight">
          LegalHub
        </span>
      )}
    </div>
  )
}

export function LogoWhite({ size = 36, showText = true, className = '' }: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 100 115" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="hexBorderW" x1="0" y1="0" x2="100" y2="115" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
          <linearGradient id="lGradW" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#c4b5fd" />
          </linearGradient>
          <linearGradient id="fGradW" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f0abfc" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <polygon points="50,4 96,28 96,87 50,111 4,87 4,28" fill="url(#hexBorderW)" />
        <polygon points="50,11 89,32 89,83 50,104 11,83 11,32" fill="#1e1b4b" />
        <polygon points="50,104 89,83 89,87 50,111 11,87 11,83" fill="#3b82f6" opacity="0.7" />
        <rect x="22" y="30" width="9" height="46" rx="2" fill="url(#lGradW)" />
        <rect x="22" y="67" width="26" height="9" rx="2" fill="url(#lGradW)" />
        <rect x="55" y="30" width="23" height="8" rx="2" fill="url(#fGradW)" />
        <rect x="55" y="30" width="9" height="46" rx="2" fill="url(#fGradW)" />
        <rect x="55" y="51" width="18" height="7" rx="2" fill="url(#fGradW)" />
      </svg>
      {showText && (
        <span className="font-bold text-xl text-white tracking-tight">
          LegalHub
        </span>
      )}
    </div>
  )
}
