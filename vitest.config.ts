import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, 'src/tests/sustainability.test.ts'],
    environmentMatchGlobs: [
      ['src/tests/**/*.test.tsx', 'jsdom'],
    ],
  },
})
