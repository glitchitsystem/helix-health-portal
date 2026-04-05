import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://127.0.0.1:4000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Proxy API calls to the Express server during development.
      // Prefer explicit IPv4 by default to avoid intermittent localhost
      // resolution issues on Windows dev setups.
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
