import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { DEV_SERVER_DENY } from './scripts/devServer.mjs'

// `npm run build:single` emits one self-contained census.html (double-click to open, no server).
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    ...(mode === 'single' ? [viteSingleFile({ removeViteModuleLoader: true })] : []),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Never serve a secret: Vite's own list plus the Ask relay's ask-relay/.dev.vars (scripts/devServer.mjs).
  server: { fs: { deny: DEV_SERVER_DENY } },
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
  },
  test: {
    environment: 'node',
    // Excel round trips (ExcelJS write + SheetJS read of the whole sample) take a few seconds and
    // slow further when the full suite runs in parallel; the default 5 s timeout made them flaky.
    testTimeout: 30_000,
    // Time budgets ("runs in under 150 ms") live in *.perf.test.ts. They run one file at a time
    // once the unit tests are done, so they never compete with the parallel run for the CPU.
    // `npx vitest run` runs both; `npx vitest run --project perf` runs only the budgets.
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          // The Ask relay (ask-relay/, docs/ASK-RELAY.md) is tested here too, with fakes.
          include: ['src/**/*.test.ts', 'ask-relay/test/**/*.test.ts'],
          exclude: ['src/**/*.perf.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'perf',
          include: ['src/**/*.perf.test.ts'],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
}))
