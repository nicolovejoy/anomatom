import { defineConfig } from 'vite';

// GitHub Pages serves the project under /jugglebeat/ until a custom domain is set (step 7).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
});
