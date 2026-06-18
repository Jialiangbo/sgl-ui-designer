import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    minify: 'esbuild',
    rollupOptions: {
      input: {
        index: __dirname + '/src/index.html',
        editor: __dirname + '/src/editor.html',
        preview: __dirname + '/src/preview.html',
        settings: __dirname + '/src/settings.html',
        components: __dirname + '/src/components.html'
      }
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false
  }
});
