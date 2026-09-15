export type GameDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

// Faith id lives in types.ts (instead of engine/faiths.ts) so that entity types
// such as Faction / ExternalMegacity / Township can carry a `dominantFaithId`
// field without creating an import cycle with engine/faiths.ts (which imports
// GameState from this file). engine/faiths.ts re-exports this for back-compat.
export type FaithId =
  | "eternal-flame"
  | "machine-choir"
  | "ancestor-cult"
  | "the-ledger"
  | "the-tidekeepers"
  | "helix-commune"
  | "free-choir"
  | "catholicism";

export type GameMessage = {
  id: string;
  timestamp: GameDate;
  tick: number;
  category: "report" | "call" | "mission" | "alert" | "update" | "intel" | "request" | "world-news";
  title: string;
  body: string;
  read: boolean;
  priority: "low" | "normal" | "high" | "critical";
};

export type Resources = {
  credits: number;
  food: number;
  water: number;
  power: number;
  steel: number;
  goods: number;
  fuel: number;
  medSupplies: number;
  ammo: number;
};

/**
 * Top-level reserves with intentional gameplay storage ceilings.
 *
 * Water, credits, and ammo remain flow/treasury reserves. `stockpiles` is a
 * separate open-ended logistics ledger for commodities and field supplies.
 */
export type StorageResourceKey = "food" | "steel" | "goods" | "fuel" | "medSupplies" | "power";

export type CityStats = {
  population: number;
  populationGrowthRate: number;
  crime: number;
  unrest: number;
  happiness: number;
  lawOrder: number;
  corruption: number;
  employment: number;
  housingPressure: number;
  infrastructureHealth: number;
  researchProgress: number;
  researchTarget: number;
  defenseRating: number;
  education: number;
  publicHealth: number;
  biosphere: number;
  // Fractional accumulator for continuous biosphere recovery. The integer
  // `biosphere` above only changes when this crosses ±1, so small ongoing
  // investments still move it over time. Persisted; clamped to [-1, 1]. See
  // processBiosphere in tickProcessors.ts and engine/biosphereBreakdown.ts.
  biosphereRecoveryProgress?: number;
  diseaseRisk: number;
  upliftPopulation: number;
  industrialOutput?: number;
  attrition?: number;
};

export type PartnerControlStatus = "independent" | "occupied" | "annexed";

export type Rates = {
  taxIncome: number;
  tradeIncome: number;
  tourismIncome: number;
  foodProduction: number;
  foodConsumption: number;
  waterProduction: number;
  waterConsumption: number;
  powerGeneration: number;
  powerDrain: number;
  steelProduction: number;
  goodsProduction: number;
  goodsConsumption: number;
  fuelProduction: number;
  medProduction: number;
  ammoProduction: number;
};

export type TourismState = {
  touristCount: number;
  tourismIncome: number;
  tourismSatisfaction: number;
  tourismCapacity: number;
};

export type ActiveEdict = {
  edictId: string;
  ticksRemaining: number;
  issuedAtTick: number;
  cooldownUntilTick: number;
};

export type UtilityState = {
  powerStored: number;
  wasteGenerated: number;
  wasteProcessed: number;
  transitCapacity: number;
  transitLoad: number;
  commsStrength: number;
  fuelDistribution: number;
  sanitationLevel: number;
};

export type Buildings = Record<string, number>;

export type InfrastructureCategory =
  | "construction" | "energy" | "water" | "food" | "housing" | "transit"
  | "industrial" | "security" | "defense" | "research" | "civic" | "farming"
  | "cybernetics" | "tourism" | "weaponSystems" | "expansion" | "space"
  | "commercial" | "infrastructure" | "wasteland" | "military";
export type InfrastructureAsset = {
  id: string;
  key: string;
  source: "city" | "military" | "rail";
  category: InfrastructureCategory;
  count: number;
  points: number;
  maxIntegrity: number;
  integrity: number;
};
export type InfrastructureIncident = {
  id: string;
  kind: "damage" | "repair" | "capacity_add" | "capacity_remove";
  /** Infrastructure points actually affected by this incident. */
  amount: number;
  tick: number;
  reason?: string;
  assetId?: string;
  source?: InfrastructureAsset["source"];
  category?: InfrastructureCategory;
};
export type InfrastructureLedger = {
  version: number;
  totalPoints: number;
  intactPoints: number;
  assets: Record<string, InfrastructureAsset>;
  incidents: InfrastructureIncident[];
  /** Longer-lived replay guard; separate from the short player-facing history. */
  appliedIncidentIds?: string[];
  summaries: Record<string, number>;
};
export type Units = Record<string, number>;

export type CompanySector =
  | "energy"
  | "water"
  | "food"
  | "construction"
  | "manufacturing"
  | "transport"
  | "tech"
  | "medical"
  | "finance"
  | "civic";

export type CompanyDef = {
  id: string;
  name: string;
  sector: CompanySector;
  tier: 1 | 2 | 3;
  description: string;
  licenseCost: number;
  maintenanceCost: number;
  employment: number;
  taxOutput: number;
  corruptionRisk: number;
  effects: {
    power?: number;
    water?: number;
    food?: number;
    steel?: number;
    goods?: number;
    fuel?: number;
    med?: number;
    trade?: number;
    research?: number;
    happiness?: number;
    crime?: number;
    stability?: number;
  };
};

export type CompanyInstance = {
  companyId: string;
  districtId: string;
  licenseDate: number;
  /**
   * Legacy records can outlive the district they were licensed into. Those
   * records remain visible for audit/recovery, but do not operate until their
   * district reference is valid again.
   */
  status?: "active" | "quarantined";
  quarantineReason?: "unknown_district";
};

export type Policies = {
  curfewEnabled: boolean;
  rationsEnabled: boolean;
  martialLaw: boolean;
  propaganda: boolean;
  gangsPatrolled: boolean;
  corruptionInvestigation: boolean;
  surveillanceActive: boolean;
  laborDirective: boolean;
  mutantPolicy: "contain" | "purge" | "tolerate";
  welfareRationing: "cut" | "normal" | "generous";
};

export type Doctrine = {
  lawVsMercy: number;
  brutalityVsLegit: number;
  orderVsProsperity: number;
  centralVsLocal: number;
};

export type District = {
  id: string;
  name: string;
  subtitle: string;
  population: number;
  wealth: number;
  crime: number;
  unrest: number;
  loyalty: number;
  infraQuality: number;
  gangInfluence: number;
  mutationRate: number;
  defenseRating: number;
  industrialOutput: number;
  ecology: number;
};

export type DistrictCommandEffect = Partial<Record<
  "population" | "crime" | "unrest" | "loyalty" | "infraQuality" | "defenseRating" | "wealth" | "gangInfluence",
  number
>>;

export type DistrictCommandHistoryEntry = {
  id: string;
  districtId: string;
  actionId: string;
  effects: DistrictCommandEffect;
  tick: number;
  timestamp: GameDate;
  cooldownUntilTick: number;
};

export type FactionInfrastructure = {
  military: number;
  walls: number;
  fuel: number;
  civilian: number;
};

export type SettlementInfrastructureScore = {
  /** Capacity points, analogous to the player infrastructure ledger total. */
  totalPoints: number;
  /** Estimated usable capacity as a percentage of total points. */
  integrityPercent: number;
};

/**
 * Shared operational facts for any populated settlement on the strategic map.
 *
 * The legacy partner records remain intentionally denormalized for save and
 * simulation compatibility. This nested sheet is the stable presentation
 * contract used by map dossiers and future settlement types.
 */
export type SettlementOperationalData = {
  population: number;
  territoryKm2: number;
  infrastructure: FactionInfrastructure;
  infrastructureScore: SettlementInfrastructureScore;
  /** Optional condition inputs retained for deterministic NPC estimates. */
  condition?: {
    health: number;
    attrition: number;
  };
  setting: {
    terrain: string;
    coastal: boolean;
    wasteland: boolean;
    foundation?: string;
    hazards?: string[];
  };
  faithCulture?: {
    faith: string;
    culture: string[];
  };
  government: {
    style: string;
    institution: string;
  };
  economy: {
    profile: string;
    outputs: string[];
  };
  resources: string[];
  trade: {
    exports: string[];
    imports: string[];
    capacity: "limited" | "regional" | "major" | "continental";
  };
  military: {
    capacity: number;
    posture: string;
  };
  stability: {
    score: number;
    label: string;
  };
  diplomacy: {
    posture: string;
    influence: number;
  };
  priorities?: string[];
};

export type StrikeRecord = {
  id: string;
  tick: number;
  timestamp: GameDate;
  attackerId: string;
  targetId: string;
  targetName: string;
  attackType: string;
  targetCategory: string;
  success: boolean;
  intercepted: boolean;
  damageDealt: Record<string, number>;
  attackerCasualties: number;
  civilianCasualties: number;
  narrative: string;
};

export type EcologyStance = "poacher" | "conservationist" | "druid" | "neutral";

export type FactionDomain =
  | "administration"
  | "inspection"
  | "legal"
  | "auditing"
  | "finance"
  | "procurement";

export type FactionMechanicalRole =
  | "institutional_governance";

export type FactionScope = "internal" | "external";

export type Faction = {
  id: string;
  name: string;
  description: string;
  influence: number;
  loyalty: number;
  threat: number;
  type: "law" | "criminal" | "corporate" | "underclass" | "cult" | "institutional";
  isActive: boolean;
  /** Optional identity metadata; older factions and saves may omit it. */
  scope?: FactionScope;
  color?: string;
  domains?: FactionDomain[];
  mechanicalRole?: FactionMechanicalRole;
  /** How deeply the institution is embedded in city operations (0–100). */
  institutionalPresence?: number;
  leader?: FactionLeader;
  infrastructure?: FactionInfrastructure;
  personality?: PartnerPersonality;
  ecologyStance?: EcologyStance;
  // Dominant religion among the faction's followers. `undefined` (or null in
  // legacy saves) means the faction has no organized religion. Surfaced in UI
  // (Factions screen, Diplomacy entity cards).
  dominantFaithId?: FaithId | null;
};

export type AdministrativeCohortId =
  | "civil_administration"
  | "inspection"
  | "legal"
  | "auditing"
  | "treasury_finance"
  | "procurement"
  | "financial_district";

export type AdministrativeCohort = {
  id: AdministrativeCohortId;
  staffing: number;
  capacity: number;
  effectiveness: number;
  independence: number;
  workload: number;
  corruptionExposure: number;
};

export type AdministrativeReformDirection =
  | "balanced"
  | "watchdog_expansion"
  | "centralization"
  | "decentralization"
  | "austerity"
  | "expedited_approvals"
  | "public_prosecution";

export type AdministrativeInstitutions = {
  cohorts: Record<AdministrativeCohortId, AdministrativeCohort>;
  overallCapacity: number;
  overallEffectiveness: number;
  oversightCoverage: number;
  workloadPressure: number;
  corruptionExposure: number;
  pressure: number;
  reformDirection: AdministrativeReformDirection;
  reformAdoptedTick: number;
  lastUpdatedTick: number;
};

export type PartnerPersonalityTrait =
  | "proud"
  | "vengeful"
  | "mercantile"
  | "paranoid"
  | "opportunist"
  | "honorable"
  | "pragmatic"
  | "fanatical"
  | "cautious"
  | "treacherous";

export type PartnerPersonality = {
  primary: PartnerPersonalityTrait;
  secondary?: PartnerPersonalityTrait;
  values: {
    gifts: number;
    threats: number;
    formality: number;
    secrecy: number;
    loyaltyMemory: number;
    grudgeMemory: number;
  };
  manifesto: string;
};

export type PartnerLedgerEntry = {
  action: string;
  tick: number;
  outcome: "accepted" | "rejected" | "broken";
  weight: number;
};

export type PartnerLedger = {
  partnerId: string;
  favors: number;
  grudges: number;
  debts: number;
  lastInteractionTick: number;
  recent: PartnerLedgerEntry[];
  reputationLine: string;
  trustTrend: "rising" | "steady" | "falling";
};

export type IntelItemKind = "rumor" | "intel" | "tip" | "warning" | "secret";

export type IntelItem = {
  id: string;
  source: string;
  sourceId?: string;
  kind: IntelItemKind;
  subjectId?: string;
  subjectName?: string;
  content: string;
  acquiredTick: number;
  expiresTick: number;
  reliability: number;
  acted: boolean;
};

export type PendingPartnerResponse = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerKind: PartnerKind;
  triggerAction: string;
  responseKind: "favor-asked" | "counter-offer" | "third-party-gossip" | "retaliation" | "memory-callback" | "intel-leak";
  payload: string;
  dueTick: number;
};

export type PartnerKind =
  | "law"
  | "criminal"
  | "corporate"
  | "underclass"
  | "cult"
  | "institutional"
  | "megacity"
  | "nation"
  | "township"
  | "settlement"
  | "group";

export type TradeAgreement = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerType: "faction" | "megacity";
  give: { commodity: string; amount: number }[];
  receive: { commodity: string; amount: number }[];
  creditsPerTick: number;
  duration: number;
  remainingTicks: number;
  status: "active" | "expired" | "cancelled";
  createdTick: number;
};

export type JointProject = {
  id: string;
  partnerId: string;
  partnerName: string;
  buildingKey: string;
  buildingName: string;
  progress: number;
  target: number;
  contributionPerTick: number;
  status: "in_progress" | "complete" | "cancelled";
  createdTick: number;
};

export type DiplomaticPact = {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerType: "faction" | "megacity";
  pactType: "non-aggression" | "mutual-defense" | "open-borders" | "intelligence-sharing";
  effects: { crime?: number; threat?: number; loyalty?: number; influence?: number };
  duration: number;
  remainingTicks: number;
  status: "active" | "expired" | "broken";
  createdTick: number;
};

export type ActiveOperationType =
  | "blockade" | "embargo" | "sanctions" | "tribute"
  | "protection-racket" | "proxy-war" | "destabilization"
  | "cultural-subversion" | "cyber-campaign" | "gun-pipeline";

export type ActiveOperation = {
  id: string;
  type: ActiveOperationType;
  targetId: string;
  targetName: string;
  startTick: number;
  duration: number;
  remainingTicks: number;
  status: "active" | "expired" | "cancelled" | "retaliated";
  intensity: number;
  upkeepPerTick: number;
  effects: {
    tradeIncome?: number;
    credits?: number;
    loyaltyTarget?: number;
    loyaltyAll?: number;
    threatTarget?: number;
    unrest?: number;
    crime?: number;
    corruption?: number;
    defenseRating?: number;
    infrastructureHealth?: number;
  };
  retaliationChance: number;
  discoveryChance: number;
  discovered: boolean;
  narrative: string;
};

export type PartnerArchetype =
  | "nomad"
  | "tech-enclave"
  | "religious-order"
  | "corporate-state"
  | "syndicate"
  | "settlement"
  | "military-junta"
  | "feudal-realm";

export type PartnerStance =
  | "content"
  | "prosperous"
  | "opportunistic"
  | "defiant"
  | "mourning"
  | "mobilized"
  | "hostile"
  | "desperate";

export type PersonalityArchetype =
  | "paranoid"
  | "mercantile"
  | "militarist"
  | "zealot"
  | "opportunist"
  | "isolationist"
  | "honorable"
  | "ruthless";

export type ExternalMegacity = {
  id: string;
  name: string;
  description: string;
  influence: number;
  loyalty: number;
  threat: number;
  isActive: boolean;
  tradeInventory: Record<string, number>;
  lastRefreshTick: number;
  leader?: FactionLeader;
  factionType: "megacity" | "nation" | "group";
  infrastructure?: FactionInfrastructure;
  voiceLines?: TownshipVoiceLines;
  governanceStyle?: string;
  militaryStrength?: string;
  specialResources?: string[];
  personality?: PartnerPersonality;
  population?: number;
  cityHealth?: number;
  attrition?: number;
  controlStatus?: PartnerControlStatus;
  tributePerTick?: number;
  occupiedSinceTick?: number;
  // First tick of the current uninterrupted low-loyalty/high-attrition spell
  // while controlled. Cleared as soon as either condition recovers.
  uprisingDiscontentSinceTick?: number;
  archetype?: PartnerArchetype;
  personalityArchetype?: PersonalityArchetype;
  currentAction?: string;
  concerns?: string[];
  stance?: PartnerStance;
  // City-end condition (Task: zero-pop fall). When citizens AND living
  // units both hit 0 with no ascension fallback, an NPC city is marked
  // "fallen". Distinct from `controlStatus: "occupied"` (which means a
  // player military takeover). A fallen city stays in the world as a
  // ruin — see engine/endState.ts.
  endState?: "active" | "fallen";
  endedAtTick?: number;
  endCause?: string;
  // Dominant religion in the foreign city/nation. `undefined`/null = none.
  dominantFaithId?: FaithId | null;
  /** Shared operational sheet; optional on legacy saves and backfilled on load. */
  operational?: SettlementOperationalData;
  /** Dedicated, bounded operational record for The Continuance. */
  continuance?: ContinuanceOperationalState;
  /** Authoritative map metadata used by infrastructure systems; never infer from prose. */
  railLocation?: RailLocation;
};

export type ContinuanceCohorts = {
  totalSurvivors: number;
  dependents: number;
  workers: number;
  administrators: number;
  activeDuty: number;
  reserves: number;
  command: number;
};

export type ContinuanceOperationalState = {
  cohorts: ContinuanceCohorts;
  bunker: {
    capacity: number;
    food: number;
    water: number;
    power: number;
    air: number;
    housing: number;
  };
  industry: { capacity: number; output: number };
  weapons: { readiness: number; stockpile: number };
  morale: number;
  legitimacy: number;
  secrecy: number;
  intelligenceReach: number;
  reclamationCapability: number;
  militaryCommander: {
    name: string;
    role: string;
    authority: number;
    approval: number;
    loyalty: number;
    succession: string;
  };
  civilianPresident: {
    name: string;
    role: string;
    authority: number;
    approval: number;
    loyalty: number;
    succession: string;
  };
  doctrine: string;
  restorationPlan: {
    planning: number;
    infiltration: number;
    reconnaissance: number;
    mobilization: number;
    targetRegions: string[];
    readinessThresholds: { infiltration: number; reconnaissance: number; mobilization: number };
    discoveryRisk: number;
  };
  discoveryStage: 0 | 1 | 2 | 3 | 4;
};

export type TickEntry = {
  label: string;
  delta: number;
  unit: string;
  reason: string;
  severity: "positive" | "negative" | "neutral" | "warning";
};

export type RailLocation = {
  /** Stable world-location identifier, not a display name. */
  id: string;
  x: number;
  y: number;
  /** A controlled endpoint may use a port only when this explicit flag is set. */
  railPort?: boolean;
};

export type RailCorridorStatus =
  | "consent_pending" | "under_construction" | "disrupted"
  | "completed" | "cancelled" | "rejected";

export type RailTrainUpgradeId =
  | "armored_train_plating"
  | "troop_transport_carriages"
  | "weaponized_escort_cars";

export type RailCorridor = {
  version: 1;
  id: string;
  endpointId: string;
  endpointKind: "megacity" | "township";
  endpointLocationId: string;
  status: RailCorridorStatus;
  reason?: string;
  proposalTick: number;
  consentExpiresTick?: number;
  distance: number;
  totalTicks: number;
  progressTicks: number;
  setbackTicks: number;
  /** Optional solely for pre-investment saves; sanitizer backfills zero. */
  committedCredits?: number;
  committedSteel?: number;
  capabilities: ("passenger" | "freight" | "intermodal" | "industrial" | "commercial")[];
  staffing: { robots: number; engineers: number; railWorkers: number; security: number; ticketing: number; admin: number; maintenance: number };
  /** Optional for legacy saves; completed corridors may install each module once. */
  installedTrainUpgrades?: RailTrainUpgradeId[];
};

export type BlackMarketAuditEntry = {
  id: string;
  itemId: string;
  itemName: string;
  cost: number;
  outcome: "delivered" | "seized";
  tick: number;
  date: GameDate;
};

// Task #500: one in-flight construction order. `kind: "city"` orders
// increment `buildings[buildingKey]` on completion; `kind: "military"`
// orders increment `militaryOverhaul.logistics.installationsBuilt`.
// Task #524: `kind: "unit"` orders are troop-training orders — they
// increment `units[buildingKey]` on completion (buildingKey doubles as
// the unit key). A batch order (count > 1) completes as one unit — all
// copies come online together when the shared timer ends.
export type PendingConstruction = {
  id: string;
  kind: "city" | "military" | "unit" | "academy";
  buildingKey: string;
  // Display label frozen at order time so the UI and the completion
  // inbox message never need a key->label lookup.
  label: string;
  // Unit role frozen at order time. Optional so pre-role save data remains
  // valid; queue UIs fall back to the current unit catalog when absent.
  battlefieldRole?: import("./unitRoles").UnitRole;
  count: number;
  ticksTotal: number;
  ticksRemaining: number;
  orderedTick: number;
  academyId?: string;
  courseId?: string;
};

export type GameEvent = {
  id: string;
  title: string;
  /** Legacy save compatibility; newly generated incidents omit narrative prose. */
  description?: string;
  severity: "low" | "medium" | "high" | "critical";
  effects: Partial<{
    credits: number;
    unrest: number;
    crime: number;
    food: number;
    water: number;
    power: number;
    fuel: number;
    steel: number;
    goods: number;
    happiness: number;
    lawOrder: number;
    corruption: number;
    districtId: string;
    employment: number;
    infrastructureHealth: number;
    defenseRating: number;
    populationGrowthRate: number;
    foodProduction: number;
    powerGeneration: number;
    researchSpeed: number;
    medSupplies: number;
    tradeIncome: number;
  }>;
  timestamp: number;
  resolved: boolean;
  // Tick at which a self-limiting event auto-resolves. Currently set on
  // biosphere outbreak events so an unresolved crisis burns itself out
  // (emergency teams contain it) instead of compounding forever. Optional for
  // save compatibility; legacy active outbreaks are stamped on first sight.
  expiresTick?: number;
  responseOptions?: EventResponse[];
  maxResponses?: number;
  chainId?: string;
  // Optional legacy faction tie-in retained for save compatibility. Event
  // cards no longer render faction stamps or derive prose from this field.
  factionId?: string;
  // Biome this event originated from, stamped on biosphere/ecology events so
  // resolving the event can rebalance the correct biome's populations (and set
  // a post-resolution calm window) instead of leaving the crisis to re-fire.
  biome?: import("./biomes").Biome;
  // Intrigue plot this event belongs to (Task #379). Stamped on warning /
  // terror / assassination events so the event-resolution hook can reduce the
  // plot's progress, cool the instigator's radicalization, or clear the plot —
  // applyResponseEffects only understands the 13 stat keys and cannot touch
  // IntrigueState on its own.
  plotId?: string;
  // Task #458: true when this spawn is a RE-FIRE of an id the player already
  // cleared (a prior eventTriggerCooldowns stamp existed at spawn time), i.e.
  // the same known crisis resurfacing after its retrigger cooldown — not a
  // brand-new incident. EventCard renders a "STILL UNRESOLVED" badge for it.
  // Optional for save compatibility; absent on first-time firings.
  repeat?: boolean;
  // Number of times this known crisis has resurfaced after its first firing.
  // Optional for save compatibility; absent on first-time firings.
  returnCount?: number;
};

export type EventResponse = {
  id: string;
  label: string;
  /** Legacy save compatibility; newly generated responses omit narrative prose. */
  description?: string;
  // Labour Day responses can award one of the hidden, event-granted
  // temporary worker boosters. The event-resolution reducer consumes this
  // field and activates the normal persisted active-edict timer.
  labourBoosterId?: import("./labourDay").LabourDayBoosterId;
  // Optional gating: when set, the response is only available if at
  // least one APPOINTED officer carries this trait. EventCard renders
  // it disabled with a "REQUIRES …" hint when the trait is absent.
  requiresOfficerTrait?: OfficerTrait;
  // Optional deep-link: when set, choosing this response also navigates
  // to the given expo-router route (e.g. "/(game)/advisor-briefings").
  // Used by onboarding tips whose labels promise "OPEN <SCREEN>" — the
  // engine stays UI-agnostic; EventCard performs the actual push.
  navigateTo?: string;
  /** Persistent institutional direction selected by an Administrative Bloc demand. */
  administrativeReform?: AdministrativeReformDirection;
  effects: Partial<{
    credits: number;
    unrest: number;
    crime: number;
    food: number;
    water: number;
    power: number;
    happiness: number;
    lawOrder: number;
    corruption: number;
    defenseRating: number;
    medSupplies: number;
    steel: number;
    goods: number;
    tradeIncome: number;
    employment: number;
    infrastructureHealth: number;
    factionLoyalty: number;
    factionInfluence: number;
    factionThreat: number;
    administrativeCapacity: number;
    institutionalIndependence: number;
    administrativePressure: number;
    administrativeRadicalization: number;
    wounded: number;
    sick: number;
    missing: number;
    deaths: number;
  }>;
};

export type ContractCategory =
  | "construction"
  | "supply"
  | "utility"
  | "civic"
  | "security"
  | "industrial"
  | "emergency"
  | "blackBudget";

export type ProcurementMethod = "openTender" | "directAward" | "emergencyAuth";

export type ContractStatus = "available" | "active" | "completed" | "cancelled" | "delayed" | "expired";

export type ContractorDef = {
  id: string;
  name: string;
  sector: string;
  reputation: number;
  reliability: number;
  speed: number;
  quality: number;
  costMultiplier: number;
  corruptionRisk: number;
  specialties: ContractCategory[];
  description: string;
  personality?: string;
  motto?: string;
  onHired?: string;
  onDelayed?: string;
  onCompleted?: string;
  onCorruption?: string;
};

export type ContractDef = {
  id: string;
  name: string;
  contractorId: string;
  category: ContractCategory;
  description: string;
  totalCost: number;
  upfrontCost: number;
  recurringCostPerTick: number;
  durationTicks: number;
  progressPerTick: number;
  requiredMaterials: Partial<Resources>;
  materialPerTick: Partial<Resources>;
  reliability: number;
  speed: number;
  quality: number;
  corruptionRisk: number;
  delayRisk: number;
  temporaryEffects: Partial<CityStats>;
  completionEffects: {
    buildings?: Record<string, number>;
    units?: Record<string, number>;
    cityStats?: Partial<CityStats>;
    resources?: Partial<Resources>;
    stockpiles?: Record<string, number>;
  };
};

export type ContractInstance = {
  id: string;
  defId: string;
  contractorId: string;
  districtId: string;
  status: ContractStatus;
  progress: number;
  startTick: number;
  ticksElapsed: number;
  totalPaid: number;
  procurementMethod: ProcurementMethod;
  delaysOccurred: number;
  overrunCost: number;
  events: string[];
  // Task #581: true while the contract is stalled on materials, so the
  // stall warning fires once per stall episode (reset when work resumes).
  // Optional — absent on legacy saves (falsy ⇒ next stalled tick warns).
  stallWarned?: boolean;
};

export type UnitCategoryDef = {
  key: string;
  label: string;
  category: string;
  hireCost: number;
  dismissRefund: number;
  hireBatch: number;
  upkeepPerUnit: number;
  description: string;
  /** Canonical battlefield role used by recruitment and retinue coverage. */
  battlefieldRole?: import("./unitRoles").UnitRole;
};

export type ProcurementPolicies = {
  lowestBidPriority: boolean;
  qualityFirstProcurement: boolean;
  emergencyFastTrack: boolean;
  antiCorruptionOversight: boolean;
  civicLaborPreference: boolean;
  corporatePartnerIncentives: boolean;
  penalLaborConstruction: boolean;
  openTenderRequirement: boolean;
  securityScreening: boolean;
  blackBudgetWaivers: boolean;
};

export type PlayerAttributes = {
  authority: number;
  intelligence: number;
  charisma: number;
  combat: number;
  endurance: number;
};

export type PlayerSkills = {
  leadership: number;
  tactics: number;
  administration: number;
  investigation: number;
  intimidation: number;
  diplomacy: number;
  engineering: number;
  medicine: number;
  logistics: number;
  surveillance: number;
  propaganda: number;
  blackOps: number;
};

export type AugmentationSlot = {
  id: string;
  label: string;
  bodyRegion: "head" | "torso" | "arms" | "legs" | "spine" | "internal";
  installed: string | null;
};

export type PlayerCharacter = {
  name: string;
  title: string;
  backstory: string;
  age: number;
  sex: "male" | "female" | "other";
  level: number;
  xp: number;
  xpToNext: number;
  attributePoints: number;
  skillPoints: number;
  attributes: PlayerAttributes;
  skills: PlayerSkills;
  traits: string[];
  decorations: string[];
  augmentationSlots: AugmentationSlot[];
  insigniaIndex: number;
  totalDecisions: number;
  contractsCompleted: number;
  criminalsSentenced: number;
  riotsQuelled: number;
  selectedPerks: string[];
  activeTitle: string;
  // Cosmetic portrait id resolved by utils/portraits#getPortrait. Set at
  // character creation and re-selectable from the Character screen.
  // Optional for backwards compatibility with legacy saves — older
  // commanders fall back to no portrait until the player picks one.
  portraitId?: string;
};

export type SaveSlotMeta = {
  slotId: number;
  isEmpty: boolean;
  playerName: string;
  cityName: string;
  label: string;
  totalTicks: number;
  playerLevel: number;
  population: number;
  lastSaved: number;
  // True when the slot was started (or later flipped) into Honor Mode.
  // The save itself owns the flag; SaveSlotMeta carries it forward so the
  // load/save UI can render the HONOR badge without parsing the full save.
  honorMode: boolean;
};

export type DailyStreak = {
  current: number;
  longest: number;
  lastClaimedDay: string | null; // YYYY-MM-DD local
  lastVisitedDay: string | null; // YYYY-MM-DD local
};

export type WeeklyChallenge = {
  weekKey: string;       // ISO week, e.g. "2026-W18"
  templateId: string;    // CHALLENGE_TEMPLATES[id]
  statKey:
    | "criminalsSentenced"
    | "contractsCompleted"
    | "totalDecisions"
    | "riotsQuelled"
    | "totalTicks"
    | "eventsResolved"
    | "researchUnlocked"
    | "officerMissionsCompleted";
  baseline: number;      // value of the stat at challenge generation
  target: number;        // delta required to complete
  claimed: boolean;
};

export type CareerStats = {
  citiesRun: number;
  totalPlayTime: number;
  totalTicksAllCities: number;
  totalPopulationGoverned: number;
  totalCreditsEarned: number;
  totalCriminalsSentenced: number;
  totalRiotsQuelled: number;
  totalContractsCompleted: number;
  totalDecisions: number;
  highestPopulation: number;
  longestCityTicks: number;
  totalOfficersAppointed: number;
  totalFactionWars: number;
  totalResearchCompleted: number;
  totalBuildingsConstructed: number;
  totalMissionsCompleted: number;
};

export type PlayerProfile = {
  id: string;
  name: string;
  age: number;
  sex: "male" | "female" | "other";
  backstory: string;
  createdAt: number;
  lastPlayed: number;
  commanderLevel: number;
  commanderXP: number;
  commanderXPToNext: number;
  attributePoints: number;
  skillPoints: number;
  attributes: PlayerAttributes;
  skills: PlayerSkills;
  traits: string[];
  decorations: string[];
  augmentationSlots: AugmentationSlot[];
  careerStats: CareerStats;
  unlockedAchievements: string[];
  prestigeState?: import("@/engine/prestige").PrestigeState;
  // How many missed-while-away ticks should be fully simulated on resume
  // before the engine falls back to rate extrapolation. Persisted with the
  // profile so the choice rides along with save export/import and stays
  // per-player. Optional for backwards compatibility — older profiles fall
  // back to the global SettingsContext default ("standard").
  offlineSimDepth?: "lite" | "standard" | "deep";
  // Cosmetic portrait id chosen during NEW COMMANDER. Travels with the
  // profile (and therefore with cloud / JSON export-import) so the
  // commander's face survives across save slots. Optional for backwards
  // compatibility with profiles created before portraits shipped.
  portraitId?: string;
  // Player-uploaded custom portrait, stored inline as a small (<= ~100 KB)
  // base64 data URI. Living on the profile means it persists locally, rides
  // the profile cloud-sync bundle, and is removed with the profile on
  // delete. When set, portraitId holds the sentinel "custom_<profileId>"
  // which utils/customPortraits.ts resolves back to this URI at render time.
  customPortraitUri?: string;
};

export type TechCategory =
  | "energy"
  | "water"
  | "food"
  | "industrial"
  | "construction"
  | "transport"
  | "security"
  | "military"
  | "medical"
  | "research"
  | "civic"
  | "experimental"
  | "weapons"
  | "missiles"
  | "ammunition"
  | "rocketry"
  | "satellites"
  | "orbitalInfra"
  | "spaceIndustry"
  | "colonization"
  | "spaceNavy"
  | "spaceScience"
  | "spaceMissiles"
  | "cybernetics"
  | "dna"
  | "genetics"
  | "cloning"
  | "beautification"
  | "religion"
  | "xenobiology"
  | "uplift"
  | "ecology";

export type TechTier = 1 | 2 | 3 | 4 | 5;

export type TechDef = {
  id: string;
  name: string;
  category: TechCategory;
  tier: TechTier;
  researchCost: number;
  prerequisites: string[];
  description: string;
  effects: Partial<{
    crime: number;
    unrest: number;
    happiness: number;
    lawOrder: number;
    corruption: number;
    employment: number;
    infrastructureHealth: number;
    defenseRating: number;
    populationGrowthRate: number;
    foodProduction: number;
    waterProduction: number;
    powerGeneration: number;
    steelProduction: number;
    goodsProduction: number;
    fuelProduction: number;
    medProduction: number;
    taxIncome: number;
    tradeIncome: number;
    researchSpeed: number;
    constructionSpeed: number;
  }>;
};

export type ActiveResearch = {
  techId: string;
  progress: number;
  cost: number;
};

export type OfficerTrait =
  | "efficient" | "bureaucratic" | "visionary" | "incompetent"
  | "ambitious" | "loyal" | "corrupt" | "idealistic"
  | "strict" | "strategist" | "aggressive" | "cautious"
  | "investor_friendly" | "worker_advocate" | "corporate_loyalist" | "budget_hawk"
  | "perfectionist" | "delegator" | "micromanager" | "reformist"
  | "populist" | "paranoid" | "diplomat" | "ruthless"
  | "veteran" | "intelligence_officer" | "peacekeeper" | "enforcer"
  | "seasoned" | "tenured" | "loyal_lifer" | "embittered";

export type OfficerExitReason = "retired" | "died" | "dismissed" | "scandal";

export type CareerLogEntry = {
  year: number;
  text: string;
};

export type OfficerRank = "cadet" | "officer" | "senior_officer" | "director" | "commissioner" | "chief_director";

export type AppointmentMethod = "direct" | "council_vote" | "merit" | "faction_nomination";

export type OfficerAutoFillDoctrineId =
  | "loyalists"
  | "meritocrats"
  | "faction_balance"
  | "emergency_conscription";

export type OfficerAutoFillResult = {
  doctrineId: OfficerAutoFillDoctrineId;
  filled: number;
  totalCost: number;
  appliedAtTick: number;
  appliedYear: number;
  averageCompetenceDelta: number;
  averageLoyaltyDelta: number;
  averageCorruptionDelta: number;
  affectedFactionCount: number;
  /** Average actual changes after per-faction boundary clamping. */
  factionLoyaltyDelta: number;
  factionInfluenceDelta: number;
  factionThreatDelta: number;
};

export type OfficerDepartment =
  | "supreme_leadership" | "executive_council" | "judicial" | "law_enforcement"
  | "civic" | "infrastructure" | "economic" | "research"
  | "defense" | "district" | "advisory";

export type Officer = {
  id: string;
  name: string;
  position: string;
  department: OfficerDepartment;
  rank: OfficerRank;
  competence: number;
  loyalty: number;
  ambition: number;
  corruption: number;
  popularity: number;
  fearFactor: number;
  traits: OfficerTrait[];
  backstory: string;
  factionAffiliation: string | null;
  rivals: string[];
  appointed: boolean;
  appointmentMethod: AppointmentMethod | null;
  level: number;
  xp: number;
  age?: number;
  appointedYear?: number | null;
  yearsServed?: number;
  careerLog?: CareerLogEntry[];
  exitYear?: number;
  exitReason?: OfficerExitReason;
};

export type CharacterRole =
  | "gang_lieutenant"
  | "journalist"
  | "tycoon"
  | "agitator"
  | "celebrity"
  | "informant"
  | "fugitive"
  | "preacher"
  | "union_boss";

export type CharacterStatus = "active" | "jailed" | "dead" | "exiled" | "missing";

export type NamedCharacterEvent = {
  year: number;
  text: string;
};

export type NamedCharacter = {
  id: string;
  name: string;
  role: CharacterRole;
  factionId?: string | null;
  districtId?: string | null;
  status: CharacterStatus;
  notoriety: number;
  traits: string[];
  backstory: string;
  bornYear: number;
  introducedYear: number;
  lastSeenYear: number;
  history: NamedCharacterEvent[];
};

export type WeaponDef = {
  id: string;
  name: string;
  category: "sidearm" | "rifle" | "submachine_gun" | "shotgun" | "machine_gun" | "heavy" | "energy" | "explosive" | "launcher" | "melee" | "special" | "law_enforcement" | "experimental" | "grenade";
  damage: number;
  accuracy: number;
  rateOfFire: number;
  range: number;
  cost: number;
  ammoType: string;
  description: string;
};

export type VehicleWeaponCategory = "cannon" | "machine_gun" | "missile_system" | "rocket" | "energy_weapon" | "experimental_weapon" | "defensive" | "exotic";

export type VehicleWeaponDef = {
  id: string;
  name: string;
  category: VehicleWeaponCategory;
  damage: number;
  range: number;
  cost: number;
  description: string;
};

export type NuclearWeaponCategory = "tactical" | "strategic" | "experimental_nuclear" | "exotic_nuclear" | "delivery_platform" | "advanced_concept" | "classified";

export type NuclearWeaponDef = {
  id: string;
  name: string;
  category: NuclearWeaponCategory;
  yield: number;
  range: number;
  cost: number;
  description: string;
};

export type AmmoDef = {
  id: string;
  name: string;
  category: "standard" | "armor_piercing" | "incendiary" | "explosive" | "energy" | "chemical" | "special" | "missile";
  costPer100: number;
  damage_modifier: number;
  description: string;
};

export type MissileDef = {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  damage: number;
  range: number;
  blastRadius: number;
  cost: number;
  guidance: "unguided" | "heat_seeking" | "laser_guided" | "satellite" | "ai_guided";
  description: string;
};

export type PopulationCohorts = {
  /** Residents without shelter; also used as a health and unrest burden. */
  homeless: number;
  /** Residents arriving through the city's existing refugee intake system. */
  refugees: number;
  /** Residents held by the existing detention buildings. */
  prisoners: number;
  /** Residents needing active care, derived from live disease risk. */
  sick: number;
  /** Residents outside the working-age pool, derived from life expectancy. */
  retirees: number;
  /** Children without a parent/guardian, from the existing mortality model. */
  orphans: number;
  /** Effective workers available after cohort capacity reductions. */
  workforceCapacity: number;
  /** Shelter demand, including the additional needs of refugees and orphans. */
  housingDemand: number;
  /** Medical capacity demand in equivalent residents. */
  healthServiceDemand: number;
  /** Normalized 0..100 civic strain from the cohort mix. */
  unrestPressure: number;
  /** Residents currently counted in the workforce (derived from demographics). */
  workers?: number;
  /** Residents in the unemployment pool (derived from workforce rates). */
  unemployed?: number;
  /** High-income and corporate residents (a deliberately broad derived cohort). */
  elites?: number;
};

export type CohortStewardshipTargetId =
  | "homeless"
  | "refugees"
  | "prisoners"
  | "sick"
  | "workers"
  | "unemployed"
  | "elites";

export type CohortStewardshipHistoryEntry = {
  id: string;
  action: string;
  actionId: string;
  target: CohortStewardshipTargetId;
  approach: "humanitarian" | "technocratic" | "exploitative" | "coercive";
  tick: number;
  date: GameDate;
  effects: {
    cityStats?: Partial<Record<keyof CityStats, number>>;
    demographics?: Partial<Record<keyof Demographics, number>>;
    resources?: Partial<Record<keyof Resources, number>>;
  };
  /** Actual deltas, keyed by faction id, after relationship clamping. */
  factionReactions: Record<string, { loyalty?: number; influence?: number; threat?: number }>;
  /** Alias retained in the audit contract for report consumers. */
  reactions: Record<string, { loyalty?: number; influence?: number; threat?: number }>;
  costs: Partial<Record<keyof Resources, number>>;
  gains: Partial<Record<keyof Resources, number>>;
  cooldownUntilTick: number;
};

export type Demographics = {
  totalPopulation: number;
  populationGrowthRate: number;
  birthRate: number;
  deathRate: number;
  immigrationRate: number;
  emigrationRate: number;
  homelessPopulation: number;
  prisonPopulation: number;
  refugeePopulation: number;
  transientPopulation: number;
  // Lifetime refugees the city has accepted via crisis decisions (mirrors
  // GameState.integratedRefugees). Optional for save compat.
  integratedRefugees?: number;
  totalWorkforce: number;
  employmentRate: number;
  unemploymentRate: number;
  industrialWorkforce: number;
  serviceWorkforce: number;
  governmentWorkforce: number;
  researchWorkforce: number;
  infrastructureWorkforce: number;
  securityWorkforce: number;
  blackMarketWorkforce: number;
  lowIncomePopulation: number;
  middleIncomePopulation: number;
  highIncomePopulation: number;
  corporateCitizens: number;
  independentTraders: number;
  registeredBusinesses: number;
  averageCitizenIncome: number;
  consumerSpendingIndex: number;
  savingsRate: number;
  debtLevel: number;
  crimeParticipationRate: number;
  gangAffiliationRate: number;
  politicalActivismRate: number;
  publicSatisfactionIndex: number;
  unrestPotentialIndex: number;
  fearIndex: number;
  loyaltyIndex: number;
  civicEngagementLevel: number;
  corruptionExposureRate: number;
  mediaInfluenceLevel: number;
  publicHealthIndex: number;
  hospitalCapacityUsage: number;
  diseaseInfectionRate: number;
  nutritionLevel: number;
  sanitationAccessRate: number;
  averageLifeExpectancy: number;
  medicalCoverageRate: number;
  mentalHealthStressIndex: number;
  emergencyResponseCoverage: number;
  populationHappinessIndex: number;
  clonePopulation: number;
  cloneWorkers: number;
  cloneSoldiers: number;
  clonedPets: number;
  clonedLivestock: number;
  clonedOrgansStockpile: number;
  deExtinctSpecies: number;
  geneticModifiedCitizens: number;
  chimeraOrganisms: number;
  blacksiteProjects: number;
  totalDeaths: number;
  literacyRate: number;
  substanceAbuseRate: number;
  orphanPopulation: number;
  displacedByExpansion: number;
  organDonorRegistry: number;
  /** Derived, persisted for inspection and legacy-save compatibility. */
  populationCohorts?: PopulationCohorts;
};

export type HumanConsequenceCause =
  | "natural"
  | "crime"
  | "accident"
  | "weather"
  | "radiation"
  | "disease"
  | "disaster"
  | "attack"
  | "military"
  | "squad_operation"
  | "event";

export type HumanConsequences = {
  civilianWounded: number;
  civilianSick: number;
  civilianMissing: number;
  totalCivilianDeaths: number;
  totalMilitaryDeaths: number;
  totalRecovered: number;
  totalMissingFound: number;
  deathsByCause: Partial<Record<HumanConsequenceCause, number>>;
  woundedByCause: Partial<Record<HumanConsequenceCause, number>>;
  missingByCause: Partial<Record<HumanConsequenceCause, number>>;
  /** Combat population-loss total already transferred into this ledger. */
  lastCombatPopulationLosses: number;
};

export type CrimeStats = {
  /** Compatibility mirror; aggregate custody is the authoritative source. */
  prisonPopulation?: number;
  murder: number;
  manslaughter: number;
  assault: number;
  aggravatedAssault: number;
  robbery: number;
  armedRobbery: number;
  theft: number;
  grandTheft: number;
  burglary: number;
  vehicleTheft: number;
  fraud: number;
  identityFraud: number;
  extortion: number;
  blackmail: number;
  arson: number;
  vandalism: number;
  drugPossession: number;
  drugTrafficking: number;
  weaponsViolation: number;
  cyberCrime: number;
  smuggling: number;
  humanTrafficking: number;
  kidnapping: number;
  organizedCrime: number;
  publicDisorder: number;
  corruption: number;
  illegalAugmentation: number;
  implantTheft: number;
  forcedCyberization: number;
  neuralHijacking: number;
  cyberpsychosis: number;
  augmentSabotage: number;
  blackClinicOperations: number;
  implantCounterfeiting: number;
  cyberwareSmugging: number;
  neuralIdentitySpoofing: number;
  prostheticWeaponization: number;
  dataBreaches: number;
  networkIntrusion: number;
  aiManipulation: number;
  deepfakeFraud: number;
  cryptoTheft: number;
  digitalRansomware: number;
  surveillanceHacking: number;
  informationBrokering: number;
  neuralNetTrespass: number;
  virtualIdentityTheft: number;
  dataMining: number;
  gridTampering: number;
  streetRacing: number;
  gangWarfare: number;
  protectionRacketeering: number;
  stimDealering: number;
  illegalGambling: number;
  streetVendorExtortion: number;
  graffitiBombing: number;
  squatting: number;
  droneFighting: number;
  pedestrianAssault: number;
  transitVandalism: number;
  industrialEspionage: number;
  toxicDumping: number;
  factorySabotage: number;
  laborExploitation: number;
  supplyChainTampering: number;
  patentTheft: number;
  regulatoryFraud: number;
  energyTheft: number;
  automationSabotage: number;
  wasteTrafficking: number;
  resourceHoarding: number;
  organHarvesting: number;
  illegalCloning: number;
  bioweaponDevelopment: number;
  unlicensedGeneMods: number;
  pharmaceuticalCounterfeiting: number;
  clinicalTrialFraud: number;
  medicalDataTrafficking: number;
  plagueHoarding: number;
  syntheticBloodTrafficking: number;
  neurotoxinDistribution: number;
  illegalPsychSurgery: number;
  corporateAssassination: number;
  governmentInfiltration: number;
  massManipulation: number;
  electionRigging: number;
  intelligenceSelling: number;
  megacorpWarfare: number;
  judicialCorruption: number;
  politicalBlackmail: number;
  shadowGovernment: number;
  diplomaticCrimes: number;
  treason: number;
  unregisteredWeaponsSales: number;
  syntheticDrugManufacturing: number;
  alienArtifactTrafficking: number;
  slaveChipTrading: number;
  blackMarketCybernetics: number;
  contrabandeering: number;
  forgeryOperations: number;
  illegalBountyHunting: number;
  pitFighting: number;
  mutantTrafficking: number;
  radioactiveMaterialSmuggling: number;
  totalArrests: number;
  totalConvictions: number;
  totalIncarcerations: number;
  recidivismRate: number;
};

export type TickIntervalMinutes = 1 | 5 | 10 | 15 | 60;

// How the simulation advances. "realtime" is the classic idle mode where the
// tick loop runs on a timer; "turnbased" freezes the clock and only advances
// when the player presses End Turn (one in-game day per turn), pausing on any
// new crisis. Chosen once when starting a new game. Optional so legacy saves
// deserialise without it; sanitizeState/migrateState backfill "realtime".
export type GameplayMode = "realtime" | "turnbased";

export type CheatFlags = {
  yesman: boolean;
  zombie: boolean;
  infiniteMoney: boolean;
  godMode: boolean;
  speedDemon: boolean;
  anarchy: boolean;
  utopia: boolean;
  techUnlockAll: boolean;
  populationBoom: boolean;
  noUpkeep: boolean;
  megaBuilder: boolean;
  invisibleCity: boolean;
  factionPuppets: boolean;
  corruptEveryone: boolean;
  maxDefense: boolean;
  peaceOnEarth: boolean;
  spaceRush: boolean;
  tradeGod: boolean;
  propaganda100: boolean;
  robotOverlord: boolean;
  unlimitedWater: boolean;
  unlimitedFood: boolean;
};

export type GameState = {
  saveSlot: number;
  saveLabel?: string;
  // Honor / Iron Man Mode flag — when true, the player has opted out of
  // manual save and load for this slot. The flag is per-save (not a global
  // setting) so it travels with the save across devices and backups.
  // Older saves load with this undefined; treat as false.
  honorMode?: boolean;
  // Set on load when the save envelope's stored checksum does not match its
  // payload but the payload is still intact JSON — the signature of a save
  // edited outside the game (real corruption breaks decompression/parsing
  // first). The save keeps playing normally, but achievement checks stop
  // awarding for it (see checkAchievements). Deliberately silent: no UI ever
  // surfaces it. Persisted with the save so the mark survives re-saves.
  integrityCompromised?: boolean;
  // Mirror of the active player's offline simulation depth at save time.
  // Stored on the slot (in addition to the player profile) so a Steam
  // cloud restore on another device — where the local profile may not yet
  // exist — can re-apply the same Lite/Standard/Deep choice without the
  // player having to rediscover it from the modal hint. Optional for
  // backwards compatibility; older saves load with this undefined and
  // fall through to the profile/global default.
  offlineSimDepth?: "lite" | "standard" | "deep";
  playTime: number;
  totalTicks: number;
  // Monotonic lifetime gross-income tally for this city. Incremented by every
  // positive credit grant (tax/trade/tourism, mission & contract rewards,
  // sales, event payouts) via recordCreditsEarned. Unlike resources.credits
  // this never falls when the player spends, so career stats and the Steam
  // total-credits-earned stat report true earnings instead of peak balance.
  // Optional for backwards compatibility — legacy saves load without it and
  // sanitizeState backfills 0.
  totalCreditsEarned: number;
  lastTickTime: number;
  missedTicks: number;
  gameStarted: boolean;
  playerTitle: string;
  // Optional for backwards compatibility. New cities record the selected
  // commander origin; legacy saves resolve to the neutral "none" origin.
  commanderOrigin?: import("@/engine/commanderOrigins").CommanderOriginId;
  cityName: string;
  gameDate: GameDate;
  messages: GameMessage[];
  /** Action keys already charged for coercive social/diplomatic backlash. */
  coerciveBacklashLog?: string[];
  // Message IDs explicitly dismissed by the player. This is a bounded
  // tombstone list so a stale completion/retry callback cannot resurrect a
  // deleted mission result after the next tick or a reload.
  dismissedMessageIds?: string[];
  // Player actions that happen between ticks can contribute to the next
  // tick report without making the action UI own simulation bookkeeping.
  pendingTickEntries?: TickEntry[];
  // Per-operation tick deadlines for law-manual field operations. Optional so
  // saves created before field operations were dispatchable remain compatible.
  lawOperationCooldowns?: Record<string, number>;
  // Confirmed underground purchases, retained independently from the transient
  // inbox message and next-tick ledger entry so players can audit them later.
  blackMarketHistory?: BlackMarketAuditEntry[];
  player: PlayerCharacter;
  resources: Resources;
  cityStats: CityStats;
  /** Authoritative physical infrastructure ledger; cityStats.health is a mirror. */
  infrastructureLedger?: InfrastructureLedger;
  rates: Rates;
  // Persistent trade-income modifier accumulated from events that grant
  // `tradeIncome` (e.g. "expand trade routes" +200, "trade embargo" -300).
  // Events grant a per-tick trade income change, but `rates.tradeIncome` is
  // recomputed from scratch every tick, so a bonus written straight into the
  // rate vanishes after a single tick. It lives here instead and is re-added
  // into `rates.tradeIncome` every tick (see formulas.ts) so the change
  // actually persists in the budget. Can be negative. Optional for legacy
  // saves; sanitizeState backfills 0.
  eventTradeIncome?: number;
  buildings: Buildings;
  units: Units;
  policies: Policies;
  procurementPolicies: ProcurementPolicies;
  doctrine: Doctrine;
  cheats: CheatFlags;
  demographics: Demographics;
  /** Persistent resident and service-member harm; optional on legacy saves. */
  humanConsequences?: HumanConsequences;
  officers: Officer[];
  /** Last bulk appointment outcome, retained so the lobby summary survives reload. */
  lastOfficerAutoFillResult?: OfficerAutoFillResult | null;
  namedCharacters?: NamedCharacter[];
  /** Unified custody records for named detainees and future POW/group sources. */
  custody?: import("./custody").CustodyState;
  districts: District[];
  factions: Faction[];
  /** Aggregate institutional telemetry; recomputed by the shared tick pipeline. */
  administrativeInstitutions?: AdministrativeInstitutions;
  externalMegacities: ExternalMegacity[];
  /** Deterministic authored/generated megacity roster for this save. */
  megacityRoster?: import("./settlementRoster").MegacityRosterMetadata;
  /** Versioned bilateral rail projects. Optional only for legacy save compatibility. */
  railCorridors?: RailCorridor[];
  tradeAgreements: TradeAgreement[];
  jointProjects: JointProject[];
  diplomaticPacts: DiplomaticPact[];
  activeOperations: ActiveOperation[];
  companies: CompanyInstance[];
  activeContracts: ContractInstance[];
  completedContracts: ContractInstance[];
  contractCapacity: number;
  unlockedTechnologies: string[];
  activeResearch: ActiveResearch | null;
  researchQueue: string[];
  autoResearch: boolean;
  activePolicies: string[];
  crimeStats: CrimeStats;
  utilities: UtilityState;
  stockpiles: Record<string, number>;
  tourism: TourismState;
  activeEdicts: ActiveEdict[];
  edictCooldowns: Record<string, number>;
  // Per-target cooldowns for the personal interaction verbs (Task #393).
  // Key `${kind}:${targetId}:${actionId}` → the totalTicks value at which the
  // verb becomes usable on that target again. Optional so legacy saves load;
  // treated as {} everywhere it is read.
  personalActionCooldowns?: Record<string, number>;
  // Recent uses of each personal interaction verb, keyed with the same
  // `${kind}:${targetId}:${actionId}` shape as personalActionCooldowns.
  // Timestamps are totalTicks values; the interaction engine prunes entries
  // outside its decay window. Optional so legacy saves load safely.
  personalActionHistory?: Record<string, number[]>;
  // Bounded audit trail for commands aimed at a district. Unlike the generic
  // personal-action fatigue map, this keeps the actual applied stat deltas and
  // date so the district dossier can explain recent regime interventions.
  districtCommandHistory?: DistrictCommandHistoryEntry[];
  /** Bounded audit trail for context-sensitive cohort stewardship actions. */
  cohortStewardshipHistory?: CohortStewardshipHistoryEntry[];
  tickIntervalMinutes: TickIntervalMinutes;
  // Real-time (idle) vs turn-based play. See GameplayMode. Optional for legacy
  // saves; treated as "realtime" everywhere it is read when absent.
  gameplayMode?: GameplayMode;
  tickLog: TickEntry[];
  activeEvents: GameEvent[];
  eventHistory: GameEvent[];
  weather?: string;
  season?: import("@/engine/weather").Season;
  dismissedTutorialTips?: string[];
  // True after the player has finished (or skipped) the first-run onboarding
  // sequence. Optional in the type so legacy saves serialise without this
  // key — the loader treats `undefined` as `true` (veterans skip the
  // tutorial). New games start with `false` via createInitialState.
  hasCompletedOnboarding?: boolean;
  // Tracks the player's position inside the live onboarding walkthrough.
  // null when not currently progressing (either fresh-save before arrival,
  // or already completed). Each non-null value gates an OnboardingBanner
  // on the corresponding game screen (build→construction, edict→law,
  // dispatch→inbox). The (game)/_layout.tsx gate uses this field to route
  // a player back to the correct screen if they reload mid-flow.
  onboardingStep?: "arrival" | "build" | "edict" | "dispatch" | "summary" | null;
  // Per-beat completion flags for the live onboarding walkthrough. Mirror
  // the player's actual in-game action: didBuild (authorised the worker
  // housing stack), didEdict (issued emergency rations), didRead (opened
  // the welcome dispatch). Persisted alongside `onboardingStep` so that
  // if the player saves and quits between completing an action and the
  // OnboardingBanner advancing to the next beat, re-entry still resumes
  // forward instead of asking them to repeat the action. Veterans and
  // completed runs read as `true` via migrateState; fresh saves default
  // to `false` (see initialState.ts).
  didBuild?: boolean;
  didEdict?: boolean;
  didRead?: boolean;
  // Last biosphere crisis-risk tier the player was told about, used to fire a
  // one-time positive nudge the moment their nature-crisis risk improves to a
  // new tier (HIGH -> EASING -> LOW). Derived from the shared
  // getBiosphereCrisisRisk(biosphere).tier ramp so the message and the on-screen
  // NATURE CRISIS RISK gauges always agree. Persisted so the nudge is idempotent
  // across saves/reloads and never repeats for the same tier. Legacy saves
  // backfill this from their current biosphere tier (see saveLoad migrateState)
  // so an already-recovered save does not fire a spurious message on load.
  lastSeenBiosphereCrisisTier?: import("@/engine/wildlandsEcology").BiosphereCrisisRiskTier;
  // Task #367: durable last-seen band rank per tracked high-signal stat, powering
  // the one-time "crossed into a better band" advisories (mirrors the biosphere
  // tier baseline above). Seeded in initialState.ts and backfilled in
  // saveLoad.ts. See engine/statWinBands.ts + tickProcessors.emitStatBandImprovements.
  lastSeenCrimeBandRank?: import("@/engine/statWinBands").StatBandRank;
  lastSeenHappinessBandRank?: import("@/engine/statWinBands").StatBandRank;
  // Task #430: whether the imminent-brownout advisory has already fired for the
  // current low-power episode. Set true when the power ETA first drops into the
  // warn window (see tickProcessors.emitPowerBrownoutWarning) and cleared once the
  // grid recovers to a non-deficit, so the on-screen warning fires once per
  // brownout episode and can re-fire after a recovery. Legacy saves default to
  // undefined (treated as "not warned"), so a struggling grid still warns on load.
  powerBrownoutWarned?: boolean;
  // Task #552: whether the one-time "what is holding the golden-age coverage
  // back" advisor hint has fired. Set true the first time the city clears every
  // core thriving bar while only the biosphere floor or the housing-pressure
  // cap keeps the prosperity stories locked (see
  // tickProcessors.emitProsperityGateHint). Never cleared, so the hint fires at
  // most once per city. Legacy saves default to undefined (treated as "not
  // shown"), so an established blocked city still gets the hint after load.
  prosperityGateHintShown?: boolean;
  // Set once the biosphere/housing terms that blocked golden-age coverage
  // recover and the celebratory ticker item is emitted.
  prosperityGateRecoveryCelebrated?: boolean;
  // Starter-objective marker (new-player objective marker). A durable OPT-IN
  // flag set `true` ONLY by createInitialState for genuinely-new games. The
  // loader (saveLoad migrateState) resolves this with a strict `=== true`, so
  // legacy saves (field absent) and veteran starts (explicit `false`) read as
  // off — veterans and existing saves never see the marker. A future "Guided
  // vs Veteran start" toggle flips this `false` for veteran starts. See
  // engine/objectives.ts for the gating logic.
  starterObjectivesActive?: boolean;
  // `true` once the player dismisses the starter-objective marker. Persisted so
  // the dismissal is permanent for that save.
  starterObjectivesDismissed?: boolean;
  // Coach-tip-on-unlock (new-player per-tab coaching). A durable OPT-IN flag set
  // `true` ONLY by createInitialState for genuinely-new games. The loader
  // (saveLoad migrateState) resolves this with a strict `=== true`, so legacy
  // saves (field absent) and veteran starts (explicit `false`) read as off —
  // veterans and existing saves never see coach tips. The future "Guided vs
  // Veteran start" toggle flips this `false` for veteran starts. The seen-once
  // record itself lives per-device in TutorialContext. See engine/hudCoachTips.ts.
  hudCoachTipsActive?: boolean;
  // Calm-start window length (ticks). Guided/fresh games persist the default
  // CALM_START_TICKS so crises hold back through Day 1; a Veteran start persists
  // a shorter/zero value so random crisis spawners resume immediately. Absent on
  // legacy saves (they have high totalTicks, so calm start is moot anyway) — the
  // calmStart helper falls back to CALM_START_TICKS when undefined. See
  // engine/calmStart.ts.
  calmStartTicks?: number;
  addons?: Record<string, boolean>;
  localEconomy?: import("@/engine/independentEnterprises").LocalEconomyState;
  unlockedAchievements?: string[];
  notableLocations?: NotableLocation[];
  townships?: Township[];
  banking?: BankingState;
  intelligence?: IntelligenceState;
  lawMissions?: LawMission[];
  miningOperations?: MiningOperation[];
  miningEvents?: MiningEvent[];
  scavengeExpeditions?: ScavengeExpedition[];
  scavengingInfrastructure?: string[];
  wildlandsProjects?: WildlandsProject[];
  wildlandsEcology?: Partial<Record<import("./biomes").Biome, BiomeEcology>>;
  tamingQueue?: TamingEntry[];
  // Phase 5 — Megafauna boss-strike unique loot pool. Distinct from regular
  // resources; these are commodities that only drop from successful boss kills.
  wildlandsTrophies?: {
    ivory?: number;
    alphaPheromones?: number;
    exoticPelts?: number;
    geneVaultSamples?: number;
  };
  unitUpgradeTiers?: Record<string, number>;
  captainUpgrades?: Record<string, string[]>;
  followerUpgrades?: Record<string, string[]>;
  discoveredLore?: string[];
  discoveredTerrain?: string[];
  atlasCategoryRewardsClaimed?: string[];
  // True after the one-time capstone reward has fired for charting every
  // atlas category. Persisted so reloading a save never re-grants the
  // capstone XP/title.
  atlasCapstoneClaimed?: boolean;
  combat?: CombatState;
  activeMiningPolicies?: string[];
  activeScavengingPolicies?: string[];
  tickPaused?: boolean;
  immigrationBanned?: boolean;
  bordersClosed?: boolean;
  // Refugee & border-pressure systems: consecutive ticks migration has been
  // restricted (immigration ban OR sealed borders), the temporary
  // refugee-workforce production boost granted by taking people in, and the
  // lifetime count of refugees the city has accepted. All optional for save
  // compat; sanitizer backfills.
  borderClosureTicks?: number;
  refugeeBoostTicksRemaining?: number;
  refugeeBoostMagnitude?: number;
  integratedRefugees?: number;
  strikeHistory?: StrikeRecord[];
  savedLoadouts?: Record<string, Record<string, number>>;
  militaryOverhaul?: import("@/engine/militaryOverhaul").MilitaryOverhaulState;
  politics?: import("@/engine/politicsData").PoliticsState;
  innerCircle?: import("@/engine/innerCircleData").InnerCircleState;
  // Inner-politics intrigue system (Task #379): per-faction radicalization and
  // active coup / terror / assassination plots. Optional for save compat.
  intrigue?: import("@/engine/intrigue").IntrigueState;
  bodyguards?: import("@/engine/bodyguardData").BodyguardState;
  softwareUpgrades?: import("@/engine/softwareUpgrades").SoftwareUpgradeState;
  resourceNodes?: import("@/engine/resourceNodes").ResourceNodeState;
  discoveredLocationIds: string[];
  worldEventLog: { tick: number; event: string; type: string; timestamp: number; title?: string; description?: string; revealed?: string | null }[];
  locationRelations: Record<string, LocationRelation>;
  eventTriggerCooldowns?: Record<string, number>;
  // Durable per-crisis resurfacing counts. Unlike the cooldown timestamp,
  // this survives clearing and tells the player how often a lingering
  // condition has returned.
  eventRecurrenceCounts?: Record<string, number>;
  // Per-faction counts for war-pack events during the current hostile conflict.
  // The outer key is the instigating faction id; inner keys are war event ids.
  // Counts are cleared when that faction falls below the hostile threshold, so
  // a later escalation starts a distinct conflict with fresh occurrence limits.
  // Optional for legacy-save compatibility.
  warEventOccurrences?: Record<string, Record<string, number>>;
  // Task #480: reactive city news. Short ticker-ready facts written by the
  // engine at the moment they happen (edicts enacted/lapsed, notable
  // construction, mega-project completions, resolved events with the chosen
  // orders, season turnover). Ring-buffer capped at NEWS_FEED_CAP; the news
  // ticker mirrors entries once via a seen-id gate. Optional for save compat.
  newsFeed?: import("@/engine/newsFeed").NewsFeedItem[];
  startingRegion?: string;
  playerCityPosition?: { x: number; y: number };
  prestigeResourceMult?: number;
  prestigeResearchMult?: number;
  prestigeBusinessSpawnMult?: number;
  prestigeChainExpansionMult?: number;
  prestigeAntiMonopolyCapDelta?: number;
  megaProjects?: import("@/engine/megaProjects").MegaProjectInstance[];
  // Task #500: buildings under construction. Paid upfront at order time;
  // counts only increment when ticksRemaining hits 0 (see
  // engine/pendingConstruction.ts, processed inside runTick so live,
  // turn-based and offline catch-up all advance identically). Optional for
  // save compat — missing on legacy saves means nothing under construction.
  pendingConstructions?: PendingConstruction[];
  eligibleMegaProjects?: import("@/engine/megaProjects").MegaProjectId[];
  seenEligibleMegaProjects?: import("@/engine/megaProjects").MegaProjectId[];
  activeWarOps?: { opId: string; ticksRemaining: number; startedTick: number }[];
  nuclearStockpile?: { warheads: number; productionRate: number; maintenanceCost: number; deterrenceLevel: number; lastProductionTick: number };
  warOpDefenseBonus?: number;
  activeIllnesses?: { illnessId: string; severity: number; ticksActive: number }[];
  difficulty?: "easy" | "medium" | "hard";
  // City-end condition (see engine/endState.ts). When citizens AND
  // living units both hit 0 with no ascension fallback, the player city
  // is marked "fallen". Late-game tech chains (machine ascension via
  // automaton_civilization, biological perpetuation via
  // perpetual_biogenesis) flip survivalMode so the city survives past
  // zero biological pop. Optional so legacy saves load — the tick
  // processor seeds it on first run.
  endState?: {
    status: "active" | "fallen" | "ascended-machine" | "ascended-bio";
    survivalMode: "biological" | "machine" | "hybrid";
    endedAtTick?: number;
    cause?: string;
    // UI flag — set true once the player has seen and dismissed the
    // end-state modal for this status, so it doesn't re-fire every tick
    // (or after a reload). Cleared automatically by processEndStateCheck
    // whenever the status transitions to a *new* terminal/ascended state.
    acknowledged?: boolean;
  };
  activeMissions?: import("@/engine/officerMissions").ActiveMissionInstance[];
  totalMissionsSucceeded?: number;
  totalMissionsFailed?: number;
  totalMegaProjectsCompleted?: number;
  statHistory?: import("@/engine/statHistory").StatSnapshot[];
  activeEventChains?: import("@/engine/eventChains").ActiveEventChain[];
  eventChainCooldowns?: Record<string, number>;
  autoConstruction?: import("@/engine/autoConstruction").AutoConstructionConfig;
  // Auto-Hire Recruitment (Task #123). Per-domain auto-manager built on
  // top of autoManagers foundations. See engine/autoRecruit.ts.
  autoRecruit?: import("@/engine/autoRecruit").AutoRecruitConfig;
  // Per-domain auto-managers (Task #131). Config (budget/target/priority)
  // for every non-recruit Advisor Briefings domain, persisted alongside
  // autoRecruit. See engine/autoDomainManagers.ts.
  autoDomains?: Partial<Record<import("@/engine/autoDomainManagers").AutoDomain, import("@/engine/autoDomainManagers").AutoDomainConfig>>;
  // Religion Mechanics Foundation (Task #129). Per-district faith shares
  // Faith roster, per-faith player Stance, and opt-in Leader Cult.
  // Religion is a managed civic dimension — no mandates, no auto-manager.
  // See engine/faiths.ts for the data model and tick processor.
  faiths?: import("@/engine/faiths").FaithState;
  // Auto-Manager Foundations (Task #122). Shared infra for downstream
  // per-domain auto-managers — mode toggles, approval queue, snoozes,
  // and the global pause-all-ACT kill switch. See engine/autoManagers.ts.
  autoManagers?: import("@/engine/autoManagers").AutoManagerState;
  newSystems?: import("@/engine/newSystems").NewSystemsState;
  diplomacyCooldowns?: Record<string, number>;
  diplomaticReputation?: number;
  diplomaticHistory?: DiplomaticHistoryEntry[];
  completedDiplomaticActions?: Record<string, string[]>;
  diplomacyAdvanced?: import("@/engine/diplomacyAdvanced").DiplomacyAdvancedState;
  dailyStreak?: DailyStreak;
  weeklyChallenge?: WeeklyChallenge;
  // Lifetime count of weekly challenges the player has cleared. Used by
  // achievements (weekly_first / weekly_ten) and surfaced in stats screens.
  weeklyChallengesCompleted?: number;
  // ── Cosmetic identity (Pack A — Faction customization, optional) ──
  // User-customized faction banner shown on the HUD, summary card, and
  // diplomacy player banner. See engine/playerFaction.ts for shape and
  // helpers (`getPlayerFaction` always returns a complete record).
  playerFaction?: import("./playerFaction").PlayerFactionIdentity;
  // ── Cosmetic loadout (Pack B — Equipment & uniforms, optional) ──
  // Wardrobe + sidearm picks. Strictly visual; no combat math reads
  // these fields. See engine/wardrobe.ts for variants and helpers.
  playerOutfit?: import("./wardrobe").PlayerOutfit;
  officerOutfits?: Record<string, import("./wardrobe").OfficerOutfit>;
  // The APP_VERSION the player most recently dismissed the "what's new" modal
  // for. When the constant changes the modal pops once on next launch.
  lastSeenVersion?: string;
  partnerLedgers?: Record<string, PartnerLedger>;
  intelItems?: IntelItem[];
  pendingPartnerResponses?: PendingPartnerResponse[];
  retinue?: import("@/engine/retinueData").RetinueState;
  /** Staffed security commands; squads remain authoritative in retinue. */
  securityWings?: import("@/engine/securityWings").SecurityWingState;
  inventory?: import("@/engine/inventoryData").InventoryState;
  districtExpansion?: import("@/engine/districtExpansion").DistrictExpansionState;
  companionMissions?: { id: string; missionId: string; guardId: string; guardName: string; startTick: number; endTick: number; completed: boolean }[];
  personalGoals?: import("@/engine/personalGoals").PersonalGoalsState;
  // Round 4 — Vulcan Arms Consortium (munitions company state).
  vulcan?: import("@/engine/munitionsCompany").VulcanState;
  // Ring buffer of recent offline-catchup resumes that took meaningfully
  // longer than predicted. Used to escalate the "took longer than
  // expected" hint after repeated overruns so degrading device perf
  // (thermal throttle, background load, growing save) gets surfaced
  // before it becomes painful. Capped at RESUME_OVERSHOOT_HISTORY_CAP
  // entries; entries older than RESUME_OVERSHOOT_TICK_TTL game-ticks
  // are dropped on next push so old play sessions don't keep escalating
  // forever. Optional for backwards compatibility.
  recentResumeOvershoots?: ResumeOvershootRecord[];
  // Ring buffer of the last few offline-catchup resumes regardless of
  // whether they overshot. Powers the per-resume trend list rendered
  // under OFFLINE SIM DEPTH in Settings so players can spot a slowdown
  // pattern across runs (not just the current resume) and self-tune
  // their depth setting with real data. Capped at
  // RESUME_SAMPLE_HISTORY_CAP entries; entries older than
  // RESUME_OVERSHOOT_TICK_TTL game-ticks are dropped on next push.
  recentResumeSamples?: ResumeSampleRecord[];
};

/** A single offline-catchup overshoot occurrence pinned for escalation. */
export type ResumeOvershootRecord = {
  /** Wall-clock duration the catch-up actually took, in ms. */
  actualMs: number;
  /** Predicted wall-clock duration at the start of the batch, in ms. */
  estimatedMs: number;
  /** GameState.totalTicks at the moment the overshoot was recorded.
   *  Used to age out old entries so the escalation reflects RECENT runs. */
  atTick: number;
};

/** A single offline-catchup resume sample (overshoot or not) for the
 *  per-resume trend list shown under OFFLINE SIM DEPTH in Settings. */
export type ResumeSampleRecord = {
  /** Ticks fully simulated in the batch (not the missed total). */
  ticksProcessed: number;
  /** Predicted wall-clock duration at the start of the batch, in ms. */
  estimatedMs: number;
  /** Wall-clock duration the catch-up actually took, in ms. */
  actualMs: number;
  /** GameState.totalTicks at the moment the sample was recorded. */
  atTick: number;
};

export type DiplomaticHistoryEntry = {
  id: string;
  tick: number;
  factionId: string;
  factionName: string;
  action: string;
  outcome: "accepted" | "rejected" | "counter-proposed";
  counterAction?: string;
  reputationChange: number;
};

export type LocationRelation = {
  disposition: number;
  aidSent: number;
  raidsSent: number;
  tradesMade: number;
  scoutsMade: number;
  lastInteractionTick: number;
  // Tick of the most recent completed TRADE MISSION with this partner. Trade
  // is gated by TRADE_COOLDOWN_TICKS so it can't be spammed for infinite
  // credits; undefined (legacy saves / never traded) reads as "off cooldown".
  lastTradeTick?: number;
};

export type BankLoan = {
  id: string;
  bankId: "megacity-central" | "corpbank";
  principal: number;
  remainingBalance: number;
  interestRate: number;
  monthlyPayment: number;
  ticksRemaining: number;
  ticksTaken: number;
  defaulted: boolean;
};

export type BankAccount = {
  bankId: "megacity-central" | "corpbank";
  balance: number;
  interestRate: number;
  lastInterestTick: number;
};

export type DiplomaticTransfer = {
  id: string;
  targetId: string;
  targetName: string;
  amount: number;
  purpose: "aid" | "trade" | "tribute" | "bribe" | "investment";
  tick: number;
};

export type BankingState = {
  loans: BankLoan[];
  accounts: BankAccount[];
  transfers: DiplomaticTransfer[];
  creditRating: number;
  totalInterestPaid: number;
  totalInterestEarned: number;
};

export type IntelAsset = {
  id: string;
  name: string;
  type: "informant" | "satellite" | "wiretap" | "deepcover" | "cyber";
  targetFaction: string;
  reliability: number;
  discovered: boolean;
  active: boolean;
};

export type IntelOperation = {
  id: string;
  name: string;
  type: "recon" | "sabotage" | "assassination" | "counterintel" | "extraction" | "infiltration";
  targetId: string;
  status: "planning" | "active" | "completed" | "failed" | "aborted";
  successChance: number;
  ticksRemaining: number;
  cost: number;
  outcome?: string;
};

export type IntelligenceState = {
  assets: IntelAsset[];
  operations: IntelOperation[];
  securityLevel: number;
  counterIntelRating: number;
  totalOpsCompleted: number;
  totalOpsFailed: number;
  rumors: string[];
  interceptedComms: string[];
  autoRecon?: boolean;
  autoReconCostPerTick?: number;
};

export type LawMission = {
  id: string;
  name: string;
  description: string;
  type: "patrol" | "raid" | "rescue" | "investigation" | "expedition" | "escort";
  status: "available" | "active" | "completed" | "failed";
  difficulty: number;
  requiredUnits: number;
  assignedUnits: number;
  ticksRemaining: number;
  rewards: { credits?: number; xp?: number; reputation?: number };
  risks: string;
};

export type MiningEvent = {
  id: string;
  operationId: string;
  operationName: string;
  type: string;
  title: string;
  description: string;
  severity: "positive" | "neutral" | "negative" | "critical";
  tick: number;
  resolved: boolean;
};

export type MiningOperation = {
  id: string;
  resourceType: "gas" | "oil" | "iron" | "copper" | "titanium" | "uranium" | "lithium" | "rare-earth";
  name: string;
  output: number;
  workers: number;
  efficiency: number;
  depletionRate: number;
  remainingDeposit: number;
  active: boolean;
  vehicles?: Record<string, number>;
  hiredJobs?: Record<string, number>;
  surveyed?: boolean;
  shutdownUntilTick?: number;
};

export type ScavengeExpedition = {
  id: string;
  name: string;
  zoneName: string;
  type: "scout" | "scavenge" | "excavate" | "reclaim";
  status: "planning" | "active" | "returning" | "completed" | "failed";
  teamSize: number;
  ticksRemaining: number;
  loot: Record<string, number>;
  dangerLevel: number;
  automated: boolean;
};

export type WildlandsProjectKind =
  | "ranger_patrol"
  | "cultivation"
  | "restoration"
  | "cull"
  | "vaccinate"
  | "fence"
  | "beast_hunt"
  | "beast_capture"
  | "megafauna_retaliation";
export type WildlandsProjectStatus = "active" | "completed";

export type MegafaunaId = "tarpit_titan" | "ridge_tyrant" | "glassback_whale";

export type WildlandsProjectMeta = {
  megafaunaId?: MegafaunaId;
  loadoutSnapshot?: Record<string, number>;
  wranglerCount?: number;
  targetSpecies?: string;
  huntOutcome?: "wounded_retreat" | "rout";
  originalDeployed?: number;
};

export type WildlandsProject = {
  id: string;
  kind: WildlandsProjectKind;
  biome: import("./biomes").Biome;
  ticksRemaining: number;
  totalTicks: number;
  status: WildlandsProjectStatus;
  result?: string;
  startedAtTick?: number;
  meta?: WildlandsProjectMeta;
};

export type TamingEntry = {
  id: string;
  beastUnitKey: string;
  beastLabel: string;
  count: number;
  ticksRemaining: number;
  totalTicks: number;
  capturedAtTick: number;
  biome: import("./biomes").Biome;
};

export type BiomeEcology = {
  flora: number;
  herbivore: number;
  predator: number;
  vermin: number;
  megafauna: number;
  scavenger: number;
  lastDelta: {
    flora: number;
    herbivore: number;
    predator: number;
    vermin: number;
    megafauna: number;
    scavenger: number;
  };
  vaccinationTicks?: number;
  fencingTicks?: number;
  megafaunaSightedTick?: number;
  diseaseSuppressedTicks?: number;
  lastEventTick?: number;
  // Set when the player resolves a biosphere crisis in this biome. No new
  // ecology event fires here until totalTicks reaches this value, giving the
  // rebalanced populations time to settle instead of re-triggering a sibling.
  calmUntilTick?: number;
};

export type FactionLeader = {
  name: string;
  title: string;
  attitude: "friendly" | "neutral" | "suspicious" | "hostile" | "fearful";
  goals: string[];
  personalityTraits: string[];
  portraitId?: string;
};

export type NotableLocation = {
  id: string;
  name: string;
  description: string;
  type: "landmark" | "ruin" | "facility" | "zone" | "monument";
  discovered: boolean;
};

export type TownshipVoiceLines = {
  greeting: string;
  tradeAccept: string;
  tradeReject: string;
  threatened: string;
  pleased: string;
  hostile: string;
};

export type Township = {
  id: string;
  name: string;
  description: string;
  population: number;
  loyalty: number;
  threat: number;
  influence: number;
  status: "allied" | "neutral" | "hostile" | "undiscovered";
  factionType: "township" | "group" | "nation";
  leader?: FactionLeader;
  infrastructure?: FactionInfrastructure;
  voiceLines?: TownshipVoiceLines;
  tradeInventory?: Record<string, number>;
  specialization?: string;
  acrossWater?: boolean;
  personality?: PartnerPersonality;
  cityHealth?: number;
  attrition?: number;
  controlStatus?: PartnerControlStatus;
  tributePerTick?: number;
  occupiedSinceTick?: number;
  archetype?: PartnerArchetype;
  personalityArchetype?: PersonalityArchetype;
  currentAction?: string;
  concerns?: string[];
  stance?: PartnerStance;
  // See ExternalMegacity.endState — applies symmetrically to townships.
  endState?: "active" | "fallen";
  endedAtTick?: number;
  endCause?: string;
  // Dominant religion in the township. `undefined`/null = none.
  dominantFaithId?: FaithId | null;
  /** Shared operational sheet; optional on legacy saves and backfilled on load. */
  operational?: SettlementOperationalData;
  /** Authoritative map metadata used by infrastructure systems; never infer from prose. */
  railLocation?: RailLocation;
};

export type ActiveEngagement = {
  id: string;
  templateId: string;
  name: string;
  type: "skirmish" | "raid" | "assault" | "siege" | "ambush" | "defense" | "counterattack" | "patrol_clash" | "aerial_strike" | "cyber_attack";
  status: "preparing" | "active" | "resolved";
  unitsCommitted: number;
  enemyStrength: number;
  enemyMorale: number;
  terrainMod: number;
  ticksRemaining: number;
  zoneId: string;
  doctrineId: string;
  tactical?: {
    formation: "line" | "column" | "wedge" | "phalanx" | "dispersed" | "reserve_echelon";
    ordnance: "standard" | "heavy_artillery" | "air_support" | "orbital_strike" | "incendiary" | "emp_burst";
    reserveCommitment: number;
    officerAssigned: string | null;
  };
  result?: {
    victory: boolean;
    playerCasualties: number;
    enemyCasualties: number;
    moraleShift: number;
    dominance: number;
    creditsGained: number;
    xpGained: number;
    populationLoss: number;
    factionImpact?: { factionSource: string; change: number };
    resolvedTick?: number;
  };
  // Task #229: faction-flavored composition for non-raid engagements so
  // the resolution path can compute per-archetype kills and feed them
  // into combat.enemiesDefeatedByArchetype (mirrors the raid path which
  // already attaches composition + factionSource at spawn). Optional so
  // old saves and any future engagement spawn paths that skip it still
  // load — strength-based combat resolves the engagement identically
  // either way.
  composition?: Record<string, number>;
  factionSource?: string;
};

export type BattleLogEntry = {
  id: string;
  tick: number;
  engagementName: string;
  victory: boolean;
  playerCasualties: number;
  enemyCasualties: number;
  dominance: number;
  zoneId: string;
  doctrineUsed: string;
  creditsLooted: number;
  ammoLooted: number;
  timestamp: GameDate;
  // Task #223: carry the raid's faction-flavored composition and the
  // faction tag through to the after-action / siege debrief so the
  // player can see *who* attacked (and how many of each archetype were
  // taken down) — not just an opaque enemyCasualties number. Optional
  // so non-raid engagements and old saves still render.
  composition?: Record<string, number>;
  factionSource?: string;
  enemyLosses?: Record<string, number>;
};

export type CombatZone = {
  id: string;
  name: string;
  description: string;
  status: "friendly" | "contested" | "hostile" | "neutral" | "devastated";
  controlLevel: number;
  threat: number;
  garrison: number;
  maxGarrison: number;
  resourceBonus: { credits?: number; steel?: number; fuel?: number; ammo?: number };
  adjacentZones: string[];
  controllingFaction: string;
};

export type HostileRaidEvent = {
  id: string;
  templateId: string;
  name: string;
  description: string;
  enemyStrength: number;
  enemyMorale: number;
  terrainMod: number;
  targetZoneId: string;
  factionSource: string;
  populationDamage: number;
  ticksRemaining: number;
  status: "incoming" | "active" | "repelled" | "breached";
  // Task #222: faction-flavored unit composition attached at spawn so the
  // raid card / siege report can display "Hostiles spotted: 6× Rust-Pack
  // Bikers, 2× Slag-Cannon Crew" instead of the opaque enemyStrength
  // number. Optional so old saves and any future raid spawn paths that
  // skip composition still load — strength-based combat resolves the
  // raid identically either way.
  composition?: Record<string, number>;
};

export type CombatState = {
  activeEngagements: ActiveEngagement[];
  battleLog: BattleLogEntry[];
  zones: CombatZone[];
  activeDoctrine: string;
  totalBattlesFought: number;
  totalVictories: number;
  totalDefeats: number;
  totalCasualties: number;
  totalEnemyKills: number;
  warMorale: number;
  raidEventQueue: HostileRaidEvent[];
  totalPopulationLosses: number;
  // Task #226: lifetime tally of enemies put down, broken down by the
  // faction signature archetype id (e.g. "rust_pack_bikers"). Updated
  // whenever a hostile raid resolves with computed per-archetype
  // enemyLosses. Optional on read so old saves hydrate cleanly; the
  // sanitizer fills in an empty object when missing.
  enemiesDefeatedByArchetype?: Record<string, number>;
  // Task #239: persist the player's last-picked faction chip for the
  // "Hostiles Defeated" tally and the "Battle Log" sections on the
  // Defense tab so the filter rides along with the save instead of
  // resetting to "all" every time the screen mounts. Optional: missing
  // / unknown values fall back to "all" via the sanitizer.
  killFactionFilter?: string;
  logFactionFilter?: string;
};
