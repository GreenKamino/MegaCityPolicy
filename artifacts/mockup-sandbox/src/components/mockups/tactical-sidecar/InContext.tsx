const INK = "#1a1a1a";
const INK_LIGHT = "#5a5a5a";
const INK_FAINT = "#9a9a9a";
const PAPER = "#f4efe3";
const ACCENT = "#c44a2a";
const HIGHLIGHT = "#fde88f";
const SIDECAR_TINT = "#e6f0e1";

function Box({
  x, y, w, h, fill = "none", stroke = INK, dashed = false, opacity = 1,
}: { x: number; y: number; w: number; h: number; fill?: string; stroke?: string; dashed?: boolean; opacity?: number }) {
  return (
    <path
      d={`M${x + 3} ${y} L${x + w - 4} ${y + 1.5} L${x + w} ${y + h - 3} L${x + 2} ${y + h} Z`}
      fill={fill}
      stroke={stroke}
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      strokeDasharray={dashed ? "4 3" : undefined}
      opacity={opacity}
    />
  );
}

function Scribble({ x, y, w, h, density = 4, color = INK_LIGHT }: { x: number; y: number; w: number; h: number; density?: number; color?: string }) {
  const lines = [];
  for (let i = 0; i < density; i++) {
    const yy = y + (h / density) * i + 3;
    const wobble = (i % 2 === 0 ? 1 : -1) * 1.5;
    lines.push(
      <path
        key={i}
        d={`M${x + 3} ${yy} Q${x + w / 2} ${yy + wobble}, ${x + w - 3} ${yy}`}
        fill="none"
        stroke={color}
        strokeWidth="0.7"
        strokeLinecap="round"
      />
    );
  }
  return <>{lines}</>;
}

function Arrow({ fromX, fromY, toX, toY, text, color = ACCENT, dy = 0 }: {
  fromX: number; fromY: number; toX: number; toY: number; text: string; color?: string; dy?: number;
}) {
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2 - 18;
  return (
    <g>
      <path d={`M${fromX} ${fromY} Q${midX} ${midY}, ${toX} ${toY}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d={`M${toX} ${toY} L${toX - 7} ${toY - 5} M${toX} ${toY} L${toX - 5} ${toY + 7}`} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <text x={fromX} y={fromY + dy} fill={color} fontFamily="'Caveat', cursive" fontSize="20" fontWeight="700">{text}</text>
    </g>
  );
}

export function InContext() {
  return (
    <div className="min-h-screen w-full" style={{ background: PAPER, padding: 24 }}>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;700&family=Architects+Daughter&display=swap"
      />

      <svg viewBox="0 0 1380 880" width="100%" height="780" preserveAspectRatio="xMidYMid meet" style={{ maxWidth: 1380 }}>
        {/* Header note */}
        <text x={20} y={34} fill={INK} fontFamily="'Caveat', cursive" fontSize="32" fontWeight="700">
          how the sidecar sits next to a real game screen
        </text>
        <text x={22} y={56} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="12">
          example: diplomacy view · ~70% main content · ~30% sidecar
        </text>
        <path d="M20 64 Q400 70, 800 60" stroke={INK_LIGHT} strokeWidth="1" fill="none" strokeDasharray="3 3" />

        {/* Phone frame */}
        <Box x={40} y={88} w={1150} h={720} />
        <text x={56} y={108} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">
          GAME WINDOW · 1280 × 800
        </text>

        {/* Top app bar */}
        <Box x={56} y={120} w={1118} h={40} />
        <text x={70} y={146} fill={INK} fontFamily="'Caveat', cursive" fontSize="20" fontWeight="700">MEGACITY</text>
        <text x={170} y={146} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">
          ◆ DAY 42      ◆ ¢ 14,200      ◆ FUEL 76%      ◆ MORALE 64%
        </text>
        <text x={1158} y={146} textAnchor="end" fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">⚙ MENU</text>

        {/* Tab strip */}
        <Box x={56} y={168} w={1118} h={32} />
        {["OVERVIEW","FACTIONS","DIPLOMACY","MILITARY","ECONOMY","CHARACTER","INTEL"].map((t,i)=>(
          <g key={t}>
            <text x={80 + i*145} y={189} fill={i===2?INK:INK_FAINT} fontFamily="'Architects Daughter', cursive" fontSize="11" fontWeight={i===2?700:400}>
              {t}
            </text>
            {i===2 && <rect x={68 + i*145} y={194} width={88} height={3} fill={ACCENT} rx="1" />}
          </g>
        ))}

        {/* ====== MAIN CONTENT (left ~ 760px) ====== */}
        <text x={68} y={222} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="10">
          MAIN CONTENT — diplomacy screen
        </text>

        {/* Faction list header */}
        <text x={68} y={246} fill={INK} fontFamily="'Caveat', cursive" fontSize="22" fontWeight="700">Known Factions</text>
        <text x={770} y={246} textAnchor="end" fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">filter: ALL · ALLIED · HOSTILE</text>

        {/* Faction cards (4 stacked) */}
        {[
          { name: "Sable Vow",     stand: "+72", ally: true,  leader: "Marshal Ren Kade",   note: "treaty pending renewal · day 46" },
          { name: "Iron Concord",  stand: "+18", ally: false, leader: "Chairwoman Yen",     note: "tariff renegotiation requested" },
          { name: "House Korr",    stand: "−4",  ally: false, leader: "Lord Korr",          note: "NDA expires in 4 days" },
          { name: "Vyra-9 Cartel", stand: "−63", ally: false, leader: "The Black Vector",   note: "ACTIVE WAR · sector 14 contested" },
        ].map((f,i) => {
          const y = 260 + i*98;
          const standColor = f.stand.startsWith("+") ? "#3a7a3a" : ACCENT;
          return (
            <g key={f.name}>
              <Box x={68} y={y} w={702} h={88} />
              {/* Crest icon stub */}
              <Box x={80} y={y+10} w={68} h={68} dashed />
              <circle cx={114} cy={y+44} r="22" fill="none" stroke={INK} strokeWidth="1.2" />
              <path d={`M${100} ${y+38} L${114} ${y+30} L${128} ${y+38} L${130} ${y+50} L${114} ${y+58} L${98} ${y+50} Z`} fill="none" stroke={INK} strokeWidth="1.1" />

              <text x={162} y={y+30} fill={INK} fontFamily="'Caveat', cursive" fontSize="22" fontWeight="700">{f.name}</text>
              <text x={162} y={y+48} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">leader: {f.leader}</text>
              <text x={162} y={y+66} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">{f.note}</text>

              {/* Standing meter */}
              <text x={580} y={y+22} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="10">STANDING</text>
              <text x={760} y={y+22} textAnchor="end" fill={standColor} fontFamily="'Caveat', cursive" fontSize="22" fontWeight="700">{f.stand}</text>
              <Box x={580} y={y+30} w={180} h={8} />
              {(() => {
                const v = parseInt(f.stand.replace("−","-"));
                const pct = Math.max(0, Math.min(100, (v + 100) / 2));
                return <rect x={582} y={y+32} width={(180 * pct)/100} height={4} fill={standColor} opacity="0.55" rx="1" />;
              })()}

              {/* Action buttons */}
              <Box x={580} y={y+50} w={86} h={26} />
              <text x={623} y={y+67} textAnchor="middle" fill={INK} fontFamily="'Architects Daughter', cursive" fontSize="11">PARLEY</text>
              <Box x={674} y={y+50} w={86} h={26} />
              <text x={717} y={y+67} textAnchor="middle" fill={f.ally?INK_LIGHT:ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="11">{f.ally?"GIFT":"THREATEN"}</text>
            </g>
          );
        })}

        {/* Highlight one row */}
        <Highlighter x={68} y={554} w={702} h={88} />

        {/* ====== SIDECAR (right ~ 380px) ====== */}
        {/* Tinted background to call out the sidecar zone */}
        <rect x={794} y={216} width={386} height={580} fill={SIDECAR_TINT} opacity="0.5" rx="3" />

        {/* Sidecar outer */}
        <Box x={794} y={216} w={386} h={580} />

        {/* Sidecar header */}
        <Box x={802} y={224} w={370} h={26} />
        <circle cx={812} cy={237} r="3.5" fill={ACCENT} />
        <text x={822} y={241} fill={INK} fontFamily="'Architects Daughter', cursive" fontSize="11">TACTICAL SIDECAR</text>
        <text x={1162} y={241} textAnchor="end" fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">DIPLOMACY · LIVE</text>

        {/* Section 1 label */}
        <text x={802} y={264} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="10">① BLUEPRINT</text>
        <Box x={802} y={268} w={370} h={150} />
        <circle cx={987} cy={343} r="48" fill="none" stroke={INK} strokeWidth="1.1" strokeDasharray="3 3" />
        <circle cx={987} cy={343} r="34" fill="none" stroke={INK} strokeWidth="1.1" />
        <line x1={939} y1={343} x2={1035} y2={343} stroke={INK_LIGHT} strokeWidth="0.7" />
        <line x1={987} y1={295} x2={987} y2={391} stroke={INK_LIGHT} strokeWidth="0.7" />
        <path d={`M970 333 L987 325 L1004 333 L1009 346 L1003 359 L987 366 L971 359 L965 346 Z`} fill="none" stroke={INK} strokeWidth="1.2" />
        <text x={987} y={406} textAnchor="middle" fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">DOSSIER: VYRA-9</text>

        {/* Section 2 label */}
        <text x={802} y={434} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="10">② READOUT</text>
        <Box x={802} y={438} w={180} h={48} />
        <text x={810} y={452} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">TOP ALLY</text>
        <text x={810} y={476} fill={INK} fontFamily="'Caveat', cursive" fontSize="18" fontWeight="700">Sable Vow</text>
        <text x={974} y={476} textAnchor="end" fill="#3a7a3a" fontFamily="'Architects Daughter', cursive" fontSize="10">+4</text>

        <Box x={990} y={438} w={182} h={48} />
        <text x={998} y={452} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">TOP RIVAL</text>
        <text x={998} y={476} fill={INK} fontFamily="'Caveat', cursive" fontSize="18" fontWeight="700">Vyra-9</text>
        <text x={1164} y={476} textAnchor="end" fill={ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="10">−7</text>

        <Box x={802} y={494} w={180} h={48} />
        <text x={810} y={508} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">ACTIVE WARS</text>
        <text x={810} y={532} fill={INK} fontFamily="'Caveat', cursive" fontSize="18" fontWeight="700">2</text>
        <text x={974} y={532} textAnchor="end" fill={ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="10">↑1</text>

        <Box x={990} y={494} w={182} h={48} />
        <text x={998} y={508} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">TREATIES</text>
        <text x={998} y={532} fill={INK} fontFamily="'Caveat', cursive" fontSize="18" fontWeight="700">6</text>
        <text x={1164} y={532} textAnchor="end" fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="10">stable</text>

        {/* Bars */}
        <text x={802} y={560} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">STANDING</text>
        <text x={1172} y={560} textAnchor="end" fill={INK} fontFamily="'Architects Daughter', cursive" fontSize="9">72%</text>
        <Box x={802} y={564} w={370} h={8} />
        <rect x={804} y={566} width={262} height={4} fill="#3a7a3a" opacity="0.55" rx="1" />

        <text x={802} y={584} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">THREAT</text>
        <text x={1172} y={584} textAnchor="end" fill={INK} fontFamily="'Architects Daughter', cursive" fontSize="9">41%</text>
        <Box x={802} y={588} w={370} h={8} />
        <rect x={804} y={590} width={148} height={4} fill={ACCENT} opacity="0.55" rx="1" />

        {/* Section 3 label */}
        <text x={802} y={612} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="10">③ INTEL FEED</text>
        <Box x={802} y={616} w={370} h={150} />

        {[
          { tag: "INTERCEPT", body: "Vyra-9 cartel mobilizing strike teams", op: 1 },
          { tag: "DIPLOMAT",  body: "Iron Concord requests private channel", op: 0.85 },
          { tag: "RUMOR",     body: "Black market: Praxis exo-suit testing", op: 0.7 },
          { tag: "TREATY",    body: "House Korr renegotiation in 4 days",     op: 0.55 },
        ].map((row, i) => (
          <g key={i} opacity={row.op}>
            <text x={812} y={638 + i*36} fill={ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="10">{row.tag}</text>
            <text x={888} y={638 + i*36} fill={INK} fontFamily="'Architects Daughter', cursive" fontSize="10">{row.body}</text>
            {i < 3 && <path d={`M812 ${648 + i*36} Q987 ${650 + i*36}, 1162 ${648 + i*36}`} stroke={INK_LIGHT} strokeWidth="0.5" fill="none" strokeDasharray="2 3" />}
          </g>
        ))}

        {/* Sidecar footer */}
        <Box x={802} y={772} w={370} h={20} />
        <text x={812} y={786} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="9">CH 03 · ENCRYPTED</text>
        <text x={1162} y={786} textAnchor="end" fill={ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="9">DAY 42 · 14:07</text>

        {/* ====== ANNOTATIONS ====== */}
        {/* Pointing to sidecar — placed to the right outside the game window */}
        <text x={1208} y={300} fill={ACCENT} fontFamily="'Caveat', cursive" fontSize="26" fontWeight="700">tactical</text>
        <text x={1208} y={324} fill={ACCENT} fontFamily="'Caveat', cursive" fontSize="26" fontWeight="700">sidecar</text>
        <text x={1208} y={344} fill={ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="11">always-visible</text>
        <text x={1208} y={358} fill={ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="11">right-side panel</text>
        <text x={1208} y={372} fill={ACCENT} fontFamily="'Architects Daughter', cursive" fontSize="11">on every screen</text>
        <path d={`M1205 350 Q1190 400, 1180 460`} stroke={ACCENT} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <path d={`M1180 460 L1174 455 M1180 460 L1186 458`} stroke={ACCENT} strokeWidth="1.5" fill="none" />

        {/* Pointing to main content — placed below header */}
        <text x={1208} y={560} fill={INK_LIGHT} fontFamily="'Caveat', cursive" fontSize="22" fontWeight="700">main</text>
        <text x={1208} y={582} fill={INK_LIGHT} fontFamily="'Caveat', cursive" fontSize="22" fontWeight="700">content</text>
        <text x={1208} y={600} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">unchanged —</text>
        <text x={1208} y={614} fill={INK_LIGHT} fontFamily="'Architects Daughter', cursive" fontSize="11">just narrower</text>
        <path d={`M1205 590 Q1100 600, 800 600`} stroke={INK_LIGHT} strokeWidth="1.2" fill="none" strokeLinecap="round" strokeDasharray="4 3" />
        <path d={`M800 600 L808 595 M800 600 L808 606`} stroke={INK_LIGHT} strokeWidth="1.2" fill="none" />

        {/* Bottom callout */}
        <text x={20} y={836} fill={INK_LIGHT} fontFamily="'Caveat', cursive" fontSize="16" fontWeight="500">
          → same chrome on every screen, only the ① blueprint, ② numbers, and ③ feed swap to match the active tab
        </text>
      </svg>
    </div>
  );
}

function Highlighter({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x} y={y} width={w} height={h} fill={HIGHLIGHT} opacity="0.35" rx="2" />;
}
