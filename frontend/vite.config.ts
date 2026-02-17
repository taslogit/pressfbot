import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      plugins: [react(), tailwindcss()],
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom', 'react-router-dom'],
              animation: ['framer-motion', 'canvas-confetti'],
              ui: ['lucide-react'],
              qr: ['qrcode.react'],
              ton: ['@tonconnect/ui-react']
            }
          }
        },
        // Use esbuild minification (default, faster and doesn't require terser)
        minify: 'esbuild',
        // В проде убираем только debugger; console оставляем (log/warn обёрнуты в DEV в коде)
        esbuild: {
          drop: process.env.NODE_ENV === 'production' ? ['debugger'] : []
        }
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
