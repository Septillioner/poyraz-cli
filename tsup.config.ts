import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['poyraz', 'chalk', '@inquirer/prompts', 'dotenv'],
});
