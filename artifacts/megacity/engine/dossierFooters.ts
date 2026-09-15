export const DOSSIER_FOOTERS = [
  "Last known address: classified.",
  "Believed to owe favors to three factions.",
  "Has not been seen smiling since 2087.",
  "Sleeps with a sidearm under the pillow. Both pillows.",
  "Drinks only when sober. Sober only when ordered.",
  "Two open warrants in adjacent sectors. Neither will be served.",
  "Carries no identification. Doesn't need to.",
  "Files reports in handwriting. Refuses to explain why.",
  "Considered a model citizen by every survey that matters.",
  "Three previous psych evaluations were lost in the same fire.",
  "Refers to the Commander's office as 'the building.' Always.",
  "Owns a dog. The dog has its own dossier.",
  "Officially deceased twice. Disputes both records.",
  "Has been quietly removed from four guest lists.",
  "Speaks four languages. Lies in all of them.",
  "Last polygraph result: inconclusive, then redacted.",
  "Pays cash. Always exact change. Never asks for a receipt.",
  "Listed as next of kin for two strangers.",
  "Refuses photographs. The file photo is a sketch.",
  "Believes the surveillance grid was their idea.",
  "Once filed a missing-person report on themself. It was approved.",
  "Walks home a different route every night.",
  "Has never been late. Has never been on time.",
  "Suspected of nothing in particular. Suspected nonetheless.",
  "Three witnesses recanted. The fourth retired suddenly.",
  "Receives mail at an address that does not exist on any map.",
  "Files taxes early. Always.",
  "Owns more knives than the average kitchen. Cooks rarely.",
  "Has been described, by separate parties, as 'fine.'",
  "Their handwriting matches no known sample on file.",
];

export function pickDossierFooter(seed?: string): string {
  const idx = seed
    ? Math.abs(hashString(seed)) % DOSSIER_FOOTERS.length
    : Math.floor(Math.random() * DOSSIER_FOOTERS.length);
  return DOSSIER_FOOTERS[idx]!;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}
