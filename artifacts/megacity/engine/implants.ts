export type ImplantCategory =
  | "limb"
  | "vision"
  | "neural"
  | "bodySystem"
  | "military"
  | "industrial"
  | "medical"
  | "security"
  | "experimental"
  | "advancedMilitary";

export type ImplantRarity = "common" | "uncommon" | "rare" | "legendary" | "prototype";

export type ImplantDef = {
  id: string;
  name: string;
  category: ImplantCategory;
  rarity: ImplantRarity;
  cost: number;
  description: string;
};

export const IMPLANT_CATEGORIES: { id: ImplantCategory; label: string }[] = [
  { id: "limb", label: "LIMB REPLACEMENTS" },
  { id: "vision", label: "VISION IMPLANTS" },
  { id: "neural", label: "NEURAL IMPLANTS" },
  { id: "bodySystem", label: "BODY SYSTEM IMPLANTS" },
  { id: "military", label: "MILITARY IMPLANTS" },
  { id: "industrial", label: "INDUSTRIAL IMPLANTS" },
  { id: "medical", label: "MEDICAL IMPLANTS" },
  { id: "security", label: "SECURITY IMPLANTS" },
  { id: "experimental", label: "EXPERIMENTAL IMPLANTS" },
  { id: "advancedMilitary", label: "ADVANCED MILITARY IMPLANTS" },
];

export const IMPLANTS: ImplantDef[] = [
  { id: "imp_basic_cyberarm_l", name: "Basic Cyber-Arm (Left)", category: "limb", rarity: "common", cost: 5000, description: "Standard prosthetic arm replacement with basic motor function." },
  { id: "imp_basic_cyberarm_r", name: "Basic Cyber-Arm (Right)", category: "limb", rarity: "common", cost: 5000, description: "Standard prosthetic arm replacement with fine motor control." },
  { id: "imp_reinforced_cyberarm", name: "Reinforced Cyber-Arm", category: "limb", rarity: "uncommon", cost: 12000, description: "Heavy-duty arm with industrial-grade servos and armored casing." },
  { id: "imp_basic_cyberleg_l", name: "Basic Cyber-Leg (Left)", category: "limb", rarity: "common", cost: 4500, description: "Standard leg prosthetic with natural gait replication." },
  { id: "imp_basic_cyberleg_r", name: "Basic Cyber-Leg (Right)", category: "limb", rarity: "common", cost: 4500, description: "Standard leg prosthetic with shock-absorbing joints." },
  { id: "imp_sprint_cyberlegs", name: "Sprint-Class Cyber-Legs", category: "limb", rarity: "rare", cost: 25000, description: "Racing-grade leg replacements with carbon-fiber pistons." },
  { id: "imp_multi_joint_arm", name: "Multi-Joint Flex Arm", category: "limb", rarity: "uncommon", cost: 15000, description: "Arm with additional elbow and wrist joints for extreme articulation." },
  { id: "imp_mantis_arm", name: "Mantis-Pattern Combat Arm", category: "limb", rarity: "rare", cost: 30000, description: "Weaponized arm with retractable blade and reinforced strike surface." },
  { id: "imp_gecko_grip_hands", name: "Gecko-Grip Hands", category: "limb", rarity: "uncommon", cost: 10000, description: "Van der Waals adhesion pads on fingertips for wall-climbing." },
  { id: "imp_full_body_frame", name: "Full Body Cyber-Frame", category: "limb", rarity: "legendary", cost: 200000, description: "Complete skeletal and muscular replacement. Near-total conversion." },

  { id: "imp_basic_cybereyes", name: "Basic Cyber-Eyes", category: "vision", rarity: "common", cost: 6000, description: "Standard optical replacements with enhanced clarity and zoom." },
  { id: "imp_kiroshi_mk1", name: "Kiroshi Optics Mk-1", category: "vision", rarity: "uncommon", cost: 15000, description: "Premium optical implants with HUD overlay and recording capability." },
  { id: "imp_kiroshi_mk2", name: "Kiroshi Optics Mk-2", category: "vision", rarity: "rare", cost: 35000, description: "Advanced optics with thermal, night-vision, and threat detection." },
  { id: "imp_tactical_eyes", name: "Tactical Combat Eyes", category: "vision", rarity: "rare", cost: 40000, description: "Military-grade eyes with rangefinding, wind calculation, and IFF." },
  { id: "imp_xray_lens", name: "X-Ray Lens Implant", category: "vision", rarity: "rare", cost: 50000, description: "Short-range material penetration vision for inspection and surveillance." },
  { id: "imp_microscopic_eyes", name: "Microscopic Analysis Eyes", category: "vision", rarity: "uncommon", cost: 18000, description: "Microscopic zoom capability for forensic and scientific work." },
  { id: "imp_panoramic_eyes", name: "Panoramic Vision System", category: "vision", rarity: "uncommon", cost: 20000, description: "270-degree field of view via lateral sensor implants." },
  { id: "imp_thermal_eyes", name: "Thermal Imaging Eyes", category: "vision", rarity: "uncommon", cost: 16000, description: "Dedicated thermal spectrum vision for search and rescue." },
  { id: "imp_recording_eyes", name: "Continuous Recording Eyes", category: "vision", rarity: "common", cost: 8000, description: "Always-on visual recording with 48-hour onboard storage." },
  { id: "imp_sniper_eyes", name: "Sniper Targeting Eyes", category: "vision", rarity: "legendary", cost: 80000, description: "Extreme-range targeting system with atmospheric compensation." },

  { id: "imp_basic_neural_link", name: "Basic Neural Link", category: "neural", rarity: "common", cost: 8000, description: "Standard brain-computer interface for data access and comms." },
  { id: "imp_advanced_neural_link", name: "Advanced Neural Link", category: "neural", rarity: "uncommon", cost: 22000, description: "High-bandwidth neural interface with multi-stream processing." },
  { id: "imp_memory_module", name: "Memory Expansion Module", category: "neural", rarity: "uncommon", cost: 18000, description: "Additional memory storage and perfect recall capability." },
  { id: "imp_hacking_deck", name: "Integrated Hacking Deck", category: "neural", rarity: "rare", cost: 45000, description: "Built-in cyberdeck for neural hacking and system intrusion." },
  { id: "imp_reflex_tuner", name: "Reflex Tuner", category: "neural", rarity: "uncommon", cost: 20000, description: "Neural pathway optimizer for faster reaction times." },
  { id: "imp_skill_chip_slot", name: "Skill Chip Socket", category: "neural", rarity: "common", cost: 10000, description: "Neural socket for plug-in skill modules — instant expertise." },
  { id: "imp_ai_copilot", name: "AI Co-Pilot Module", category: "neural", rarity: "rare", cost: 55000, description: "Embedded AI assistant for decision support and multitasking." },
  { id: "imp_emotion_regulator", name: "Emotion Regulator", category: "neural", rarity: "uncommon", cost: 15000, description: "Limbic system modulator for emotional control under stress." },
  { id: "imp_dream_recorder", name: "Dream Recorder", category: "neural", rarity: "common", cost: 7000, description: "Records and plays back dreams for analysis or entertainment." },
  { id: "imp_quantum_neural_core", name: "Quantum Neural Core", category: "neural", rarity: "legendary", cost: 150000, description: "Quantum computing substrate bonded to neural tissue for superhuman cognition." },

  { id: "imp_synth_heart_i", name: "Synthetic Heart Mk-I", category: "bodySystem", rarity: "common", cost: 12000, description: "Cybernetic heart with enhanced pumping efficiency and durability." },
  { id: "imp_synth_heart_ii", name: "Synthetic Heart Mk-II", category: "bodySystem", rarity: "uncommon", cost: 28000, description: "Advanced heart with emergency overdrive mode and self-repair." },
  { id: "imp_synth_lungs", name: "Synthetic Lungs", category: "bodySystem", rarity: "common", cost: 10000, description: "Cybernetic lungs with enhanced O2 extraction and toxin filtering." },
  { id: "imp_blood_pump", name: "Blood Pump Upgrade", category: "bodySystem", rarity: "common", cost: 8000, description: "Secondary circulatory pump for improved blood flow and healing." },
  { id: "imp_synth_liver", name: "Synthetic Liver", category: "bodySystem", rarity: "uncommon", cost: 15000, description: "Enhanced toxin processing and chemical resistance." },
  { id: "imp_synth_kidneys", name: "Synthetic Kidneys", category: "bodySystem", rarity: "uncommon", cost: 14000, description: "Cybernetic kidneys with near-perfect blood filtration." },
  { id: "imp_reinforced_spine", name: "Reinforced Spine", category: "bodySystem", rarity: "uncommon", cost: 20000, description: "Titanium-alloy spinal column for structural integrity and load bearing." },
  { id: "imp_adrenaline_pump", name: "Adrenaline Pump", category: "bodySystem", rarity: "rare", cost: 35000, description: "On-demand adrenaline injection system for emergency performance." },
  { id: "imp_nano_blood", name: "Nano-Blood System", category: "bodySystem", rarity: "rare", cost: 60000, description: "Blood replaced with oxygen-carrying nanite solution. Self-repairing." },
  { id: "imp_endocrine_controller", name: "Endocrine Controller", category: "bodySystem", rarity: "legendary", cost: 90000, description: "Full hormonal system override for optimized body chemistry." },

  { id: "imp_sub_dermal_armor_i", name: "Sub-Dermal Armor Mk-I", category: "military", rarity: "common", cost: 15000, description: "Lightweight armor mesh implanted under the skin." },
  { id: "imp_sub_dermal_armor_ii", name: "Sub-Dermal Armor Mk-II", category: "military", rarity: "uncommon", cost: 30000, description: "Heavy-duty titanium-ceramic weave. Stops rifle rounds." },
  { id: "imp_smart_weapon_link", name: "Smart Weapon Link", category: "military", rarity: "uncommon", cost: 18000, description: "Neural link to smart weapons for aim-assist and friend-or-foe." },
  { id: "imp_ammo_counter", name: "Ammo Counter Display", category: "military", rarity: "common", cost: 5000, description: "HUD-linked ammunition counter for all connected weapons." },
  { id: "imp_combat_stim_port", name: "Combat Stimulant Port", category: "military", rarity: "uncommon", cost: 22000, description: "Automated drug delivery system for combat performance enhancement." },
  { id: "imp_threat_detector", name: "Threat Detector Array", category: "military", rarity: "rare", cost: 40000, description: "360-degree threat awareness system with auditory and haptic alerts." },
  { id: "imp_tactical_comm_suite", name: "Tactical Comms Suite", category: "military", rarity: "uncommon", cost: 16000, description: "Encrypted military communication implant with squad coordination." },
  { id: "imp_ballistic_coprocessor", name: "Ballistic Co-Processor", category: "military", rarity: "rare", cost: 45000, description: "Dedicated ballistic trajectory computer for extreme accuracy." },
  { id: "imp_emp_hardening", name: "EMP Hardening Package", category: "military", rarity: "uncommon", cost: 20000, description: "Faraday cage shielding for all implants against electromagnetic pulse." },
  { id: "imp_combat_exoskeleton", name: "Integrated Combat Exoskeleton", category: "military", rarity: "legendary", cost: 120000, description: "Full combat frame with powered joints, armor, and weapons integration." },

  { id: "imp_power_grip", name: "Power Grip Hands", category: "industrial", rarity: "common", cost: 6000, description: "Reinforced hands with enhanced grip strength for heavy labor." },
  { id: "imp_welding_finger", name: "Integrated Welding Finger", category: "industrial", rarity: "common", cost: 8000, description: "Built-in plasma welding torch in the index finger." },
  { id: "imp_cargo_spine", name: "Cargo-Rated Spine", category: "industrial", rarity: "uncommon", cost: 18000, description: "Heavy-load spinal reinforcement for cargo handling operations." },
  { id: "imp_magnetic_boots", name: "Magnetic Boot Implants", category: "industrial", rarity: "uncommon", cost: 12000, description: "Electromagnetic sole implants for zero-G and vertical surface work." },
  { id: "imp_hazmat_filters", name: "Hazmat Filtration Suite", category: "industrial", rarity: "uncommon", cost: 14000, description: "Complete respiratory and dermal protection against industrial chemicals." },
  { id: "imp_structural_scanner", name: "Structural Integrity Scanner", category: "industrial", rarity: "uncommon", cost: 16000, description: "Sonar-based material stress analysis via touch interface." },
  { id: "imp_mining_drill_arm", name: "Mining Drill Arm", category: "industrial", rarity: "rare", cost: 35000, description: "Arm-mounted rotary drill for mining and excavation operations." },
  { id: "imp_radiation_shield", name: "Radiation Shield Implant", category: "industrial", rarity: "uncommon", cost: 20000, description: "Lead-bismuth compound sub-dermal layer for radiation work." },
  { id: "imp_diagnostic_hud", name: "Engineering Diagnostic HUD", category: "industrial", rarity: "common", cost: 9000, description: "AR overlay showing mechanical schematics and fault diagnosis." },
  { id: "imp_construction_frame", name: "Construction Worker Frame", category: "industrial", rarity: "legendary", cost: 100000, description: "Full industrial exoskeleton for construction and demolition work." },

  { id: "imp_med_scanner", name: "Medical Scanner Implant", category: "medical", rarity: "common", cost: 10000, description: "Palm-contact vital signs reader and basic diagnostic tool." },
  { id: "imp_nano_surgeon", name: "Nano-Surgeon Suite", category: "medical", rarity: "rare", cost: 50000, description: "Fingertip nanite injectors for microscopic surgical procedures." },
  { id: "imp_blood_analyzer", name: "Blood Analyzer", category: "medical", rarity: "common", cost: 8000, description: "Instant blood composition analysis via contact patch." },
  { id: "imp_defibrillator_palm", name: "Defibrillator Palm", category: "medical", rarity: "uncommon", cost: 15000, description: "Built-in cardiac defibrillator for emergency resuscitation." },
  { id: "imp_pharma_dispenser", name: "Pharmaceutical Dispenser", category: "medical", rarity: "uncommon", cost: 18000, description: "Automated drug mixing and injection system for patient care." },
  { id: "imp_bone_knitter", name: "Bone Knitter Module", category: "medical", rarity: "uncommon", cost: 22000, description: "Ultrasonic bone repair tool integrated into the hand." },
  { id: "imp_tissue_printer", name: "Tissue Printer Fingers", category: "medical", rarity: "rare", cost: 45000, description: "Bioprinting nozzles for on-site tissue repair and grafting." },
  { id: "imp_neural_stabilizer", name: "Neural Stabilizer", category: "medical", rarity: "rare", cost: 40000, description: "Prevents and treats neural implant rejection and cyberpsychosis." },
  { id: "imp_pathogen_detector", name: "Pathogen Detector", category: "medical", rarity: "uncommon", cost: 14000, description: "Airborne pathogen analysis for epidemiological field work." },
  { id: "imp_full_med_suite", name: "Full Medical Suite", category: "medical", rarity: "legendary", cost: 180000, description: "Complete surgical-grade medical implant package for field operations." },

  { id: "imp_retinal_scanner", name: "Retinal Scanner Implant", category: "security", rarity: "common", cost: 8000, description: "Eye-contact biometric identification and access control." },
  { id: "imp_lockpick_array", name: "Electronic Lockpick Array", category: "security", rarity: "uncommon", cost: 14000, description: "Fingertip lockpicking tools for mechanical and electronic locks." },
  { id: "imp_signal_jammer", name: "Signal Jammer Implant", category: "security", rarity: "uncommon", cost: 16000, description: "Short-range communications jammer to prevent alerts." },
  { id: "imp_stealth_skin", name: "Adaptive Camouflage Skin", category: "security", rarity: "rare", cost: 55000, description: "Chromatophore skin layer that mimics surroundings for active camo." },
  { id: "imp_voice_scrambler", name: "Voice Scrambler", category: "security", rarity: "common", cost: 6000, description: "Real-time voice modulation to prevent identification." },
  { id: "imp_bug_detector", name: "Bug Detector Suite", category: "security", rarity: "uncommon", cost: 12000, description: "Detects hidden listening devices, cameras, and tracking beacons." },
  { id: "imp_false_identity", name: "False Identity Chip", category: "security", rarity: "rare", cost: 35000, description: "Spoofs biometric scanners with fabricated identity data." },
  { id: "imp_micro_drone_bay", name: "Micro-Drone Launch Bay", category: "security", rarity: "rare", cost: 48000, description: "Shoulder-mounted bay launches surveillance micro-drones." },
  { id: "imp_counter_hack", name: "Counter-Intrusion Firewall", category: "security", rarity: "uncommon", cost: 20000, description: "Neural firewall that blocks hacking attempts on your implants." },
  { id: "imp_ghost_suite", name: "Ghost Operative Suite", category: "security", rarity: "legendary", cost: 150000, description: "Complete stealth package — camo, signal mask, identity spoof, silence." },

  { id: "imp_nano_repair_swarm", name: "Nano-Repair Swarm", category: "experimental", rarity: "prototype", cost: 250000, description: "Self-replicating nanite cloud that repairs any implant damage automatically." },
  { id: "imp_cortex_bomb", name: "Cortex Bomb", category: "experimental", rarity: "prototype", cost: 5000, description: "Cranial explosive charge. Ultimate insurance policy. Remote detonation." },
  { id: "imp_personality_backup", name: "Personality Engram Backup", category: "experimental", rarity: "prototype", cost: 300000, description: "Continuous neural state backup. Theoretical resurrection capability." },
  { id: "imp_synthetic_blood_type", name: "Universal Synthetic Blood", category: "experimental", rarity: "prototype", cost: 180000, description: "Blood replaced with universal synthetic. Immune to all blood pathogens." },
  { id: "imp_time_sense", name: "Chrono-Perception Modulator", category: "experimental", rarity: "prototype", cost: 220000, description: "Experimental temporal perception augment. Users report time distortion." },
  { id: "imp_bioelectric_gen", name: "Bioelectric Generator", category: "experimental", rarity: "prototype", cost: 200000, description: "Generates electricity from metabolic processes. Powers all implants internally." },
  { id: "imp_neural_clone", name: "Neural Clone Interface", category: "experimental", rarity: "prototype", cost: 350000, description: "Creates a digital copy of consciousness for parallel operation." },
  { id: "imp_gravity_anchor", name: "Personal Gravity Anchor", category: "experimental", rarity: "prototype", cost: 280000, description: "Micro gravity manipulation device. Limited levitation capability." },
  { id: "imp_quantum_encrypt", name: "Quantum Encryption Brain", category: "experimental", rarity: "prototype", cost: 400000, description: "Unhackable quantum-encrypted neural communications." },
  { id: "imp_transcendence_core", name: "Transcendence Core", category: "experimental", rarity: "prototype", cost: 500000, description: "Full neural-digital bridge. The boundary between human and AI dissolves." },

  { id: "imp_railgun_arm", name: "Railgun Arm", category: "advancedMilitary", rarity: "legendary", cost: 180000, description: "Arm-mounted electromagnetic accelerator. Fires tungsten penetrators." },
  { id: "imp_energy_shield", name: "Personal Energy Shield", category: "advancedMilitary", rarity: "legendary", cost: 200000, description: "Electromagnetic barrier generator. Deflects projectiles for 5 seconds." },
  { id: "imp_plasma_blade", name: "Plasma Blade Implant", category: "advancedMilitary", rarity: "legendary", cost: 150000, description: "Forearm-integrated plasma cutting blade. Temperature: 30,000°C." },
  { id: "imp_missile_shoulder", name: "Shoulder Micro-Missile Pod", category: "advancedMilitary", rarity: "legendary", cost: 160000, description: "4-tube micro-missile launcher concealed in the shoulder." },
  { id: "imp_sonic_cannon", name: "Sonic Devastator", category: "advancedMilitary", rarity: "legendary", cost: 130000, description: "Focused sonic weapon that liquefies internal organs at close range." },
  { id: "imp_laser_eye", name: "Offensive Laser Eye", category: "advancedMilitary", rarity: "legendary", cost: 140000, description: "Eye-mounted laser capable of cutting through steel at 10m." },
  { id: "imp_stealth_field", name: "Active Stealth Field Generator", category: "advancedMilitary", rarity: "legendary", cost: 250000, description: "Full-body optical cloaking field with thermal signature masking." },
  { id: "imp_nerve_strike", name: "Neural Disruption Touch", category: "advancedMilitary", rarity: "legendary", cost: 120000, description: "Palm-contact neural overload. Instant incapacitation on touch." },
  { id: "imp_berserker_frame", name: "Berserker Combat Frame", category: "advancedMilitary", rarity: "legendary", cost: 300000, description: "Full military conversion frame. Maximum combat performance. High cyberpsychosis risk." },
  { id: "imp_war_machine", name: "War Machine Integration", category: "advancedMilitary", rarity: "legendary", cost: 500000, description: "Total military conversion. Weapons, armor, targeting, comms — all built in." },
];

export const IMPLANT_MAP: Record<string, ImplantDef> = {};
for (const imp of IMPLANTS) {
  IMPLANT_MAP[imp.id] = imp;
}

export function getImplantsByCategory(category: ImplantCategory): ImplantDef[] {
  return IMPLANTS.filter((i) => i.category === category);
}

