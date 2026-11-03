import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

// The commit the build is made from, for the About page's build line: CI's own, else the checkout's.
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

// Served at the root of anomatom.com.
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit()),
  },
});
