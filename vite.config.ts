import { defineConfig, loadEnv } from 'vite';

// GitHub Pages serves the project under /jugglebeat/ until a custom domain is set (step 7).
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, process.cwd(), 'BASE_PATH').BASE_PATH ?? '/',
}));
