import type { GameState } from "@/engine/types";
import type { EventChainDef } from "@/engine/eventChains";
import {
  ensureFaithState,
  FAITH_DEFS,
  FAITH_IDS,
  type FaithId,
} from "@/engine/faiths";

function pickDistrictWithDominantFaith(
  s: GameState,
  faithId: FaithId,
  threshold: number,
): { districtId: string; districtName: string; share: number } | null {
  const fs = ensureFaithState(s);
  let best: { districtId: string; districtName: string; share: number } | null = null;
  for (const d of s.districts ?? []) {
    const shares = fs.districtShares[d.id];
    if (!shares) continue;
    const share = shares[faithId] ?? 0;
    if (share >= threshold && (!best || share > best.share)) {
      best = { districtId: d.id, districtName: d.name, share };
    }
  }
  return best;
}

function pickFaithMatching(
  s: GameState,
  predicate: (id: FaithId) => boolean,
): FaithId | null {
  for (const id of FAITH_IDS) {
    if (predicate(id)) return id;
  }
  return null;
}

// SCHISM — triggers when a tolerated/suppressed faith holds dominant share
// in a district (resentment spawns a sect split).
const FAITH_SCHISM: EventChainDef = {
  id: "faith_schism",
  name: "Faith Schism",
  cooldownTicks: 240,
  triggerCheck: (s) => {
    if (!s.faiths) return false;
    for (const id of FAITH_IDS) {
      const stance = s.faiths.stances[id];
      if (stance === "sponsor") continue;
      if (pickDistrictWithDominantFaith(s, id, 0.6)) return true;
    }
    return false;
  },
  prepareContext: (s) => {
    const fs = ensureFaithState(s);
    const id = pickFaithMatching(s, (fid) => {
      if (fs.stances[fid] === "sponsor") return false;
      return pickDistrictWithDominantFaith(s, fid, 0.6) !== null;
    });
    if (!id) return null;
    const dist = pickDistrictWithDominantFaith(s, id, 0.6);
    if (!dist) return null;
    return {
      faithName: FAITH_DEFS[id].shortName,
      districtName: dist.districtName,
    };
  },
  stages: [
    {
      id: "schism_open",
      title: "SCHISM IN {districtName}",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "schism_back_mainline",
          label: "BACK THE MAINLINE",
          effects: { credits: -8000, lawOrder: 2, unrest: 3, happiness: -2 },
          nextStageId: null,
        },
        {
          id: "schism_let_burn",
          label: "LET THEM FIGHT",
          effects: { unrest: 5, crime: 4, happiness: -3 },
          nextStageId: null,
        },
        {
          id: "schism_mediate",
          label: "MEDIATE A COUNCIL",
          effects: { credits: -16000, happiness: 3, unrest: -2, corruption: 1 },
          nextStageId: null,
        },
      ],
    },
  ],
};

// MIRACLE — triggers when a sponsored faith reaches dominant share somewhere.
// Pure positive-flavoured chain; the player chooses how to lean into it.
const FAITH_MIRACLE: EventChainDef = {
  id: "faith_miracle",
  name: "Faith Miracle",
  cooldownTicks: 320,
  triggerCheck: (s) => {
    if (!s.faiths) return false;
    for (const id of FAITH_IDS) {
      if (s.faiths.stances[id] !== "sponsor") continue;
      if (pickDistrictWithDominantFaith(s, id, 0.7)) return true;
    }
    return false;
  },
  prepareContext: (s) => {
    const fs = ensureFaithState(s);
    const id = pickFaithMatching(s, (fid) => {
      if (fs.stances[fid] !== "sponsor") return false;
      return pickDistrictWithDominantFaith(s, fid, 0.7) !== null;
    });
    if (!id) return null;
    const dist = pickDistrictWithDominantFaith(s, id, 0.7);
    if (!dist) return null;
    return {
      faithName: FAITH_DEFS[id].shortName,
      districtName: dist.districtName,
    };
  },
  stages: [
    {
      id: "miracle_open",
      title: "REPORTED MIRACLE IN {districtName}",
      severity: "low",
      delayTicks: 0,
      responses: [
        {
          id: "miracle_endorse",
          label: "ENDORSE THE MIRACLE",
          effects: { happiness: 5, unrest: -3, corruption: 2 },
          nextStageId: null,
        },
        {
          id: "miracle_investigate",
          label: "QUIETLY INVESTIGATE",
          effects: { credits: -5000, happiness: 2, lawOrder: 2 },
          nextStageId: null,
        },
        {
          id: "miracle_dismiss",
          label: "DISMISS AS HYSTERIA",
          effects: { happiness: -4, unrest: 2 },
          nextStageId: null,
        },
      ],
    },
  ],
};

// HERESY CRACKDOWN — triggers when player suppresses a faith but it still
// holds meaningful share. Crackdown choice: escalate or back off.
const FAITH_HERESY_CRACKDOWN: EventChainDef = {
  id: "faith_heresy_crackdown",
  name: "Heresy Crackdown",
  cooldownTicks: 200,
  triggerCheck: (s) => {
    if (!s.faiths) return false;
    for (const id of FAITH_IDS) {
      if (s.faiths.stances[id] !== "suppress") continue;
      if (pickDistrictWithDominantFaith(s, id, 0.4)) return true;
    }
    return false;
  },
  prepareContext: (s) => {
    const fs = ensureFaithState(s);
    const id = pickFaithMatching(s, (fid) => {
      if (fs.stances[fid] !== "suppress") return false;
      return pickDistrictWithDominantFaith(s, fid, 0.4) !== null;
    });
    if (!id) return null;
    const dist = pickDistrictWithDominantFaith(s, id, 0.4);
    if (!dist) return null;
    return {
      faithName: FAITH_DEFS[id].shortName,
      districtName: dist.districtName,
    };
  },
  stages: [
    {
      id: "heresy_open",
      title: "HERESY HOLDOUT — {districtName}",
      severity: "high",
      delayTicks: 0,
      responses: [
        {
          id: "heresy_raid",
          label: "RAID THE GATHERINGS",
          effects: { credits: -12000, lawOrder: 4, unrest: 4, happiness: -5, crime: 2 },
          nextStageId: null,
        },
        {
          id: "heresy_show_trial",
          label: "PUBLIC SHOW TRIAL",
          effects: { lawOrder: 6, unrest: 6, happiness: -7, corruption: 3 },
          nextStageId: null,
        },
        {
          id: "heresy_back_off",
          label: "QUIETLY STAND DOWN",
          effects: { happiness: 2, unrest: -2, lawOrder: -3 },
          nextStageId: null,
        },
      ],
    },
  ],
};

// LEADER CULT ASSASSINATION — high-stakes drawback hook for opt-in Leader Cult.
// Triggers only while the player is Leader Cult head. The choice is real but
// never auto-binds the player; declining still surfaces the threat.
const LEADER_CULT_ASSASSINATION: EventChainDef = {
  id: "leader_cult_assassination",
  name: "Leader Cult Assassination Plot",
  cooldownTicks: 320,
  triggerCheck: (s) => {
    if (!s.faiths?.leaderCult) return false;
    // Only fires after a settling period — no plot on tick 0 of declaration.
    return (s.totalTicks ?? 0) - s.faiths.leaderCult.declaredAtTick > 20;
  },
  prepareContext: (s) => {
    const cult = s.faiths?.leaderCult;
    if (!cult) return null;
    return { faithName: FAITH_DEFS[cult.faithId].shortName };
  },
  stages: [
    {
      id: "assassination_open",
      title: "ASSASSINATION PLOT — {faithName}",
      severity: "critical",
      delayTicks: 0,
      responses: [
        {
          id: "assassination_purge",
          label: "PURGE THE CELL",
          effects: { credits: -20000, lawOrder: 4, unrest: 6, happiness: -4, corruption: 3 },
          nextStageId: null,
        },
        {
          id: "assassination_flip",
          label: "TURN AN INFORMANT",
          effects: { credits: -35000, lawOrder: 2, corruption: 4 },
          nextStageId: null,
        },
        {
          id: "assassination_ignore",
          label: "IGNORE THE WARNING",
          effects: { unrest: 8, happiness: -8, lawOrder: -4 },
          nextStageId: null,
        },
      ],
    },
  ],
};

export const RELIGION_EVENT_CHAINS: EventChainDef[] = [
  FAITH_SCHISM,
  FAITH_MIRACLE,
  FAITH_HERESY_CRACKDOWN,
  LEADER_CULT_ASSASSINATION,
];
