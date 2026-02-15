/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Cinzel', 'serif'],
        heading: ['Cinzel', 'serif'],
        body: ['Crimson Pro', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      spacing: {
        'content-bottom': 'var(--spacing-content-bottom, 5rem)',
      },
      colors: {
        bg: 'var(--color-bg)',
        card: 'var(--color-card)',
        primary: 'var(--color-text-primary)',
        muted: 'var(--color-text-muted)',
        border: 'var(--color-border)',
        input: 'var(--color-input)',
        accent: {
          lime: '#B4FF00',
          cyan: '#00E0FF',
          pink: '#FF4DD2',
          gold: '#FFD700',
        }
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 20s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'scan': 'scan 4s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        scan: {
          '0%, 100%': { top: '0%' },
          '50%': { top: '100%' },
        }
      }
    }
  },
  plugins: [],
};
