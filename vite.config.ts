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
      '@': path.resolve(import.meta.dirname, './src'),
      '@pipeline': path.resolve(import.meta.dirname, './pipeline'),
    },
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor', test: /node_modules[\\/](react|react-dom)[\\/]/ },
            { name: 'search', test: /node_modules[\\/]fuse\.js[\\/]/ },
            { name: 'virtual', test: /node_modules[\\/]@tanstack[\\/]react-virtual[\\/]/ },
            { name: 'i18n', test: /node_modules[\\/](i18next|react-i18next)[\\/]/ },
            { name: 'configcat', test: /node_modules[\\/]configcat-js[\\/]/ },
          ],
        },
      },
    },
  },
});
