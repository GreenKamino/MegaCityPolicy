import "./_group.css";

const MAP_W = 1280;
const MAP_H = 900;

const C = {
  parchment: "#D4C5A0",
  parchmentDark: "#C4B48A",
  ink: "#2A1F0E",
  inkFaded: "#5A4D3A",
  inkLight: "#8A7D6A",
  sepia: "#6B5B3E",
  red: "#8B2500",
  blue: "#2B4570",
  blueFaded: "#4A6890",
  green: "#3A5F3A",
  greenFaded: "#5A8A5A",
  orange: "#B87333",
  coastLine: "#4A6578",
  sandDark: "#B8A070",
  oceanBg: "#8AABB8",
};

const WEST_CONTINENT = `
  M 80,60
  C 92,48 115,38 140,42 C 155,44 168,36 185,32
  C 200,28 218,35 235,30 C 252,25 270,18 290,22
  C 308,25 325,18 345,22 C 358,24 372,18 390,25
  L 405,28 C 418,22 432,16 448,20
  C 462,24 478,18 495,22 C 505,24 512,30 520,35
  C 528,42 535,52 540,65
  C 545,80 548,95 542,110
  C 538,122 542,135 548,148
  C 552,160 548,172 542,185
  C 538,198 542,210 548,225
  C 552,238 548,252 542,265
  C 538,278 542,290 545,305
  C 548,318 542,332 538,345
  C 535,355 540,368 545,382
  C 548,395 542,408 535,420
  C 530,432 535,445 540,458
  C 545,472 540,485 532,498
  C 528,508 532,520 538,535
  C 542,548 538,560 530,572
  C 525,582 530,595 535,608
  C 540,622 535,635 525,645
  C 518,655 525,668 532,680
  C 535,692 528,702 518,710
  C 508,718 498,725 488,728
  C 475,732 462,738 450,742
  C 435,748 422,752 408,748
  C 395,745 382,752 368,755
  C 355,758 342,762 328,758
  C 315,755 302,762 288,765
  C 275,768 262,772 248,768
  C 235,765 222,770 208,775
  C 195,778 182,782 168,778
  C 155,775 142,780 128,785
  C 115,788 102,785 88,788
  C 75,792 62,788 52,782
  C 42,775 35,765 30,752
  C 25,738 22,722 20,708
  C 18,695 22,682 20,668
  C 18,655 15,642 18,628
  C 20,615 16,602 18,588
  C 20,575 16,562 18,548
  C 20,535 16,522 18,508
  C 20,495 16,482 18,468
  C 20,455 16,442 18,428
  C 20,415 16,402 18,388
  C 20,375 16,362 18,348
  C 20,335 16,322 18,308
  C 20,295 16,282 18,268
  C 20,255 16,242 18,228
  C 20,215 16,202 18,188
  C 20,175 16,162 18,148
  C 20,135 22,122 28,108
  C 32,98 40,88 48,78
  C 55,70 65,62 80,60
  Z
`;

const WEST_PENINSULA = `
  M 18,388
  C 8,398 -2,412 -8,428
  C -12,445 -18,462 -15,478
  C -12,495 -5,508 5,515
  C 12,518 16,512 18,508
`;

const WEST_BAY = `
  M 290,22
  C 298,55 318,72 342,78
  C 362,82 382,72 395,55
  C 402,45 405,35 405,28
`;

const EAST_CONTINENT = `
  M 720,55
  C 735,45 755,38 778,42 C 792,44 808,36 825,32
  C 842,28 858,35 878,30 C 895,25 912,18 932,22
  C 948,25 962,18 978,25 C 992,30 1005,24 1020,28
  C 1032,32 1045,38 1055,48
  C 1065,58 1072,70 1078,85
  C 1082,98 1078,112 1082,125
  C 1085,138 1082,152 1078,165
  L 1082,178 C 1085,192 1088,205 1085,218
  C 1082,232 1085,245 1088,258
  C 1092,272 1088,285 1085,298
  C 1082,312 1085,325 1090,338
  L 1092,348 C 1088,362 1082,375 1085,388
  C 1088,402 1092,415 1088,428
  C 1085,438 1082,448 1078,458
  C 1072,468 1065,478 1058,488
  C 1048,502 1055,515 1062,528
  C 1068,542 1062,555 1052,565
  C 1042,575 1048,588 1055,602
  C 1060,615 1052,625 1042,635
  L 1035,642 C 1025,648 1015,655 1005,658
  C 992,662 978,668 968,672
  C 955,678 942,682 928,685
  C 915,688 902,692 888,695
  C 875,698 862,702 848,698
  C 835,695 822,702 808,705
  C 795,708 782,712 768,708
  C 755,705 742,712 728,715
  C 715,718 702,722 688,718
  C 678,715 668,710 660,702
  C 652,695 648,685 645,672
  C 642,658 645,645 648,632
  C 652,618 648,605 645,592
  C 642,578 645,565 648,552
  C 652,538 648,525 645,512
  C 642,498 645,485 648,472
  C 652,458 648,445 645,432
  C 642,418 645,405 648,392
  C 652,378 648,365 645,352
  C 642,338 645,325 648,312
  C 652,298 648,285 645,272
  C 642,258 648,245 652,232
  C 655,218 652,205 648,192
  C 645,178 648,165 652,152
  C 655,138 660,125 668,112
  C 675,100 685,88 698,75
  C 708,65 715,58 720,55
  Z
`;

const NE_CONTINENT = `
  M 880,60
  C 895,52 915,48 938,52
  C 958,55 978,48 998,52
  C 1015,55 1032,48 1052,55
  C 1068,60 1082,68 1095,78
  C 1108,88 1118,102 1125,118
  C 1130,132 1128,148 1132,162
  C 1135,178 1130,192 1125,205
  C 1118,218 1112,228 1102,238
  C 1092,248 1078,255 1065,258
  C 1052,262 1038,265 1025,262
  C 1012,258 998,262 985,265
  C 972,268 958,265 945,268
  C 932,272 918,268 905,265
  C 892,262 878,268 865,272
  C 852,275 842,278 832,275
  C 822,272 815,265 810,255
  C 805,245 802,232 805,218
  C 808,205 812,192 815,178
  C 818,165 815,152 812,138
  C 808,125 812,112 818,98
  C 822,88 832,78 845,68
  C 858,60 870,55 880,60
  Z
`;

const SE_ISLAND = `
  M 1120,620
  C 1132,608 1152,598 1175,602
  C 1198,605 1218,615 1232,628
  C 1245,642 1252,658 1248,675
  C 1245,692 1235,705 1222,715
  C 1208,725 1192,728 1175,725
  C 1158,722 1142,712 1132,698
  C 1122,685 1118,668 1118,652
  C 1118,638 1120,628 1120,620
  Z
`;

const SOUTH_ISLAND = `
  M 480,780
  C 492,768 512,762 535,765
  C 558,768 578,778 592,792
  C 605,808 608,825 600,840
  C 592,852 578,860 560,862
  C 542,865 525,858 510,848
  C 498,838 488,822 485,808
  C 482,795 480,788 480,780
  Z
`;

const NW_ISLAND = `
  M 160,15
  C 172,8 192,5 210,8
  C 228,12 242,22 248,35
  C 252,48 248,58 238,65
  C 228,72 215,68 202,62
  C 188,55 178,45 170,35
  C 165,28 162,22 160,15
  Z
`;

const SMALL_ISLAND_1 = `
  M 595,370
  C 602,362 615,358 628,362
  C 638,365 645,375 642,385
  C 638,395 628,400 618,398
  C 608,395 600,388 598,378
  C 596,374 595,370 595,370
  Z
`;

const SMALL_ISLAND_2 = `
  M 1180,360
  C 1188,352 1202,348 1215,352
  C 1228,358 1235,372 1230,385
  C 1225,398 1212,405 1198,402
  C 1185,398 1178,385 1178,372
  C 1178,365 1180,360 1180,360
  Z
`;

const ALL_LANDS = [
  { path: WEST_CONTINENT, id: "west", cx: 280, cy: 420 },
  { path: EAST_CONTINENT, id: "east", cx: 860, cy: 400 },
  { path: NE_CONTINENT, id: "ne", cx: 968, cy: 165 },
  { path: SE_ISLAND, id: "se", cx: 1185, cy: 665 },
  { path: SOUTH_ISLAND, id: "south", cx: 540, cy: 815 },
  { path: NW_ISLAND, id: "nw", cx: 205, cy: 38 },
  { path: SMALL_ISLAND_1, id: "si1", cx: 618, cy: 380 },
  { path: SMALL_ISLAND_2, id: "si2", cx: 1205, cy: 378 },
];

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cpx1 = prev[0] + (curr[0] - prev[0]) * 0.5;
    const cpx2 = prev[0] + (curr[0] - prev[0]) * 0.5;
    d += ` C${cpx1},${prev[1]} ${cpx2},${curr[1]} ${curr[0]},${curr[1]}`;
  }
  return d;
}

const TERRAIN_ZONES = [
  { cx: 320, cy: 350, rx: 65, ry: 65, color: C.green, opacity: 0.15, label: "CITY CORE" },
  { cx: 320, cy: 350, rx: 130, ry: 130, color: C.green, opacity: 0.05 },
  { cx: 280, cy: 120, rx: 140, ry: 40, color: C.orange, opacity: 0.07, label: "NORTHERN DEADLANDS" },
  { cx: 280, cy: 680, rx: 150, ry: 45, color: C.sepia, opacity: 0.07, label: "SOUTHERN DEPTHS" },
  { cx: 460, cy: 200, rx: 50, ry: 80, color: C.red, opacity: 0.05, label: "IRON FRONTIER" },
  { cx: 80, cy: 400, rx: 50, ry: 150, color: C.blue, opacity: 0.05, label: "WEST COAST" },
  { cx: 420, cy: 500, rx: 80, ry: 80, color: "#8B2500", opacity: 0.06, label: "IRRADIATED ZONE" },
  { cx: 250, cy: 270, rx: 120, ry: 40, color: C.greenFaded, opacity: 0.05, label: "TRADE CORRIDOR" },

  { cx: 860, cy: 320, rx: 60, ry: 60, color: C.green, opacity: 0.12, label: "OSTRAVA" },
  { cx: 860, cy: 320, rx: 120, ry: 120, color: C.green, opacity: 0.04 },
  { cx: 780, cy: 150, rx: 80, ry: 40, color: C.orange, opacity: 0.06, label: "NULL ZONE" },
  { cx: 950, cy: 550, rx: 80, ry: 60, color: "#8B2500", opacity: 0.05, label: "VERDANT REACHES" },
  { cx: 968, cy: 165, rx: 80, ry: 50, color: C.blue, opacity: 0.06, label: "TARKORT" },
  { cx: 1185, cy: 665, rx: 50, ry: 40, color: C.red, opacity: 0.05, label: "EASTERN INDUSTRIAL" },
];

const MOUNTAIN_RANGES = [
  {
    id: "iron-mountains",
    peaks: [[120, 180], [148, 165], [175, 182], [202, 168], [230, 185], [258, 170]] as [number, number][],
    label: "Iron Mountains", lx: 190, ly: 198,
  },
  {
    id: "deadland-ridge",
    peaks: [[350, 120], [378, 105], [405, 118], [432, 102], [458, 115]] as [number, number][],
    label: "Deadland Ridge", lx: 405, ly: 132,
  },
  {
    id: "ashen-peaks",
    peaks: [[150, 600], [178, 585], [205, 598], [232, 582], [258, 595]] as [number, number][],
    label: "Ashen Peaks", lx: 205, ly: 615,
  },
  {
    id: "the-spine",
    peaks: [[490, 250], [498, 280], [488, 310], [496, 340], [485, 370]] as [number, number][],
    label: "The Spine", lx: 512, ly: 310,
  },
  {
    id: "eastern-range",
    peaks: [[780, 420], [795, 445], [785, 470], [798, 495], [788, 520]] as [number, number][],
    label: "Shattered Range", lx: 815, ly: 470,
  },
  {
    id: "tarkort-peaks",
    peaks: [[920, 120], [945, 108], [968, 122], [992, 110], [1015, 125]] as [number, number][],
    label: "Crown Peaks", lx: 968, ly: 140,
  },
];

const DRIED_RIVERS: { points: [number, number][]; label: string; lx: number; ly: number }[] = [
  {
    points: [[280, 180], [270, 220], [260, 260], [268, 300], [260, 340], [255, 380]],
    label: "Old Meridian (dry)", lx: 238, ly: 280,
  },
  {
    points: [[420, 220], [400, 250], [388, 280], [395, 310]],
    label: "Rust Creek", lx: 375, ly: 260,
  },
  {
    points: [[850, 250], [840, 290], [830, 330], [835, 370]],
    label: "Grey Wash", lx: 815, ly: 310,
  },
];

const PLATEAU_MARKS = [
  { cx: 350, cy: 240, rx: 50, ry: 22, label: "Command Plateau", lx: 350, ly: 218 },
  { cx: 120, cy: 480, rx: 40, ry: 18, label: "Scoria Mesa", lx: 120, ly: 462 },
  { cx: 950, cy: 420, rx: 45, ry: 18, label: "Warden Flat", lx: 950, ly: 402 },
];

const CANYON_MARKS = [
  { x: 380, y: 310, angle: 30, label: "Irongate Canyon", lx: 380, ly: 292 },
  { x: 430, y: 520, angle: 20, label: "The Rift", lx: 430, ly: 502 },
  { x: 200, y: 230, angle: -15, label: "Echo Rift", lx: 200, ly: 212 },
];

const WATER_BODIES = [
  { label: "T H E   O B S I D I A N   S E A", x: 610, y: 430, fontSize: 12, isOcean: true },
  { label: "The Shattered Coast", x: 8, y: 420, fontSize: 9, rotation: -90 },
  { label: "Acid Strait", x: 610, y: 700, fontSize: 9 },
  { label: "Mirror Basin", x: 330, y: 80, fontSize: 8 },
  { label: "S O U T H E R N   R E A C H", x: 640, y: 880, fontSize: 10, isOcean: true },
  { label: "G U L F  O F  I R O N", x: 610, y: 200, fontSize: 9, isOcean: true },
  { label: "The Bitter Deep", x: 1200, y: 530, fontSize: 9, isOcean: true },
  { label: "Carrion Bay", x: 580, y: 100, fontSize: 8 },
  { label: "Wrack Cove", x: -5, y: 520, fontSize: 7, rotation: -45 },
];

const LOCATIONS: { x: number; y: number; name: string; type: "player" | "megacity" | "nation" | "township" | "notable" | "resource" }[] = [
  { x: 320, y: 370, name: "MEGACITY", type: "player" },

  { x: 180, y: 300, name: "Nova Pacifica", type: "megacity" },
  { x: 120, y: 360, name: "Black Atlantic Rig", type: "megacity" },
  { x: 350, y: 190, name: "Aurelius Dominion", type: "megacity" },
  { x: 860, y: 340, name: "The Recursion", type: "megacity" },

  { x: 460, y: 170, name: "The Iron Khanate", type: "nation" },
  { x: 130, y: 260, name: "The Iron Armada", type: "nation" },
  { x: 1155, y: 655, name: "Ashfall Citadel", type: "nation" },
  { x: 960, y: 180, name: "Tarkort Federation", type: "nation" },

  { x: 380, y: 290, name: "Fort Stern", type: "township" },
  { x: 350, y: 360, name: "Irongate", type: "township" },
  { x: 250, y: 440, name: "Port Sulphur", type: "township" },
  { x: 150, y: 500, name: "Helix Commune", type: "township" },
  { x: 140, y: 560, name: "Greywater", type: "township" },
  { x: 430, y: 430, name: "Blackridge", type: "township" },
  { x: 920, y: 450, name: "Scrapyard City", type: "township" },
  { x: 980, y: 580, name: "The Crucible", type: "township" },
  { x: 820, y: 600, name: "Drift Haven", type: "township" },
  { x: 280, y: 620, name: "Scaffold", type: "township" },
  { x: 1200, y: 680, name: "Tide's End", type: "township" },

  { x: 280, y: 280, name: "Trade Nexus Alpha", type: "notable" },
  { x: 380, y: 240, name: "Weather Stn. Prime", type: "notable" },
  { x: 310, y: 410, name: "Antiquity Market", type: "notable" },
  { x: 370, y: 400, name: "Sector Zero Crater", type: "notable" },
  { x: 300, y: 340, name: "The Museum", type: "notable" },
  { x: 340, y: 450, name: "Monument of Compliance", type: "notable" },
  { x: 270, y: 420, name: "Parliament of Crows", type: "notable" },
  { x: 330, y: 310, name: "Civilization 9", type: "notable" },
  { x: 290, y: 390, name: "Pilgrim Station", type: "notable" },
  { x: 260, y: 470, name: "The Last Library", type: "notable" },
  { x: 250, y: 510, name: "New Eden", type: "notable" },
  { x: 380, y: 430, name: "The Wall of Names", type: "notable" },
  { x: 350, y: 400, name: "Cathedral of Rust", type: "notable" },
  { x: 380, y: 370, name: "Perimeter Wall", type: "notable" },
  { x: 280, y: 250, name: "Market Crossing", type: "notable" },
  { x: 310, y: 270, name: "Old Highway 99", type: "notable" },
  { x: 320, y: 300, name: "The Clock Tower", type: "notable" },
  { x: 950, y: 500, name: "Beacon Ruin", type: "notable" },
  { x: 540, y: 820, name: "Storm Rock", type: "notable" },
  { x: 80, y: 650, name: "Wrack Isle", type: "notable" },

  { x: 400, y: 200, name: "Copper Teeth Outcrop", type: "resource" },
  { x: 360, y: 380, name: "Rust Canyon", type: "resource" },
];

const UNDISCOVERED: [number, number][] = [
  [420, 160], [450, 300], [370, 550], [480, 600],
  [200, 650], [100, 300], [440, 480], [380, 640],
  [750, 200], [820, 180], [900, 380], [960, 620],
  [780, 550], [700, 400], [1050, 300], [1020, 200],
  [1180, 400], [620, 380], [540, 780], [570, 800],
];

function nodeColor(type: string): string {
  switch (type) {
    case "player": return C.green;
    case "megacity": return C.blue;
    case "nation": return C.orange;
    case "township": return C.greenFaded;
    case "notable": return C.inkLight;
    case "resource": return "#DAA520";
    default: return C.inkFaded;
  }
}

function nodeSize(type: string): number {
  switch (type) {
    case "player": return 7;
    case "megacity": return 5;
    case "nation": return 5;
    case "township": return 4;
    case "notable": return 3;
    case "resource": return 4;
    default: return 3;
  }
}

function InnerContours({ path, clipId, cx, cy, count, startInset, spacing }: {
  path: string; clipId: string; cx: number; cy: number;
  count: number; startInset: number; spacing: number;
}) {
  const lines = [];
  for (let i = 0; i < count; i++) {
    const inset = startInset + i * spacing;
    const scale = 1 - inset / 1000;
    const opacity = Math.max(0.04, 0.18 - i * 0.025);
    const sw = Math.max(0.25, 0.6 - i * 0.05);
    lines.push(
      <path key={i} d={path} fill="none" stroke={C.coastLine} strokeWidth={sw}
        opacity={opacity}
        transform={`translate(${cx * (1 - scale)}, ${cy * (1 - scale)}) scale(${scale})`} />
    );
  }
  return (
    <g clipPath={`url(#${clipId})`}>
      {lines}
    </g>
  );
}

export function EnhancedMap() {
  return (
    <div style={{ width: MAP_W, height: MAP_H, position: "relative", overflow: "hidden", background: C.oceanBg }}>
      <svg width={MAP_W} height={MAP_H} viewBox={`-30 -10 ${MAP_W + 60} ${MAP_H + 20}`}
        style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          {ALL_LANDS.map((land) => (
            <clipPath key={`clip-${land.id}`} id={`clip-${land.id}`}><path d={land.path} /></clipPath>
          ))}
          <filter id="land-shadow">
            <feDropShadow dx="2" dy="2" stdDeviation="3" floodColor="#1a1408" floodOpacity="0.25" />
          </filter>
        </defs>

        <rect x="-30" y="-10" width={MAP_W + 60} height={MAP_H + 20} fill={C.oceanBg} />

        {ALL_LANDS.map((land) => (
          <g key={`land-${land.id}`}>
            <g filter="url(#land-shadow)"><path d={land.path} fill={C.parchment} /></g>
            <path d={land.path} fill={C.parchment} />
          </g>
        ))}

        {TERRAIN_ZONES.map((z, i) => (
          <g key={i}>
            <ellipse cx={z.cx} cy={z.cy} rx={z.rx} ry={z.ry} fill={z.color} opacity={z.opacity} />
            {z.label && (
              <text x={z.cx} y={z.cy - z.ry + 14} textAnchor="middle"
                fill={C.inkLight} fontSize="9" fontFamily="Inter, sans-serif"
                letterSpacing="2.5" opacity="0.45" fontWeight="600">
                {z.label}
              </text>
            )}
          </g>
        ))}

        {ALL_LANDS.map((land) => {
          const big = land.id === "west" || land.id === "east" || land.id === "ne";
          return (
            <g key={`coast-${land.id}`}>
              <path d={land.path} fill="none" stroke={C.coastLine}
                strokeWidth={big ? 0.8 : 0.6} opacity={big ? 0.4 : 0.3} />
              <InnerContours path={land.path} clipId={`clip-${land.id}`}
                cx={land.cx} cy={land.cy}
                count={big ? 5 : 2} startInset={big ? 12 : 8} spacing={big ? 16 : 14} />
            </g>
          );
        })}

        <path d={WEST_PENINSULA} fill="none" stroke={C.coastLine} strokeWidth="0.4" opacity="0.2" />
        <path d={WEST_BAY} fill="none" stroke={C.coastLine} strokeWidth="0.35" opacity="0.15" strokeDasharray="4,4" />

        {MOUNTAIN_RANGES.map((range) => (
          <g key={range.id}>
            {range.peaks.map((p, i) => (
              <g key={i}>
                <polygon
                  points={`${p[0]},${p[1]} ${p[0] - 8},${p[1] + 13} ${p[0] + 8},${p[1] + 13}`}
                  fill="none" stroke={C.inkFaded} strokeWidth="0.5" opacity="0.3"
                />
                <line x1={p[0]} y1={p[1]} x2={p[0] + 4} y2={p[1] + 8}
                  stroke={C.inkFaded} strokeWidth="0.4" opacity="0.2" />
              </g>
            ))}
            <text x={range.lx} y={range.ly} textAnchor="middle"
              fill={C.inkFaded} fontSize="7" fontFamily="Inter, sans-serif"
              fontStyle="italic" opacity="0.55" letterSpacing="1">
              {range.label}
            </text>
          </g>
        ))}

        {DRIED_RIVERS.map((river) => (
          <g key={river.label}>
            <path d={smoothPath(river.points)} fill="none" stroke={C.sandDark}
              strokeWidth="1.2" opacity="0.18" strokeDasharray="4,3" />
            <text x={river.lx} y={river.ly} textAnchor="middle"
              fill={C.sandDark} fontSize="6.5" fontFamily="Inter, sans-serif"
              fontStyle="italic" opacity="0.35" letterSpacing="1">
              {river.label}
            </text>
          </g>
        ))}

        {PLATEAU_MARKS.map((p) => (
          <g key={p.label}>
            <ellipse cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry}
              fill="none" stroke={C.inkFaded} strokeWidth="0.6" opacity="0.15"
              strokeDasharray="3,3" />
            <text x={p.lx} y={p.ly} textAnchor="middle"
              fill={C.inkFaded} fontSize="6.5" fontFamily="Inter, sans-serif"
              fontStyle="italic" opacity="0.4" letterSpacing="1">
              {p.label}
            </text>
          </g>
        ))}

        {CANYON_MARKS.map((c) => (
          <g key={c.label} transform={`rotate(${c.angle}, ${c.x}, ${c.y})`}>
            <line x1={c.x - 15} y1={c.y} x2={c.x + 15} y2={c.y}
              stroke={C.inkFaded} strokeWidth="1" opacity="0.25" />
            <line x1={c.x - 13} y1={c.y - 2.5} x2={c.x + 13} y2={c.y - 2.5}
              stroke={C.inkFaded} strokeWidth="0.35" opacity="0.12" />
            <line x1={c.x - 13} y1={c.y + 2.5} x2={c.x + 13} y2={c.y + 2.5}
              stroke={C.inkFaded} strokeWidth="0.35" opacity="0.12" />
            <text x={c.lx} y={c.ly} textAnchor="middle" transform={`rotate(${-c.angle}, ${c.lx}, ${c.ly})`}
              fill={C.inkFaded} fontSize="6" fontFamily="Inter, sans-serif"
              fontStyle="italic" opacity="0.4" letterSpacing="1">
              {c.label}
            </text>
          </g>
        ))}

        {WATER_BODIES.map((w, i) => (
          <text key={i} x={w.x} y={w.y} textAnchor="middle"
            fill={(w as any).isOcean ? C.coastLine : C.blueFaded}
            fontSize={w.fontSize} fontFamily="Inter, sans-serif"
            fontStyle="italic" opacity={(w as any).isOcean ? 0.3 : 0.45} letterSpacing="3"
            transform={w.rotation ? `rotate(${w.rotation}, ${w.x}, ${w.y})` : undefined}>
            {w.label}
          </text>
        ))}

        {UNDISCOVERED.map(([x, y], i) => (
          <text key={`u-${i}`} x={x} y={y} textAnchor="middle" dominantBaseline="central"
            fill={C.inkLight} fontSize="12" fontFamily="Inter, sans-serif"
            opacity="0.15" fontWeight="700">
            ?
          </text>
        ))}

        {LOCATIONS.map((loc) => {
          const r = nodeSize(loc.type);
          const col = nodeColor(loc.type);
          if (loc.type === "player") {
            return (
              <g key={loc.name}>
                <circle cx={loc.x} cy={loc.y} r={r + 8} fill={col} opacity="0.08" />
                <circle cx={loc.x} cy={loc.y} r={r + 4} fill={col} opacity="0.18" />
                <polygon
                  points={`${loc.x},${loc.y - r} ${loc.x + r},${loc.y} ${loc.x},${loc.y + r} ${loc.x - r},${loc.y}`}
                  fill={col} stroke={col} strokeWidth="1.5" />
                <text x={loc.x} y={loc.y + r + 14} textAnchor="middle"
                  fill={col} fontSize="11" fontFamily="Inter, sans-serif"
                  fontWeight="800" letterSpacing="3">
                  {loc.name}
                </text>
              </g>
            );
          }
          if (loc.type === "resource") {
            return (
              <g key={loc.name}>
                <polygon
                  points={`${loc.x},${loc.y - r} ${loc.x + r},${loc.y} ${loc.x},${loc.y + r} ${loc.x - r},${loc.y}`}
                  fill={col} stroke={col} strokeWidth="1" opacity="0.85" />
                <text x={loc.x} y={loc.y - r - 3} textAnchor="middle"
                  fill={col} fontSize="6" fontFamily="Inter, sans-serif"
                  fontWeight="600" opacity="0.7" letterSpacing="0.3">
                  {loc.name}
                </text>
              </g>
            );
          }
          return (
            <g key={loc.name}>
              <circle cx={loc.x} cy={loc.y} r={r} fill={col} opacity="0.85" />
              <text x={loc.x} y={loc.y - r - 3} textAnchor="middle"
                fill={C.ink} fontSize="6" fontFamily="Inter, sans-serif"
                fontWeight="500" opacity="0.6" letterSpacing="0.3">
                {loc.name}
              </text>
            </g>
          );
        })}

        <g transform="translate(30, 770)">
          <rect x="-5" y="-5" width="90" height="95" rx="3" fill={C.parchment} opacity="0.9"
            stroke={C.inkFaded} strokeWidth="0.3" />
          <circle cx="40" cy="40" r="35" fill="none" stroke={C.inkFaded} strokeWidth="0.4" opacity="0.25" />
          <line x1="40" y1="8" x2="40" y2="72" stroke={C.inkFaded} strokeWidth="0.4" opacity="0.2" />
          <line x1="8" y1="40" x2="72" y2="40" stroke={C.inkFaded} strokeWidth="0.4" opacity="0.2" />
          <text x="40" y="6" textAnchor="middle" fill={C.inkFaded} fontSize="9" fontFamily="Inter, sans-serif" fontWeight="700" opacity="0.45">N</text>
          <text x="40" y="82" textAnchor="middle" fill={C.inkFaded} fontSize="7" fontFamily="Inter, sans-serif" opacity="0.35">S</text>
          <text x="77" y="43" textAnchor="middle" fill={C.inkFaded} fontSize="7" fontFamily="Inter, sans-serif" opacity="0.35">E</text>
          <text x="3" y="43" textAnchor="middle" fill={C.inkFaded} fontSize="7" fontFamily="Inter, sans-serif" opacity="0.35">W</text>
          <polygon points="40,10 38,17 42,17" fill={C.inkFaded} opacity="0.35" />
        </g>

        <g transform="translate(1095, 10)">
          <rect x="0" y="0" width="160" height="78" rx="3" fill={C.parchment} opacity="0.9"
            stroke={C.inkFaded} strokeWidth="0.3" />
          <text x="10" y="15" fill={C.ink} fontSize="7" fontFamily="Inter, sans-serif" fontWeight="700"
            opacity="0.55" letterSpacing="1">TACTICAL OVERVIEW</text>
          <line x1="10" y1="20" x2="150" y2="20" stroke={C.inkFaded} strokeWidth="0.25" opacity="0.25" />

          <circle cx="16" cy="30" r="2.5" fill={C.green} opacity="0.85" />
          <text x="23" y="33" fill={C.ink} fontSize="6.5" fontFamily="Inter, sans-serif" opacity="0.5">Your City</text>

          <circle cx="16" cy="42" r="2.5" fill={C.blue} opacity="0.85" />
          <text x="23" y="45" fill={C.ink} fontSize="6.5" fontFamily="Inter, sans-serif" opacity="0.5">Megacity</text>

          <circle cx="85" cy="30" r="2.5" fill={C.orange} opacity="0.85" />
          <text x="92" y="33" fill={C.ink} fontSize="6.5" fontFamily="Inter, sans-serif" opacity="0.5">Nation</text>

          <circle cx="85" cy="42" r="2.5" fill={C.greenFaded} opacity="0.85" />
          <text x="92" y="45" fill={C.ink} fontSize="6.5" fontFamily="Inter, sans-serif" opacity="0.5">Township</text>

          <circle cx="16" cy="54" r="2.5" fill={C.inkLight} opacity="0.85" />
          <text x="23" y="57" fill={C.ink} fontSize="6.5" fontFamily="Inter, sans-serif" opacity="0.5">Notable</text>

          <polygon points="85,51 87.5,54 85,57 82.5,54" fill="#DAA520" opacity="0.85" />
          <text x="92" y="57" fill={C.ink} fontSize="6.5" fontFamily="Inter, sans-serif" opacity="0.5">Resource</text>

          <text x="16" y="70" fill={C.inkLight} fontSize="9" fontFamily="Inter, sans-serif" opacity="0.18" fontWeight="700">?</text>
          <text x="26" y="70" fill={C.ink} fontSize="6.5" fontFamily="Inter, sans-serif" opacity="0.5">Undiscovered</text>
        </g>

        <text x="20" y={MAP_H - 5} fill={C.inkLight} fontSize="6.5" fontFamily="Inter, sans-serif"
          opacity="0.3" letterSpacing="2">
          MEGACITY TACTICAL COMMAND — CLASSIFIED — WASTELAND SURVEY DIVISION — GRID REF: MC-7829
        </text>
      </svg>
    </div>
  );
}
