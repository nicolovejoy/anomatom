import { defineConfig } from 'vitest/config';

// Modules held at 100% line coverage, per file. Globs, so a new logic module is covered without
// touching this file. Never lower the threshold.
const covered = [
  'src/core/**',
  'src/view/**',
  'src/sound/**',
  // src/app is covered except what touches the DOM: mounts, canvases and styles.
  'src/app/**',
];

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: covered,
      // tr808.ts is the browser side of the drums (real Web Audio, smplr).
      // Browser-side modules are named `*.browser.ts` and excluded; the e2e smoke test covers them.
      exclude: [
        '**/*.test.ts',
        'src/**/*.browser.ts',
        'src/app/mount*.ts',
        'src/app/*-canvas.ts',
        'src/app/*.css',
        'src/sound/tr808.ts',
      ],
      thresholds: { lines: 100, perFile: true },
      reporter: ['text'],
    },
  },
});
