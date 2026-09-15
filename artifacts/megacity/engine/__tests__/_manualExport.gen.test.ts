import { describe, it } from "vitest";
import { writeFileSync } from "node:fs";
import { MANUAL_INTRO, MANUAL_SECTIONS, MANUAL_OUTRO } from "@/data/manualContent";
import { APP_VERSION } from "@/constants/version";

// Generator (not a real test): dumps the manual content to /tmp so that
// scripts/generate-manual-pdf.mjs can render the PDF. Skipped by default so it
// has no side effects during normal test runs. Enable with GEN_MANUAL_JSON=1.
describe.skipIf(process.env.GEN_MANUAL_JSON !== "1")("manual export generator", () => {
  it("dumps manual content to /tmp for PDF rendering", () => {
    const payload = {
      version: APP_VERSION,
      intro: MANUAL_INTRO,
      sections: MANUAL_SECTIONS,
      outro: MANUAL_OUTRO,
    };
    writeFileSync("/tmp/megacity-manual.json", JSON.stringify(payload, null, 2), "utf8");
  });
});
