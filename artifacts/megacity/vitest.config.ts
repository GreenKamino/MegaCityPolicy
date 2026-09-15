import { defineConfig, configDefaults } from "vitest/config";
import path from "path";

// Heavy / timing-sensitive engine tests must NOT run in the default
// parallel `test` run. They either assert on absolute or ratio tick
// timings (perfStress, tickBudget, tickProfile) — only meaningful when
// measured serially on a quiet core — or run for minutes over
// many-thousand-tick sims (lateGameStress, memoryStress,
// saveSizeBreakdown). Inside the parallel suite they both flake on timing
// and starve every other test. They are excluded here and run only via
// `validate:perf`, which sets RUN_STRESS=1 and runs them serially
// (--no-file-parallelism). The validation gate itself runs `test` and
// `perf` one at a time (scripts/validate-gate.mjs) so the two vitest
// processes never contend for the 2-core box.
const STRESS_TESTS = [
  "**/lateGameStress.test.ts",
  "**/memoryStress.test.ts",
  "**/perfStress.test.ts",
  "**/tickBudget.test.ts",
  "**/tickProfile.test.ts",
  "**/saveSizeBreakdown.test.ts",
];

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
    },
  },
  test: {
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.RUN_STRESS ? [] : STRESS_TESTS),
    ],
    // Generous global hang-guard. The default 5s is too tight for the long
    // tail of heavier correctness tests when the suite runs under CPU
    // contention (e.g. alongside the dev workflows, or on a slow/loaded
    // machine). The validation gate now runs `test` and `perf` serially
    // (scripts/validate-gate.mjs), but this generous timeout stays as
    // defense-in-depth. Genuinely heavy tests still set their own larger
    // per-test timeouts.
    testTimeout: 30_000,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
