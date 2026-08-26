import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: [...configDefaults.exclude, ...(process.env.INCLUDE_SLOW_TESTS ? [] : ['src/tests/sustainability.test.ts'])],
    environmentMatchGlobs: [
      ['src/tests/**/*.test.tsx', 'jsdom'],
      ['src/tests/**/*.test.ts', 'jsdom'],
    ],
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
  },
})
