import { defineConfig } from 'vitest/config';

// Modules held at 100% line coverage, per file. Globs, so a new logic module is covered without
// touching this file. Never lower the threshold.
const covered = [
  'src/core/**',
  'src/view/**',
  'src/sound/**',
  // The pure files of src/app; the mounts and canvases there touch the DOM and are not.
  'src/app/player.ts',
  'src/app/state.ts',
  'src/app/route.ts',
  // Stream C's AppState ↔ hash codec, named ahead so C need not edit this file.
  'src/app/hash.ts',
];

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: covered,
      // tr808.ts is the browser side of the drums (real Web Audio, smplr); the e2e smoke test covers it.
      exclude: ['**/*.test.ts', 'src/sound/tr808.ts'],
      thresholds: { lines: 100, perFile: true },
      reporter: ['text'],
    },
  },
});
