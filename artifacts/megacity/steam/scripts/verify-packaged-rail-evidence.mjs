import { existsSync, readFileSync, appendFileSync } from "node:fs";

const evidencePath = process.env.MEGACITY_PACKAGED_RAIL_EVIDENCE_PATH;
const expectedCommit = process.env.MEGACITY_EXPECTED_COMMIT ?? process.env.GITHUB_SHA;
const failures = [];
let evidence = null;

if (!evidencePath) {
  failures.push("MEGACITY_PACKAGED_RAIL_EVIDENCE_PATH is required");
} else if (!existsSync(evidencePath)) {
  failures.push(`packaged rail-module evidence is missing at ${evidencePath}`);
} else {
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    failures.push(`packaged rail-module evidence is not valid JSON: ${error.message}`);
  }
}

if (evidence) {
  if (evidence.schemaVersion !== 1) {
    failures.push(`unsupported packaged rail-module evidence schema: ${evidence.schemaVersion}`);
  }
  if (evidence.test !== "packaged-rail-modules") {
    failures.push(`unexpected evidence test: ${evidence.test ?? "(missing)"}`);
  }
  if (evidence.status !== "passed" || evidence.runnerResult !== "passed") {
    failures.push(
      `Windows packaged rail-module result was ${evidence.runnerResult ?? evidence.status ?? "(missing)"}`,
    );
  }
  if (!expectedCommit) {
    failures.push("the expected tested commit is missing from the release environment");
  } else if (evidence.testedCommit !== expectedCommit) {
    failures.push(
      `stale packaged rail-module evidence: tested ${evidence.testedCommit ?? "(missing)"}, ` +
        `expected ${expectedCommit}`,
    );
  }
  if (evidence.runner?.os !== "windows" || evidence.runner?.architecture !== "x64") {
    failures.push(
      `packaged rail-module evidence does not identify a Windows x64 runner ` +
        `(${evidence.runner?.os ?? "(missing)"} ${evidence.runner?.architecture ?? "(missing)"})`,
    );
  }
  if (evidence.normalSteamSavesUntouched !== true) {
    failures.push("packaged rail-module evidence did not prove normal Steam saves were untouched");
  }
  if (evidence.temporaryProfileRemoved !== true) {
    failures.push("packaged rail-module evidence did not prove the temporary profile was removed");
  }
  if (evidence.logCaptured !== true) {
    failures.push("packaged rail-module evidence did not include captured smoke output");
  }
}

const testedCommit = evidence?.testedCommit ?? "(missing)";
const runnerResult = evidence?.runnerResult ?? "(missing)";
const state = failures.length ? "BLOCKED" : "PASS";
const summary = [
  `### Packaged rail-module Windows evidence: ${state}`,
  "",
  `- Tested commit: \`${testedCommit}\``,
  `- Windows runner result: **${runnerResult}**`,
  `- Normal Steam saves untouched: **${evidence?.normalSteamSavesUntouched === true ? "yes" : "no"}**`,
  `- Temporary profile removed: **${evidence?.temporaryProfileRemoved === true ? "yes" : "no"}**`,
];
if (failures.length) {
  summary.push("", ...failures.map((failure) => `- **Release blocker:** ${failure}`));
}
summary.push("");

console.log(summary.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join("\n")}\n`);
}
if (failures.length) {
  console.error(`::error title=PACKAGED_RAIL_MODULE_EVIDENCE_BLOCKED::${failures.join("; ")}`);
  process.exitCode = 1;
}