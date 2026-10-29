import { defineConfig } from 'vitest/config';

// Modules held at 100% line coverage. Add to this list; never lower the threshold.
const coveredModules = [
  'src/core/math.ts',
  'src/core/parse.ts',
  'src/core/grid.ts',
  'src/core/flights.ts',
  'src/core/validate.ts',
  'src/core/swap.ts',
  'src/core/crossings.ts',
  'src/core/schedule.ts',
  'src/sound/transport.ts',
  'src/sound/mapping.ts',
  'src/sound/drum-sound.ts',
  'src/app/player.ts',
];

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: coveredModules,
      thresholds: { lines: 100, perFile: true },
      reporter: ['text'],
    },
  },
});
