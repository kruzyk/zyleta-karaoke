import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: '/zyleta-karaoke/',
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces (0.0.0.0)
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          search: ['fuse.js'],
          virtual: ['@tanstack/react-virtual'],
          i18n: ['i18next', 'react-i18next'],
          configcat: ['configcat-js'],
        },
      },
    },
  },
});
