import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const src = (p: string) => fileURLToPath(new URL(`../src/${p}`, import.meta.url));

// the app runs on the package's sources, as a consumer would import them
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: {
    alias: [
      { find: /^@formtrieb\/tokens-recipe\/editor$/, replacement: src('editor/index.ts') },
      { find: /^@formtrieb\/tokens-recipe$/, replacement: src('index.ts') },
    ],
  },
  build: {
    outDir: fileURLToPath(new URL('../dist-app', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: fileURLToPath(new URL('index.html', import.meta.url)),
        preview: fileURLToPath(new URL('preview.html', import.meta.url)),
      },
    },
  },
});
