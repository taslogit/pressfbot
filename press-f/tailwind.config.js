/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontSize: {
        caption: ['0.6875rem', { lineHeight: '1.25' }],
        body: ['0.875rem', { lineHeight: '1.4' }],
        subtitle: ['1rem', { lineHeight: '1.35' }],
        title: ['1.125rem', { lineHeight: '1.3' }],
        display: ['1.75rem', { lineHeight: '1.2' }],
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
