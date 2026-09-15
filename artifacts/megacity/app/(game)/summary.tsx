import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Insignia from "@/components/Insignia";
import TutorialHint from "@/components/TutorialHint";
import { useTheme, type ThemePalette } from "@/context/ThemeContext";
import { makeThemedStyles } from "@/hooks/useThemedStyles";
import { useGame } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { getPlayerFaction } from "@/engine/playerFaction";
import { formatOutfitSummary, getPlayerOutfit } from "@/engine/wardrobe";
import {
  buildRunSummary,
  type FactionStanding,
  type RunSummary,
} from "@/engine/runSummary";
import { buildRunSummaryText } from "@/engine/runSummaryText";
import { getCommanderOrigin } from "@/engine/commanderOrigins";
import { formatCompactMetricValue } from "@/utils/compactMetricValue";

function SummaryScreen() {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "web" ? 0 : insets.top;
  const { state } = useGame();
  const { showToast } = useToast();

  const r = useMemo(() => buildRunSummary(state), [state]);
  // Cosmetic identity surfaces (Pack A + Pack B). Helpers always return
  // a complete record, so legacy saves render cleanly.
  const fact = useMemo(() => getPlayerFaction(state), [state]);
  const outfit = useMemo(() => getPlayerOutfit(state), [state]);

  // Two-channel feedback for the COPY TEXT button:
  // 1) The shared toast system surfaces a "Run summary copied" pill at the
  //    bottom of the screen — same affordance used elsewhere for clipboard /
  //    save success (matches the spec's toast wording).
  // 2) An inline COPIED state on the button itself flips the icon and label
  //    for ~1.8s so the source of the toast is unambiguous (especially on
  //    small viewports where the toast can be far from the button).
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(buildRunSummaryText(r));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      showToast("Run summary copied to clipboard", "success");
    } catch (e) {
      console.warn("Copy run summary failed:", e);
      showToast("Copy failed", "danger");
    }
  }, [r, showToast]);

  return (
    <View style={[s.root, { paddingTop: topInset }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={18} color={Colors.accent} />
        </Pressable>
        <Text style={[s.headerTitle, { flex: 1 }]}>RUN SUMMARY</Text>
        <Pressable
          onPress={handleCopy}
          hitSlop={12}
          accessibilityLabel="Copy run summary as text"
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 4,
              borderWidth: 1,
              borderColor: copied ? Colors.accent : Colors.accent + "60",
              backgroundColor: Colors.accent + (copied ? "22" : "12"),
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather
            name={copied ? "check" : "copy"}
            size={12}
            color={Colors.accent}
          />
          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 1.5, color: Colors.accent }}>
            {copied ? "COPIED" : "COPY TEXT"}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TutorialHint
          id="summary_intro"
          message="Review final population, resources, quality of life, security, faction standings, construction, and policy totals before starting another city."
        />
        <View style={s.card}>
          {/* Header */}
          <View style={s.brandBar}>
            <Text style={s.brand}>MEGACITY</Text>
            <Text style={s.brandSub}>SECTOR MARSHAL</Text>
          </View>
          {/* Pack A — Faction banner. Glyph + colored name + motto. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: fact.primaryColor + "60", backgroundColor: fact.secondaryColor + "30", borderRadius: 4 }}>
            <View style={{ width: 52, height: 52, borderRadius: 4, backgroundColor: fact.secondaryColor, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: fact.primaryColor }}>
              <Insignia id={fact.glyph} size={40} color={fact.primaryColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 1.5, color: fact.primaryColor }} numberOfLines={1}>
                {fact.name.toUpperCase()}
              </Text>
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 2, fontStyle: "italic" }} numberOfLines={2}>
                "{fact.motto}"
              </Text>
            </View>
          </View>
          <Text style={s.cityName}>{r.cityName.toUpperCase()}</Text>
          <Text style={s.leader}>
            {r.playerTitle.toUpperCase()} — {r.playerName.toUpperCase()}
          </Text>
           <Text style={s.dateLine}>
             ORIGIN · {getCommanderOrigin(r.commanderOrigin).name}
           </Text>
          <Text style={s.dateLine}>
            {r.gameDateLabel} · DAY {r.daysSurvived} · TICK {r.totalTicks}
          </Text>
          {/* Pack B — Player loadout footnote. Strictly cosmetic. */}
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, letterSpacing: 1, color: Colors.textMuted, textAlign: "center", marginTop: 4 }}>
            LOADOUT: {formatOutfitSummary(outfit)}
          </Text>

          {/* Steam-release polish — three "tell me what just happened" blocks
              that surface BEFORE the stat dump so the player gets a verdict on
              the run, not just a wall of numbers. Order is intentional:
              STATE OF THE CITY (verdict) → RUN ARCHETYPE (identity) →
              MILESTONE TIMELINE (story). */}
          <View style={s.stateBlock}>
            <Text style={s.stateLabel}>STATE OF THE CITY</Text>
            <Text
              style={[
                s.stateHeadline,
                { color: stateHeadlineColor(r.stateOfCity.headline, Colors) },
              ]}
            >
              [{r.stateOfCity.headline}]
            </Text>
          </View>

          <View style={s.archetypeBlock}>
            <Text style={s.archetypeLabel}>RUN ARCHETYPE</Text>
            <Text style={s.archetypeName}>{r.archetype.name}</Text>
          </View>

          {r.milestoneTimeline.length > 0 ? (
            <Section title="MILESTONE TIMELINE">
              <View style={s.milestoneList}>
                {r.milestoneTimeline.map((m) => (
                  <View key={m.slot} style={s.milestoneRow}>
                    <Text style={s.milestoneSlot}>{String(m.slot).padStart(2, "0")}</Text>
                    <View
                      style={[
                        s.milestoneSeverityDot,
                        { backgroundColor: severityColor(m.severity, Colors) },
                      ]}
                    />
                    <Text style={s.milestoneLabel} numberOfLines={2}>
                      {m.label}
                    </Text>
                  </View>
                ))}
              </View>
            </Section>
          ) : null}

          <Section title="HEADLINE">
            <Grid>
              <BigStat label="POPULATION" value={fmt(r.population)} />
              <BigStat label="CREDITS" value={fmt(r.resources.credits)} />
              <BigStat label="DAYS SURVIVED" value={String(r.daysSurvived)} />
              <BigStat
                label="MILESTONES"
                value={`${r.firstsUnlocked} / ${r.firstsTotal}`}
              />
            </Grid>
          </Section>

          <Section title="QUALITY OF LIFE">
            <Bar label="HAPPINESS" value={r.qol.happiness} good />
            <Bar label="EDUCATION" value={r.qol.education} good />
            <Bar label="PUBLIC HEALTH" value={r.qol.publicHealth} good />
            <Bar label="BIOSPHERE" value={r.qol.biosphere} good />
            <Bar label="LITERACY" value={r.qol.literacy} good />
          </Section>

          <Section title="ORDER & SECURITY">
            <Bar label="LAW & ORDER" value={r.order.lawOrder} good />
            <Bar label="LOYALTY INDEX" value={r.order.loyaltyIndex} good />
            <Bar label="UNREST" value={r.order.unrest} />
            <Bar label="CRIME" value={r.order.crime} />
            <Bar label="CORRUPTION" value={r.order.corruption} />
            <Bar label="FEAR INDEX" value={r.order.fearIndex} />
          </Section>

          <Section title="DEMOGRAPHICS">
            <Grid>
              <SmallStat label="GROWTH/HR" value={fmtSigned(r.populationGrowthRate)} />
              <SmallStat label="BIRTH RATE" value={fmtRate(r.birthRate)} />
              <SmallStat label="DEATH RATE" value={fmtRate(r.deathRate)} />
              <SmallStat label="HOMELESS" value={fmt(r.qol.homeless)} />
              <SmallStat label="LIFE EXP" value={fmt(r.qol.lifeExpectancy) + "y"} />
              <SmallStat label="HOSP USE" value={pct(r.qol.hospitalCapacity)} />
              <SmallStat label="REFUGEES" value={fmt(r.populationCohorts.refugees)} />
              <SmallStat label="PRISONERS" value={fmt(r.populationCohorts.prisoners)} />
              <SmallStat label="SICK" value={fmt(r.populationCohorts.sick)} />
              <SmallStat label="RETIREES" value={fmt(r.populationCohorts.retirees)} />
              <SmallStat label="ORPHANS" value={fmt(r.populationCohorts.orphans)} />
            </Grid>
            <Text style={s.subLabel}>INCOME CLASSES</Text>
            <Row>
              <Cell label="LOW" value={fmt(r.incomeClasses.low)} />
              <Cell label="MIDDLE" value={fmt(r.incomeClasses.middle)} />
              <Cell label="HIGH" value={fmt(r.incomeClasses.high)} />
            </Row>
          </Section>

          <Section title="WORKFORCE">
            <Bar label="EMPLOYMENT" value={r.workforce.employmentRate} good />
            <Text style={s.subLabel}>
              TOTAL {fmt(r.workforce.total)} · UNEMPLOYED {pct(r.workforce.unemploymentRate)}
            </Text>
            <Grid>
              <SmallStat label="INDUSTRIAL" value={fmt(r.workforce.industrial)} />
              <SmallStat label="SERVICE" value={fmt(r.workforce.service)} />
              <SmallStat label="GOVERNMENT" value={fmt(r.workforce.government)} />
              <SmallStat label="RESEARCH" value={fmt(r.workforce.research)} />
              <SmallStat label="INFRASTRUCT" value={fmt(r.workforce.infrastructure)} />
              <SmallStat label="SECURITY" value={fmt(r.workforce.security)} />
              <SmallStat label="BLACK MKT" value={fmt(r.workforce.blackMarket)} />
              <SmallStat label="SECTOR TOTAL" value={fmt(r.workforce.sectorTotal)} />
              <SmallStat label="DIRECT DETAIL" value={fmt(r.workforce.directDetailedRoleTotal)} />
              <SmallStat label="LOCAL ECONOMY" value={fmt(r.workforce.localEconomyJobs)} />
              <SmallStat label="MINING OPS" value={fmt(r.workforce.miningJobs)} />
            </Grid>
            <Text style={s.subLabel}>
              Local economy and mining jobs are included subsets of employed citizens, not extra citizens.
            </Text>
          </Section>

          <Section title="STOCKPILES">
            <Grid>
              <SmallStat label="CREDITS" value={fmt(r.resources.credits)} />
              <SmallStat label="FOOD" value={fmt(r.resources.food)} />
              <SmallStat label="WATER" value={fmt(r.resources.water)} />
              <SmallStat label="POWER" value={fmt(r.resources.power)} />
              <SmallStat label="STEEL" value={fmt(r.resources.steel)} />
              <SmallStat label="GOODS" value={fmt(r.resources.goods)} />
              <SmallStat label="FUEL" value={fmt(r.resources.fuel)} />
              <SmallStat label="MED" value={fmt(r.resources.medSupplies)} />
              <SmallStat label="AMMO" value={fmt(r.resources.ammo)} />
            </Grid>
          </Section>

          <Section title="PRODUCTION BALANCE">
            <BalanceRow label="FOOD" b={r.production.food} suffix="/hr" />
            <BalanceRow label="WATER" b={r.production.water} suffix="/hr" />
            <BalanceRow
              label="POWER"
              b={{
                production: r.production.power.generation,
                consumption: r.production.power.drain,
                net: r.production.power.net,
              }}
              suffix="MW"
            />
            <BalanceRow label="GOODS" b={r.production.goods} suffix="/hr" />
          </Section>

          <Section title="INCOME (PER TICK)">
            <Row>
              <Cell label="TAX" value={fmtSigned(r.incomeRates.tax)} />
              <Cell label="TRADE" value={fmtSigned(r.incomeRates.trade)} />
              <Cell label="TOURISM" value={fmtSigned(r.incomeRates.tourism)} />
              <Cell label="AVG INCOME" value={fmt(r.averageCitizenIncome)} />
            </Row>
          </Section>

          <Section title="INFRASTRUCTURE">
            <Grid>
              <SmallStat label="BUILDINGS" value={formatCompactMetricValue(r.infrastructure.buildingsCount)} exactValue={Math.round(r.infrastructure.buildingsCount).toLocaleString()} />
              <SmallStat label="TYPES" value={formatCompactMetricValue(r.infrastructure.uniqueBuildingTypes)} exactValue={Math.round(r.infrastructure.uniqueBuildingTypes).toLocaleString()} />
              <SmallStat label="DISTRICTS" value={formatCompactMetricValue(r.infrastructure.districtsCount)} exactValue={Math.round(r.infrastructure.districtsCount).toLocaleString()} />
              <SmallStat label="UNITS" value={formatCompactMetricValue(r.infrastructure.unitsCount)} exactValue={Math.round(r.infrastructure.unitsCount).toLocaleString()} />
              <SmallStat label="INFRA HEALTH" value={pct(r.infrastructure.infrastructureHealth)} />
              <SmallStat label="DEFENSE" value={pct(r.infrastructure.defenseRating)} />
            </Grid>
          </Section>

          <Section title="RESEARCH">
            <Row>
              <Cell label="UNLOCKED" value={String(r.research.technologiesUnlocked)} />
              <Cell label="QUEUE" value={String(r.research.queueLength)} />
              <Cell
                label="ACTIVE"
                value={r.research.activeResearchId ? "YES" : "—"}
              />
              <Cell
                label="PROGRESS"
                value={pct(r.research.progressPct)}
              />
            </Row>
          </Section>

          <Section title="TOURISM">
            <Row>
              <Cell label="VISITORS" value={fmt(r.tourism.visitors)} />
              <Cell label="CAPACITY" value={fmt(r.tourism.capacity)} />
              <Cell label="SATISFACTION" value={pct(r.tourism.satisfaction)} />
              <Cell label="INCOME/T" value={fmtSigned(r.incomeRates.tourism)} />
            </Row>
          </Section>

          <Section title="GOVERNANCE & FINANCE">
            <Grid>
              <SmallStat label="EDICTS" value={String(r.governance.activeEdicts)} />
              <SmallStat label="POLICIES" value={String(r.governance.activePolicies)} />
              <SmallStat label="CREDIT RTG" value={fmt(r.governance.creditRating)} />
              <SmallStat label="LOANS OWED" value={fmt(r.governance.outstandingLoans)} />
            </Grid>
          </Section>

          <Section title="DIPLOMACY">
            <Grid>
              <SmallStat label="MEGACITIES" value={String(r.diplomacy.knownMegacities)} />
              <SmallStat label="TOWNSHIPS" value={String(r.diplomacy.knownTownships)} />
              <SmallStat label="LOCATIONS" value={String(r.diplomacy.notableLocations)} />
              <SmallStat label="TRADE PACTS" value={String(r.diplomacy.tradeAgreements)} />
              <SmallStat label="DIPLO PACTS" value={String(r.diplomacy.diplomaticPacts)} />
              <SmallStat label="JOINT PROJ" value={String(r.diplomacy.jointProjects)} />
              <SmallStat label="OPS ACTIVE" value={String(r.diplomacy.activeOperations)} />
              <SmallStat label="ACHIEVE" value={String(r.achievementsUnlocked)} />
            </Grid>
          </Section>

          {r.topFactions.length > 0 ? (
            <Section title="FACTION STANDINGS">
              <View style={s.factionList}>
                {r.topFactions.map((f) => (
                  <FactionRow key={f.id} f={f} />
                ))}
              </View>
            </Section>
          ) : null}

          <Section title="CAREER">
            <Grid>
              <SmallStat label="EVENTS" value={fmt(r.career.eventsHandled)} />
              <SmallStat
                label="STRIKES"
                value={`${r.career.strikesSucceeded}/${r.career.strikesExecuted}`}
              />
              <SmallStat label="CONTRACTS" value={fmt(r.career.contractsCompleted)} />
              <SmallStat label="ACTIVE CTR" value={fmt(r.career.contractsActive)} />
              <SmallStat label="MINING OPS" value={fmt(r.career.miningOps)} />
              <SmallStat label="SCAVENGE" value={fmt(r.career.scavengeExpeditions)} />
              <SmallStat label="LAW MISS" value={fmt(r.career.lawMissions)} />
              <SmallStat label="DEATHS" value={fmt(r.career.totalDeaths)} />
            </Grid>
          </Section>

          {r.biggestEvent ? (
            <View style={s.eventBlock}>
              <Text style={s.eventLabel}>DEFINING MOMENT</Text>
              <Text style={s.eventTitle} numberOfLines={2}>
                {r.biggestEvent.title}
              </Text>
            </View>
          ) : null}

          <View style={s.footerBar}>
            <Text style={s.footerText}>MEGACITY · SECTOR MARSHAL</Text>
          </View>
        </View>

        <View style={s.shareNote}>
          <Feather name="camera" size={12} color={Colors.textMuted} />
          <Text style={s.shareNoteText}>
            Use Photo Mode (H) or your system screenshot tool to capture this
            card and share your run.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ───── Sub-components ─────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  return <View style={s.grid}>{children}</View>;
}

function Row({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  return <View style={s.row}>{children}</View>;
}

function BigStat({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.bigStat}>
      <Text style={s.bigStatLabel}>{label}</Text>
      <Text style={s.bigStatValue}>{value}</Text>
    </View>
  );
}

function SmallStat({ label, value, exactValue }: { label: string; value: string; exactValue?: string }) {
  const s = useStyles();
  return (
    <View
      style={s.smallStat}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${exactValue ?? value}`}
    >
      <Text style={s.smallStatLabel}>{label}</Text>
      <Text
        style={s.smallStatValue}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
      >
        {value}
      </Text>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.cell}>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellValue}>{value}</Text>
    </View>
  );
}

function Bar({ label, value, good }: { label: string; value: number; good?: boolean }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const v = Math.max(0, Math.min(100, value));
  // For "good" stats high is positive; for the rest high is dangerous.
  const color = good
    ? v >= 60 ? Colors.statHigh : v >= 30 ? Colors.statMid : Colors.statLow
    : v >= 60 ? Colors.statLow : v >= 30 ? Colors.statMid : Colors.statHigh;
  return (
    <View style={s.bar}>
      <View style={s.barHeader}>
        <Text style={s.barLabel}>{label}</Text>
        <Text style={[s.barValue, { color }]}>{Math.round(v)}</Text>
      </View>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${v}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function BalanceRow({
  label,
  b,
  suffix,
}: {
  label: string;
  b: { production: number; consumption: number; net: number };
  suffix?: string;
}) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const tone = b.net >= 0 ? Colors.statHigh : Colors.statLow;
  return (
    <View style={s.balanceRow}>
      <Text style={s.balanceLabel}>{label}</Text>
      <Text style={s.balanceProd}>+{fmt(b.production)}</Text>
      <Text style={s.balanceCons}>-{fmt(b.consumption)}</Text>
      <Text style={[s.balanceNet, { color: tone }]}>
        {fmtSigned(b.net)}
        {suffix ?? ""}
      </Text>
    </View>
  );
}

function FactionRow({ f }: { f: FactionStanding }) {
  const { colors: Colors } = useTheme();
  const s = useStyles();
  const tone =
    f.threat > 60 ? Colors.danger : f.loyalty > 60 ? Colors.statHigh : Colors.textSecondary;
  return (
    <View style={s.factionRow}>
      <View style={[s.factionDot, { backgroundColor: tone }]} />
      <Text style={s.factionName} numberOfLines={1}>{f.name.toUpperCase()}</Text>
      <Text style={s.factionType}>{f.type.toUpperCase()}</Text>
      <Text style={s.factionMetric}>L{Math.round(f.loyalty)}</Text>
      <Text style={s.factionMetric}>I{Math.round(f.influence)}</Text>
      <Text style={s.factionMetric}>T{Math.round(f.threat)}</Text>
    </View>
  );
}

// ───── Formatters ─────

// Headline-tone palette for the STATE OF THE CITY block. Hard-failure states
// glow danger, positive states glow accent, neutral states stay text-coloured.
function stateHeadlineColor(headline: string, Colors: ThemePalette): string {
  switch (headline) {
    case "STARVING":
    case "PARCHED":
    case "DARK SECTOR":
    case "RIOTING":
    case "PLAGUE-RIDDEN":
    case "LAWLESS":
      return Colors.danger;
    case "BOOMING":
    case "STABLE":
      return Colors.statHigh;
    case "SHORTAGES":
      return Colors.statMid;
    default:
      return Colors.accent;
  }
}

function severityColor(sev: string | undefined, Colors: ThemePalette): string {
  switch (sev) {
    case "critical": return Colors.danger;
    case "high":     return Colors.statLow;
    case "medium":   return Colors.statMid;
    case "low":      return Colors.statHigh;
    default:         return Colors.textMuted;
  }
}

function fmt(n: number): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}
function fmtSigned(n: number): string {
  if (!isFinite(n)) return "—";
  const v = Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));
  return n >= 0 ? `+${v}` : v;
}
function fmtRate(n: number): string {
  if (!isFinite(n)) return "—";
  return n.toFixed(2);
}
function pct(n: number): string {
  if (!isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const useStyles = makeThemedStyles((Colors: ThemePalette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg, paddingHorizontal: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  headerTitle: {
    color: Colors.accent,
    fontSize: 14,
    letterSpacing: 2,
    fontWeight: "700",
    fontFamily: mono,
  },
  scrollContent: { paddingBottom: 32, gap: 12 },

  card: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 720,
    backgroundColor: Colors.bgCard,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: 6,
    padding: 16,
    gap: 8,
  },
  brandBar: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: 8,
  },
  brand: {
    color: Colors.accent,
    fontSize: 22,
    letterSpacing: 4,
    fontWeight: "900",
    fontFamily: mono,
  },
  brandSub: {
    color: Colors.textMuted,
    fontSize: 10,
    letterSpacing: 2,
    fontFamily: mono,
  },
  cityName: {
    color: Colors.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 4,
  },
  leader: {
    color: Colors.textSecondary,
    fontSize: 12,
    letterSpacing: 1.5,
    fontFamily: mono,
  },
  dateLine: {
    color: Colors.accentDim,
    fontSize: 11,
    letterSpacing: 1.5,
    fontFamily: mono,
    marginBottom: 4,
  },

  section: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
    gap: 6,
  },
  sectionBody: { gap: 6 },
  sectionLabel: {
    color: Colors.accent,
    fontSize: 11,
    letterSpacing: 2.5,
    fontFamily: mono,
    fontWeight: "700",
  },
  subLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: mono,
    marginTop: 2,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  row: { flexDirection: "row", gap: 6 },

  bigStat: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 4,
    padding: 10,
    gap: 4,
  },
  bigStatLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: mono,
  },
  bigStatValue: {
    color: Colors.accent,
    fontSize: 22,
    fontWeight: "800",
    fontFamily: mono,
  },

  smallStat: {
    flexBasis: "23%",
    flexGrow: 1,
    minWidth: 78,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 2,
  },
  smallStatLabel: {
    color: Colors.textMuted,
    fontSize: 8,
    letterSpacing: 1.5,
    fontFamily: mono,
  },
  smallStatValue: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: mono,
    flexShrink: 1,
    minWidth: 0,
  },

  cell: {
    flex: 1,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: "center",
    gap: 2,
  },
  cellLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: mono,
  },
  cellValue: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: "700",
    fontFamily: mono,
  },

  bar: { gap: 3 },
  barHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  barLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    letterSpacing: 1.5,
    fontFamily: mono,
  },
  barValue: { fontSize: 11, fontWeight: "700", fontFamily: mono },
  barTrack: {
    height: 6,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  barFill: { height: "100%" },

  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  balanceLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 11,
    letterSpacing: 1,
    fontFamily: mono,
    fontWeight: "700",
  },
  balanceProd: {
    color: Colors.statHigh,
    fontSize: 11,
    fontFamily: mono,
    width: 60,
    textAlign: "right",
  },
  balanceCons: {
    color: Colors.statLow,
    fontSize: 11,
    fontFamily: mono,
    width: 60,
    textAlign: "right",
  },
  balanceNet: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: mono,
    width: 76,
    textAlign: "right",
  },

  eventBlock: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    borderRadius: 4,
    padding: 10,
    gap: 4,
    marginTop: 6,
  },

  // STATE OF THE CITY block — left-rule + uppercase headline + 2-3 sentence
  // narrative. Sits at the very top of the summary card so the player gets a
  // verdict before they hit a single number.
  stateBlock: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
    borderRadius: 4,
    padding: 12,
    gap: 6,
    marginTop: 10,
  },
  stateLabel: {
    color: Colors.accent,
    fontSize: 9,
    letterSpacing: 2.5,
    fontWeight: "700",
    fontFamily: mono,
  },
  stateHeadline: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 2,
    fontFamily: mono,
  },
  stateNarrative: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },

  // RUN ARCHETYPE block — single-word identity + dystopian tagline.
  archetypeBlock: {
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentDim,
    borderRadius: 4,
    padding: 12,
    gap: 4,
    marginTop: 6,
  },
  archetypeLabel: {
    color: Colors.accent,
    fontSize: 9,
    letterSpacing: 2.5,
    fontWeight: "700",
    fontFamily: mono,
  },
  archetypeName: {
    color: Colors.accent,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: 4,
    fontFamily: mono,
  },
  archetypeTagline: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: "italic",
  },

  // MILESTONE TIMELINE — slot number + severity dot + event title.
  milestoneList: { gap: 4 },
  milestoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  milestoneSlot: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: "700",
    fontFamily: mono,
    letterSpacing: 1,
    width: 22,
  },
  milestoneSeverityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  milestoneLabel: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 14,
  },
  eventLabel: {
    color: Colors.warning,
    fontSize: 9,
    letterSpacing: 2,
    fontWeight: "700",
    fontFamily: mono,
  },
  eventTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  eventBody: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },

  factionList: { gap: 4 },
  factionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.bg,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  factionDot: { width: 8, height: 8, borderRadius: 4 },
  factionName: {
    flex: 1,
    color: Colors.text,
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: "700",
  },
  factionType: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 1,
    fontFamily: mono,
  },
  factionMetric: {
    color: Colors.accent,
    fontSize: 10,
    letterSpacing: 1,
    fontFamily: mono,
    width: 28,
    textAlign: "right",
  },

  footerBar: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 6,
    alignItems: "center",
  },
  footerText: {
    color: Colors.textMuted,
    fontSize: 9,
    letterSpacing: 3,
    fontFamily: mono,
  },
  shareNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignSelf: "center",
    maxWidth: 720,
  },
  shareNoteText: {
    flex: 1,
    color: Colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontStyle: "italic",
  },
}));

export default withScreenBoundary(SummaryScreen, "summary");
