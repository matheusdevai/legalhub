/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#1e293b',
          600: '#0f172a',
          700: '#0a1120',
          800: '#0a1120',
          900: '#060c18',
          DEFAULT: '#0f172a',
        },
        accent: {
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        sidebar: {
          900: '#0a1628',
          800: '#0f1e36',
          700: '#162540',
          600: '#1e304f',
          500: '#283d5e',
          border: '#e2e8f0',
          text:   '#64748b',
          hover:  '#f1f5f9',
          active: '#eff6ff',
        },
        dark: {
          900: '#0a1628',
          800: '#0f1e36',
          700: '#162540',
          600: '#1e304f',
          500: '#283d5e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'sidebar':    '1px 0 0 0 #e2e8f0',
        'card':       '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.08), 0 1px 4px rgba(0,0,0,0.04)',
        'modal':      '0 20px 60px -10px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.06)',
        'button':     '0 1px 3px rgba(15,23,42,0.25)',
        'button-lg':  '0 4px 14px rgba(15,23,42,0.30)',
        'dark-card':  '0 1px 3px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.15)',
        'dark-sidebar': '1px 0 0 0 rgba(255,255,255,0.06)',
      },
      animation: {
        'fade-in':  'fadeIn 0.18s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'scale-in': 'scaleIn 0.15s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn: { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'scale(1)' } },
      },
    },
  },
  plugins: [],
}
