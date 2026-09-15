export type ItemCategory = "weapon" | "armor" | "gear" | "consumable" | "relic" | "augment";
export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type EquipSlot = "weapon" | "armor" | "accessory" | "augment";

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  rarity: ItemRarity;
  icon: string;
  equipSlot?: EquipSlot;
  effects: Partial<{
    combat: number;
    defense: number;
    morale: number;
    leadership: number;
    tactics: number;
    xpBonus: number;
    upkeepReduction: number;
    healingBonus: number;
    recon: number;
    credits: number;
    defenseRating: number;
    corruption: number;
    unrest: number;
  }>;
  value: number;
  stackable: boolean;
  maxStack: number;
  requiredTech?: string;
}

export interface InventoryItem {
  id: string;
  defId: string;
  quantity: number;
  equippedTo: string | null;
}

export interface InventoryState {
  items: InventoryItem[];
  maxSlots: number;
  totalItemsFound: number;
  totalItemsSold: number;
}

export const RARITY_COLORS: Record<ItemRarity, string> = {
  common: "#AAAAAA",
  uncommon: "#4CAF50",
  rare: "#2196F3",
  epic: "#9C27B0",
  legendary: "#FF9800",
};

export const RARITY_LABELS: Record<ItemRarity, string> = {
  common: "COMMON",
  uncommon: "UNCOMMON",
  rare: "RARE",
  epic: "EPIC",
  legendary: "LEGENDARY",
};

export const ITEM_DEFS: ItemDef[] = [
  {
    id: "combat_knife", name: "Combat Knife", description: "Standard-issue close quarters blade.",
    category: "weapon", rarity: "common", icon: "knife-military", equipSlot: "weapon",
    effects: { combat: 2 }, value: 50, stackable: false, maxStack: 1,
  },
  {
    id: "assault_rifle_mk2", name: "Assault Rifle Mk.II", description: "Reliable mid-range firearm. Sector Marshal standard issue.",
    category: "weapon", rarity: "common", icon: "pistol", equipSlot: "weapon",
    effects: { combat: 5 }, value: 200, stackable: false, maxStack: 1,
  },
  {
    id: "plasma_carbine", name: "Plasma Carbine", description: "Experimental energy weapon. Sears through armor plating.",
    category: "weapon", rarity: "rare", icon: "flash", equipSlot: "weapon",
    effects: { combat: 12, morale: 5 }, value: 1500, stackable: false, maxStack: 1, requiredTech: "plasma_weaponry",
  },
  {
    id: "thunderhammer", name: "Thunderhammer", description: "Seismic-pulse melee weapon. Devastating at close range.",
    category: "weapon", rarity: "legendary", icon: "hammer", equipSlot: "weapon",
    effects: { combat: 20, morale: 10, defense: -3 }, value: 5000, stackable: false, maxStack: 1,
  },
  {
    id: "flak_vest", name: "Flak Vest", description: "Lightweight ballistic protection.",
    category: "armor", rarity: "common", icon: "tshirt-crew", equipSlot: "armor",
    effects: { defense: 3 }, value: 120, stackable: false, maxStack: 1,
  },
  {
    id: "riot_armor", name: "Riot Armor", description: "Heavy-duty crowd control suit with ceramic inserts.",
    category: "armor", rarity: "uncommon", icon: "shield-half-full", equipSlot: "armor",
    effects: { defense: 8, combat: -1 }, value: 500, stackable: false, maxStack: 1,
  },
  {
    id: "nano_weave_suit", name: "Nano-Weave Suit", description: "Self-repairing armor mesh. Top-tier protection.",
    category: "armor", rarity: "rare", icon: "shield-star", equipSlot: "armor",
    effects: { defense: 14, morale: 3 }, value: 2500, stackable: false, maxStack: 1, requiredTech: "nanotech_materials",
  },
  {
    id: "juggernaut_exo", name: "Juggernaut Exo-Frame", description: "Powered exoskeleton. Nearly impervious to small arms.",
    category: "armor", rarity: "legendary", icon: "robot-industrial", equipSlot: "armor",
    effects: { defense: 25, combat: 8, morale: 5 }, value: 8000, stackable: false, maxStack: 1, requiredTech: "exoskeleton_tech",
  },
  {
    id: "tactical_visor", name: "Tactical Visor", description: "Enhanced targeting HUD. Improves squad accuracy.",
    category: "gear", rarity: "uncommon", icon: "glasses", equipSlot: "accessory",
    effects: { combat: 3, recon: 5 }, value: 350, stackable: false, maxStack: 1,
  },
  {
    id: "command_baton", name: "Command Baton", description: "Symbol of authority. Boosts leadership effectiveness.",
    category: "gear", rarity: "uncommon", icon: "star-four-points", equipSlot: "accessory",
    effects: { leadership: 5, morale: 5 }, value: 400, stackable: false, maxStack: 1,
  },
  {
    id: "neural_link", name: "Neural Link Implant", description: "Direct neural interface. Amplifies tactical cognition.",
    category: "augment", rarity: "rare", icon: "brain", equipSlot: "augment",
    effects: { tactics: 8, xpBonus: 0.15, leadership: 3 }, value: 3000, stackable: false, maxStack: 1, requiredTech: "basic_cybernetics",
  },
  {
    id: "berserker_stim", name: "Berserker Stimulant", description: "Combat enhancement drug. Temporary rage boost.",
    category: "consumable", rarity: "common", icon: "needle",
    effects: { combat: 15 }, value: 80, stackable: true, maxStack: 10,
  },
  {
    id: "med_kit_advanced", name: "Advanced Med-Kit", description: "Military-grade first aid. Heals injuries faster.",
    category: "consumable", rarity: "uncommon", icon: "medical-bag",
    effects: { healingBonus: 30 }, value: 150, stackable: true, maxStack: 10,
  },
  {
    id: "recon_drone", name: "Recon Drone Pack", description: "Disposable surveillance drones. Intel on the go.",
    category: "consumable", rarity: "uncommon", icon: "quadcopter",
    effects: { recon: 20 }, value: 200, stackable: true, maxStack: 5,
  },
  {
    id: "old_world_badge", name: "Old World Marshal Badge", description: "Pre-collapse law enforcement insignia. Respected by all factions.",
    category: "relic", rarity: "rare", icon: "police-badge", equipSlot: "accessory",
    effects: { leadership: 8, morale: 10, corruption: -3 }, value: 2000, stackable: false, maxStack: 1,
  },
  {
    id: "sector_founders_ring", name: "Sector Founder's Ring", description: "Legendary artifact. Said to grant authority over any district.",
    category: "relic", rarity: "legendary", icon: "ring", equipSlot: "accessory",
    effects: { leadership: 15, morale: 15, credits: 50, defenseRating: 5 }, value: 10000, stackable: false, maxStack: 1,
  },
  {
    id: "corpo_dataslate", name: "Corpo Dataslate", description: "Contains encrypted megacorp intelligence. Valuable to the right buyer.",
    category: "relic", rarity: "uncommon", icon: "tablet", equipSlot: "accessory",
    effects: { credits: 25, recon: 3 }, value: 800, stackable: false, maxStack: 1,
  },
  {
    id: "synth_adrenaline_injector", name: "Synth-Adrenaline Injector", description: "Cybernetic implant that floods the body with synthetic adrenaline.",
    category: "augment", rarity: "uncommon", icon: "lightning-bolt", equipSlot: "augment",
    effects: { combat: 6, morale: 3 }, value: 600, stackable: false, maxStack: 1,
  },
  {
    id: "cortical_stack", name: "Cortical Stack", description: "Consciousness backup device. Reduces permanent losses.",
    category: "augment", rarity: "legendary", icon: "chip", equipSlot: "augment",
    effects: { xpBonus: 0.25, tactics: 5, leadership: 5 }, value: 7500, stackable: false, maxStack: 1, requiredTech: "consciousness_transfer",
  },
  {
    id: "scrap_armor_plate", name: "Scrap Armor Plate", description: "Crude but functional protection cobbled from wreckage.",
    category: "armor", rarity: "common", icon: "shield-outline", equipSlot: "armor",
    effects: { defense: 2 }, value: 30, stackable: false, maxStack: 1,
  },

  {
    id: "shock_baton", name: "Shock Baton", description: "Electrified crowd-control weapon. Non-lethal but painful.",
    category: "weapon", rarity: "common", icon: "flash", equipSlot: "weapon",
    effects: { combat: 4, morale: 2 }, value: 120, stackable: false, maxStack: 1,
  },
  {
    id: "scatter_carbine", name: "Scatter Carbine", description: "Short-range flechette weapon. Devastating in corridors.",
    category: "weapon", rarity: "uncommon", icon: "pistol", equipSlot: "weapon",
    effects: { combat: 8, defense: -1 }, value: 400, stackable: false, maxStack: 1,
  },
  {
    id: "railgun_pistol", name: "Railgun Pistol", description: "Magnetically accelerated rounds punch through armor plating.",
    category: "weapon", rarity: "rare", icon: "pistol", equipSlot: "weapon",
    effects: { combat: 14, morale: 3 }, value: 2000, stackable: false, maxStack: 1, requiredTech: "electromagnetic_weaponry",
  },
  {
    id: "executioner_blade", name: "Executioner's Blade", description: "Ceremonial yet deadly. Symbol of absolute justice.",
    category: "weapon", rarity: "legendary", icon: "sword", equipSlot: "weapon",
    effects: { combat: 18, morale: 15, leadership: 5 }, value: 6000, stackable: false, maxStack: 1,
  },
  {
    id: "demo_charges", name: "Demo Charges", description: "Military-grade breaching explosives.",
    category: "weapon", rarity: "uncommon", icon: "bomb", equipSlot: "weapon",
    effects: { combat: 10 }, value: 350, stackable: false, maxStack: 1,
  },
  {
    id: "sniper_scope", name: "Long-Range Scope", description: "Precision optics for marksman operations.",
    category: "gear", rarity: "uncommon", icon: "crosshairs-gps", equipSlot: "accessory",
    effects: { combat: 4, recon: 8 }, value: 500, stackable: false, maxStack: 1,
  },
  {
    id: "field_medkit", name: "Field Surgery Kit", description: "Complete surgical tools for field operations.",
    category: "consumable", rarity: "uncommon", icon: "needle",
    effects: { healingBonus: 40 }, value: 250, stackable: true, maxStack: 5,
  },
  {
    id: "combat_stims", name: "Combat Stimulants", description: "Military-grade performance enhancers. Temporary boost.",
    category: "consumable", rarity: "common", icon: "needle",
    effects: { combat: 10, morale: 5 }, value: 60, stackable: true, maxStack: 10,
  },
  {
    id: "ablative_plating", name: "Ablative Plating", description: "Layered ceramic armor. Absorbs impacts then shatters.",
    category: "armor", rarity: "uncommon", icon: "shield-half-full", equipSlot: "armor",
    effects: { defense: 10, combat: -2 }, value: 700, stackable: false, maxStack: 1,
  },
  {
    id: "stealth_suit", name: "Stealth Suit", description: "Light-bending fabric. Nearly invisible in shadow.",
    category: "armor", rarity: "rare", icon: "tshirt-crew", equipSlot: "armor",
    effects: { defense: 6, recon: 12, combat: 2 }, value: 2200, stackable: false, maxStack: 1, requiredTech: "stealth_tech",
  },
  {
    id: "titan_plate", name: "Titan Plate", description: "Depleted uranium composite. Heaviest infantry armor ever made.",
    category: "armor", rarity: "legendary", icon: "shield-star", equipSlot: "armor",
    effects: { defense: 30, combat: 5, morale: 8 }, value: 9000, stackable: false, maxStack: 1, requiredTech: "advanced_metallurgy",
  },
  {
    id: "holo_projector", name: "Holo-Projector", description: "Creates tactical holograms. Confuses and distracts.",
    category: "gear", rarity: "rare", icon: "projector", equipSlot: "accessory",
    effects: { recon: 10, tactics: 5, defense: 3 }, value: 1800, stackable: false, maxStack: 1,
  },
  {
    id: "grav_boots", name: "Grav-Boots", description: "Magnetic levitation boots. Increased mobility.",
    category: "gear", rarity: "rare", icon: "shoe-print", equipSlot: "accessory",
    effects: { combat: 3, recon: 6, defense: 2 }, value: 1500, stackable: false, maxStack: 1,
  },
  {
    id: "signal_jammer", name: "Signal Jammer", description: "Disrupts enemy communications within a wide radius.",
    category: "gear", rarity: "uncommon", icon: "antenna", equipSlot: "accessory",
    effects: { tactics: 4, recon: 6 }, value: 600, stackable: false, maxStack: 1,
  },
  {
    id: "wardens_cloak", name: "Warden's Cloak", description: "Armored greatcoat of the old wardens. Intimidating.",
    category: "armor", rarity: "rare", icon: "tshirt-crew", equipSlot: "armor",
    effects: { defense: 12, leadership: 5, morale: 8 }, value: 2800, stackable: false, maxStack: 1,
  },
  {
    id: "emp_grenade", name: "EMP Grenade Pack", description: "Electromagnetic pulse grenades. Disable electronics.",
    category: "consumable", rarity: "rare", icon: "flash-circle",
    effects: { combat: 20, tactics: 5 }, value: 400, stackable: true, maxStack: 5,
  },
  {
    id: "auto_turret", name: "Portable Auto-Turret", description: "Deployable automated defense turret.",
    category: "gear", rarity: "rare", icon: "robot-industrial", equipSlot: "accessory",
    effects: { defenseRating: 8, combat: 6 }, value: 2000, stackable: false, maxStack: 1, requiredTech: "automated_defenses",
  },
  {
    id: "commanders_signet", name: "Commander's Signet", description: "Ancient ring of authority. Grants legitimacy.",
    category: "relic", rarity: "rare", icon: "ring", equipSlot: "accessory",
    effects: { leadership: 10, morale: 8, corruption: -2 }, value: 3000, stackable: false, maxStack: 1,
  },
  {
    id: "pre_war_data_core", name: "Pre-War Data Core", description: "Intact database from before the collapse. Priceless intelligence.",
    category: "relic", rarity: "legendary", icon: "database", equipSlot: "accessory",
    effects: { tactics: 10, recon: 10, xpBonus: 0.20, credits: 30 }, value: 12000, stackable: false, maxStack: 1,
  },
  {
    id: "wasteland_trophy", name: "Wasteland Trophy", description: "A grim trophy taken from a defeated wasteland warlord.",
    category: "relic", rarity: "uncommon", icon: "trophy", equipSlot: "accessory",
    effects: { combat: 5, morale: 8 }, value: 500, stackable: false, maxStack: 1,
  },
  {
    id: "reflex_enhancer", name: "Reflex Enhancer", description: "Spinal implant that accelerates neural response time.",
    category: "augment", rarity: "rare", icon: "lightning-bolt", equipSlot: "augment",
    effects: { combat: 8, tactics: 4, recon: 3 }, value: 2500, stackable: false, maxStack: 1, requiredTech: "basic_cybernetics",
  },
  {
    id: "dermal_weave", name: "Dermal Weave", description: "Subdermal armor mesh woven into the skin.",
    category: "augment", rarity: "uncommon", icon: "shield-account", equipSlot: "augment",
    effects: { defense: 10, combat: 2 }, value: 1200, stackable: false, maxStack: 1, requiredTech: "basic_cybernetics",
  },
  {
    id: "targeting_optics", name: "Targeting Optics", description: "Ocular implant with ballistic calculator and threat highlighting.",
    category: "augment", rarity: "rare", icon: "eye-plus", equipSlot: "augment",
    effects: { combat: 10, recon: 8, tactics: 3 }, value: 3200, stackable: false, maxStack: 1, requiredTech: "advanced_cybernetics",
  },
  {
    id: "adrenaline_regulator", name: "Adrenaline Regulator", description: "Controls fight-or-flight response. Steady under fire.",
    category: "augment", rarity: "uncommon", icon: "heart-pulse", equipSlot: "augment",
    effects: { morale: 10, combat: 4, defense: 2 }, value: 900, stackable: false, maxStack: 1, requiredTech: "basic_cybernetics",
  },
  {
    id: "nano_repair_paste", name: "Nano-Repair Paste", description: "Self-applying nanobots that seal wounds instantly.",
    category: "consumable", rarity: "rare", icon: "flask",
    effects: { healingBonus: 60, defense: 5 }, value: 500, stackable: true, maxStack: 5, requiredTech: "nanotech_materials",
  },
  {
    id: "scrap_blade", name: "Scrap Blade", description: "Sharpened junk metal. Better than bare hands.",
    category: "weapon", rarity: "common", icon: "knife-military", equipSlot: "weapon",
    effects: { combat: 1 }, value: 15, stackable: false, maxStack: 1,
  },
  {
    id: "salvaged_pistol", name: "Salvaged Pistol", description: "Rebuilt handgun. Unreliable but functional.",
    category: "weapon", rarity: "common", icon: "pistol", equipSlot: "weapon",
    effects: { combat: 3 }, value: 80, stackable: false, maxStack: 1,
  },
  {
    id: "heavy_machine_gun", name: "Heavy Machine Gun", description: "Belt-fed suppressive weapon. Area denial.",
    category: "weapon", rarity: "rare", icon: "pistol", equipSlot: "weapon",
    effects: { combat: 16, defense: -2, morale: 4 }, value: 2500, stackable: false, maxStack: 1,
  },
  {
    id: "bandolier", name: "Ammo Bandolier", description: "Extra ammunition storage. Never run dry.",
    category: "gear", rarity: "common", icon: "ammunition", equipSlot: "accessory",
    effects: { combat: 2, upkeepReduction: 0.05 }, value: 100, stackable: false, maxStack: 1,
  },
  {
    id: "cracked_holotape", name: "Cracked Holotape", description: "Battered family-vid cassette. Half overwritten by static. A child laughs at someone you'll never meet.",
    category: "relic", rarity: "common", icon: "cassette", equipSlot: "accessory",
    effects: { morale: 3 }, value: 80, stackable: false, maxStack: 1,
  },
  {
    id: "prewar_currency_bundle", name: "Pre-War Currency Bundle", description: "Banded stack of pre-collapse paper notes. Worthless as money. Collectors still pay.",
    category: "relic", rarity: "common", icon: "cash-multiple", equipSlot: "accessory",
    effects: { credits: 5 }, value: 200, stackable: false, maxStack: 1,
  },
  {
    id: "corporate_id_lanyard", name: "Corporate ID Lanyard", description: "Laminated employee badge. Megacorp logo bleached out. Photo blacked by sun-rot. Name still legible.",
    category: "relic", rarity: "common", icon: "card-account-details", equipSlot: "accessory",
    effects: { leadership: 2 }, value: 60, stackable: false, maxStack: 1,
  },
  {
    id: "municipal_seal_plaque", name: "Municipal Seal Plaque", description: "Cast bronze plaque pried off an old sector hall. CIVITAS PRIMA, EST. — date illegible.",
    category: "relic", rarity: "uncommon", icon: "seal", equipSlot: "accessory",
    effects: { leadership: 5, morale: 3 }, value: 600, stackable: false, maxStack: 1,
  },
  {
    id: "astronauts_patch", name: "Astronaut's Patch", description: "Embroidered shoulder patch from the old orbital service. Stars no one launches anymore.",
    category: "relic", rarity: "uncommon", icon: "rocket-launch", equipSlot: "accessory",
    effects: { morale: 6, recon: 2 }, value: 450, stackable: false, maxStack: 1,
  },
  {
    id: "prewar_research_journal", name: "Pre-War Research Journal", description: "Hand-written field notes. Diagrams of weapons we can't replicate. Half the pages stuck shut.",
    category: "relic", rarity: "uncommon", icon: "notebook", equipSlot: "accessory",
    effects: { xpBonus: 0.05, tactics: 3 }, value: 800, stackable: false, maxStack: 1,
  },
  {
    id: "intact_globe_model", name: "Intact Globe Model", description: "Desk globe. Borders, oceans, cities — none of which exist now. Useful as a reference. Sobering as a lesson.",
    category: "relic", rarity: "uncommon", icon: "earth", equipSlot: "accessory",
    effects: { leadership: 4, recon: 3 }, value: 700, stackable: false, maxStack: 1,
  },
  {
    id: "vintage_service_pistol", name: "Vintage Service Pistol", description: "Pre-collapse marshal's sidearm. Operable. Someone kept it oiled for forty years before they died beside it.",
    category: "relic", rarity: "rare", icon: "pistol", equipSlot: "accessory",
    effects: { combat: 4, leadership: 4, morale: 4 }, value: 1800, stackable: false, maxStack: 1,
  },
  {
    id: "vault_master_key", name: "Vault Master Key", description: "Hex-cut municipal master key. Opens any pre-war sector vault. Most are already empty.",
    category: "relic", rarity: "rare", icon: "key-variant", equipSlot: "accessory",
    effects: { credits: 30, recon: 5 }, value: 2200, stackable: false, maxStack: 1,
  },
  {
    id: "mc_steam_data_disk", name: "Data Disk: MEGACITY", description: "Pre-war entertainment disk in a cracked sleeve. Title: MEGACITY — SECTOR MARSHAL. Boots to a strategy sim of THIS sector. Uncanny. Distributor stamp on the case: STEAM. Network address etched in marker: store.steampowered.com",
    category: "relic", rarity: "rare", icon: "disc", equipSlot: "accessory",
    effects: { xpBonus: 0.10, morale: 5, tactics: 3 }, value: 1500, stackable: false, maxStack: 1,
  },
  {
    id: "warsim_data_disk", name: "Data Disk: WARSIM", description: "Hand-burned data disk. Title: WARSIM — THE REALMS OF ASLONA. A turn-based kingdom sim. Different world, same problems. Same distributor stamp: STEAM. Address scratched on the foil: store.steampowered.com/app/659540",
    category: "relic", rarity: "rare", icon: "disc", equipSlot: "accessory",
    effects: { xpBonus: 0.10, leadership: 3, tactics: 3 }, value: 1500, stackable: false, maxStack: 1,
  },
  {
    id: "archive_key_terminal", name: "Archive Key Terminal", description: "Sealed pre-war reference computer. Battery still holds a charge. Two centuries of laws, blueprints, weather records, treaties. The collapse, fully indexed.",
    category: "relic", rarity: "legendary", icon: "console", equipSlot: "accessory",
    effects: { tactics: 10, recon: 8, xpBonus: 0.15, credits: 25, leadership: 5 }, value: 14000, stackable: false, maxStack: 1,
  },
  {
    id: "prowler_carbine", name: "Prowler Carbine", description: "Suppressed precision rifle, bullpup configuration. Marksman's preferred sidearm when the work is supposed to look natural.",
    category: "weapon", rarity: "epic", icon: "pistol", equipSlot: "weapon",
    effects: { combat: 16, recon: 4, morale: 3 }, value: 4000, stackable: false, maxStack: 1,
  },
  {
    id: "adaptive_carapace", name: "Adaptive Carapace", description: "Reactive armour plating that hardens under impact. Soft when you move, brutal when something hits you.",
    category: "armor", rarity: "epic", icon: "shield-half-full", equipSlot: "armor",
    effects: { defense: 19, combat: 4, morale: 5 }, value: 4500, stackable: false, maxStack: 1,
  },
  {
    id: "command_uplink", name: "Command Uplink", description: "Hardened tactical comms harness. Pulls real-time feeds from every squad in the operating area and routes orders without a relay.",
    category: "gear", rarity: "epic", icon: "satellite-uplink", equipSlot: "accessory",
    effects: { leadership: 8, tactics: 6, morale: 4 }, value: 4200, stackable: false, maxStack: 1,
  },
  {
    id: "synaptic_processor", name: "Synaptic Processor", description: "Co-processor wired into the prefrontal cortex. Decisions arrive before the conscious mind catches up. Side effects include occasional uncertainty about who is actually thinking.",
    category: "augment", rarity: "epic", icon: "memory", equipSlot: "augment",
    effects: { tactics: 6, recon: 4, xpBonus: 0.10, leadership: 3 }, value: 4800, stackable: false, maxStack: 1, requiredTech: "basic_cybernetics",
  },
  {
    id: "judiciar_seal", name: "Judiciar's Seal", description: "Authority sigil pressed in tungsten and carbonised bone. Sector courts still recognise it. So do most warlords. Worn by those who issue final verdicts.",
    category: "relic", rarity: "epic", icon: "stamper", equipSlot: "accessory",
    effects: { leadership: 10, morale: 8, defenseRating: 3 }, value: 5000, stackable: false, maxStack: 1,
  },
];

export function getItemDef(defId: string): ItemDef | undefined {
  return ITEM_DEFS.find((d) => d.id === defId);
}

export function createDefaultInventoryState(): InventoryState {
  return {
    items: [],
    maxSlots: 30,
    totalItemsFound: 0,
    totalItemsSold: 0,
  };
}

export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  ingredients: { defId: string; quantity: number }[];
  resourceCost: Partial<{ credits: number; steel: number; fuel: number; goods: number }>;
  resultDefId: string;
  ticksRequired: number;
  requiredTech?: string;
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: "craft_riot_armor", name: "Forge Riot Armor", description: "Combine scrap plates into proper riot armor.",
    ingredients: [{ defId: "scrap_armor_plate", quantity: 3 }],
    resourceCost: { credits: 300, steel: 10 },
    resultDefId: "riot_armor", ticksRequired: 4,
  },
  {
    id: "craft_assault_rifle", name: "Assemble Assault Rifle", description: "Build an Mk.II rifle from salvaged parts.",
    ingredients: [{ defId: "salvaged_pistol", quantity: 2 }],
    resourceCost: { credits: 250, steel: 5 },
    resultDefId: "assault_rifle_mk2", ticksRequired: 3,
  },
  {
    id: "craft_scatter_carbine", name: "Modify Scatter Carbine", description: "Convert a rifle into a flechette weapon.",
    ingredients: [{ defId: "assault_rifle_mk2", quantity: 1 }],
    resourceCost: { credits: 400, steel: 8 },
    resultDefId: "scatter_carbine", ticksRequired: 5,
  },
  {
    id: "craft_ablative_plating", name: "Laminate Ablative Plating", description: "Layer ceramic tiles over a standard vest.",
    ingredients: [{ defId: "flak_vest", quantity: 1 }, { defId: "scrap_armor_plate", quantity: 2 }],
    resourceCost: { credits: 500, steel: 15 },
    resultDefId: "ablative_plating", ticksRequired: 6,
  },
  {
    id: "craft_tactical_visor", name: "Build Tactical Visor", description: "Construct an enhanced HUD from salvaged parts.",
    ingredients: [{ defId: "recon_drone", quantity: 1 }],
    resourceCost: { credits: 350, goods: 5 },
    resultDefId: "tactical_visor", ticksRequired: 4,
  },
  {
    id: "craft_command_baton", name: "Forge Command Baton", description: "Craft a symbol of authority from reclaimed materials.",
    ingredients: [{ defId: "old_world_badge", quantity: 1 }],
    resourceCost: { credits: 600, steel: 5, goods: 3 },
    resultDefId: "command_baton", ticksRequired: 5,
  },
  {
    id: "craft_demo_charges", name: "Assemble Demo Charges", description: "Combine explosives into breaching charges.",
    ingredients: [{ defId: "combat_stims", quantity: 2 }],
    resourceCost: { credits: 300, fuel: 10 },
    resultDefId: "demo_charges", ticksRequired: 3,
  },
  {
    id: "craft_nano_weave", name: "Weave Nano-Armor", description: "Construct self-repairing armor from nanomaterials.",
    ingredients: [{ defId: "ablative_plating", quantity: 1 }, { defId: "nano_repair_paste", quantity: 2 }],
    resourceCost: { credits: 2000, steel: 20, goods: 10 },
    resultDefId: "nano_weave_suit", ticksRequired: 10, requiredTech: "nanotech_materials",
  },
  {
    id: "craft_signal_jammer", name: "Build Signal Jammer", description: "Construct a comm-disruption device.",
    ingredients: [{ defId: "recon_drone", quantity: 2 }],
    resourceCost: { credits: 500, goods: 8 },
    resultDefId: "signal_jammer", ticksRequired: 5,
  },
  {
    id: "craft_synth_injector", name: "Synthesize Adrenaline Injector", description: "Create a permanent combat implant from stims.",
    ingredients: [{ defId: "berserker_stim", quantity: 5 }, { defId: "combat_stims", quantity: 3 }],
    resourceCost: { credits: 400 },
    resultDefId: "synth_adrenaline_injector", ticksRequired: 6,
  },
  {
    id: "craft_reflex_enhancer", name: "Fabricate Reflex Enhancer", description: "Build a spinal implant from cybernetic components.",
    ingredients: [{ defId: "synth_adrenaline_injector", quantity: 1 }, { defId: "neural_link", quantity: 1 }],
    resourceCost: { credits: 2000, goods: 15 },
    resultDefId: "reflex_enhancer", ticksRequired: 8, requiredTech: "basic_cybernetics",
  },
  {
    id: "craft_advanced_medkit", name: "Upgrade Med-Kit", description: "Enhance a standard kit with advanced supplies.",
    ingredients: [{ defId: "med_kit_advanced", quantity: 2 }],
    resourceCost: { credits: 200 },
    resultDefId: "field_medkit", ticksRequired: 3,
  },
  {
    id: "craft_emp_grenade", name: "Build EMP Grenades", description: "Construct electromagnetic pulse devices.",
    ingredients: [{ defId: "recon_drone", quantity: 1 }],
    resourceCost: { credits: 500, fuel: 5, goods: 5 },
    resultDefId: "emp_grenade", ticksRequired: 4,
  },
  {
    id: "craft_wardens_cloak", name: "Restore Warden's Cloak", description: "Repair and reinforce an old warden's greatcoat.",
    ingredients: [{ defId: "riot_armor", quantity: 1 }, { defId: "old_world_badge", quantity: 1 }],
    resourceCost: { credits: 1500, goods: 10 },
    resultDefId: "wardens_cloak", ticksRequired: 8,
  },
  {
    id: "craft_heavy_mg", name: "Assemble Heavy MG", description: "Build a belt-fed machine gun from salvaged weapons.",
    ingredients: [{ defId: "assault_rifle_mk2", quantity: 2 }, { defId: "bandolier", quantity: 1 }],
    resourceCost: { credits: 1800, steel: 20 },
    resultDefId: "heavy_machine_gun", ticksRequired: 8,
  },
];

export interface EquipmentSet {
  id: string;
  name: string;
  description: string;
  itemIds: string[];
  setBonuses: {
    piecesRequired: number;
    label: string;
    effects: Partial<{
      combat: number;
      defense: number;
      morale: number;
      leadership: number;
      tactics: number;
      xpBonus: number;
      recon: number;
      credits: number;
      defenseRating: number;
      upkeepReduction: number;
      healingBonus: number;
    }>;
  }[];
}

export const EQUIPMENT_SETS: EquipmentSet[] = [
  {
    id: "marshal_regalia", name: "Marshal's Regalia", description: "The complete kit of a pre-war Sector Marshal.",
    itemIds: ["executioner_blade", "wardens_cloak", "commanders_signet"],
    setBonuses: [
      { piecesRequired: 2, label: "Authority (2pc)", effects: { leadership: 8, morale: 10 } },
      { piecesRequired: 3, label: "Supreme Command (3pc)", effects: { leadership: 15, morale: 20, combat: 5, defenseRating: 5 } },
    ],
  },
  {
    id: "ghost_operative", name: "Ghost Operative", description: "Stealth and surveillance equipment set.",
    itemIds: ["stealth_suit", "signal_jammer", "targeting_optics"],
    setBonuses: [
      { piecesRequired: 2, label: "Shadow (2pc)", effects: { recon: 12, defense: 5 } },
      { piecesRequired: 3, label: "Phantom (3pc)", effects: { recon: 20, combat: 8, tactics: 8 } },
    ],
  },
  {
    id: "juggernaut_rig", name: "Juggernaut Rig", description: "Maximum protection heavy armor set.",
    itemIds: ["juggernaut_exo", "titan_plate", "thunderhammer"],
    setBonuses: [
      { piecesRequired: 2, label: "Armored (2pc)", effects: { defense: 15, morale: 5 } },
      { piecesRequired: 3, label: "Unstoppable (3pc)", effects: { defense: 25, combat: 12, morale: 15 } },
    ],
  },
  {
    id: "cyber_enhanced", name: "Cyber-Enhanced", description: "Full cybernetic augmentation suite.",
    itemIds: ["neural_link", "cortical_stack", "reflex_enhancer", "targeting_optics"],
    setBonuses: [
      { piecesRequired: 2, label: "Augmented (2pc)", effects: { tactics: 6, xpBonus: 0.10 } },
      { piecesRequired: 3, label: "Transhumanist (3pc)", effects: { tactics: 12, xpBonus: 0.20, combat: 8 } },
      { piecesRequired: 4, label: "Apex Predator (4pc)", effects: { tactics: 18, xpBonus: 0.35, combat: 15, recon: 10 } },
    ],
  },
  {
    id: "scavenger_kit", name: "Scavenger's Kit", description: "Salvaged wasteland survival gear.",
    itemIds: ["scrap_armor_plate", "scrap_blade", "salvaged_pistol", "bandolier"],
    setBonuses: [
      { piecesRequired: 2, label: "Resourceful (2pc)", effects: { upkeepReduction: 0.10, credits: 10 } },
      { piecesRequired: 3, label: "Survivor (3pc)", effects: { upkeepReduction: 0.20, credits: 25, defense: 4 } },
      { piecesRequired: 4, label: "Wasteland King (4pc)", effects: { upkeepReduction: 0.30, credits: 50, combat: 5, morale: 10 } },
    ],
  },
  {
    id: "combat_medic_set", name: "Combat Medic Set", description: "Frontline medical specialist equipment.",
    itemIds: ["wardens_cloak", "adrenaline_regulator", "dermal_weave"],
    setBonuses: [
      { piecesRequired: 2, label: "Field Medic (2pc)", effects: { healingBonus: 15, defense: 5 } },
      { piecesRequired: 3, label: "Angel of Mercy (3pc)", effects: { healingBonus: 30, defense: 10, morale: 12 } },
    ],
  },
  {
    id: "precision_striker", name: "Precision Striker", description: "Long-range elimination specialist loadout.",
    itemIds: ["railgun_pistol", "sniper_scope", "stealth_suit"],
    setBonuses: [
      { piecesRequired: 2, label: "Marksman (2pc)", effects: { combat: 8, recon: 8 } },
      { piecesRequired: 3, label: "Deadeye (3pc)", effects: { combat: 15, recon: 15, tactics: 5 } },
    ],
  },
  {
    id: "relic_hunter", name: "Relic Hunter", description: "Pre-collapse artifact collection.",
    itemIds: ["old_world_badge", "sector_founders_ring", "pre_war_data_core", "corpo_dataslate"],
    setBonuses: [
      { piecesRequired: 2, label: "Collector (2pc)", effects: { credits: 30, xpBonus: 0.10 } },
      { piecesRequired: 3, label: "Archaeologist (3pc)", effects: { credits: 60, xpBonus: 0.20, leadership: 8 } },
      { piecesRequired: 4, label: "Living Archive (4pc)", effects: { credits: 100, xpBonus: 0.35, leadership: 15, tactics: 10 } },
    ],
  },
];

export function getActiveSetBonuses(equippedDefIds: string[]): { set: EquipmentSet; bonus: EquipmentSet["setBonuses"][0] }[] {
  const results: { set: EquipmentSet; bonus: EquipmentSet["setBonuses"][0] }[] = [];
  for (const set of EQUIPMENT_SETS) {
    const count = set.itemIds.filter(id => equippedDefIds.includes(id)).length;
    const activeBonuses = set.setBonuses.filter(b => count >= b.piecesRequired);
    const highest = activeBonuses[activeBonuses.length - 1];
    if (highest) results.push({ set, bonus: highest });
  }
  return results;
}

let _itemIdCounter = 0;
export function genItemId(): string { return `itm_${Date.now()}_${++_itemIdCounter}`; }
