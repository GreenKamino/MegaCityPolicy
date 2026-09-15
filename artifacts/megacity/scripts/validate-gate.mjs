// Serialized validation gate.
//
// The pre-completion checks used to run three heavy processes at the same
// time: the full parallel `vitest` suite (`test`), the CPU-bound serial
// stress suite (`perf`), and `tsc` (`typecheck`). On the 2-core CI box that
// is ~2.5x CPU oversubscription plus heavy memory pressure (two large vitest
// module graphs + tsc at once). Under that load, timing- and
// scheduling-sensitive suites — the atomic save-slot / torn-write /
// per-tick error-isolation tests — get starved past their timeout (or a
// worker gets OOM-killed) and report failures even though the code is fine.
// They pass reliably when run on their own.
//
// This runner executes the validation steps ONE AT A TIME so they never contend
// for the machine, which makes a red result reliably mean a real problem.
// It runs all steps regardless of individual failures (so one red step does
// not hide another) and then exits non-zero if any of them failed.

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopWrapperBaseUrl =
  process.env.E2E_DESKTOP_BASE_URL || "http://localhost:80/desktop";
const desktopWrapperEnv = { E2E_BASE_URL: desktopWrapperBaseUrl };

// Each step mirrors exactly what the separate validation commands used to
// run — only the scheduling changes, not what is checked. The browser case
// requires the Expo preview workflow to be available and uses its demo
// fixture, so it never loads or mutates a real save slot.
const defaultSteps = [
  { name: "typecheck", cmd: "./node_modules/.bin/tsc", args: ["--noEmit"] },
  { name: "test", cmd: "./node_modules/.bin/vitest", args: ["run", "--reporter=dot"] },
  // Reuse the package script so the perf file list stays single-sourced.
  { name: "perf", cmd: "pnpm", args: ["run", "validate:perf"] },
  // The faction-demand command performs an actionable Expo preview readiness
  // check before it launches Chromium or starts the gameplay assertions.
  { name: "e2e:faction-demand", cmd: "pnpm", args: ["run", "test:e2e:faction-demand"] },
  // This focused suite performs its own bounded Expo preview readiness check
  // before launching Chromium, then covers doctrine-only, facility-only, and
  // combined expiry behavior.
  { name: "e2e:training-banner", cmd: "pnpm", args: ["run", "test:e2e:training-banner"] },
  // The role-filter check drives the actual recruitment screen against a
  // read-only demo fixture, without importing the screen or mocking native APIs.
  { name: "e2e:role-filter", cmd: "pnpm", args: ["run", "test:e2e:role-filter"] },
  { name: "e2e:construction-batch", cmd: "pnpm", args: ["run", "test:e2e:construction-batch"] },
  { name: "e2e:construction-batch-reload", cmd: "pnpm", args: ["run", "test:e2e:construction-batch-reload"] },
  // The storage-plan check covers both the narrow Economy layout and the wide
  // Construction catalog, and reports the affected screen in its assertions.
  { name: "e2e:storage-plan", cmd: "pnpm", args: ["run", "test:e2e:storage-plan"] },
  // These checks intentionally target the managed desktop wrapper workflow
  // through the shared /desktop proxy, rather than loading the Expo route
  // directly. Keep them as separate steps so wrapper failures are reported
  // independently from the Expo browser checks and from each other.
  {
    name: "e2e:desktop-wrapper:military-food-pool",
    cmd: "pnpm",
    args: [
      "--filter",
      "@workspace/megacity-desktop",
      "run",
      "test:e2e:military-food-pool",
    ],
    env: desktopWrapperEnv,
  },
  {
    name: "e2e:desktop-wrapper:recovery-links",
    cmd: "pnpm",
    args: ["--filter", "@workspace/megacity-desktop", "run", "test:e2e:recovery"],
    env: desktopWrapperEnv,
  },
  {
    name: "e2e:desktop-wrapper:construction-batch-selector",
    cmd: "pnpm",
    args: [
      "--filter",
      "@workspace/megacity-desktop",
      "run",
      "test:e2e:construction-batch-selector",
    ],
    env: desktopWrapperEnv,
  },
  {
    name: "e2e:desktop-wrapper:communications",
    cmd: "pnpm",
    args: [
      "--filter",
      "@workspace/megacity-desktop",
      "run",
      "test:e2e:communications",
    ],
    env: desktopWrapperEnv,
  },
  {
    name: "e2e:desktop-wrapper:contract-recovery",
    cmd: "pnpm",
    args: [
      "--filter",
      "@workspace/megacity-desktop",
      "run",
      "test:e2e:contract-recovery",
    ],
    env: desktopWrapperEnv,
  },
  {
    name: "e2e:desktop-wrapper:generic-megacity-sheets",
    cmd: "pnpm",
    args: [
      "--filter",
      "@workspace/megacity-desktop",
      "run",
      "test:e2e:generic-megacity-sheets",
    ],
    env: desktopWrapperEnv,
  },
  { name: "e2e:military-food-pool", cmd: "pnpm", args: ["run", "test:e2e:military-food-pool"] },
  { name: "e2e:production-chains", cmd: "pnpm", args: ["run", "test:e2e:production-chains"] },
  { name: "e2e:contract-recovery", cmd: "pnpm", args: ["run", "test:e2e:contract-recovery"] },
  { name: "e2e:review-guards", cmd: "pnpm", args: ["run", "test:e2e:review-guards"] },
  { name: "e2e:black-market-audit-reload", cmd: "pnpm", args: ["run", "test:e2e:black-market-audit-reload"] },
  { name: "e2e:biosphere-recovery", cmd: "pnpm", args: ["run", "test:e2e:biosphere-recovery"] },
  { name: "e2e:housing-capacity", cmd: "pnpm", args: ["run", "test:e2e:housing-capacity"] },
  { name: "e2e:utility-production-parity", cmd: "pnpm", args: ["run", "test:e2e:utility-production-parity"] },
  { name: "e2e:retinue-assignment-reload", cmd: "pnpm", args: ["run", "test:e2e:retinue-assignment-reload"] },
  { name: "e2e:retinue-operation", cmd: "pnpm", args: ["run", "test:e2e:retinue-operation"] },
];

// Keep the production gate's step list fixed, but allow the subprocess
// regression test to provide two disposable commands without launching the
// full release suite. NODE_ENV is an additional guard so this cannot
// accidentally replace the release checks in a normal invocation.
const steps =
  process.env.NODE_ENV === "test" && process.env.VALIDATE_GATE_TEST_STEPS
    ? JSON.parse(process.env.VALIDATE_GATE_TEST_STEPS)
    : defaultSteps;

const failed = [];
const timings = [];
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const MAX_FAILURE_LINES = 12;
const MAX_TAIL_LINES = 8;
const formatDuration = (milliseconds) => `${(milliseconds / 1000).toFixed(2)}s`;
const reportStepTiming = (name, startedAt) => {
  const elapsedMs = performance.now() - startedAt;
  timings.push({ name, elapsedMs });
  console.log(
    `[validate-gate] ${name} finished in ${formatDuration(elapsedMs)}`,
  );
};

const runStep = (step) =>
  new Promise((resolveStep) => {
    const failureLines = [];
    const tailLines = [];
    const pending = { stdout: "", stderr: "" };
    const child = spawn(step.cmd, step.args, {
      cwd: packageRoot,
      env: step.env ? { ...process.env, ...step.env } : process.env,
    });

    const inspectLine = (rawLine) => {
      const line = rawLine.replace(ANSI_PATTERN, "").trim();
      if (!line) return;
      tailLines.push(line);
      if (tailLines.length > MAX_TAIL_LINES) tailLines.shift();

      // Vitest prints one of these lines for each failing file/test. Retaining
      // them gives the final summary the actionable names without replaying
      // assertion bodies or thousands of lines of otherwise-live output.
      if (
        failureLines.length < MAX_FAILURE_LINES &&
        /^(?:FAIL|×|✗)\s+/.test(line) &&
        !failureLines.includes(line)
      ) {
        failureLines.push(line);
      }
    };

    const streamChunk = (streamName, target, chunk) => {
      target.write(chunk);
      pending[streamName] += chunk.toString();
      const lines = pending[streamName].split(/\r?\n/);
      pending[streamName] = lines.pop() ?? "";
      for (const line of lines) inspectLine(line);
    };

    child.stdout.on("data", (chunk) => streamChunk("stdout", process.stdout, chunk));
    child.stderr.on("data", (chunk) => streamChunk("stderr", process.stderr, chunk));
    child.on("error", (error) => resolveStep({ error, failureLines, tailLines }));
    child.on("close", (status, signal) => {
      if (pending.stdout) inspectLine(pending.stdout);
      if (pending.stderr) inspectLine(pending.stderr);
      resolveStep({ status, signal, failureLines, tailLines });
    });
  });

for (let i = 0; i < steps.length; i++) {
  const step = steps[i];
  console.log(`\n===== [${i + 1}/${steps.length}] ${step.name} =====`);
  const startedAt = performance.now();
  const res = await runStep(step);
  if (res.error) {
    console.error(`\n[validate-gate] failed to launch "${step.name}": ${res.error.message}`);
    failed.push({ name: step.name, summary: [`Launch error: ${res.error.message}`] });
    reportStepTiming(step.name, startedAt);
    continue;
  }
  if (res.status !== 0) {
    const exitDetail = res.signal ? `terminated by ${res.signal}` : `exit code ${res.status}`;
    failed.push({
      name: step.name,
      summary:
        res.failureLines.length > 0
          ? [exitDetail, ...res.failureLines]
          : [`${exitDetail}; final output:`, ...res.tailLines],
    });
  }
  reportStepTiming(step.name, startedAt);
}

const slowestSteps = [...timings]
  .sort((a, b) => b.elapsedMs - a.elapsedMs)
  .slice(0, 3);
console.log("\nVALIDATION GATE: TIMINGS (slowest first)");
for (const step of slowestSteps) {
  console.log(`  ${step.name}: ${formatDuration(step.elapsedMs)}`);
}

if (failed.length > 0) {
  console.error(`\nVALIDATION GATE: FAILED (${failed.map(({ name }) => name).join(", ")})`);
  console.error("VALIDATION GATE: FAILURE DETAILS");
  for (const failure of failed) {
    console.error(`  ${failure.name}:`);
    for (const line of failure.summary) {
      console.error(`    ${line}`);
    }
  }
  process.exit(1);
}
console.log("\nVALIDATION GATE: PASSED");
