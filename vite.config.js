import { defineConfig } from 'vite';
import { resolve } from 'path';

const root = resolve(__dirname, 'src');
console.log('[vite.config] root =', root);

export default defineConfig({
  root,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        editor: resolve(root, 'editor.html'),
        components: resolve(root, 'components.html'),
        settings: resolve(root, 'settings.html')
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  server: {
    port: 1420,
    strictPort: true
  },
  optimizeDeps: {
    force: true
  }
});
