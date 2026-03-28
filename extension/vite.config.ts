import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env vars for the current mode (.env, .env.production, etc.)
  // The third argument '' makes ALL env vars available, not just VITE_-prefixed ones
  // at config-evaluation time (we still only expose VITE_-prefixed vars to client code).
  const env = loadEnv(mode, process.cwd(), '');

  // Determine the API base URL:
  //   1. Explicit VITE_API_BASE_URL env var (set in CI/CD or .env.production)
  //   2. Production mode default  -> https://api.lensai.app
  //   3. Development mode default -> http://localhost:8000
  const apiBaseUrl =
    env.VITE_API_BASE_URL ||
    (mode === 'production' ? 'https://api.lensai.app' : 'http://localhost:8000');

  return {
    plugins: [
      react(),
      crx({ manifest }),
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    // Inject resolved env vars so the built extension bundle has them as string literals
    define: {
      'import.meta.env.VITE_API_BASE_URL':       JSON.stringify(apiBaseUrl),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID':   JSON.stringify(env.VITE_GOOGLE_CLIENT_ID ?? ''),
    },

    build: {
      rollupOptions: {
        input: {
          sidepanel: 'sidepanel.html',
          popup: 'popup.html',
        },
      },
      // Only emit sourcemaps in development; omit them from production builds
      // to avoid leaking source code and to reduce extension package size.
      sourcemap: mode !== 'production',
      minify: 'esbuild',
      // Target modern Chromium (MV3 extensions only run on Chrome 88+)
      target: ['chrome88'],
      // Raise the chunk-size warning threshold slightly; the D3 knowledge graph
      // is legitimately large and cannot easily be code-split in an extension.
      chunkSizeWarningLimit: 800,
    },

    // Vite dev-server is not used for the extension itself, but kept for
    // potential component story / test harness usage.
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:8000',
          changeOrigin: true,
        },
      },
    },
  };
});
