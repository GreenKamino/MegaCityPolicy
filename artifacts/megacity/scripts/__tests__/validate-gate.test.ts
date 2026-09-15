import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const gatePath = join(packageRoot, "scripts", "validate-gate.mjs");
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("validate-gate subprocess contract", () => {
  it("streams child output and preserves actionable failure summaries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "megacity-validate-gate-"));
    tempDirectories.push(directory);
    const childPath = join(directory, "disposable-stage.mjs");
    await writeFile(
      childPath,
      `
const [stage, status] = process.argv.slice(2);
process.stdout.write(stage + ": streamed child output\\\\n");
if (status === "fail") {
  setTimeout(() => {
    process.stderr.write("FAIL engine/__tests__/releaseGateProbe.test.ts > keeps exact failure\\\\n");
    process.exit(1);
  }, 120);
} else {
  setTimeout(() => {
    process.stdout.write(stage + ": completed successfully\\\\n");
    process.exit(0);
  }, 120);
}
`,
    );

    const steps = [
      {
        name: "success-stage",
        cmd: process.execPath,
        args: [childPath, "success-stage", "pass"],
      },
      {
        name: "failing-stage",
        cmd: process.execPath,
        args: [childPath, "failing-stage", "fail"],
      },
    ];
    const gate = spawn(process.execPath, [gatePath], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        VALIDATE_GATE_TEST_STEPS: JSON.stringify(steps),
      },
    });

    let output = "";
    let gateExitCode: number | null | undefined;
    const streamedOutput = new Promise<void>((resolveStream) => {
      const collect = (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("success-stage: streamed child output")) {
          resolveStream();
        }
      };
      gate.stdout.on("data", collect);
      gate.stderr.on("data", collect);
    });
    const result = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolveProcess) => {
        gate.on("close", (code, signal) => {
          gateExitCode = code;
          resolveProcess({ code, signal });
        });
      },
    );

    await streamedOutput;
    expect(gateExitCode).toBeUndefined();

    const { code, signal } = await result;
    expect(signal).toBeNull();
    expect(code).not.toBe(0);
    expect(output).toContain("success-stage: streamed child output");
    expect(output).toContain("success-stage: completed successfully");
    expect(output).toContain("failing-stage: streamed child output");
    expect(output.indexOf("success-stage: completed successfully")).toBeLessThan(
      output.indexOf("failing-stage: streamed child output"),
    );

    const failureDetails = output.slice(
      output.indexOf("VALIDATION GATE: FAILURE DETAILS"),
    );
    expect(failureDetails).toContain(
      "FAIL engine/__tests__/releaseGateProbe.test.ts > keeps exact failure",
    );
    expect(failureDetails).not.toContain("success-stage:");
  });

  it("keeps every failed stage when multiple failure modes occur", async () => {
    const directory = await mkdtemp(join(tmpdir(), "megacity-validate-gate-"));
    tempDirectories.push(directory);
    const childPath = join(directory, "multi-failure-stage.mjs");
    await writeFile(
      childPath,
      `
const [stage, mode] = process.argv.slice(2);
process.stdout.write(stage + ": started\\\\n");
if (mode === "signal") {
  setTimeout(() => process.kill(process.pid, "SIGTERM"), 120);
} else {
  setTimeout(() => process.exit(0), 120);
}
`,
    );

    const steps = [
      {
        name: "successful-stage",
        cmd: process.execPath,
        args: [childPath, "successful-stage", "pass"],
      },
      {
        name: "launch-error-stage",
        cmd: join(tmpdir(), "megacity-command-that-does-not-exist"),
        args: [],
      },
      {
        name: "signal-failure-stage",
        cmd: process.execPath,
        args: [childPath, "signal-failure-stage", "signal"],
      },
    ];
    const gate = spawn(process.execPath, [gatePath], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        VALIDATE_GATE_TEST_STEPS: JSON.stringify(steps),
      },
    });

    let output = "";
    gate.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    gate.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    const { code, signal } = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolveProcess) => {
      gate.on("close", (exitCode, exitSignal) => {
        resolveProcess({ code: exitCode, signal: exitSignal });
      });
    });

    expect(signal).toBeNull();
    expect(code).not.toBe(0);
    const failureDetails = output.slice(
      output.indexOf("VALIDATION GATE: FAILURE DETAILS"),
    );
    expect(failureDetails).toContain("launch-error-stage:");
    expect(failureDetails).toContain("Launch error:");
    expect(failureDetails).toContain("ENOENT");
    expect(failureDetails).toContain("signal-failure-stage:");
    expect(failureDetails).toContain("terminated by SIGTERM");
    expect(failureDetails).not.toContain("successful-stage:");
  });

  it("keeps an unlaunchable stage in the failure details and blocks release", async () => {
    const steps = [
      {
        name: "unlaunchable-stage",
        cmd: join(tmpdir(), "megacity-command-that-does-not-exist"),
        args: [],
      },
    ];
    const gate = spawn(process.execPath, [gatePath], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        VALIDATE_GATE_TEST_STEPS: JSON.stringify(steps),
      },
    });

    let output = "";
    gate.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    gate.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    const { code, signal } = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolveProcess) => {
      gate.on("close", (exitCode, exitSignal) => {
        resolveProcess({ code: exitCode, signal: exitSignal });
      });
    });

    expect(signal).toBeNull();
    expect(code).not.toBe(0);
    const failureDetails = output.slice(
      output.indexOf("VALIDATION GATE: FAILURE DETAILS"),
    );
    expect(failureDetails).toContain("unlaunchable-stage:");
    expect(failureDetails).toContain("Launch error:");
    expect(failureDetails).toContain("ENOENT");
  });

  it("keeps signal termination in the failure details and blocks release", async () => {
    const directory = await mkdtemp(join(tmpdir(), "megacity-validate-gate-"));
    tempDirectories.push(directory);
    const childPath = join(directory, "signal-stage.mjs");
    await writeFile(
      childPath,
      `
process.stdout.write("signal-stage: started\\\\n");
setTimeout(() => process.kill(process.pid, "SIGTERM"), 120);
`,
    );

    const gate = spawn(process.execPath, [gatePath], {
      cwd: packageRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        VALIDATE_GATE_TEST_STEPS: JSON.stringify([
          {
            name: "signal-stage",
            cmd: process.execPath,
            args: [childPath],
          },
        ]),
      },
    });

    let output = "";
    gate.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    gate.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    const { code, signal } = await new Promise<{
      code: number | null;
      signal: NodeJS.Signals | null;
    }>((resolveProcess) => {
      gate.on("close", (exitCode, exitSignal) => {
        resolveProcess({ code: exitCode, signal: exitSignal });
      });
    });

    expect(signal).toBeNull();
    expect(code).not.toBe(0);
    const failureDetails = output.slice(
      output.indexOf("VALIDATION GATE: FAILURE DETAILS"),
    );
    expect(failureDetails).toContain("signal-stage:");
    expect(failureDetails).toContain("terminated by SIGTERM");
  });
});
