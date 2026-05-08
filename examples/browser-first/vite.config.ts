import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { compileUIKit } from '@iwsdk/vite-plugin-uikitml';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';

export default defineConfig({
  plugins: [
    mkcert(),
    iwsdkDev({
      emulator: {
        device: 'metaQuest3',
        activation: 'always',
        injectOnBuild: true,
      },
      ai: { mode: 'collaborate', screenshotSize: { width: 500, height: 500 } },
      verbose: true,
    }),
    compileUIKit({ sourceDir: 'ui', outputDir: 'public/ui', verbose: true }),
  ],
  server: { host: '0.0.0.0' },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
