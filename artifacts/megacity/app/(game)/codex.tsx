import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState, useCallback } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SectionHeader from "@/components/SectionHeader";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { REALTIME_CLOCK_EXPLANATION } from "@/utils/tickTimingCopy";
import { ACTION_COST_PLAYER_GUIDE } from "@/engine/actionCostTiming";

type CodexCategory = {
  id: string;
  title: string;
  icon: string;
  iconSet: "feather" | "mci";
  entries: CodexEntry[];
};

type CodexEntry = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  related?: string[];
};

const CODEX_DATA: CodexCategory[] = [
  {
    id: "getting-started",
    title: "GETTING STARTED",
    icon: "flag",
    iconSet: "feather",
    entries: [
      {
        id: "gs-overview",
        title: "Welcome, Commander",
        tags: ["intro", "tutorial", "new player"],
        related: ["gs-first-steps", "gs-ticks", "cm-overview"],
        body: `You are the newly appointed Commander of MEGACITY — a sprawling dystopian metropolis of approximately one million citizens spread across 270 districts. Your mandate: keep the city running, the population alive, and the factions under control.

The city operates on a TICK SYSTEM. Every tick, the simulation advances: resources are produced and consumed, events fire, construction progresses, and your city's stats shift based on your decisions. In real-time mode a tick lands roughly every 5 minutes on its own; in turn-based mode the city holds still until you press End Turn.

--- PRIMARY CONCERNS ---

• CREDITS — The city's currency. Everything costs credits.
• POPULATION — Citizens are your workforce and tax base.
• HAPPINESS — Unhappy citizens riot. Riots damage infrastructure.
• CRIME — Unchecked crime spirals into chaos.
• UNREST — The powder keg. If unrest exceeds 80, expect civil war.

Start by reviewing the OVERVIEW screen. Deploy enforcers to control crime. Build food production to feed your citizens. Research technologies to unlock new capabilities. And keep an eye on the FACTIONS — they have their own agendas.`,
      },
      {
        id: "gs-first-steps",
        title: "First 50 Ticks — Survival Guide",
        tags: ["beginner", "tips", "early game"],
        related: ["gs-ticks", "cm-resources", "eco-income"],
        body: `--- TICK 1-10: STABILIZE ---

• Check your resource production. Are you producing enough food and water?
• Deploy Patrol Enforcers (Law screen) to establish baseline law and order.
• Review active events and respond to any crises immediately.
• Appoint officers to key departments — competent officers provide stat bonuses.

--- TICK 10-25: EXPAND ---

• Begin construction of revenue-generating buildings (Tax Offices, Trading Posts).
• Start your first research project — prioritize Tier 1 technologies.
• Open the Recruitment screen and hire essential personnel.
• Negotiate with factions whose threat level is rising.

--- TICK 25-50: CONSOLIDATE ---

• Establish mining operations for raw materials.
• Build military infrastructure if defense rating is below 30.
• Begin awarding contracts for ongoing projects.
• Explore the world map — discover townships and trading partners.

--- KEY RULE ---
Never let credits hit zero. When credits run out, everything stops — no deployments, no construction, no research. Maintain a reserve before committing to a new action.`,
      },
      {
        id: "gs-saving",
        title: "Saving & Loading",
        tags: ["save", "load", "slots"],
        body: `MEGACITY supports 6 save slots, each with its own custom label. Access them from the MORE menu.

• AUTO-SAVE: The game auto-saves to the active slot periodically.
• MANUAL SAVE: Tap "SAVE TO SLOT" and select one of six slots (1-6).
• CUSTOM LABELS: Tap EDIT on any slot to give it a name like "iron-fisted run" or "before the war." Labels persist across reloads.
• RELATIVE TIMESTAMPS: Slot cards show "Just now," "5 minutes ago," "Yesterday," etc., so you can tell saves apart at a glance.
• LOAD: Tap "LOAD SLOT" to restore a previous save. WARNING: This overwrites your current session.

The game is fully offline — no internet connection required. All data is stored locally on your device.

--- TIP ---
Use multiple save slots as insurance before risky decisions (declaring war on a faction, issuing controversial edicts, etc.).`,
      },
      {
        id: "gs-ticks",
        title: "The Tick System",
        tags: ["ticks", "time", "simulation", "offline"],
        related: ["gs-overview", "sea-overview"],
        body: `The game world advances in TICKS.

${REALTIME_CLOCK_EXPLANATION}

• TURN-BASED TURNS: one End Turn advances up to a full day (4 ticks) and stops early the moment a crisis needs your decision, so you never miss an emergency.

--- TICK PROCESSING ORDER ---

1. Resource production and consumption
2. Seasonal & weather modifier application
3. Population growth/decline
4. Crime, unrest, and happiness calculations
5. Building construction progress
6. Research progress
7. Officer competence effects
8. Faction loyalty/threat shifts
9. Random event rolls
10. Trade and economy updates
11. Military readiness changes
12. Season/weather state update for next tick

The EVENTS & REPORTS screen shows a log of what happened during each tick. Review it regularly to stay informed.`,
      },
      {
        id: "gs-action-costs",
        title: "Action Costs & Timing",
        tags: ["cost", "timing", "duration", "cooldown", "credits"],
        related: ["gs-ticks", "cm-resources", "law-edicts"],
        body: `${ACTION_COST_PLAYER_GUIDE}

--- BEFORE YOU CONFIRM ---

• Check UPFRONT COST against the current treasury.
• Check RUNNING COST for charges that repeat each active tick.
• Check ACTIVE FOR separately from COOLDOWN.
• For fixed-duration actions, MAXIMUM TOTAL COST combines the upfront charge and every scheduled running charge.
• If an action cannot be cancelled, or keeps charging when funds run short, the action card states that explicitly.`,
      },
      {
        id: "gs-commander",
        title: "Commander Profile",
        tags: ["commander", "profile", "attributes", "traits", "character"],
        related: ["off-inner-circle", "gs-overview"],
        body: `Your commander is a persistent character with stats that carry across cities and playthroughs.

--- ATTRIBUTES (scale 1-10) ---

• AUTHORITY — Leadership and control effectiveness.
• INTELLIGENCE — Research speed and problem-solving.
• CHARISMA — Faction negotiations and citizen morale.
• COMBAT — Military operations and defense.
• ENDURANCE — Resilience and crisis management.

Attributes are rolled during profile creation with bonus points to allocate. Your background faction grants starting bonuses (e.g., Law Enforcement grants +2 Law & Order, +1 Authority).

--- TRAITS ---

Choose up to 3 traits during creation from 24 available options:
Academy Graduate, Iron Will, Street Survivor, Corporate Exile, Born Leader, Ruthless Tactician, People's Champion, Shadow Operative, Engineering Prodigy, Medical Background, Propaganda Expert, Wasteland Scout, and more.

--- MULTIPLE PROFILES ---
You can maintain multiple commander profiles, each with their own saves and progression.`,
      },
    ],
  },
  {
    id: "city-management",
    title: "CITY MANAGEMENT",
    icon: "city-variant",
    iconSet: "mci",
    entries: [
      {
        id: "cm-overview",
        title: "City Stats Overview",
        tags: ["stats", "happiness", "unrest", "crime", "health"],
        related: ["cm-population", "cm-resources"],
        body: `Your city is measured by 10 primary statistics (0-100 scale):

--- POSITIVE STATS (higher = better) ---

HAPPINESS — Citizen satisfaction. Affected by food, water, housing, and entertainment. Below 40: unrest rises. Above 70: population growth bonus.

LAW & ORDER — Enforcement effectiveness. Increased by deploying enforcers and passing tough edicts. Reduces crime and unrest.

PUBLIC HEALTH — Population wellness. Affected by medical facilities, disease outbreaks, food quality, and environmental hazards.

INFRASTRUCTURE HEALTH — Physical condition of the city. Decays over time based on population pressure. Maintained by construction crews and funding.

DEFENSE RATING — Military preparedness. Determines resistance to external threats and faction uprisings.

EDUCATION — Literacy and skill level. Affects research speed, economic productivity, and officer quality.

BIOSPHERE — Environmental health. Affected by pollution, waste management, and green infrastructure.

--- NEGATIVE STATS (lower = better) ---

UNREST — Social instability. Driven by unhappiness, crime, corruption, and faction conflict. Above 60: riots possible. Above 80: civil war territory.

CRIME — Criminal activity level. Controlled by enforcers, patrols, surveillance, and law enforcement policies.

CORRUPTION — Government corruption level. Increases with certain officer traits and policies. Reduces credit income and citizen trust.`,
      },
      {
        id: "cm-population",
        title: "Population & Growth",
        tags: ["population", "growth", "citizens", "demographics"],
        related: ["cm-overview", "eco-income"],
        body: `Population is your most critical resource. Citizens work, pay taxes, and consume resources.

--- GROWTH FORMULA ---
Base Growth Rate x (Happiness / 50) x (Public Health / 50)

--- GROWTH ACCELERATORS ---
• High happiness (>70): Significant growth bonus
• Good public health (>70): Health bonus to growth
• Housing availability: More residential buildings = more capacity
• Immigration from allied townships

--- GROWTH PENALTIES ---
• Low happiness (<40): Growth stalls or reverses
• Disease outbreaks: Mass casualties
• Famine (food shortage): Population decline
• High unrest (>60): Emigration increases
• War casualties: Direct population loss

--- CITIZEN CLASSES ---
The city tracks 50+ demographic categories including employment, housing status, education level, and citizen class:
• UPPER — Wealthy elite. High tax contribution.
• PROFESSIONAL — Skilled workers. Research and administration.
• WORKING — Manual labour. Industry and construction.
• UNDERCLASS — Struggling citizens. High unrest contribution.
• DESTITUTE — No income, no housing. Crime and disease risk.`,
      },
      {
        id: "cm-resources",
        title: "Resources & Stockpiles",
        tags: ["resources", "credits", "food", "water", "power", "steel"],
        related: ["eco-trade", "cm-supply"],
        body: `--- PRIMARY RESOURCES ---

• CREDITS — Currency for all operations. Generated by taxes, trade, and companies.
• FOOD — Feeds the population. Consumption: ~0.01% of population per tick. Shortage causes happiness crash and population decline.
• WATER — Essential utility. Shortage causes disease outbreaks.
• POWER — Electricity for buildings and industry. Shortage cascades into production penalties.
• STEEL — Construction material. Required for most buildings and military equipment.
• GOODS — Consumer products. Affect happiness and trade revenue.
• FUEL — Military and vehicle operations. Shortage reduces army readiness.
• MEDICAL SUPPLIES — Healthcare operations. Shortage reduces public health.
• AMMO — Military ammunition. Required for combat operations and missions.

--- STOCKPILES ---
The game tracks 730+ individual commodities across categories including raw materials, refined goods, chemicals, electronics, military hardware, and luxury items. These are traded on the TRADE EXCHANGE.

--- UTILITY LAYER ---
Six utility systems operate with cascading penalties:
1. POWER — Electricity generation and distribution.
2. WASTE — Garbage and hazardous waste processing.
3. TRANSIT — Public transportation and logistics.
4. COMMUNICATIONS — Data and broadcast networks.
5. FUEL — Petroleum and energy distribution.
6. SANITATION — Water treatment and sewage.

If one system fails, others are affected. A power outage cascades into transit failures, communication blackouts, and water treatment shutdowns.`,
      },
      {
        id: "cm-supply",
        title: "Supply Chains & Production",
        tags: ["supply chain", "production", "recipes", "manufacturing", "industry"],
        related: ["cm-resources", "build-overview", "eco-trade"],
        body: `MEGACITY features 160+ production chain recipes connecting raw materials to finished goods.

--- HOW CHAINS WORK ---

Each production building takes INPUT commodities and produces OUTPUT commodities per tick. All buildings in the chain must be operational for the chain to function.

--- EXAMPLE CHAINS ---

• Iron Ore Mine → Metal Foundry → Steel Mill → Vehicle Assembly Plant → Military Vehicles
• Chemical Plant → Pharmaceutical Lab → Medical Supplies
• Agri-Dome → Food Processing Plant → Packaged Rations
• Silicon Quarry → Electronics Factory → Computer Components → AI Research Lab

--- CHAIN MANAGEMENT TIPS ---

• Check the ECONOMY screen for production bottlenecks.
• A single missing link breaks the entire chain downstream.
• Over-producing intermediary goods wastes building slots and power.
• Sell surplus intermediary goods on the Trade Exchange for extra income.
• Some chains have multiple paths — research unlocks alternative recipes.

--- INDUSTRIAL SUB-CATEGORIES ---
• General • Chemicals • Plastics • Raw Materials
• Finished Goods • Advanced Materials

--- TRACE ANY CHAIN ---

Open the PRODUCTION CHAINS screen (More menu) to pick any resource and see exactly which buildings produce it and which consume it, then tap an input or output to follow the chain up- or downstream.

--- TWO AMMO ECONOMIES (IMPORTANT) ---

MEGACITY has two separate "ammo" pools that are easy to confuse:
• AMMUNITION (ARMY) — a top-level supply your units spend in combat. Produced ONLY by MANNED military installations (Military screen), scaled by garrison coverage.
• AMMUNITION CRATES — a trade commodity made by civilian Ammunition Press Lines (Steel Ingot + Copper Ingot in, Crates out). These sit in your stockpiles for trade and do NOT refill the army ammo pool.`,
      },
      {
        id: "cm-policies",
        title: "Policies & Governance",
        tags: ["policies", "governance", "civil rights", "regulation"],
        related: ["law-edicts", "fac-overview"],
        body: `POLICIES are persistent governance settings that affect your city continuously (unlike edicts which are temporary).

--- POLICY CATEGORIES ---

• LAW ENFORCEMENT — Patrol intensity, surveillance level, use of force guidelines.
• CIVIL RIGHTS — Freedom of speech, assembly, privacy protections.
• HEALTH & SAFETY — Medical access, food quality standards, workplace safety.
• ECONOMY — Tax rates, trade regulation, corporate oversight.
• EDUCATION — Funding levels, curriculum control, research priorities.
• ENVIRONMENT — Emission limits, waste management standards.
• MILITARY — Conscription, weapons access, defense posture.
• IMMIGRATION — Border control, refugee acceptance, citizenship path.

--- POLICY EFFECTS ---

Each policy is a toggle or slider that adjusts multiple stats simultaneously. For example:
• Strict curfew: +Law & Order, -Happiness, -Civil Rights
• Open borders: +Population growth, +Diversity, -Security

Policies take several ticks to reach full effect — don't expect instant results.

--- BALANCING ACT ---
Authoritarian policies stabilize the city fast but breed long-term resentment. Liberal policies keep citizens happy but make crises harder to control. Your background faction and commander traits influence which policies are most effective.`,
      },
      {
        id: "cm-software",
        title: "City Software Upgrades",
        tags: ["software", "upgrades", "automation", "AI"],
        related: ["res-overview", "cm-overview"],
        body: `City Software Upgrades represent your administration's digital infrastructure — 20 upgrades across 8 categories, each with 3 tiers.

--- CATEGORIES ---

• RESOURCE MANAGEMENT — Automated stockpile optimization.
• SECURITY ANALYTICS — Predictive crime modeling.
• ECONOMIC MODELING — Revenue forecasting and trade AI.
• POPULATION TRACKING — Demographic analysis and census.
• INFRASTRUCTURE MONITORING — Predictive maintenance.
• RESEARCH COORDINATION — Multi-project management.
• COMMUNICATIONS — Broadcast and surveillance networks.
• MILITARY SYSTEMS — Tactical AI and logistics.

--- TIER PROGRESSION ---

• Tier 1: Basic functionality. Low cost.
• Tier 2: Enhanced capabilities. Moderate cost, requires Tier 1.
• Tier 3: Full automation. High cost, requires Tier 2.

Each tier provides cumulative bonuses. Tier 3 upgrades can significantly reduce micromanagement — automated systems handle routine decisions while you focus on strategy.`,
      },
      {
        id: "cm-civil-service",
        title: "Civil Service Functions",
        tags: ["bureaucracy", "government", "administration"],
        related: ["gs-overview", "off-overview"],
        body: `Administration supports taxation, licensing, budgeting, and regulation.

--- FUNCTIONS ---
• Maintains city services during crises.
• Processes policy implementation and department staffing.
• Provides operational continuity for appointed leadership.`,
      },
    ],
  },
  {
    id: "economy",
    title: "ECONOMY & FINANCE",
    icon: "trending-up",
    iconSet: "feather",
    entries: [
      {
        id: "eco-income",
        title: "Income & Expenditure",
        tags: ["income", "taxes", "expenses", "budget", "p&l"],
        related: ["eco-trade", "eco-banking", "eco-companies"],
        body: `--- INCOME SOURCES ---

• TAX REVENUE — Primary income. Based on population, employment rate, and tax policies.
• TRADE INCOME — Generated by trade routes and commodity sales on the Exchange.
• TOURISM — Tourist buildings generate passive income based on happiness and safety.
• COMPANY LICENSING — 100 licensed corporations pay licensing fees.
• CONTRACT FEES — Completed contracts generate revenue.

--- EXPENDITURES ---

• UNIT UPKEEP — All deployed units (enforcers, soldiers, droids) have ongoing costs.
• BUILDING MAINTENANCE — Infrastructure upkeep. Underfunding causes decay.
• OFFICER SALARIES — Government officials draw salaries.
• SUPPLY COSTS — Food, medical, and material procurement.
• RESEARCH FUNDING — Active research projects consume credits.

--- MONITORING ---
The ECONOMY screen shows a detailed Profit & Loss statement. The TRENDS tab shows sparkline charts tracking credits, population, happiness, crime, and more over the last 50 ticks. Monitor it regularly to catch deficits early.`,
      },
      {
        id: "eco-trade",
        title: "Trade Exchange & Commodities",
        tags: ["trade", "commodities", "exchange", "buy", "sell"],
        related: ["eco-income", "cm-supply", "wm-water"],
        body: `The TRADE EXCHANGE is a dynamic commodity market where you buy and sell 730+ goods.

--- PRICE MECHANICS ---
Prices fluctuate based on supply and demand. Selling large quantities drives the price down. Buying drives it up.

--- TRADE ROUTES ---
Establish routes with allied townships and megacities for passive income. Route safety depends on the danger level of connecting paths (check the world map).

--- WATER RESTRICTIONS ---
4 townships across water (Port Sulphur, Sunken Arcadia, Mireholm, Greywater) require special infrastructure before trade can begin — port facilities, ferry services, bridge construction, or air freight technology.

--- AUTO-TRADING ---
The Resource Trading AI can be configured to automatically buy critical resources when stocks are low and sell surplus goods for profit.

--- BLACK MARKET ---
For goods that can't be traded legally — illegal weapons, contraband, restricted technology. Higher margins but increased crime and corruption risk.`,
      },
      {
        id: "eco-banking",
        title: "Banking & Loans",
        tags: ["banking", "loans", "savings", "interest", "finances"],
        related: ["eco-income"],
        body: `The FINANCES & BANKING screen provides access to two banks:

--- SAVINGS ACCOUNT ---
Deposit credits to earn interest. Safe but low returns. Interest calculated per tick based on your credit rating.

--- LOANS ---
Borrow credits at interest rates that vary by loan tier:
• Small loans: Low interest, fast approval.
• Medium loans: Moderate interest, reasonable terms.
• Large loans: High interest, strict repayment schedule.

Repayment is automatic over a fixed term.

--- CREDIT RATING ---
Your credit rating affects interest rates on both savings and loans. Maintained by:
• Timely loan repayment
• Positive cash flow
• Low corruption

--- DIPLOMATIC TRANSFERS ---
Send credits to factions or allied cities as diplomatic gestures. Improves relations but costs you money.

--- WARNING ---
Defaulting on loans triggers severe penalties — credit rating drops, interest rates increase, and diplomatic standing suffers.`,
      },
      {
        id: "eco-companies",
        title: "Corporations & Licensing",
        tags: ["companies", "corporations", "licensing", "business"],
        related: ["eco-income", "eco-trade"],
        body: `100 licensed corporations operate within MEGACITY, each contributing to the economy.

--- COMPANY TYPES ---
Corporations span multiple sectors: manufacturing, services, technology, finance, media, security, and logistics.

--- LICENSING SYSTEM ---
• Each corporation pays a licensing fee to operate.
• License revenue scales with the company's success.
• Companies grow or shrink based on economic conditions.
• Revoking licenses hurts revenue but gives political leverage.

--- COMPANY EFFECTS ---
Active corporations provide:
• Employment for citizens
• Tax revenue from operations
• Commodity production
• Faction influence (some companies are faction-aligned)

--- CORPORATE FACTION ---
The Corporate faction's power is directly tied to the health and number of active corporations. Strong corporate presence means more credits but also more corporate political influence.`,
      },
      {
        id: "eco-processed-food",
        title: "Food Security",
        tags: ["food", "rations", "stockpiles"],
        related: ["cm-resources", "gs-first-steps"],
        body: `Food is consumed every tick and shortages reduce city stability.

--- OPERATIONS ---
• Maintain production and reserve stockpiles.
• Distribute food during disasters and mobilization.
• Monitor the resource panel for consumption and shortages.`,
      },
    ],
  },
  {
    id: "law-security",
    title: "LAW & SECURITY",
    icon: "gavel",
    iconSet: "mci",
    entries: [
      {
        id: "law-overview",
        title: "Law Enforcement Overview",
        tags: ["law", "enforcers", "crime", "security"],
        related: ["law-edicts", "law-gangs", "law-prison"],
        body: `As Commander, maintaining law and order is fundamental to city stability.

--- ENFORCEMENT UNITS ---

• PATROL ENFORCERS — Baseline law enforcement. Deploy in batches of 10.
• ROOKIE CADETS — Cheaper but less effective trainee enforcers.
• SENIOR ENFORCERS — Experienced officers with higher effectiveness.
• ELITE STRIKE TEAMS — Specialist units for high-threat operations.
• STREET PATROL UNITS — Beat cops for neighbourhood coverage.
• SECTOR LAW SQUADS — Mobile response teams.

--- RIOT CONTROL ---

• RIOT POLICE SQUADS — Standard crowd control.
• RIOT SHIELD UNITS — Defensive formation specialists.
• CROWD DISPERSAL TEAMS — Non-lethal crowd management.
• HEAVY RIOT MECH UNITS — Armoured suppression platforms.
• RIOT DRONE SQUADS — Aerial crowd monitoring and control.
• TACTICAL SUPPRESSION TEAMS — Advanced riot response.

--- SURVEILLANCE ---

• Surveillance Drones — Aerial monitoring.
• Patrol Drones — Automated patrols.
• Investigative Drones — Crime scene analysis.

--- CRIME FORMULA ---
Crime growth = (100 - LawOrder) x 0.05 + (Unrest x 0.02)
More enforcers and surveillance reduce crime. High unrest and low happiness increase it.`,
      },
      {
        id: "law-edicts",
        title: "Edicts",
        tags: ["edicts", "orders", "decrees", "policies"],
        related: ["cm-policies", "law-overview"],
        body: `EDICTS are one-time orders with temporary effects and cooldowns. 46+ edicts available.

--- EDICT PROPERTIES ---

• COST — Credits required to issue.
• DURATION — How many ticks the effect lasts.
• COOLDOWN — How many ticks before it can be reissued after expiry.
• EFFECTS — Stat changes while active.

--- EXAMPLES ---

• CURFEW — Reduces crime but damages happiness.
• MARTIAL LAW — Maximum law enforcement but severe happiness penalty.
• TAX HOLIDAY — Boosts happiness but eliminates tax revenue.
• EMERGENCY RATIONS — Prevents starvation but depletes food stockpiles.
• PROPAGANDA BROADCAST — Boosts loyalty but costs credibility.
• AMNESTY DECREE — Reduces prison overcrowding but releases criminals.

--- STACKING ---
Edicts stack — you can have multiple active simultaneously, but watch for conflicting effects. Running CURFEW and TAX HOLIDAY together is counterproductive.`,
      },
      {
        id: "law-gangs",
        title: "Gangs & Organised Crime",
        tags: ["gangs", "organized crime", "criminal", "threat", "contraband"],
        related: ["law-overview", "law-prison"],
        body: `MEGACITY's underworld consists of 50 named gangs operating across the city.

--- GANG TYPES ---

• Street Gangs — Territory-based. Fight over districts.
• Syndicates — Organised crime networks. Run protection rackets.
• Mercenary Groups — Guns for hire. Sometimes useful, always dangerous.
• Organised Crime — Drug production, trafficking, corruption.
• Specialist Crews — Heist teams, hackers, infiltrators.

--- THREAT LEVELS (1-5) ---

• Level 1-2: Minor nuisance. Standard patrols suffice.
• Level 3: Significant threat. Requires dedicated enforcement.
• Level 4: Major threat. Deploy strike teams.
• Level 5: Critical. City-wide impact. Immediate action required.

--- CONTRABAND REGISTRY ---
50 contraband items tracked by the Contraband Registry. Field Operations can target specific contraband types for seizure. Categories include weapons, narcotics, counterfeit goods, restricted technology, and banned media.

--- GANG DYNAMICS ---
Gangs grow when crime is high and law enforcement is weak. They shrink when you crack down. But eliminating one gang can create a power vacuum that allows others to expand.`,
      },
      {
        id: "law-gang-lore",
        title: "Gang Threat Tiers",
        tags: ["gangs", "wasteland", "raider", "intelligence", "threat"],
        related: ["law-gangs", "wm-overview", "wm-expeditions"],
        body: `Gang records identify current threat level and known operating area.

--- GANG TIERS ---

• STANDARD GANGS — Street-level operations. Nuisance to moderate threat.
• ELITE GANGS — Organised, well-armed, and politically connected. Serious threat.
• LEGENDARY GANGS — City-wide impact. Critical threat level.

Use current threat and location data when assigning enforcement operations.`,
      },
      {
        id: "law-prison",
        title: "Prison System",
        tags: ["prison", "custody", "solitary", "detention"],
        related: ["law-overview"],
        body: `Arrested citizens are placed in custody. Prison capacity is determined by your detention infrastructure:

• SOLITARY DETENTION BLOCKS — Each block holds 1,500 prisoners.
• MEGA-PRISON COMPLEXES — Each complex holds 8,000 prisoners.

--- CAPACITY MANAGEMENT ---
If prison population exceeds capacity, overflow penalties apply:
• Increased crime (prisoners released early)
• Increased unrest (overcrowding protests)
• Potential prison riots

--- MONITORING ---
Monitor the custody count on the Law Overview screen. Build additional detention facilities as your enforcement effectiveness increases.

--- TIP ---
High imprisonment rates mean your law enforcement is working but also mean you have an underlying crime problem to address. Address root causes (unemployment, low happiness, gang presence) to reduce the need for mass incarceration.`,
      },
    ],
  },
  {
    id: "military",
    title: "MILITARY & DEFENSE",
    icon: "tank",
    iconSet: "mci",
    entries: [
      {
        id: "mil-overview",
        title: "Military Overview",
        tags: ["military", "army", "defense", "combat", "units"],
        related: ["mil-missions", "mil-ordnance", "mil-bodyguard"],
        body: `The military screens manage your city's armed forces, defensive capabilities, and offensive operations.

--- STANDING ARMY ---

• Infantry — Ground troops. Backbone of the army.
• Armor — Tanks and APCs. 3x combat power of infantry.
• Artillery — Long-range fire support. 4x combat power.
• Air Support — Aircraft and gunships. 5x combat power.
• Special Ops — Elite operatives. 2x combat power.
• Support — Logistics, medical, engineering.

--- ARMY STRENGTH ---
Infantry + (Armor x 3) + (Artillery x 4) + (Air x 5) + (SpecOps x 2) + Support

--- READINESS (0-100%) ---
Your army's combat effectiveness. Decreases when:
• Fuel is short (up to -4/tick)
• Ammo is short (up to -4/tick)
• Rations are short (up to -4/tick)

Low readiness severely impacts mission success rates. An army at 90% readiness at half strength beats a full army at 30% readiness.`,
      },
      {
        id: "mil-missions",
        title: "Military Missions",
        tags: ["missions", "operations", "deployment", "combat"],
        related: ["mil-overview", "off-overview"],
        body: `Deploy your forces on various mission types.

--- SUCCESS FORMULA ---
Success Chance = min(90%, 50 + Readiness x 0.3 - Difficulty x 5)

--- MISSION TYPES ---
Intelligence gathering, combat patrols, offensive strikes, defensive operations, and humanitarian assistance.

--- CASUALTIES ---
• Failed missions: 5-25 KIA (killed in action).
• Successful missions: Light casualties possible.

--- OFFICER MISSIONS ---
Officers can be deployed on specialised missions — intelligence ops, diplomatic missions, and combat leadership. Officer competence affects success rates. 10 mission types available.

--- WAR ROOM ---
The War Room provides access to strategic operations — large-scale offensive and defensive moves that cost significant resources but provide major defense bonuses.

--- DROID UNITS ---
20 types of autonomous military drones available. Droids don't suffer morale penalties but require power and maintenance. Effective for hazardous operations where human casualties are unacceptable.`,
      },
      {
        id: "mil-ordnance",
        title: "Ordnance & Weapons",
        tags: ["weapons", "ordnance", "ammo", "armaments"],
        related: ["mil-overview", "cm-supply"],
        body: `Your military maintains an extensive weapons inventory.

--- WEAPON CATEGORIES ---
Small arms, heavy weapons, special weapons, and vehicle-mounted systems.

--- ORDNANCE TYPES ---
• Kinetic — Conventional ballistic weapons.
• Thermal — Heat-based weapons and incendiaries.
• Chemical — Gas and area-denial weapons.
• Nuclear — Strategic deterrent. Politically catastrophic if used.
• Experimental — Prototype weapons from research.

--- PRODUCTION ---
Military goods are produced by dedicated buildings:
• Ammunition Press Lines — Produce ammo
• Small Arms Factories — Produce basic weapons
• Energy Weapon Forges — Produce advanced energy weapons

--- VEHICLE WEAPONS ---
Tanks and vehicles mount specific weapon systems — cannons, machine guns, missile systems, rockets, and experimental weapons. Each has damage, range, and cost ratings.`,
      },
      {
        id: "mil-bodyguard",
        title: "Bodyguard Retinue",
        tags: ["bodyguard", "retinue", "personal guard", "protection"],
        related: ["mil-overview", "gs-commander"],
        body: `Your personal bodyguard retinue consists of elite operatives assigned to protect and assist the Commander.

--- OPERATIVE CLASSES ---

• SHIELD — Close protection specialists. High defense.
• SHADOW — Covert operatives. Intelligence gathering.
• BLADE — Combat specialists. High offense.
• TECH — Technical experts. Electronic warfare.
• MEDIC — Field medics. Emergency response.

--- SLOTS ---
Maximum 6 bodyguard slots. Each operative occupies one slot.

--- RECRUITMENT ---
Bodyguards are recruited from the officer pool or discovered through events. High-quality operatives are rare.

--- CLONING PATH ---
Advanced technology allows cloning of bodyguard operatives — producing duplicates of your best operatives. Requires Tier 4+ genetics research.

--- BENEFITS ---
Active bodyguards provide passive bonuses to the commander and affect event outcomes. Some events reference your retinue directly.`,
      },
    ],
  },
  {
    id: "factions",
    title: "FACTIONS & DIPLOMACY",
    icon: "sword-cross",
    iconSet: "mci",
    entries: [
      {
        id: "fac-overview",
        title: "Faction System",
        tags: ["factions", "loyalty", "threat", "influence", "politics"],
        related: ["fac-diplomacy"],
        body: `Faction screens track influence, loyalty, threat, leaders, infrastructure, and available actions.

--- FACTION STATS ---

• INFLUENCE (0-100) — Political power within the city.
• LOYALTY (0-100) — Allegiance to your administration.
• THREAT (0-100) — Danger level to city stability.

--- ACTIONS ---

The Factions Terminal exposes 12 sandbox actions per faction, grouped by category. Quick verbs stay one tap away; the rest live behind MORE ACTIONS.

DIPLOMATIC (carrots, ceremony):
• NEGOTIATE — Open channels. +10 Loyalty, -5 Threat. Free.
• HOST BANQUET — Personal charm. +12 Loyalty, +3 Influence. 4,000c.
• GRANT HONOR — Title or medal. +10 Loyalty, +5 Influence. 2,500c.

ECONOMIC (credits, concessions):
• FUND (Corporate only) — +15 Loyalty, +5 Influence, -3 Threat. 5,000c.
• TAX CONCESSION — Cut their levies. +10 Loyalty, -3 Threat. 3,000c.
• SEIZE ASSETS — Confiscate property. -15 Loyalty, +8 Influence, +12 Threat. Free.

COVERT (deniable, dirty):
• PLANT INFORMANT — +6 Influence, +4 Threat. 3,500c.
• SPREAD RUMORS — -8 Loyalty, +4 Influence. 1,500c.
• ARRANGE ACCIDENT — Eliminate leadership. -22 Loyalty, +4 Influence, -10 Threat. 8,000c.

HOSTILE (loud, public):
• SUPPRESS — -10 Influence, +15 Threat. Free.
• ARREST LEADERS — -20 Loyalty, +12 Influence, +8 Threat. 6,000c.
• PURGE — Liquidate command structure. -40 Loyalty, +20 Influence, +25 Threat. 12,000c.

--- CIVIL WAR ---
If Threat exceeds 80 and Loyalty drops below 20:
• BREWING: 8 ticks of rising tension.
• ACTIVE: 40-80 ticks of combat. +3 Unrest/tick, +2 Crime/tick.
• CEASEFIRE: 8 ticks of negotiation.
• RESOLVED: War ends. Lasting consequences.`,
      },
      {
        id: "fac-diplomacy",
        title: "Diplomacy & External Relations",
        tags: ["diplomacy", "agreements", "megacities", "alliances"],
        related: ["fac-overview", "wm-overview"],
        body: `Beyond internal factions, MEGACITY maintains diplomatic relationships with external entities.

--- EXTERNAL MEGACITIES ---
12 other mega-cities exist in the world. Each has its own government, military strength, and diplomatic stance. Available agreements:
• Trade agreements (passive income)
• Non-aggression pacts (security)
• Alliances (mutual defense)
• Technology sharing (research boost)

--- TOWNSHIPS ---
33+ smaller settlements scattered across the wasteland. Many start undiscovered. Townships can become:
• TRADE PARTNERS — Passive income from trade routes.
• ALLIES — Military cooperation and mutual defense.
• VASSALS — Under your control, providing resources.

--- DIPLOMATIC ACTIONS ---
The Diplomacy Terminal offers communication, trade, intelligence, military, and aid actions — each requiring different levels of influence and credits.

--- REPUTATION ---
Breaking agreements has severe reputation consequences. Your reputation score (0-100, grades S through F) is calculated from happiness, crime control, stability, faction relations, employment, tech progress, and population growth.`,
      },
    ],
  },
  {
    id: "world-map",
    title: "WORLD MAP",
    icon: "map",
    iconSet: "feather",
    entries: [
      {
        id: "wm-overview",
        title: "Exploring the Wasteland",
        tags: ["world map", "exploration", "locations", "discovery", "americas", "north america"],
        related: ["wm-terrain", "wm-weather", "wm-water"],
        body: `The WORLD MAP renders the post-collapse Americas — coastlines drawn from real geography, redrawn by climate shift and centuries of war. MEGACITY sits somewhere on the North American landmass, surrounded by 203 settlements, ruins, and contested zones.

--- LOCATION TYPES ---

• PLAYER CITY — Your megacity (green marker with glow).
• MEGACITIES — Other major cities (blue markers).
• NATIONS — Regional powers (orange markers).
• TOWNSHIPS — Small settlements (faded green markers).
• NOTABLE LOCATIONS — Points of interest (grey markers).
• RESOURCE NODES — Exploitable resource sites (gold diamonds).

--- DISCOVERY ---
Most locations start undiscovered and hidden by fog of war. Discover by sending expeditions, establishing trade routes, or researching exploration technologies.

--- ROUTES ---
Connected locations are linked by routes. Route safety ranges from SAFE (green) to HOSTILE (red). Hostile routes cost more to traverse and risk caravan losses.

--- MINIMAP ---
The tactical overview in the corner shows all discovered locations at a glance, color-coded by terrain type for quick geographic reference.

--- SOUTHERN CONTINENT ---
South America is rendered on the map but presently uninhabited — labeled UNDER DEVELOPMENT in-world. No active settlements, routes, or expeditions reach it yet. Future content will open the southern landmass for exploration and conquest.

The map covers the full Americas continent, with all 203 active locations distributed across North America. New Game offers 12 starting regions — preset spawn zones, each placed on the same map but with their own faction terrain and starting bonuses.

--- LOCATION ACTIONS ---

Beyond the core SCOUT, TRADE, AID, and RAID convoy missions, the selected-location panel exposes 5 sandbox verbs against any discovered non-player location. These are deterministic — no weather, no encounter rolls — and feed straight into the relation ledger.

MILITARY:
• BOMBARD — Long-range artillery strike. -30 disposition, +1 raid count, posts to news ticker. 12,000c, 30 ammo. Hostile/neutral only, target must have population.
• BLOCKADE — Choke supply lines. -15 disposition, +1 raid count, posts to news ticker. 6,000c. Hostile/neutral only.

COVERT:
• INFILTRATE — Plant agents. -5 disposition, +2 scout count, 65% chance to reveal one connected undiscovered location. 7,500c.
• INSTIGATE REVOLT — Foment rebellion against the local faction. -40 disposition, +1 raid count, posts to news ticker. 9,000c. Hostile only.

SETTLEMENT:
• SETTLE OUTPOST — Establish a forward base. +35 disposition, +1 aid count. 25,000c. Cannot be hostile, target population must be under 500,000.

All sandbox verbs cost credits up front, validate eligibility before charging, and leave state untouched on failure.`,
      },
      {
        id: "wm-terrain",
        title: "Terrain & Geography",
        tags: ["terrain", "geography", "landscape", "environment"],
        related: ["wm-overview", "wm-weather"],
        body: `Every location has a terrain classification that affects gameplay and trade.

--- TERRAIN TYPES (18) ---

URBAN — Dense metropolitan areas. High population, infrastructure.
COASTAL — Shoreline settlements. Port access, fishing, trade bonus.
RIVERINE — River-adjacent. Fresh water access, agriculture bonus.
LAKESIDE — Near lakes. Water supply, mild climate.
SUBMERGED — Partially underwater. Unique challenges, isolation.
SUBTERRANEAN — Underground cities. Protected but claustrophobic.
ELEVATED — High ground. Defensive advantage, thin air.
MOUNTAIN — Peak settlements. Extreme defense, limited access.
WASTELAND — Irradiated zones. Dangerous but resource-rich.
DESERT — Arid regions. Water scarcity, solar potential.
VOLCANIC — Near active volcanoes. Geothermal power, eruption risk.
SWAMP — Wetlands. Disease risk, difficult construction.
FOREST — Dense vegetation. Renewable resources, concealment.
PLAINS — Open flatlands. Agriculture, easy construction.
CANYON — Deep gorges. Natural fortification, limited expansion.
OFFSHORE — Ocean-based. Ship access only, naval power.
MOBILE — Moving settlements (The Silent Ark). Ever-shifting location.
ORBITAL — Space-based. Requires advanced technology to reach.

--- MAP VISUALIZATION ---
The minimap uses terrain-tinted dots for quick identification. Main map nodes show colored glow rings indicating terrain type. Coastal areas appear blue, volcanic zones red, forests green, and so on.`,
      },
      {
        id: "wm-weather",
        title: "Environmental Hazards",
        tags: ["weather", "radiation", "hazards", "environment", "storms"],
        related: ["wm-overview", "sea-overview"],
        body: `The wasteland is not safe. Environmental hazard zones are marked on the world map:

--- HAZARD TYPES ---

RADIATION STORMS — Zones of lingering radioactive fallout. Dangerous to traverse. Equipment degradation.

DUST CLOUDS — Massive dust storms that reduce visibility and damage vehicles. Some are permanent atmospheric features.

ACID RAIN — Corrosive precipitation zones along the western coast. Damages exposed infrastructure and personnel.

ELECTROMAGNETIC FIELDS — Zones where electronics malfunction. Drones and communications equipment fail.

ASHFALL — Volcanic or industrial ash zones in the east. Respiratory hazards and reduced agricultural productivity.

TOXIC FOG — Chemical pollution zones, usually near industrial ruins. Severe health hazards.

--- INTENSITY RATINGS ---
Each hazard zone has an intensity (Low, Medium, High) that determines severity. Plan routes around high-intensity zones when possible.

--- WEATHER STATION PRIME ---
A notable location on the world map. Pre-war automated weather control. Still influences local patterns. Securing it could provide strategic advantages.`,
      },
      {
        id: "wm-water",
        title: "Cross-Water Trade Routes",
        tags: ["water", "trade", "port", "ferry", "bridge", "shipping"],
        related: ["eco-trade", "wm-overview", "wm-terrain"],
        body: `Some townships and locations lie across bodies of water, requiring special infrastructure before trade can be established.

--- WATER-BLOCKED SETTLEMENTS ---

• PORT SULPHUR — Coastal industrial settlement.
• SUNKEN ARCADIA — Partially submerged resort on rafts.
• MIREHOLM — Swamp settlement accessible only by water.
• GREYWATER — River delta community.

--- REQUIRED INFRASTRUCTURE ---

To unlock cross-water trade routes, you need at least one of:
• Port/ferry/bridge construction technology
• Skyport Landing Platforms (air freight)
• Cargo Freight Megaways (heavy logistics)

--- WHY IT MATTERS ---
Water-blocked settlements often have unique trade goods unavailable elsewhere. Port Sulphur's industrial output and Sunken Arcadia's salvage operations are particularly valuable once access is established.`,
      },
      {
        id: "wm-expeditions",
        title: "Wasteland Expeditions",
        tags: ["expeditions", "scavenging", "wasteland", "exploration"],
        related: ["wm-overview", "wm-resources"],
        body: `Send teams into the wasteland to scavenge resources, discover locations, and retrieve pre-war technology.

--- SUCCESS FORMULA ---
Success Chance = max(20%, 85 - DangerLevel + DefenseRating x 0.2)

--- EXPEDITION TYPES ---
10+ templates including salvage runs, recon missions, artifact retrieval, and rescue operations.

--- REQUIREMENTS ---
• Personnel — Troops or specialists.
• Equipment — Vehicles, supplies, weapons.
• Funding — Credits for fuel, hazard pay, and equipment.

--- REWARDS ---
Rare commodities, technology blueprints, new location discoveries, and unique items.

--- PENDING LOOT ---
When your inventory is full and an expedition discovers loot, items are placed in the PENDING LOOT queue instead of being lost. You can:
• CLAIM — Move the item to your inventory (requires a free slot).
• SCRAP — Convert the item to credits based on its rarity value.
• DISCARD — Remove the item permanently.
Pending loot persists until you deal with it — your expeditions will never lose valuable finds again.

--- LOOT RARITY ---
• COMMON — Basic supplies. Moderate scrap value.
• UNCOMMON — Useful finds. Decent scrap value.
• RARE — Significant discoveries. Good scrap value.
• EPIC — Exceptional artifacts. High scrap value.
• LEGENDARY — One-of-a-kind relics. Extraordinary scrap value.

--- RISK ---
Failed expeditions result in casualties and lost equipment. Higher danger areas yield better rewards but with greater risk. Expeditions have approximately a 60% return rate — the 40% that don't return found something interesting. Or something interesting found them.`,
      },
      {
        id: "wm-resources",
        title: "Resource Nodes",
        tags: ["resource nodes", "mining", "extraction", "survey"],
        related: ["wm-overview", "cm-resources"],
        body: `Resource nodes are discoverable sites on the world map that can be surveyed and exploited for ongoing per-tick resource income.

--- NODE TYPES ---

• SCRAP — Salvageable materials. Steel, components.
• FUEL — Petroleum and chemical deposits.
• HUNTING GROUNDS — Wildlife. Food supply.
• FLORA — Plants and herbs. Medical supplies.
• MINERALS — Rare earth minerals. Electronics, trade goods.
• WATER — Clean water sources. Essential utility.
• SALVAGE TECH — Pre-war technology caches.
• BIO-SPECIMENS — Genetic samples. Research materials.

--- RICHNESS LEVELS ---
Each node has a richness rating (Poor, Moderate, Rich, Exceptional) that multiplies its yield.

--- SURVEYING ---
Nodes must be surveyed before exploitation begins. Surveying reveals the exact yield, depletion rate, and any hazards. Some nodes are renewable (never deplete), while others exhaust over time.

--- EXPLOITATION ---
Once surveyed, assign workers and equipment to begin extraction. Output is added to your stockpiles each tick.`,
      },
      {
        id: "wm-cheyenne",
        title: "USR — United States Remnants",
        tags: ["cheyenne mountain complex", "united states remnants", "usr", "bunker", "colorado"],
        related: ["wm-overview"],
        body: `Restricted world-map location.

--- STATUS ---
The marker is hidden until its location is discovered. Clearance determines the operational detail shown in its intelligence report.

--- ACCESS ---
Sealed facility. No trade, expedition, diplomacy, or entry action is available.`,
      },
      {
        id: "wm-grand-canyon",
        title: "Grand Canyon — Notable Marker",
        tags: ["grand canyon", "notable", "canyon", "arizona", "geography"],
        related: ["wm-overview", "wm-terrain"],
        body: `The Grand Canyon survives. Wider than it was, deeper than it was, and as empty of human settlement as it was when it was first surveyed.

--- TERRAIN ---
Canyon. Natural fortification. Limited expansion. Population: 0.

--- STATUS ---
Marked on the world map as a notable geographic feature, discovered by default. No faction claims the canyon. No township sits on its rim. Caravan routes give it a wide berth — the canyon walls echo, and what comes back is not always the original sound.

--- WHY IT MATTERS ---
A landmark, a navigational reference, and a reminder that the world had geography before it had factions. Future content may open the canyon for expedition or settlement. For now: a line on the map and a long drop.`,
      },
    ],
  },
  {
    id: "officers",
    title: "OFFICERS & PERSONNEL",
    icon: "account-tie",
    iconSet: "mci",
    entries: [
      {
        id: "off-overview",
        title: "Officer System",
        tags: ["officers", "departments", "competence", "appointment"],
        related: ["off-inner-circle", "off-spy"],
        body: `166 officer positions exist across 11 departments. Officers directly affect city performance.

--- DEPARTMENTS ---
Infrastructure, Economic, Law Enforcement, Defense, Civic, Research, Judicial, Executive, District, Advisory, Intelligence.

--- OFFICER STATS ---

• RANK — Cadet → Officer → Senior → Commander → Chief Director
• COMPETENCE (0-100) — Skill level. Affects department performance.
• LOYALTY (0-100) — Allegiance to you personally.
• CORRUPTION (0-100) — How corrupt they are.
• TRAITS — Special characteristics (tech_savvy, negotiator, survivalist, charismatic, cynic, corrupt, efficient, etc.)

--- COMPETENCE EFFECTS ---

• Department Competence > 50: City receives bonuses.
  A strong Economic department adds credit income that scales with competence.
• Department Competence < 40: Penalties apply.

--- CORRUPTION ---
Officers with high corruption cause "Officer Graft" — credit leakage of 50 + (corruption x 2) credits per tick.

Efficient officers add a flat credit-income bonus.

--- APPOINTMENT METHODS ---

• DIRECT — You assign them personally. Fast but +Corruption risk.
• COMPETITIVE — Merit-based selection. Slower but higher quality.
• POLITICAL — Faction-influenced. Builds loyalty, may compromise competence.

--- SANDBOX ACTIONS ---

The Officer Lobby exposes 8 sandbox verbs against any appointed officer, on top of CONSULT and RELIEVE OF DUTY. Quick verbs stay one tap away; the rest live behind MORE ACTIONS, grouped by category.

REWARD (carrots, money):
• PROMOTE — Advance one rank. +8 LOY, +5 AMB, +5 POP. 4,000c. Requires Competence ≥ 50 and not already at top rank.
• DECORATE — Public ceremony, medal. +12 LOY, +10 POP. 2,500c.
• BRIBE — Quiet envelope. +15 LOY, +8 CORPT. 6,000c.

DISCIPLINE (sticks, public):
• REPRIMAND — Formal warning. -10 AMB, -5 POP, +4 LOY (fear), +6 FEAR. Free.
• DEMOTE — Strip one rank. -15 LOY, -12 AMB, -8 POP. Free. Requires not at bottom rank.

COVERT (knives in the dark):
• INVESTIGATE — Internal Affairs probe. -12 CORPT, -6 LOY, +4 FEAR. 3,000c. Requires Corruption ≥ 15 (need cause).
• BLACKMAIL — Use what you know. +18 LOY, -8 AMB, +5 CORPT. 4,500c. Requires Corruption ≥ 20 (need leverage).

REMOVAL (burn the seat, send a message):
• EXILE — Permanent removal. Vacates seat. Ripples +4 FEAR, -2 AMB to every other appointed officer. 5,000c.`,
      },
      {
        id: "off-inner-circle",
        title: "Inner Circle",
        tags: ["inner circle", "advisors", "whispers", "loyalty"],
        related: ["off-overview", "gs-commander"],
        body: `Your most trusted officers form the INNER CIRCLE — a small group of advisors with direct access to you.

--- ROLES ---
Chief Advisor, Spymaster, War Minister, and other key positions. Each role provides specific bonuses and generates unique intelligence.

--- WHISPERS ---
Your inner circle feeds you information about the city:
• LOW LOYALTY warnings
• HIGH CORRUPTION alerts
• HIGH AMBITION notices
• RIVALRY between officers
• GENERAL intelligence

These whispers appear in your inbox tagged as "intel" priority.

--- XP & LEVELING ---

• Chief Advisor: 8 XP/tick
• Spymaster: 6 XP/tick
• Other roles: 4-5 XP/tick

Leveling up unlocks enhanced bonuses. Higher-level advisors provide better intelligence quality and more frequent warnings.`,
      },
      {
        id: "off-spy",
        title: "Spy Operations",
        tags: ["spy", "espionage", "intelligence", "covert", "sabotage"],
        related: ["off-overview", "fac-overview"],
        body: `100 spy operations are available for covert intelligence and sabotage activities.

--- OPERATION CATEGORIES ---

• RECONNAISSANCE — Gather intelligence on factions and settlements.
• INFILTRATION — Plant agents within enemy organisations.
• SABOTAGE — Disrupt enemy operations and infrastructure.
• COUNTER-INTELLIGENCE — Detect and neutralize enemy spies.
• PROPAGANDA — Influence public opinion and faction loyalty.
• ASSASSINATION — High-risk targeted elimination.

--- REQUIREMENTS ---
Each operation requires specific officer skills, time, and resources. Success chance depends on:
• Officer intelligence rating
• Target's counter-intelligence capability
• Your espionage technology level

--- CONSEQUENCES ---
Failed operations can be traced back to you, causing diplomatic incidents. Successful operations may remain undetected or be attributed to other parties.

--- TIP ---
Invest in the Intelligence department and appoint a competent Spymaster to your Inner Circle before relying heavily on spy operations.`,
      },
    ],
  },
  {
    id: "research",
    title: "RESEARCH & TECHNOLOGY",
    icon: "cpu",
    iconSet: "feather",
    entries: [
      {
        id: "res-overview",
        title: "Technology Tree",
        tags: ["research", "technology", "upgrades", "tier"],
        related: ["cm-software", "build-overview"],
        body: `500+ technologies across 30 categories and 5 tiers.

--- TIERS ---

• Tier 1 — Basic technologies. Available immediately.
• Tier 2 — Advanced. Requires Tier 1 prerequisites.
• Tier 3 — Cutting-edge. Significant resource investment.
• Tier 4 — Experimental. High cost, high reward.
• Tier 5 — Ultimate. Game-changing capabilities.

--- RESEARCH FORMULA ---
Progress = (BaseSpeed + OfficerBonus + BuildingBonus) / TargetCost

--- CATEGORIES ---
Infrastructure, Military, Medical, Economic, Surveillance, Energy, Agriculture, Cybernetics, Space, Genetics, and many more.

--- TECHNOLOGY PROPERTIES ---

• COST — Credits required to begin research.
• TICKS TO COMPLETE — Duration of research.
• PREREQUISITES — Other technologies that must be unlocked first.
• EFFECTS — Permanent bonuses upon completion.

--- TIPS ---
Build research labs and appoint competent Research officers to accelerate progress. Multiple projects can run simultaneously if you have the buildings and funding. Prioritize Tier 1 breadth before pushing deep into Tier 2+.`,
      },
      {
        id: "res-chains",
        title: "Research Event Chains",
        tags: ["research", "events", "consequences", "chains", "narrative"],
        related: ["res-overview"],
        body: `Researching certain technologies does not just unlock effects. It triggers consequences. The Research Event Chain system binds nine specific anchor technologies to narrative events that fire once per save, in three pacing windows.

--- EARLY-GAME CHAINS (3) ---

• FIRST REACTOR — LOAD STRAIN — fires after researching Advanced Fusion Reactors. The chief engineer wants funding for load-balancing. Resolution unlocks Smart Grid Load Balancing.
• FIRST HARVEST — fires after researching Mega Vertical Farming. The first crop comes in misshapen. Resolution unlocks Automated Crop Monitoring.
• BRACKISH INTAKE — fires after researching Ultra-Efficient Desalination. The intake pulls something it should not. Resolution unlocks Industrial Waste Purification.

--- MID-GAME CHAINS (3) ---

• DISTRICT AUDIT — fires after Smart Grid Load Balancing. Per-district numbers reveal who has been stealing power. Resolution unlocks District Energy Optimization.
• MICROBIAL SWAP — fires after Bio-Filtration Plants. The bacterial colonies in the filters are not the ones you authorized. Resolution unlocks Advanced Sanitation Chemistry.
• RATION FAILURE — fires after Food Preservation Nanotech. A pallet of rations comes back wrong. Resolution unlocks Agricultural Climate Control.

--- LATE-GAME CHAINS (3) ---

• GEOTHERMAL BREACH — fires after Autonomous Energy Distribution. The deep taps hit something hot, and not magma. Resolution unlocks Urban Geothermal Tapping.
• PIPELINE SKIN — fires after combined Stormwater Harvest Systems and Advanced Sanitation Chemistry. The pipes are growing a layer that nobody specified. Resolution unlocks Self-Repairing Pipeline Materials.
• BLACKSITE SIGNAL — fires after Story: Lazarus Protocol. A pre-war research signal is still broadcasting from a buried lab. Resolution unlocks Story: Calcification Cure.

--- PACING ---

• EARLY: ticks 30-240, fewer than 10 unlocked techs.
• MID: ticks 80-600, 10-23 unlocked techs.
• LATE: ticks 200+, 24+ unlocked techs.

Windows are non-overlapping on the tech-count axis, so MID and LATE can never trigger simultaneously. Each chain fires at most once per save.

--- HOW TO RESPOND ---
Every chain offers three responses: a FUND option that costs credits and grants the successor tech, a CHEAP option that avoids the cost but accepts a penalty, and a BLAME option that shifts blame to someone expendable. Funding is the path forward. The other two are characterization.`,
      },
    ],
  },
  {
    id: "districts",
    title: "DISTRICTS & SECTORS",
    icon: "map-marker-multiple",
    iconSet: "mci",
    entries: [
      {
        id: "dist-overview",
        title: "District Management",
        tags: ["districts", "sectors", "zones", "heatmap"],
        related: ["cm-overview", "build-overview"],
        body: `MEGACITY is divided into 270 districts, each with localised statistics:

• Population density • Crime rate • Wealth level
• Unrest level • Loyalty • Infrastructure quality • Defense rating

--- HEATMAP VIEW ---
The Sector Map screen provides heatmap overlays for Crime, Wealth, Unrest, Loyalty, and Defense — letting you identify problem areas at a glance.

--- DISTRICT SPECIALISATION ---
Districts can specialise in one of 8 types:
• Manufacturing • Commerce • Research • Military
• Residential • Entertainment • Agricultural • Energy

--- SPECIALISATION PROGRESSION ---
Progresses every 40 ticks if infrastructure quality >60 and unrest <40. Maximum level 5.

--- LEVEL 5 BONUSES ---
• Manufacturing: +10 Industrial Output
• Commerce: +10 Trade Revenue
• Research: +10 Research Speed
• Military: +10 Defense Rating
• Residential: +10 Housing Capacity
• Entertainment: +10 Happiness
• Agricultural: +10 Food Production
• Energy: +10 Power Output`,
      },
    ],
  },
  {
    id: "construction",
    title: "CONSTRUCTION & BUILDINGS",
    icon: "tool",
    iconSet: "feather",
    entries: [
      {
        id: "build-overview",
        title: "Building System",
        tags: ["construction", "buildings", "infrastructure", "build"],
        related: ["cm-supply", "dist-overview"],
        body: `440+ building types across multiple categories.

--- CATEGORIES ---

• RESIDENTIAL — Housing for citizens.
• COMMERCIAL — Revenue generation and employment.
• INDUSTRIAL — Manufacturing and production.
• MILITARY — Barracks, armories, and fortifications.
• CIVIC — Government, education, and healthcare.
• RESEARCH — Labs and development facilities.
• UTILITY — Power plants, water treatment, waste management.
• TOURISM — 12 tourist attraction buildings.

--- BATCH CONSTRUCTION ---
Build up to 10 of the same building simultaneously for efficiency.

--- SUPPLY CHAINS ---
160+ production chain recipes connect raw materials to finished goods. Buildings in the chain must be operational for the chain to function.

--- EXAMPLE CHAIN ---
Iron Ore Mine → Metal Foundry → Steel Mill → Vehicle Assembly Plant → Military Vehicles

--- AUTO-CONSTRUCTION ---
Unlockable automation that handles construction without manual input. Saves time but costs more — the contractor's little secret.`,
      },
    ],
  },
  {
    id: "cybernetics",
    title: "CYBERNETICS",
    icon: "robot-industrial",
    iconSet: "mci",
    entries: [
      {
        id: "cyber-overview",
        title: "Cybernetics System",
        tags: ["cybernetics", "implants", "augments", "modification"],
        body: `The cybernetics program encompasses body modification technology for your population and military.

--- COMPONENTS ---

• 100 AUGMENTS — External modifications and enhancements.
• 100 IMPLANTS — Internal body modifications.
• 30 TRADE COMMODITIES — Cybernetic components for trade.
• 25 TECHNOLOGIES — Research tree for cybernetic advancement.
• 10 BUILDINGS — Clinics, labs, and manufacturing facilities.

--- IMPLANT CATEGORIES ---

• Neural — Brain and cognitive enhancements.
• Optical — Vision and perception upgrades.
• Skeletal — Bone and structural reinforcement.
• Muscular — Strength and endurance.
• Organ — Internal organ replacements.
• Dermal — Skin and exterior modifications.

--- IMPLANT RARITY ---

• Common — Widely available. Low cost.
• Uncommon — Specialised. Moderate cost.
• Rare — Limited production. High cost.
• Legendary — One-of-a-kind prototypes. Extreme cost.

--- CITIZEN TRAITS ---
50 citizen traits can be affected by cybernetic programs. Gene Wrights faction ties closely to this system.`,
      },
    ],
  },
  {
    id: "space",
    title: "SPACE COMMAND",
    icon: "rocket-launch-outline",
    iconSet: "mci",
    entries: [
      {
        id: "space-overview",
        title: "Orbital Operations",
        tags: ["space", "orbital", "fleet", "colonies", "satellite"],
        related: ["mp-overview", "res-overview"],
        body: `Space Command manages your city's presence beyond the atmosphere.

--- CAPABILITIES ---

• SATELLITE DEPLOYMENT — Surveillance, communications, and weather monitoring.
• ORBITAL STRIKES — Devastating but politically costly.
• SPACE STATION — Research and manufacturing in zero-G.
• FLEET OPERATIONS — Military vessels for orbital defense and power projection.
• COLONY MANAGEMENT — Off-world settlements for resource extraction.

--- REQUIREMENTS ---
Requires significant Tier 4-5 technology research to unlock capabilities. The Space Elevator mega-project dramatically reduces launch costs.

--- STRATEGIC VALUE ---
Orbital assets can't be touched by ground-based factions. Space-based surveillance covers the entire map. Orbital manufacturing bypasses ground-side resource constraints.

--- TIP ---
Space Command is a late-game investment. Don't rush it — secure your ground-level city first. But once operational, orbital assets provide unmatched strategic superiority.`,
      },
    ],
  },
  {
    id: "mega-projects",
    title: "MEGA-PROJECTS",
    icon: "city-variant-outline",
    iconSet: "mci",
    entries: [
      {
        id: "mp-overview",
        title: "City-Scale Construction",
        tags: ["mega projects", "arcology", "space elevator", "fusion"],
        related: ["build-overview", "space-overview"],
        body: `8 Mega-Projects are massive, multi-phase construction endeavours that transform your city.

--- PROJECT PHASES ---

• PLANNING — Design and resource allocation.
• CONSTRUCTION — Active building. 50+ ticks per phase. Requires massive Steel, Power, and Credits.
• OPERATIONAL — Project complete. Permanent benefits active.

--- THE EIGHT MEGA-PROJECTS ---

• ATMOSPHERIC SCRUBBER — Cleans the city's air. Massive biosphere bonus.
• ARCOLOGY — Self-contained city-within-a-city. Housing and efficiency.
• FUSION NEXUS — Unlimited power generation.
• SPACE ELEVATOR — Cheap orbital access. Trade and military benefits.
• DEEP CORE TAP — Geothermal energy and mineral extraction.
• MEGA-HIGHWAY NETWORK — City-wide rapid transit.
• ORBITAL DEFENSE GRID — Space-based missile defense.
• THE WALL — Massive perimeter fortification.

--- WARNING ---
These are late-game investments requiring a stable, wealthy city. Abandoned mega-projects are expensive failures — don't start one you can't finish.`,
      },
    ],
  },
  {
    id: "seasonal",
    title: "SEASONS & WEATHER",
    icon: "weather-partly-cloudy",
    iconSet: "mci",
    entries: [
      {
        id: "sea-overview",
        title: "Seasonal Cycles",
        tags: ["seasons", "weather", "spring", "summer", "autumn", "winter"],
        related: ["gs-ticks", "cm-resources", "wm-weather"],
        body: `MEGACITY experiences four-season cycles that modify resource production and city conditions.

--- SEASONS (cycle every ~30 ticks) ---

SPRING — Growth and renewal.
• Food production +15%
• Moderate weather, mild effects

SUMMER — Heat and strain.
• Water production -15% (evaporation)
• Power drain +15% (cooling demand)
• Higher disease risk

AUTUMN — Harvest and preparation.
• Food production +20% (harvest bonus)
• Moderate weather, good trade conditions

WINTER — Cold and scarcity.
• Food production -25% (crop failure)
• Water production -10% (freezing)
• Power drain +25% (heating demand)
• Higher unrest from cold

--- WEATHER EVENTS ---

40+ dystopian weather types cycle within each season:
Clear, rain, storm, heatwave, blizzard, toxic fog, acid rain, dust storm, and more.

Weather effects apply to happiness, crime, disease risk, food production, and power drain. The current season and weather are displayed on the Overview header.

--- PLANNING ---
Seasonal modifiers are applied BEFORE resource consumption each tick. Plan stockpiles accordingly — winter food shortages are predictable and avoidable with preparation.`,
      },
    ],
  },
  {
    id: "medical",
    title: "MEDICAL & HEALTH",
    icon: "medical-bag",
    iconSet: "mci",
    entries: [
      {
        id: "med-overview",
        title: "Healthcare System",
        tags: ["medical", "health", "disease", "illness", "hospital"],
        related: ["cm-overview", "cm-resources"],
        body: `Public health management is critical to city survival.

--- ILLNESS SYSTEM ---
30 distinct illnesses can affect your population, each requiring specific medications and treatment facilities.

--- HEALTH INFRASTRUCTURE ---

• Hospitals and clinics provide baseline healthcare.
• Medical supply production keeps treatments available.
• Research unlocks advanced medical technologies.

--- PUBLIC HEALTH THRESHOLDS ---

• Above 70: Population growth bonus. Low disease risk.
• 40-70: Manageable. Some health events.
• Below 40: Health crisis. Disease outbreaks. Population decline.

--- TRADE ---
Medical supplies are a tradeable commodity — import if local production is insufficient, export surplus for profit.

--- PREVENTION ---
Clean water, waste management, and food quality all contribute to baseline public health. Investment in sanitation infrastructure prevents costly epidemics.

--- SEASONAL IMPACT ---
Summer increases disease risk. Winter reduces public health through cold exposure. Plan medical stockpiles around seasonal cycles.`,
      },
    ],
  },
  {
    id: "prestige",
    title: "PRESTIGE & LEGACY",
    icon: "star-shooting",
    iconSet: "mci",
    entries: [
      {
        id: "pres-overview",
        title: "Rebirth System",
        tags: ["prestige", "rebirth", "legacy", "permanent bonuses"],
        related: ["pres-reputation"],
        body: `PRESTIGE is MEGACITY's new-game-plus system. When your city reaches sufficient milestones, trigger a REBIRTH.

--- WHAT HAPPENS ---

• Your city resets to a fresh start.
• You earn LEGACY POINTS (LP) based on your achievements.
• LP can be spent on permanent bonuses.
• Each rebirth unlocks new content and challenges.

--- LEGACY BONUSES (7 available) ---

Permanent upgrades purchased with LP that apply to ALL future cities:
• Production bonuses • Defense bonuses
• Income bonuses • Research speed
• Starting resources • Faction standing • Population growth

--- LEGACY TIERS ---

Your total LP determines your Legacy Tier — a prestige rank that represents your cumulative accomplishment across all rebirths.

--- IS REBIRTH REQUIRED? ---
No. You can continue playing your current city indefinitely. But rebirth rewards make subsequent playthroughs more varied and powerful.`,
      },
      {
        id: "pres-reputation",
        title: "Reputation Score",
        tags: ["reputation", "score", "grade", "rating"],
        related: ["pres-overview", "fac-diplomacy"],
        body: `Your reputation is a real-time score (0-100) reflecting your performance as Commander.

--- GRADE SCALE ---

• S (90-100) — Legendary. Gold rating.
• A (75-89) — Excellent. Green rating.
• B (60-74) — Good. Blue rating.
• C (45-59) — Average. Yellow rating.
• D (30-44) — Poor. Orange rating.
• F (0-29) — Failing. Red rating.

--- SCORE FACTORS ---

• Citizen happiness (major factor)
• Crime control effectiveness
• Social stability (low unrest)
• Faction relations (average loyalty)
• Employment rate
• Technology progress
• Population growth trend

--- IMPACT ---
Reputation affects diplomatic standing, faction negotiations, and is displayed on the Prestige screen alongside your Legacy information. High reputation makes faction negotiations easier and trade deals more favourable.`,
      },
    ],
  },
  {
    id: "achievements",
    title: "ACHIEVEMENTS",
    icon: "trophy-outline",
    iconSet: "mci",
    entries: [
      {
        id: "ach-overview",
        title: "Achievement System",
        tags: ["achievements", "milestones", "trophies", "progress", "steam"],
        related: ["pres-overview"],
        body: `400+ achievements across 15 categories track your accomplishments.

--- CATEGORIES ---

• City milestones (population targets, credit thresholds)
• Military achievements (battles won, units deployed)
• Economic achievements (trade volume, profit margins)
• Research achievements (technologies unlocked)
• Exploration achievements (locations discovered)
• Political achievements (faction management)
• Construction achievements (buildings completed)
• Dark achievements (morally questionable decisions)
• Year milestones (1, 5, 10, 25, 50, 100 years survived)
• And more...

--- STEAM INTEGRATION ---
All achievements have Steam API integration prepared. When the Steam version launches, achievements will sync with your Steam profile.

--- PROGRESS ---
Achievement progress is tracked automatically. Check the ACHIEVEMENTS screen from the More menu to see your progress. Some achievements unlock special content or bonuses.`,
      },
    ],
  },
  {
    id: "events-crises",
    title: "EVENTS & CRISES",
    icon: "alert-circle",
    iconSet: "feather",
    entries: [
      {
        id: "evt-overview",
        title: "Random Event System",
        tags: ["events", "random", "crisis", "response", "choices"],
        related: ["gs-ticks", "fac-overview", "law-overview"],
        body: `MEGACITY generates random events each tick, ranging from minor nuisances to existential crises. Each event has a description, severity rating, automatic effects, and most have RESPONSE OPTIONS that let you influence the outcome.

--- SEVERITY LEVELS ---

• LOW — Minor events. Small stat shifts. Usually positive or neutral.
• MEDIUM — Significant events. Moderate stat impact. Require attention.
• HIGH — Major crises. Large stat swings. Demand immediate response.
• CRITICAL — Existential threats. Massive negative effects. Wrong response could be catastrophic.

--- RESPONSE OPTIONS ---

Most events present 2-4 response choices. Each response has:
• A descriptive label and explanation
• Specific stat effects (credits, happiness, unrest, crime, etc.)
• Some responses cost credits — check before choosing

Choosing no response (letting the event expire) applies only the base event effects. Choosing wisely can mitigate damage or amplify benefits.

--- EVENT CATEGORIES ---

• CITY EVENTS — Infrastructure failures, construction sabotage, corruption scandals
• FACTION EVENTS — Faction-specific incidents tied to their agendas and rivalries
• WASTELAND EVENTS — Caravans, refugees, trade disputes, and external threats
• DARK COMEDY — Sentient vending machines, dance plagues, rat diplomacy, and other absurdities
• MEGA-PROJECT — Events tied to active mega-construction projects
• WAR — Military operations and combat events during wartime
• BIOSPHERE — Environmental and ecological events

--- EVENT FREQUENCY ---

Events are rolled each tick based on current city conditions. Higher unrest and crime increase the frequency of negative events. High happiness and stability increase the chance of positive events.`,
      },
      {
        id: "evt-dark-comedy",
        title: "Dark Comedy Events",
        tags: ["dark humor", "comedy", "funny", "absurd", "satire"],
        related: ["evt-overview"],
        body: `Among the genuine crises and political machinations, MEGACITY generates absurdist events that reflect the dark humor of life in a dystopian megacity.

--- WHAT TO EXPECT ---

• Sentient machines demanding employment rights
• Bureaucracy that develops a mind of its own
• Citizens who are suspiciously happy (investigated accordingly)
• Dance plagues, sock shortages, and haunted hab-blocks
• Vending machine territorial disputes
• Administrative errors that accidentally create utopia
• Conspiracy theorists who turn out to be right
• Rats with diplomatic ambitions

--- ARE THEY SERIOUS? ---

Yes. These events have real game effects — stat changes, credit costs, and consequences. A sentient vending machine is funny until it drains the treasury. A toilet shortage is hilarious until unrest hits 80.

--- RESPONSE PHILOSOPHY ---

Dark comedy events typically offer three approaches:
• PRAGMATIC — Fix the problem. Costs money. Boring but effective.
• CREATIVE — Lean into the absurdity. Sometimes the best response to a dancing plague is a city-wide festival.
• AUTHORITARIAN — Ban it, suppress it, pretend it never happened. Works short-term. Breeds resentment.

The best Commanders know when to laugh at the chaos and when to take it seriously. Usually both.`,
      },
      {
        id: "evt-news-ticker",
        title: "News Ticker & Headlines",
        tags: ["news", "headlines", "ticker", "humor", "satire"],
        related: ["evt-overview", "evt-dark-comedy"],
        body: `The news ticker at the top of the Overview screen delivers a constant stream of headlines reflecting life in MEGACITY.

--- HEADLINE TYPES ---

• AMBIENT — General city atmosphere and daily life reports
• LORE — World-building headlines about the wasteland, pre-war history, and mysterious signals
• DARK HUMOR — Satirical commentary on dystopian bureaucracy, absurd city policy, and the human condition under concrete
• STAT-REACTIVE — Headlines triggered by specific city conditions (health crises, crime waves, employment changes)
• FACTION — Headlines about faction activity, intercepted communications, and political maneuvering

--- FREQUENCY ---

New headlines appear every few ticks. Dark humor headlines fire every 3 ticks. The ticker cycles through approximately 200 unique satirical headlines plus hundreds of contextual ones.

--- ARE THEY GAMEPLAY-RELEVANT? ---

Some headlines are pure flavor — atmospheric world-building. Others hint at emerging problems: a headline about rising crime might foreshadow a gang event. A headline about food quality might precede a food shortage crisis. Pay attention to patterns.`,
      },
    ],
  },
  {
    id: "tips",
    title: "TIPS & STRATEGIES",
    icon: "lightbulb-on-outline",
    iconSet: "mci",
    entries: [
      {
        id: "tip-general",
        title: "General Strategy Tips",
        tags: ["tips", "strategy", "advice", "guide"],
        related: ["gs-first-steps", "tip-economy", "tip-combat"],
        body: `--- SURVIVAL PRIORITIES (in order) ---

1. Food and water production — Without these, population dies.
2. Credit income — Without money, everything stops.
3. Law enforcement — Without order, the city burns.
4. Healthcare — Disease outbreaks cascade catastrophically.
5. Military readiness — External threats don't wait.

--- COMMON MISTAKES ---

• Over-expanding military before securing economic base.
• Ignoring factions until civil war triggers.
• Building too fast without maintaining infrastructure.
• Neglecting officer appointments — empty departments have no competence.
• Running out of credits with active construction projects.

--- ADVANCED TIPS ---

• Use multiple save slots before risky decisions.
• Check the Profit & Loss statement every 10 ticks.
• Maintain 3+ faction loyalties above 65 for political stability.
• Keep unrest below 40 at all times — above 40, problems compound rapidly.
• Invest in education early — it multiplies research and economic efficiency.
• Monitor the world map for emerging threats from hostile nations.
• Diversify income — don't rely solely on taxes.
• Stockpile food before winter (food production -25%).`,
      },
      {
        id: "tip-economy",
        title: "Economic Mastery",
        tags: ["economy", "money", "credits", "profit"],
        related: ["eco-income", "eco-trade", "tip-general"],
        body: `--- CREDIT GENERATION HIERARCHY ---

1. Taxes (reliable, scales with population)
2. Trade routes (passive income, requires safe routes)
3. Company licensing (steady income from 100 corporations)
4. Commodity trading (high variance, high skill ceiling)
5. Tourism (requires high happiness and safety)
6. Black market (high risk, high reward)

--- COST CONTROL ---

• Dismiss idle military units — upkeep costs are per-tick.
• Don't over-build — each building has maintenance costs.
• Watch officer corruption — corrupt officers leak credits.
• Research economic technologies early for production bonuses.

--- EMERGENCY CREDIT GENERATION ---

• Sell surplus commodities on the Trade Exchange.
• Take a loan (but plan for repayment).
• Issue a "Tax Surge" edict (temporary revenue boost).
• Sell mining rights to external megacities.

--- SEASONAL PLANNING ---
Autumn harvest (+20% food) creates surplus — sell excess food on the Exchange during autumn for maximum profit before winter scarcity drives prices up.`,
      },
      {
        id: "tip-combat",
        title: "Military Strategy",
        tags: ["military", "combat", "war", "defense"],
        related: ["mil-overview", "mil-missions", "tip-general"],
        body: `--- READINESS IS EVERYTHING ---
An army at 90% readiness at half strength beats a full army at 30% readiness.

--- READINESS MANAGEMENT ---

• Maintain fuel reserves (>50 at all times).
• Keep ammo production ahead of consumption.
• Ensure food supply for military rations.

--- MISSION SELECTION ---

• Only run missions when readiness >70%.
• Match mission difficulty to your army strength.
• Use officer-led missions for critical objectives.

--- FACTION WARS ---

• Negotiate with factions BEFORE they reach 80 threat.
• If civil war is unavoidable, stockpile resources first.
• During active conflict, prioritise infrastructure repair.
• Civil wars last 40-80 ticks — plan accordingly.

--- DEFENSE INVESTMENT ---

• Defense Rating should match your threat environment.
• World map hostile routes indicate nearby dangers.
• Keep at least 2 military research projects active.
• Droids are excellent for hazardous operations — no morale cost.`,
      },
    ],
  },
  {
    id: "expansion",
    title: "DISTRICT EXPANSION",
    icon: "map-marker-radius",
    iconSet: "mci",
    entries: [
      {
        id: "exp-overview",
        title: "Wasteland Reclamation",
        tags: ["expansion", "reclamation", "districts", "wasteland"],
        related: ["exp-phases", "exp-upgrades", "dist-overview"],
        body: `The wastelands surrounding MEGACITY contain 25 reclaimable plots of contaminated land. Each plot can be reclaimed through a multi-phase decontamination process, eventually becoming a fully functional district.

--- CONTAMINATION TYPES ---

• IRRADIATED — Former reactor zones. High radiation requires specialized cleanup. Yields energy-focused districts.
• FLOODED — Submerged sub-sectors. Pumping and drainage required. Often yields salvage or residential zones.
• STRUCTURALLY COLLAPSED — Destroyed megastructures. Rubble clearance and foundation rebuilding needed.
• TOXIC WASTE — Abandoned industrial zones. Chemical neutralization required. Yields industrial districts.
• GEOLOGICALLY UNSTABLE — Seismically active areas. Stabilization and deep anchoring needed. Yields mining or defense districts.

--- SEVERITY ---

Each plot has a contamination severity rating from 1-5 dots. Higher severity means longer phases and higher costs, but often yields more valuable district types.

--- AUTO-DEVELOP ---

Enable Auto-Develop to automatically advance reclamation projects to the next phase when resources are available. Disable it to maintain manual control over spending.`,
      },
      {
        id: "exp-phases",
        title: "Reclamation Phases",
        tags: ["phases", "survey", "decontaminate", "foundation", "develop"],
        related: ["exp-overview", "exp-techs"],
        body: `Every reclamation project passes through four sequential phases:

--- PHASE 1: SURVEY ---

Initial assessment of the contaminated zone. Cheapest and fastest phase. Survey drones map the terrain, identify hazards, and plan the decontamination approach. Cost: Primarily credits.

--- PHASE 2: DECONTAMINATE ---

The most expensive phase. Specialized crews neutralize the contamination — radiation scrubbing, chemical neutralization, flood pumping, or structural demolition depending on the type. Cost: Credits + fuel + specialized resources.

--- PHASE 3: FOUNDATION ---

Lay the groundwork for the new district. Steel-intensive construction of basic infrastructure, roads, utilities connections, and structural reinforcement. Cost: Credits + steel + goods.

--- PHASE 4: DEVELOP ---

Final phase. Transform the cleared plot into a functional district with housing, services, and economic infrastructure. Credits-heavy with some resource requirements. Upon completion, a new district is added to your city roster.

--- TECH BONUSES ---

Research expansion technologies to speed up phases and reduce costs. Automated Survey Drones triple survey speed. Rapid Foundation Laying doubles foundation speed. Advanced Decontamination and Deep Soil Remediation reduce decontamination costs.`,
      },
      {
        id: "exp-upgrades",
        title: "District Upgrades",
        tags: ["upgrade", "tiers", "bonuses", "improvement"],
        related: ["exp-overview", "dist-overview"],
        body: `Existing districts can be upgraded through 5 tiers, each providing cumulative bonuses:

--- TIER BONUSES ---

• TIER 1 — Basic: +5% wealth, +3% infrastructure, -2% crime
• TIER 2 — Improved: +10% wealth, +6% infrastructure, -4% crime, +5% industrial output
• TIER 3 — Advanced: +15% wealth, +10% infrastructure, -8% crime, +10% industrial output, +1000 population capacity
• TIER 4 — Elite: +22% wealth, +15% infrastructure, -12% crime, +18% industrial output, +2500 population capacity
• TIER 5 — Apex: +30% wealth, +20% infrastructure, -15% crime, +25% industrial output, +5000 population capacity

--- COSTS ---

Each tier costs increasing amounts of credits and materials. Higher-category districts (administrative, commercial) have different bonus profiles emphasizing governance and trade over raw output.

--- UPGRADE PROCESS ---

Upgrades take multiple ticks to complete. Only one upgrade can be active per district at a time. The district continues to function normally during the upgrade process.`,
      },
      {
        id: "exp-techs",
        title: "Expansion Technologies",
        tags: ["tech", "research", "expansion", "speed", "cost"],
        related: ["exp-phases", "res-overview"],
        body: `Ten technologies specifically enhance the expansion system:

--- SPEED TECHNOLOGIES ---

• AUTOMATED SURVEY DRONES — Survey phase 3x faster
• RAPID FOUNDATION LAYING — Foundation phase 2x faster
• WASTELAND TERRAFORMING — All phases 20% faster
• MEGA RECLAMATION — All phases 50% faster, unlock severity 5 plots

--- COST TECHNOLOGIES ---

• ADVANCED DECONTAMINATION — Decontamination phase 30% cheaper
• DEEP SOIL REMEDIATION — Decontamination 50% cheaper
• EXPANSION LOGISTICS — All phases 20% cheaper

--- UNLOCK TECHNOLOGIES ---

• STRUCTURAL RECLAMATION — Unlock severity 4+ collapsed plots
• HAZMAT ENGINEERING — Unlock severity 4+ toxic plots
• GEOLOGICAL STABILIZATION — Unlock severity 4+ unstable plots

--- RESEARCH ORDER ---

Start with Automated Survey Drones (cheap, huge speed boost). Then Advanced Decontamination to reduce the most expensive phase. Rapid Foundation Laying and Expansion Logistics next. Save Mega Reclamation for late game.`,
      },
    ],
  },
  {
    id: "auto-managers",
    title: "AUTO-MANAGERS",
    icon: "robot-outline",
    iconSet: "mci",
    entries: [
      {
        id: "am-overview",
        title: "Auto-Manager Framework",
        tags: ["auto-managers", "advisor", "briefings", "delegation", "automation", "inner circle"],
        related: ["am-domains", "off-inner-circle"],
        body: `The ADVISOR BRIEFINGS screen, accessed from the More menu, is mission control for delegating routine work to your Inner Circle. Eight independent domains can each be set to one of three modes.

--- MODES ---

• OFF — The advisor stays silent. You handle the domain manually.
• SUGGEST — The advisor queues proposals in the briefings panel for one-tap approval or decline.
• ACT — The advisor executes inside the rules you set. You can still review and reverse decisions.

--- INNER CIRCLE GATING ---

Every domain requires the matching Inner Circle role to be filled. Without the appointment the panel tells you who to install — no advisor, no automation.

--- GLOBAL CONTROLS ---

• PAUSE ALL ACT — One tap downgrades every ACT domain to SUGGEST until you re-enable. Use before risky decisions.
• HONOR MODE — Set in Options. Globally locks ACT to SUGGEST. For players who want full agency on every move.
• ALWAYS-ALLOW — Mark trusted proposal kinds (e.g. "recruit-batch") to auto-approve without queueing.
• SNOOZE — Silence a noisy proposal kind for the day.

--- ALERT DOT ---

The MORE menu surfaces an alert dot on ADVISOR BRIEFINGS whenever an auto-manager has a proposal waiting for you.

--- TIP ---

Start every domain at SUGGEST. Watch what your advisors propose for a few ticks, then graduate the trustworthy ones to ACT. Anything you find yourself constantly approving without thinking is a candidate for Always-Allow.`,
      },
      {
        id: "am-domains",
        title: "The Eight Domains",
        tags: ["auto-managers", "domains", "recruit", "research", "intel", "trade", "military", "edicts"],
        related: ["am-overview", "off-inner-circle"],
        body: `Each domain is owned by a specific Inner Circle role.

--- AUTO-RECRUIT ---
Owner: ENFORCER. Refills empty squad slots and recruits troops within a credit budget. The Recruitment screen exposes its own AUTO-HIRE: ENFORCER PROTOCOL panel with per-tick budget, target strength percent, and class priority controls.

--- AUTO-RESEARCH ---
Owner: SCIENCE ADVISOR. Picks the next prereq-met tech from your priority categories.

--- AUTO-INTELLIGENCE ---
Owner: SPYMASTER. Runs surveillance and intel ops against your watch list.

--- AUTO-ESPIONAGE ---
Owner: SPYMASTER. Counter-intel and retaliation against incoming espionage.

--- AUTO-AGRICULTURE ---
Owner: AGRICULTURE MINISTER. Maintains your food stockpile band; queues farm contracts when supply dips.

--- AUTO-TRADE ---
Owner: DIPLOMAT. Auto-accepts profitable trade offers within your rules.

--- AUTO-MILITARY ---
Owner: WAR MARSHAL. Tops up fuel, ammo, and rations; suggests mobilization.

--- AUTO-EDICTS ---
Owner: CHANCELLOR. Tunes taxes and edicts to keep stats inside a target band.`,
      },
    ],
  },
  {
    id: "religion",
    title: "RELIGION & FAITHS",
    icon: "candle",
    iconSet: "mci",
    entries: [
      {
        id: "faith-overview",
        title: "The Eight Faiths",
        tags: ["religion", "faith", "eternal flame", "machine choir", "ancestor cult", "catholicism", "stance", "drift"],
        related: ["faith-stances", "faith-leader-cult"],
        body: `Eight faiths drift across your districts based on category affinity. They cannot be eradicated — only managed.

--- THE ETERNAL FLAME ---
Reactor-priesthood that worships the fusion cores as sleeping gods. Strongest in ENERGY and RESEARCH districts. Tied to the Eternal Flame faction.

--- THE MACHINE CHOIR ---
Industrial congregation that hears divinity in lathe-song and assembly hum. Strongest in INDUSTRIAL and TRANSPORT districts. An independent congregation with no parent faction.

--- THE ANCESTOR CULT ---
Undercity sect that venerates the pre-Collapse dead. Thrives in SLUMS, WASTELAND, FRONTIER, and HOUSING districts where the old names are still spoken.

--- CATHOLICISM ---
Parish networks preserving Catholic worship, mutual aid, and sacramental life through the collapse. Strongest in HOUSING, MEDICAL, and GOVERNMENT districts.

--- DISTRICT DRIFT ---

Every tick, each district's faith share drifts toward whichever faith matches its category. Your stance toward each faith modifies the rate.`,
      },
      {
        id: "faith-stances",
        title: "Faith Stances — Sponsor, Tolerate, Suppress",
        tags: ["faith", "stance", "sponsor", "tolerate", "suppress", "happiness", "law", "loyalty"],
        related: ["faith-overview", "faith-leader-cult"],
        body: `For each faith, set one of three stances independently. You can sponsor one faith while suppressing another.

--- CITY-WIDE EFFECTS (per tick) ---

• SPONSOR — +0.05 Happiness, -0.03 Unrest, +0.04 Corruption
• TOLERATE — Neutral baseline.
• SUPPRESS — +0.06 Law & Order, +0.05 Unrest, -0.04 Happiness

--- DISTRICT-LEVEL EFFECTS (dominant district, per tick) ---

• SPONSOR — +0.05 Loyalty, +0.03 Crime
• TOLERATE — Neutral baseline.
• SUPPRESS — -0.06 Loyalty, -0.02 Crime

--- MIXED STRATEGIES ---

Sponsor the Eternal Flame in your reactor districts to keep the Authority happy. Suppress the Ancestor Cult in the slums to control unrest. The system rewards careful per-faith bookkeeping.`,
      },
      {
        id: "faith-leader-cult",
        title: "Leader Cult — The Commander's Personal Creed",
        tags: ["faith", "leader cult", "declaration", "renunciation", "devotional events"],
        related: ["faith-overview", "faith-stances"],
        body: `You may formally adopt one faith as the Commander's personal creed.

--- DECLARATION ---
Picks one faith as your Leader Cult. Amplifies that faith's affinity drift across all districts.

--- DEVOTIONAL EVENTS ---
The chosen faith unlocks unique events and dialogue.

--- RENUNCIATION ---
Possible but enforces a cooldown before you can declare another.

--- WARNING ---
Declaring a Leader Cult is a permanent ideological signal. Other factions notice. The Reliquary See in particular tracks whether the Commander has declared for any of the three drifting faiths — and what that says about the See's standing in the city.`,
      },
    ],
  },
];

const ALL_ENTRIES = CODEX_DATA.flatMap((cat) =>
  cat.entries.map((e) => ({ ...e, categoryId: cat.id, categoryTitle: cat.title }))
);

const ENTRY_INDEX = new Map(ALL_ENTRIES.map(e => [e.id, e]));

function FormattedBody({ text }: { text: string }) {
  const fmtStyles = useFmtStyles();
  const lines = text.split("\n");
  return (
    <View style={{ gap: 0 }}>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("---") && trimmed.endsWith("---")) {
          const label = trimmed.replace(/^-+\s*/, "").replace(/\s*-+$/, "");
          return (
            <View key={i} style={fmtStyles.sectionHeader}>
              <View style={fmtStyles.sectionLine} />
              <Text style={fmtStyles.sectionLabel}>{label}</Text>
              <View style={fmtStyles.sectionLine} />
            </View>
          );
        }
        if (trimmed.startsWith("•")) {
          const content = trimmed.substring(1).trim();
          const dashIdx = content.indexOf("—");
          const colonIdx = content.indexOf(" — ");
          if (dashIdx > 0 && dashIdx < 40) {
            const term = content.substring(0, dashIdx).trim();
            const desc = content.substring(dashIdx + 1).trim();
            return (
              <View key={i} style={fmtStyles.bulletRow}>
                <Text style={fmtStyles.bullet}>•</Text>
                <Text style={fmtStyles.bodyLine}>
                  <Text style={fmtStyles.keyword}>{term}</Text>
                  <Text> — {desc}</Text>
                </Text>
              </View>
            );
          }
          return (
            <View key={i} style={fmtStyles.bulletRow}>
              <Text style={fmtStyles.bullet}>•</Text>
              <Text style={fmtStyles.bodyLine}>{content}</Text>
            </View>
          );
        }
        if (/^\d+\./.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\.\s*/)![1];
          const rest = trimmed.replace(/^\d+\.\s*/, "");
          return (
            <View key={i} style={fmtStyles.bulletRow}>
              <Text style={fmtStyles.numBullet}>{num}.</Text>
              <Text style={fmtStyles.bodyLine}>{rest}</Text>
            </View>
          );
        }
        if (trimmed === "") {
          return <View key={i} style={{ height: 8 }} />;
        }
        const allCaps = /^[A-Z][A-Z\s&\/\(\),:0-9×x\-\.]+$/.test(trimmed) && trimmed.length < 60;
        if (allCaps && !trimmed.includes("=")) {
          return (
            <Text key={i} style={fmtStyles.subHeader}>{trimmed}</Text>
          );
        }
        const formatted = highlightKeywords(trimmed, fmtStyles);
        return <Text key={i} style={fmtStyles.bodyLine}>{formatted}</Text>;
      })}
    </View>
  );
}

function highlightKeywords(text: string, fmtStyles: ReturnType<typeof useFmtStyles>): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\b([A-Z][A-Z\s]{2,}(?=[^a-z]|$))\b/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<Text key={`t${lastIndex}`}>{text.substring(lastIndex, match.index)}</Text>);
    }
    parts.push(
      <Text key={`k${match.index}`} style={fmtStyles.keyword}>{match[1]}</Text>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(<Text key={`t${lastIndex}`}>{text.substring(lastIndex)}</Text>);
  }
  return parts.length > 0 ? parts : [<Text key="full">{text}</Text>];
}

const useFmtStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.accent + "30",
  },
  sectionLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 2,
  },
  subHeader: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  keyword: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
  },
  bulletRow: {
    flexDirection: "row",
    gap: 6,
    paddingLeft: 4,
    marginBottom: 2,
  },
  bullet: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 21,
    width: 12,
  },
  numBullet: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    lineHeight: 21,
    width: 18,
    textAlign: "right",
  },
  bodyLine: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 21,
    flex: 1,
  },
}));

function CodexScreen() {
  const { colors: Colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CodexEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return ALL_ENTRIES.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        e.tags.some((t) => t.includes(q))
    );
  }, [searchQuery]);

  const activeCategory = useMemo(
    () => CODEX_DATA.find((c) => c.id === selectedCategory) ?? null,
    [selectedCategory]
  );

  const navigateToEntry = useCallback((entryId: string) => {
    const entry = ENTRY_INDEX.get(entryId);
    if (entry) setSelectedEntry(entry);
  }, []);

  if (selectedEntry) {
    const relatedEntries = (selectedEntry.related ?? [])
      .map(id => ENTRY_INDEX.get(id))
      .filter(Boolean) as typeof ALL_ENTRIES;

    return (
      <View style={[styles.root, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setSelectedEntry(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to codex category">
            <Feather name="arrow-left" size={18} color={Colors.accent} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{selectedEntry.title}</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.entryContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.entryTitle}>{selectedEntry.title}</Text>
          <View style={styles.tagRow}>
            {selectedEntry.tags.map((t) => (
              <View key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          <FormattedBody text={selectedEntry.body} />

          {relatedEntries.length > 0 && (
            <View style={styles.relatedSection}>
              <View style={styles.relatedHeader}>
                <View style={styles.relatedLine} />
                <Text style={styles.relatedLabel}>RELATED ENTRIES</Text>
                <View style={styles.relatedLine} />
              </View>
              {relatedEntries.map(re => (
                <Pressable
                  key={re.id}
                  style={({ pressed }) => [styles.relatedItem, pressed && styles.pressed]}
                  onPress={() => navigateToEntry(re.id)}
                >
                  <Feather name="link" size={12} color={Colors.accent} />
                  <Text style={styles.relatedItemText}>{re.title}</Text>
                  <Feather name="chevron-right" size={12} color={Colors.textMuted} />
                </Pressable>
              ))}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    );
  }

  if (activeCategory) {
    return (
      <View style={[styles.root, { paddingTop: topInset }]}>
        <View style={styles.header}>
          <Pressable onPress={() => setSelectedCategory(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back to codex categories">
            <Feather name="arrow-left" size={18} color={Colors.accent} />
          </Pressable>
          <Text style={styles.headerTitle}>{activeCategory.title}</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {activeCategory.entries.map((entry) => (
            <Pressable
              key={entry.id}
              style={({ pressed }) => [styles.entryItem, pressed && styles.pressed]}
              onPress={() => setSelectedEntry(entry)}
            >
              <View style={styles.entryItemLeft}>
                <Feather name="file-text" size={14} color={Colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryItemTitle}>{entry.title}</Text>
                  <Text style={styles.entryItemPreview} numberOfLines={1}>
                    {entry.body.split("\n").find(l => l.trim().length > 0 && !l.trim().startsWith("---"))?.trim() ?? ""}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={14} color={Colors.textMuted} />
            </Pressable>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="book-open-variant" size={18} color={Colors.accent} />
        <Text style={styles.headerTitle}>CODEX — FIELD OPERATIONS MANUAL</Text>
      </View>

      <View style={styles.searchContainer}>
        <Feather name="search" size={14} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search codex..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          accessibilityLabel="Search codex entries"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
            <Feather name="x" size={14} color={Colors.textMuted} />
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {searchQuery.trim().length > 0 ? (
          <>
            <SectionHeader
              title="Search Results"
              subtitle={`${searchResults.length} matches`}
              icon={<Feather name="search" size={14} color={Colors.accent} />}
            />
            {searchResults.length === 0 ? (
              <View style={styles.empty}>
                <Feather name="alert-circle" size={20} color={Colors.textMuted} />
                <Text style={styles.emptyText}>No entries found for "{searchQuery}"</Text>
              </View>
            ) : (
              searchResults.map((entry) => (
                <Pressable
                  key={entry.id}
                  style={({ pressed }) => [styles.entryItem, pressed && styles.pressed]}
                  onPress={() => { setSelectedEntry(entry); setSearchQuery(""); }}
                >
                  <View style={styles.entryItemLeft}>
                    <Feather name="file-text" size={14} color={Colors.accent} />
                    <View>
                      <Text style={styles.entryItemTitle}>{entry.title}</Text>
                      <Text style={styles.entryItemSub}>{entry.categoryTitle}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={14} color={Colors.textMuted} />
                </Pressable>
              ))
            )}
          </>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{CODEX_DATA.length}</Text>
                <Text style={styles.statLabel}>SECTIONS</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{ALL_ENTRIES.length}</Text>
                <Text style={styles.statLabel}>ENTRIES</Text>
              </View>
            </View>

            <Text style={styles.introText}>
              Welcome to the MEGACITY Field Operations Manual. This codex contains everything you need to survive and thrive as Commander. Select a category below or use the search bar above.
            </Text>
            {CODEX_DATA.map((cat) => {
              const IconComp = cat.iconSet === "mci" ? MaterialCommunityIcons : Feather;
              return (
                <Pressable
                  key={cat.id}
                  style={({ pressed }) => [styles.categoryItem, pressed && styles.pressed]}
                  onPress={() => setSelectedCategory(cat.id)}
                >
                  <View style={styles.catLeft}>
                    <View style={styles.catIconBox}>
                      <IconComp name={cat.icon as any} size={18} color={Colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.catTitle}>{cat.title}</Text>
                      <Text style={styles.catSub}>{cat.entries.length} {cat.entries.length === 1 ? "entry" : "entries"}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={16} color={Colors.textMuted} />
                </Pressable>
              );
            })}
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bgSecondary,
  },
  headerTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    letterSpacing: 1.5,
    flex: 1,
  },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Platform.OS === "web" ? 12 : 16, paddingTop: Platform.OS === "web" ? 8 : 16, paddingBottom: 20 },
  entryContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    padding: 0,
  },

  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: Colors.accent + "08",
    borderWidth: 1,
    borderColor: Colors.accent + "20",
    borderRadius: 4,
  },
  statNumber: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    letterSpacing: 1,
  },
  statLabel: {
    color: Colors.textMuted,
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 2,
  },

  introText: {
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },

  categoryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 8,
  },
  catLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  catIconBox: {
    width: 36,
    height: 36,
    borderRadius: 4,
    backgroundColor: Colors.accent + "15",
    borderWidth: 1,
    borderColor: Colors.accent + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  catTitle: {
    color: Colors.text,
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  catSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
    letterSpacing: 0.5,
  },

  entryItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 14,
    marginBottom: 6,
  },
  entryItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  entryItemTitle: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  entryItemPreview: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
    opacity: 0.7,
  },
  entryItemSub: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
    backgroundColor: Colors.accent + "10",
  },

  entryTitle: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: 1,
    marginBottom: 12,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 16,
  },
  tag: {
    backgroundColor: Colors.accent + "15",
    borderWidth: 1,
    borderColor: Colors.accent + "30",
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    color: Colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 1,
  },

  relatedSection: {
    marginTop: 24,
  },
  relatedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  relatedLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.accent + "20",
  },
  relatedLabel: {
    color: Colors.accent,
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    letterSpacing: 2,
    opacity: 0.7,
  },
  relatedItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.accent + "20",
    borderRadius: 4,
    marginBottom: 4,
  },
  relatedItemText: {
    color: Colors.accent,
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    flex: 1,
  },

  empty: {
    alignItems: "center",
    paddingVertical: 30,
    gap: 8,
  },
  emptyText: {
    color: Colors.textMuted,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
  },
}));

export default withScreenBoundary(CodexScreen, "codex");
