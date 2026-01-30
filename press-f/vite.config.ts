import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
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
        // Optimize bundle size
        minify: 'terser',
        terserOptions: {
          compress: {
            drop_console: true, // Remove console.log in production
            drop_debugger: true
          }
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
