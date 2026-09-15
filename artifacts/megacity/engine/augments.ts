export type AugmentCategory =
  | "strength"
  | "speed"
  | "vision"
  | "brain"
  | "sensory"
  | "combat"
  | "survival"
  | "utility"
  | "social"
  | "experimental";

export type AugmentDef = {
  id: string;
  name: string;
  category: AugmentCategory;
  description: string;
  effects: Partial<{
    strength: number;
    speed: number;
    reflexes: number;
    perception: number;
    intelligence: number;
    charisma: number;
    endurance: number;
    combat: number;
    stealth: number;
    hacking: number;
    resilience: number;
    intimidation: number;
  }>;
};

export const AUGMENT_CATEGORIES: { id: AugmentCategory; label: string }[] = [
  { id: "strength", label: "STRENGTH AUGMENTS" },
  { id: "speed", label: "SPEED AUGMENTS" },
  { id: "vision", label: "VISION AUGMENTS" },
  { id: "brain", label: "BRAIN AUGMENTS" },
  { id: "sensory", label: "SENSORY AUGMENTS" },
  { id: "combat", label: "COMBAT AUGMENTS" },
  { id: "survival", label: "SURVIVAL AUGMENTS" },
  { id: "utility", label: "UTILITY AUGMENTS" },
  { id: "social", label: "SOCIAL AUGMENTS" },
  { id: "experimental", label: "EXPERIMENTAL AUGMENTS" },
];

export const AUGMENTS: AugmentDef[] = [
  { id: "aug_muscle_weave_i", name: "Muscle Weave Mk-I", category: "strength", description: "Synthetic muscle fiber woven into natural tissue, boosting raw lifting power.", effects: { strength: 5 } },
  { id: "aug_muscle_weave_ii", name: "Muscle Weave Mk-II", category: "strength", description: "Advanced myomer strands replace 40% of natural muscle for superior force output.", effects: { strength: 10 } },
  { id: "aug_titanium_bone_lace", name: "Titanium Bone Lacing", category: "strength", description: "Skeletal reinforcement with titanium composite lattice. Fracture-proof.", effects: { strength: 8, endurance: 5 } },
  { id: "aug_hydraulic_grip", name: "Hydraulic Grip System", category: "strength", description: "Micro-hydraulic actuators in forearms amplify crushing force tenfold.", effects: { strength: 6, combat: 3 } },
  { id: "aug_exo_spine", name: "Exo-Spine Brace", category: "strength", description: "Powered vertebral support frame enabling superhuman load bearing.", effects: { strength: 7, endurance: 4 } },
  { id: "aug_power_arms", name: "Power-Arm Servos", category: "strength", description: "Servo-assisted arm augments for industrial-grade strength.", effects: { strength: 12 } },
  { id: "aug_dense_muscle_graft", name: "Dense Muscle Grafts", category: "strength", description: "Lab-grown hyper-dense muscle tissue implanted over natural fibers.", effects: { strength: 9, resilience: 3 } },
  { id: "aug_carbon_tendon", name: "Carbon Fiber Tendons", category: "strength", description: "Tendons replaced with carbon-polymer composites for snap-proof joints.", effects: { strength: 6, speed: 2 } },
  { id: "aug_gorilla_arms", name: "Gorilla Arms", category: "strength", description: "Massive pneumatic arm replacements. Designed for demolition work.", effects: { strength: 15, intimidation: 5 } },
  { id: "aug_nano_muscle", name: "Nano-Muscle Matrix", category: "strength", description: "Nanite-infused muscle tissue that self-repairs and adapts under strain.", effects: { strength: 11, resilience: 4, endurance: 3 } },

  { id: "aug_reflex_booster_i", name: "Reflex Booster Mk-I", category: "speed", description: "Neural pathway accelerators that halve reaction time.", effects: { speed: 5, reflexes: 5 } },
  { id: "aug_reflex_booster_ii", name: "Reflex Booster Mk-II", category: "speed", description: "Second-gen reflex suite with predictive micro-movements.", effects: { speed: 8, reflexes: 8 } },
  { id: "aug_sprint_pistons", name: "Sprint Piston Legs", category: "speed", description: "Lower-leg piston implants for burst acceleration.", effects: { speed: 10 } },
  { id: "aug_kerenzikov", name: "Kerenzikov Stabilizer", category: "speed", description: "Time-dilation perception augment. The world slows when danger spikes.", effects: { speed: 6, reflexes: 10 } },
  { id: "aug_synaptic_accelerator", name: "Synaptic Accelerator", category: "speed", description: "Overclocked nerve conduction for lightning-fast motor response.", effects: { speed: 7, reflexes: 7 } },
  { id: "aug_lightweight_skeleton", name: "Lightweight Skeleton", category: "speed", description: "Hollow titanium bone replacements — lighter but nearly as strong.", effects: { speed: 8, endurance: -2 } },
  { id: "aug_micro_turbine_joints", name: "Micro-Turbine Joints", category: "speed", description: "Rotary joints with micro-turbines for explosive angular velocity.", effects: { speed: 9, combat: 3 } },
  { id: "aug_quicksilver_nerves", name: "Quicksilver Nerve Lacing", category: "speed", description: "Silver-alloy neural sheaths for near-instant signal propagation.", effects: { speed: 6, reflexes: 6, perception: 2 } },
  { id: "aug_dash_module", name: "Dash Module", category: "speed", description: "Electromagnetic burst system enables short-range teleport-speed dashes.", effects: { speed: 12 } },
  { id: "aug_chronos_implant", name: "Chronos Implant", category: "speed", description: "Experimental time-perception stretcher. Users report seconds feeling like minutes.", effects: { speed: 5, reflexes: 12, perception: 5 } },

  { id: "aug_infrared_optics", name: "Infrared Optics", category: "vision", description: "Thermal imaging overlay integrated into retinal implants.", effects: { perception: 6 } },
  { id: "aug_telescopic_lens", name: "Telescopic Lens Array", category: "vision", description: "Variable-zoom optical replacements with 50x magnification.", effects: { perception: 8 } },
  { id: "aug_night_vision", name: "Night-Vision Retinas", category: "vision", description: "Light-amplifying retinal coating for perfect darkness vision.", effects: { perception: 5, combat: 2 } },
  { id: "aug_threat_scanner", name: "Threat Detection Scanner", category: "vision", description: "Real-time hostile intent recognition via micro-expression analysis.", effects: { perception: 7, combat: 4 } },
  { id: "aug_hud_overlay", name: "HUD Overlay System", category: "vision", description: "Augmented reality heads-up display with tactical data feeds.", effects: { perception: 4, intelligence: 3 } },
  { id: "aug_xray_vision", name: "X-Ray Penetration Sight", category: "vision", description: "Short-range material-penetrating vision. Sees through walls up to 3m.", effects: { perception: 10 } },
  { id: "aug_motion_tracker", name: "Motion Tracker Optics", category: "vision", description: "Detects and highlights all motion within 360-degree visual field.", effects: { perception: 6, reflexes: 3 } },
  { id: "aug_biometric_scanner", name: "Biometric Eye Scanner", category: "vision", description: "Retinal-integrated scanner reads heartrate, stress, and ID signatures.", effects: { perception: 5, intelligence: 2 } },
  { id: "aug_laser_designator_eye", name: "Laser Designator Eye", category: "vision", description: "Military-grade targeting laser built into the iris.", effects: { perception: 4, combat: 6 } },
  { id: "aug_multi_spectrum", name: "Multi-Spectrum Vision", category: "vision", description: "Full EM spectrum vision — radio, microwave, UV, IR overlaid on visible light.", effects: { perception: 12 } },

  { id: "aug_neural_processor_i", name: "Neural Co-Processor Mk-I", category: "brain", description: "Secondary processing core handles background cognitive tasks.", effects: { intelligence: 5 } },
  { id: "aug_neural_processor_ii", name: "Neural Co-Processor Mk-II", category: "brain", description: "Dual-core neural augment with parallel thought-stream capability.", effects: { intelligence: 10 } },
  { id: "aug_memory_bank", name: "Eidetic Memory Bank", category: "brain", description: "Perfect recall implant stores and retrieves memories with zero degradation.", effects: { intelligence: 7 } },
  { id: "aug_logic_engine", name: "Logic Engine Implant", category: "brain", description: "Dedicated reasoning co-processor for complex problem-solving.", effects: { intelligence: 8, hacking: 3 } },
  { id: "aug_net_interface", name: "Direct Net Interface", category: "brain", description: "Cranial jack for direct neural-network connectivity. Think at wire speed.", effects: { intelligence: 4, hacking: 8 } },
  { id: "aug_multi_tasker", name: "Multi-Task Cortex", category: "brain", description: "Split-attention augment allows parallel conscious task management.", effects: { intelligence: 6, perception: 3 } },
  { id: "aug_savant_module", name: "Savant Calculation Module", category: "brain", description: "Mathematical co-processor for instant computation.", effects: { intelligence: 9 } },
  { id: "aug_language_core", name: "Universal Language Core", category: "brain", description: "Real-time translation implant covering 200+ languages and ciphers.", effects: { intelligence: 4, charisma: 3 } },
  { id: "aug_tactical_brain", name: "Tactical Brain Overlay", category: "brain", description: "Military decision-support system layered onto cognitive processes.", effects: { intelligence: 6, combat: 5 } },
  { id: "aug_hive_mind_link", name: "Hive-Mind Neural Link", category: "brain", description: "Experimental shared-consciousness implant. Link with up to 5 minds.", effects: { intelligence: 12, perception: 5 } },

  { id: "aug_audio_amplifier", name: "Audio Amplifier Cochlea", category: "sensory", description: "Inner-ear replacement with 10x sound amplification and filtering.", effects: { perception: 6 } },
  { id: "aug_sonar_pulse", name: "Sonar Pulse Emitter", category: "sensory", description: "Echolocation system for spatial awareness in zero-visibility conditions.", effects: { perception: 7 } },
  { id: "aug_chemical_analyzer", name: "Chemical Analyzer Tongue", category: "sensory", description: "Taste-bud replacement identifies 50,000+ chemical compounds on contact.", effects: { perception: 4, intelligence: 2 } },
  { id: "aug_vibration_sensor", name: "Seismic Vibration Sensor", category: "sensory", description: "Sub-dermal sensors detect ground vibrations and approaching footsteps.", effects: { perception: 5, reflexes: 3 } },
  { id: "aug_em_receptor", name: "EM Field Receptor", category: "sensory", description: "Detects electromagnetic emissions from electronics and powered devices.", effects: { perception: 6, hacking: 2 } },
  { id: "aug_pain_editor", name: "Pain Editor", category: "sensory", description: "Neural gate that suppresses pain signals. Dangerous — injuries go unnoticed.", effects: { endurance: 8, resilience: 5 } },
  { id: "aug_pheromone_detector", name: "Pheromone Detector", category: "sensory", description: "Olfactory augment reads emotional states via airborne pheromones.", effects: { perception: 4, charisma: 3 } },
  { id: "aug_pressure_mapping", name: "Pressure Mapping Skin", category: "sensory", description: "Sub-dermal pressure grid for enhanced tactile awareness.", effects: { perception: 5, reflexes: 2 } },
  { id: "aug_magnetic_sense", name: "Magnetic Sense Implant", category: "sensory", description: "Detects magnetic fields for navigation and metal detection.", effects: { perception: 4 } },
  { id: "aug_full_spectrum_sense", name: "Full Spectrum Sensory Suite", category: "sensory", description: "Complete sensory replacement — all five senses upgraded to superhuman levels.", effects: { perception: 15 } },

  { id: "aug_mantis_blades", name: "Mantis Blades", category: "combat", description: "Retractable forearm blades of monomolecular-edge titanium.", effects: { combat: 10, intimidation: 5 } },
  { id: "aug_mono_wire", name: "Monowire Whip", category: "combat", description: "Wrist-mounted monofilament whip that cuts through most materials.", effects: { combat: 9, stealth: 3 } },
  { id: "aug_ballistic_fists", name: "Ballistic Fist Launchers", category: "combat", description: "Pneumatic knuckle launchers deliver explosive punches.", effects: { combat: 8, strength: 4 } },
  { id: "aug_sub_dermal_armor", name: "Sub-Dermal Armor Mesh", category: "combat", description: "Woven titanium-ceramic mesh beneath the skin. Stops small-caliber rounds.", effects: { combat: 3, resilience: 10 } },
  { id: "aug_targeting_system", name: "Smart Targeting System", category: "combat", description: "Weapon-linked aiming augment with predictive trajectory calculation.", effects: { combat: 8, perception: 4 } },
  { id: "aug_adrenal_surge", name: "Adrenal Surge Regulator", category: "combat", description: "On-demand adrenaline injection for combat hyper-performance.", effects: { combat: 6, speed: 4, strength: 3 } },
  { id: "aug_pain_suppressor", name: "Combat Pain Suppressor", category: "combat", description: "Military-grade pain blocker. Fight through injuries without performance loss.", effects: { combat: 5, endurance: 6 } },
  { id: "aug_wrist_cannon", name: "Wrist-Mounted Micro-Cannon", category: "combat", description: "Concealed 5mm caseless micro-gun in the forearm.", effects: { combat: 12 } },
  { id: "aug_reactive_armor", name: "Reactive Armor Plating", category: "combat", description: "Explosive-reactive sub-dermal tiles that detonate on ballistic impact.", effects: { combat: 4, resilience: 12 } },
  { id: "aug_berserker_chip", name: "Berserker Combat Chip", category: "combat", description: "Overrides self-preservation instincts for maximum aggression. High risk.", effects: { combat: 15, strength: 5, intelligence: -3 } },

  { id: "aug_toxin_filter", name: "Toxin Filtration System", category: "survival", description: "Liver-augment filters 99% of known poisons and chemical agents.", effects: { resilience: 6, endurance: 3 } },
  { id: "aug_rad_scrubber", name: "Radiation Scrubber Implant", category: "survival", description: "Nanite system continuously neutralizes radiation damage.", effects: { resilience: 8 } },
  { id: "aug_oxygen_recycler", name: "Oxygen Recycler Lungs", category: "survival", description: "Closed-loop lung augment extracts O2 from exhaled CO2.", effects: { endurance: 10 } },
  { id: "aug_thermal_regulator", name: "Thermal Regulator", category: "survival", description: "Body temperature management system for extreme environments.", effects: { endurance: 6, resilience: 4 } },
  { id: "aug_blood_nanites", name: "Healing Blood Nanites", category: "survival", description: "Nano-machines in the bloodstream accelerate wound healing 5x.", effects: { resilience: 10, endurance: 3 } },
  { id: "aug_backup_heart", name: "Backup Synthetic Heart", category: "survival", description: "Secondary cybernetic heart activates if primary fails.", effects: { endurance: 8, resilience: 5 } },
  { id: "aug_dermal_plating", name: "Environmental Dermal Plating", category: "survival", description: "Skin reinforcement for hazardous environment operations.", effects: { resilience: 7, endurance: 3 } },
  { id: "aug_metabolic_optimizer", name: "Metabolic Optimizer", category: "survival", description: "Digestive augment extracts maximum nutrition from minimal food.", effects: { endurance: 7 } },
  { id: "aug_immune_booster", name: "Immune System Booster", category: "survival", description: "Synthetic immune cells fight infections at 10x natural speed.", effects: { resilience: 6 } },
  { id: "aug_full_body_hardening", name: "Full Body Hardening Suite", category: "survival", description: "Complete environmental survival package — rad, toxin, heat, cold, pressure.", effects: { resilience: 12, endurance: 8 } },

  { id: "aug_tool_hand", name: "Multi-Tool Hand", category: "utility", description: "Modular hand replacement with 20 interchangeable tool heads.", effects: { intelligence: 3 } },
  { id: "aug_data_jack", name: "Universal Data Jack", category: "utility", description: "Wrist-mounted interface port for any data system.", effects: { hacking: 6 } },
  { id: "aug_grapple_arm", name: "Grapple Launch Arm", category: "utility", description: "Forearm-mounted magnetic grappling hook with 50m range.", effects: { speed: 3 } },
  { id: "aug_flashlight_eyes", name: "Integrated Flashlight Eyes", category: "utility", description: "High-lumen light emitters behind the cornea.", effects: { perception: 3 } },
  { id: "aug_comms_implant", name: "Sub-Vocal Comms Implant", category: "utility", description: "Throat-implanted transceiver for silent communication.", effects: { charisma: 2, stealth: 3 } },
  { id: "aug_recorder_eyes", name: "Video Recorder Eyes", category: "utility", description: "Continuous visual recording with 72-hour buffer storage.", effects: { perception: 2, intelligence: 2 } },
  { id: "aug_lockpick_fingers", name: "Electronic Lockpick Fingers", category: "utility", description: "Fingertip tools for mechanical and electronic lock bypass.", effects: { hacking: 5, stealth: 3 } },
  { id: "aug_air_filter", name: "Integrated Air Filter", category: "utility", description: "Nasal filtration system for toxic atmospheres.", effects: { resilience: 4 } },
  { id: "aug_internal_clock", name: "Atomic Internal Clock", category: "utility", description: "Cesium-based internal chronometer accurate to nanoseconds.", effects: { intelligence: 2 } },
  { id: "aug_swiss_army_body", name: "Swiss Army Body", category: "utility", description: "Full utility augment suite — tools, storage, computing, communications.", effects: { intelligence: 5, hacking: 4, perception: 3 } },

  { id: "aug_voice_modulator", name: "Voice Modulator", category: "social", description: "Vocal cord augment with frequency control and voice mimicry.", effects: { charisma: 6, intimidation: 3 } },
  { id: "aug_pheromone_emitter", name: "Pheromone Emitter", category: "social", description: "Synthetic pheromone glands that subtly influence nearby humans.", effects: { charisma: 8 } },
  { id: "aug_empathy_reader", name: "Empathy Reader Cortex", category: "social", description: "Neural augment that reads emotional states from biometric micro-signals.", effects: { charisma: 5, perception: 4 } },
  { id: "aug_confidence_chip", name: "Confidence Amplifier Chip", category: "social", description: "Suppresses anxiety and social hesitation responses.", effects: { charisma: 7, intimidation: 2 } },
  { id: "aug_facial_sculpt", name: "Dynamic Facial Sculpting", category: "social", description: "Programmable facial structure for disguise and expression optimization.", effects: { charisma: 6, stealth: 4 } },
  { id: "aug_subliminal_projector", name: "Subliminal Projector", category: "social", description: "Low-frequency audio emitter that plants subconscious suggestions.", effects: { charisma: 10, intimidation: 3 } },
  { id: "aug_lie_detector", name: "Lie Detector Array", category: "social", description: "Analyzes voice stress, pupil dilation, and micro-expressions for deception.", effects: { perception: 5, charisma: 3 } },
  { id: "aug_negotiation_suite", name: "Negotiation Support Suite", category: "social", description: "Real-time bargaining analysis with optimal strategy suggestions.", effects: { charisma: 5, intelligence: 4 } },
  { id: "aug_fear_inducer", name: "Fear Inducer Aura", category: "social", description: "Ultrasonic emitter triggers primal fear response in nearby subjects.", effects: { intimidation: 12 } },
  { id: "aug_silver_tongue", name: "Silver Tongue Package", category: "social", description: "Complete social augmentation — voice, pheromones, empathy, confidence.", effects: { charisma: 12, intimidation: 5 } },

  { id: "aug_quantum_brain", name: "Quantum Brain Module", category: "experimental", description: "Quantum computing substrate bonded to neural tissue. Unstable but revolutionary.", effects: { intelligence: 15, perception: 5 } },
  { id: "aug_phase_shift", name: "Phase Shift Membrane", category: "experimental", description: "Experimental matter-phasing skin. Partially phase through solid objects.", effects: { stealth: 15 } },
  { id: "aug_nano_swarm_body", name: "Nano-Swarm Body Integration", category: "experimental", description: "Body partially composed of programmable nanite swarms.", effects: { resilience: 10, strength: 5, speed: 5 } },
  { id: "aug_precognition_chip", name: "Precognition Chip", category: "experimental", description: "Pattern-matching AI that produces uncanny predictive capabilities.", effects: { reflexes: 12, perception: 8 } },
  { id: "aug_bioplasm_core", name: "Bioplasm Energy Core", category: "experimental", description: "Organic fusion core replaces metabolic system. No food or sleep needed.", effects: { endurance: 15 } },
  { id: "aug_ghost_module", name: "Ghost Module", category: "experimental", description: "Active camouflage and signal dampening. Near-invisible to sensors.", effects: { stealth: 12, hacking: 5 } },
  { id: "aug_telekinetic_amp", name: "Telekinetic Amplifier", category: "experimental", description: "Neural amp that generates weak telekinetic force. Limited range.", effects: { strength: 5, combat: 8 } },
  { id: "aug_synthetic_soul", name: "Synthetic Soul Backup", category: "experimental", description: "Continuous personality/memory backup to external server. Mortality optional.", effects: { intelligence: 8, resilience: 8 } },
  { id: "aug_hivenet_node", name: "HiveNet Node", category: "experimental", description: "Always-on mesh network node. Share senses and skills with other nodes.", effects: { intelligence: 10, perception: 10 } },
  { id: "aug_ascension_package", name: "Ascension Package", category: "experimental", description: "Full transhumanist augmentation. More machine than human. Maximum performance.", effects: { strength: 8, speed: 8, intelligence: 8, combat: 8, resilience: 8 } },
];

export const AUGMENT_MAP: Record<string, AugmentDef> = {};
for (const a of AUGMENTS) {
  AUGMENT_MAP[a.id] = a;
}

export function getAugmentsByCategory(category: AugmentCategory): AugmentDef[] {
  return AUGMENTS.filter((a) => a.category === category);
}
