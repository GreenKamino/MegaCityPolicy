import { useEffect, useState } from "react";

const COLORS = {
  base: "#0a0d08",
  panel: "#0f1410",
  edge: "#1c2618",
  grid: "#1a2417",
  accent: "#7fff7f",
  accentDim: "#3a7a3a",
  text: "#cfe8cf",
  muted: "#6a8a6a",
  warn: "#ffb347",
  danger: "#ff5e5e",
};

const FEED_LINES: { tag: string; tagColor: string; text: string }[] = [
  { tag: "INTERCEPT", tagColor: COLORS.accent, text: "VYRA-9 cartel mobilizing 3 strike teams toward Sector 14" },
  { tag: "DIPLOMAT", tagColor: COLORS.warn, text: "Iron Concord envoy requests private channel re: tariff" },
  { tag: "RUMOR", tagColor: COLORS.muted, text: "Black market chatter: Praxis Syndicate testing new exo-suit" },
  { tag: "TREATY", tagColor: COLORS.accent, text: "NDA with House Korr enters renegotiation window in 4 days" },
  { tag: "INTERCEPT", tagColor: COLORS.danger, text: "Hostile recon ping from unknown faction at perimeter relay" },
  { tag: "DIPLOMAT", tagColor: COLORS.warn, text: "Tradehall Chairwoman Yen confirmed for summit, Day 47" },
  { tag: "RUMOR", tagColor: COLORS.muted, text: "Two governors quietly liquidating bond reserves overnight" },
  { tag: "TREATY", tagColor: COLORS.accent, text: "Mutual-defense pact with Sable Vow approaches 90% trust" },
];

function ScanlineOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "repeating-linear-gradient(to bottom, rgba(127,255,127,0.04) 0px, rgba(127,255,127,0.04) 1px, transparent 1px, transparent 3px)",
        mixBlendMode: "screen",
      }}
    />
  );
}

function CornerBracket({ corner }: { corner: "tl" | "tr" | "bl" | "br" }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 14,
    height: 14,
    borderColor: COLORS.accent,
    borderStyle: "solid",
  };
  const pos: Record<string, React.CSSProperties> = {
    tl: { top: 4, left: 4, borderWidth: "2px 0 0 2px" },
    tr: { top: 4, right: 4, borderWidth: "2px 2px 0 0" },
    bl: { bottom: 4, left: 4, borderWidth: "0 0 2px 2px" },
    br: { bottom: 4, right: 4, borderWidth: "0 2px 2px 0" },
  };
  return <div style={{ ...base, ...pos[corner] }} />;
}

function BlueprintCrest() {
  return (
    <svg viewBox="0 0 220 180" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M10 0H0V10" fill="none" stroke={COLORS.grid} strokeWidth="0.5" />
        </pattern>
        <radialGradient id="glow" cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="rgba(127,255,127,0.18)" />
          <stop offset="100%" stopColor="rgba(127,255,127,0)" />
        </radialGradient>
      </defs>
      <rect width="220" height="180" fill="url(#grid)" />
      <rect width="220" height="180" fill="url(#glow)" />

      {/* Outer reticle */}
      <circle cx="110" cy="92" r="62" fill="none" stroke={COLORS.accentDim} strokeWidth="0.8" strokeDasharray="2 3" />
      <circle cx="110" cy="92" r="48" fill="none" stroke={COLORS.accent} strokeWidth="0.8" />
      <line x1="40" y1="92" x2="180" y2="92" stroke={COLORS.accentDim} strokeWidth="0.5" />
      <line x1="110" y1="22" x2="110" y2="162" stroke={COLORS.accentDim} strokeWidth="0.5" />

      {/* Faction crest: stylized angular wolf head */}
      <g stroke={COLORS.accent} strokeWidth="1.4" fill="none" strokeLinejoin="miter">
        <path d="M82 60 L110 48 L138 60 L150 78 L142 102 L128 118 L110 124 L92 118 L78 102 L70 78 Z" />
        <path d="M92 78 L100 86 L96 96" />
        <path d="M128 78 L120 86 L124 96" />
        <path d="M104 102 L110 110 L116 102" />
        <path d="M82 60 L88 44 L96 56" />
        <path d="M138 60 L132 44 L124 56" />
      </g>

      {/* Tick marks */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r1 = 62, r2 = 68;
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={110 + Math.cos(rad) * r1}
            y1={92 + Math.sin(rad) * r1}
            x2={110 + Math.cos(rad) * r2}
            y2={92 + Math.sin(rad) * r2}
            stroke={COLORS.accent}
            strokeWidth="1"
          />
        );
      })}

      {/* Caption */}
      <text x="110" y="172" textAnchor="middle" fill={COLORS.muted} fontSize="7" fontFamily="monospace" letterSpacing="2">
        SUBJECT: VYRA-9 / RIVAL CARTEL
      </text>
    </svg>
  );
}

function HeaderBar() {
  return (
    <div
      className="flex items-center justify-between px-3 py-2"
      style={{ borderBottom: `1px solid ${COLORS.edge}`, background: COLORS.panel }}
    >
      <div className="flex items-center gap-2">
        <div
          className="h-2 w-2 rounded-full"
          style={{ background: COLORS.accent, boxShadow: `0 0 6px ${COLORS.accent}` }}
        />
        <span
          className="text-[10px] tracking-[0.3em]"
          style={{ color: COLORS.accent, fontFamily: "monospace" }}
        >
          TACTICAL SIDECAR
        </span>
      </div>
      <span className="text-[9px] tracking-[0.2em]" style={{ color: COLORS.muted, fontFamily: "monospace" }}>
        DIPLOMACY · LIVE
      </span>
    </div>
  );
}

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2 pb-1">
      <span
        className="text-[9px] tracking-[0.32em]"
        style={{ color: COLORS.accentDim, fontFamily: "monospace" }}
      >
        {children}
      </span>
      {right}
    </div>
  );
}

function StatCell({
  label,
  value,
  delta,
  deltaColor = COLORS.accent,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
}) {
  return (
    <div
      className="relative px-3 py-2"
      style={{ background: COLORS.base, border: `1px solid ${COLORS.edge}` }}
    >
      <div
        className="text-[9px] tracking-[0.2em]"
        style={{ color: COLORS.muted, fontFamily: "monospace" }}
      >
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span
          className="text-xl leading-none"
          style={{
            color: COLORS.text,
            fontFamily: "monospace",
            textShadow: `0 0 6px rgba(127,255,127,0.2)`,
          }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="text-[10px]"
            style={{ color: deltaColor, fontFamily: "monospace" }}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

function MiniBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center justify-between text-[9px]" style={{ fontFamily: "monospace" }}>
        <span style={{ color: COLORS.muted, letterSpacing: "0.2em" }}>{label}</span>
        <span style={{ color: COLORS.text }}>{pct}%</span>
      </div>
      <div
        className="mt-1 h-1.5 w-full"
        style={{ background: COLORS.base, border: `1px solid ${COLORS.edge}` }}
      >
        <div
          className="h-full"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>
    </div>
  );
}

function IntelFeed() {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setOffset((o) => (o + 1) % FEED_LINES.length), 2400);
    return () => clearInterval(id);
  }, []);

  const visible = Array.from({ length: 4 }, (_, i) => FEED_LINES[(offset + i) % FEED_LINES.length]);

  return (
    <div className="px-3 pb-2">
      <div
        className="relative overflow-hidden"
        style={{
          background: COLORS.base,
          border: `1px solid ${COLORS.edge}`,
          height: 152,
        }}
      >
        <div className="flex flex-col">
          {visible.map((line, i) => (
            <div
              key={`${offset}-${i}`}
              className="flex gap-2 px-2 py-2"
              style={{
                fontFamily: "monospace",
                fontSize: 10,
                lineHeight: 1.3,
                borderBottom: i < 3 ? `1px dashed ${COLORS.edge}` : "none",
                opacity: i === 0 ? 1 : 0.55 + (3 - i) * 0.1,
                animation: i === 0 ? "sidecarFadeIn 480ms ease-out" : undefined,
              }}
            >
              <span
                style={{
                  color: line.tagColor,
                  letterSpacing: "0.15em",
                  flexShrink: 0,
                  width: 70,
                }}
              >
                {line.tag}
              </span>
              <span style={{ color: COLORS.text, flex: 1 }}>{line.text}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes sidecarFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export function TacticalSidecar() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "#05070a", padding: 16 }}
    >
      <div
        className="relative"
        style={{
          width: 360,
          height: 820,
          background: COLORS.base,
          border: `1px solid ${COLORS.edge}`,
          boxShadow: `0 0 0 1px ${COLORS.panel}, 0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(127,255,127,0.05)`,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <CornerBracket corner="tl" />
        <CornerBracket corner="tr" />
        <CornerBracket corner="bl" />
        <CornerBracket corner="br" />

        <HeaderBar />

        {/* Top: Blueprint art */}
        <SectionLabel
          right={
            <span
              className="text-[9px]"
              style={{ color: COLORS.muted, fontFamily: "monospace" }}
            >
              Δ CTX
            </span>
          }
        >
          BLUEPRINT // CONTEXT
        </SectionLabel>
        <div
          className="mx-3 relative"
          style={{
            background: COLORS.panel,
            border: `1px solid ${COLORS.edge}`,
            height: 200,
          }}
        >
          <BlueprintCrest />
          <div
            className="absolute left-2 top-2 text-[8px] tracking-[0.25em]"
            style={{ color: COLORS.accent, fontFamily: "monospace" }}
          >
            ◉ REC
          </div>
          <div
            className="absolute right-2 top-2 text-[8px] tracking-[0.25em]"
            style={{ color: COLORS.muted, fontFamily: "monospace" }}
          >
            DOSSIER 04 / 12
          </div>
        </div>

        {/* Middle: Live readout */}
        <SectionLabel>READOUT // LIVE</SectionLabel>
        <div className="grid grid-cols-2 gap-2 px-3">
          <StatCell label="TOP ALLY" value="Sable Vow" delta="+4" />
          <StatCell label="TOP RIVAL" value="Vyra-9" delta="-7" deltaColor={COLORS.danger} />
          <StatCell label="ACTIVE WARS" value="2" delta="↑1" deltaColor={COLORS.warn} />
          <StatCell label="TREATIES" value="6" delta="stable" deltaColor={COLORS.muted} />
        </div>
        <div className="mt-1">
          <MiniBar label="STANDING" pct={72} color={COLORS.accent} />
          <MiniBar label="THREAT" pct={41} color={COLORS.warn} />
        </div>

        {/* Bottom: Intel feed */}
        <SectionLabel
          right={
            <span
              className="text-[9px]"
              style={{ color: COLORS.accentDim, fontFamily: "monospace" }}
            >
              ●  4 / {FEED_LINES.length}
            </span>
          }
        >
          INTEL FEED
        </SectionLabel>
        <IntelFeed />

        <div
          className="mt-auto px-3 py-1.5 flex items-center justify-between"
          style={{ borderTop: `1px solid ${COLORS.edge}`, background: COLORS.panel }}
        >
          <span
            className="text-[9px] tracking-[0.25em]"
            style={{ color: COLORS.muted, fontFamily: "monospace" }}
          >
            CH 03 · ENCRYPTED
          </span>
          <span
            className="text-[9px] tracking-[0.25em]"
            style={{ color: COLORS.accent, fontFamily: "monospace" }}
          >
            DAY 42 · 14:07
          </span>
        </div>

        <ScanlineOverlay />
      </div>
    </div>
  );
}
