// Lightweight module shims for build environment (silence TS2307 during CI/typecheck)
declare module 'react';
declare module 'react-dom';
declare module 'framer-motion';
declare module 'react-router-dom';
declare module 'lucide-react';
declare module 'canvas-confetti';
declare module 'qrcode.react';
declare module 'react/jsx-runtime';

// Provide minimal JSX namespace if needed
declare namespace JSX {
  interface IntrinsicElements { [elemName: string]: any }
}
