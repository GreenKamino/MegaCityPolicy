import "./_group.css";

const W = 900;
const H = 880;

const INK = "#3a3530";
const PAPER = "#f3ecdb";

type Pt = [number, number];

const COAST_PTS: Pt[] = [
  [140, 80], [165, 65], [195, 50], [225, 60], [255, 45], [285, 55],
  [315, 40], [350, 35], [385, 45], [420, 38], [455, 55], [490, 48],
  [525, 65], [560, 60], [595, 75], [625, 95], [645, 120], [665, 145],
  [685, 175], [710, 200], [735, 225], [752, 255], [760, 285], [752, 315],
  [730, 340], [705, 350], [680, 340], [655, 350], [635, 365], [625, 385],
  [635, 410], [655, 425], [685, 440], [712, 458], [738, 480], [758, 510],
  [770, 545], [762, 580], [745, 610], [720, 640], [695, 660], [670, 678],
  [640, 695], [610, 708], [580, 720], [548, 728], [515, 738], [482, 745],
  [450, 758], [418, 770], [385, 778], [352, 770], [325, 760], [300, 770],
  [278, 790], [255, 802], [230, 790], [210, 770], [195, 745], [185, 720],
  [170, 698], [150, 680], [135, 660], [148, 640], [165, 625], [180, 605],
  [195, 588], [210, 570], [225, 550], [218, 528], [200, 515], [178, 500],
  [155, 488], [135, 470], [125, 445], [135, 420], [148, 400], [160, 380],
  [165, 358], [155, 338], [140, 320], [128, 300], [120, 278], [128, 255],
  [142, 235], [155, 215], [165, 195], [158, 175], [142, 158], [128, 138],
  [125, 118], [135, 100],
];

function buildCoastPath(pts: Pt[]): string {
  let d = `M ${pts[0][0]} ${pts[0][1]} `;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % pts.length];
    const mx = (cur[0] + nxt[0]) / 2;
    const my = (cur[1] + nxt[1]) / 2;
    d += `Q ${cur[0]} ${cur[1]} ${mx} ${my} `;
  }
  d += "Z";
  return d;
}

function outwardHatching(pts: Pt[]) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const out: Array<{ x1: number; y1: number; x2: number; y2: number; o: number }> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    if ((mx - cx) * nx + (my - cy) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const groups = 2 + ((i * 7) % 3);
    for (let g = 0; g < groups; g++) {
      const t = -0.35 + g * 0.25 + ((i * 13 + g * 5) % 7) * 0.02;
      const ax = a[0] + (b[0] - a[0]) * (0.2 + t * 0.6);
      const ay = a[1] + (b[1] - a[1]) * (0.2 + t * 0.6);
      const off = 4 + ((i * 11 + g * 3) % 6);
      const sx = ax + nx * off;
      const sy = ay + ny * off;
      const slant = ((i + g) % 2 === 0 ? 0.55 : 0.85);
      const lenH = 8 + ((i * 5 + g * 7) % 9);
      const tx = nx * Math.cos(slant) + (-ny) * Math.sin(slant);
      const ty = ny * Math.cos(slant) + nx * Math.sin(slant);
      const ex = sx + tx * lenH;
      const ey = sy + ty * lenH;
      out.push({ x1: sx, y1: sy, x2: ex, y2: ey, o: 0.32 + ((i * 17 + g) % 5) * 0.04 });
    }
  }
  return out;
}

const HATCH = outwardHatching(COAST_PTS);
const COAST_PATH = buildCoastPath(COAST_PTS);

const MOUNTAIN_RIDGES: Array<Pt[]> = [
  [[285, 145], [305, 155], [325, 150], [345, 158]],
  [[295, 175], [315, 185], [335, 180], [355, 188], [375, 184]],
  [[305, 205], [325, 215], [345, 210], [365, 218], [385, 214]],
  [[320, 235], [340, 245], [360, 240], [380, 248], [400, 244]],
  [[340, 265], [360, 275], [380, 270], [400, 278], [420, 274]],
  [[360, 295], [380, 305], [400, 300], [420, 308], [440, 304]],
  [[380, 325], [400, 335], [420, 330], [440, 338], [460, 334]],
  [[400, 355], [420, 365], [440, 360], [460, 368], [480, 364]],
  [[420, 385], [440, 395], [460, 390], [480, 398]],
  [[440, 415], [460, 425], [480, 420], [500, 428]],
  [[460, 445], [480, 455], [500, 450], [520, 458]],
  [[480, 475], [500, 485], [520, 480], [540, 488]],
  [[500, 505], [520, 515], [540, 510], [560, 518]],
  [[520, 535], [540, 545], [560, 540]],
  [[495, 565], [515, 575], [535, 570], [555, 578]],
  [[475, 595], [495, 605], [515, 600]],
  [[455, 625], [475, 635]],
];

const ISLANDS: Array<{ cx: number; cy: number; r: number; pts: number; seed: number }> = [
  { cx: 705, cy: 70, r: 11, pts: 8, seed: 1 },
  { cx: 730, cy: 58, r: 8, pts: 7, seed: 2 },
  { cx: 758, cy: 78, r: 13, pts: 8, seed: 3 },
  { cx: 740, cy: 96, r: 7, pts: 7, seed: 4 },
  { cx: 770, cy: 105, r: 9, pts: 7, seed: 5 },

  { cx: 818, cy: 252, r: 10, pts: 8, seed: 6 },
  { cx: 842, cy: 282, r: 8, pts: 7, seed: 7 },
  { cx: 832, cy: 318, r: 12, pts: 8, seed: 8 },
  { cx: 856, cy: 342, r: 7, pts: 7, seed: 9 },
  { cx: 812, cy: 382, r: 9, pts: 7, seed: 10 },
  { cx: 836, cy: 408, r: 11, pts: 8, seed: 11 },

  { cx: 822, cy: 458, r: 9, pts: 8, seed: 12 },
  { cx: 848, cy: 486, r: 7, pts: 7, seed: 13 },
  { cx: 830, cy: 514, r: 11, pts: 8, seed: 14 },

  { cx: 792, cy: 660, r: 10, pts: 8, seed: 15 },
  { cx: 814, cy: 690, r: 8, pts: 7, seed: 16 },
  { cx: 794, cy: 720, r: 12, pts: 8, seed: 17 },
  { cx: 822, cy: 745, r: 7, pts: 7, seed: 18 },
  { cx: 800, cy: 770, r: 9, pts: 7, seed: 19 },

  { cx: 170, cy: 830, r: 10, pts: 8, seed: 20 },
  { cx: 200, cy: 820, r: 7, pts: 7, seed: 21 },
  { cx: 240, cy: 850, r: 12, pts: 8, seed: 22 },
  { cx: 290, cy: 838, r: 8, pts: 7, seed: 23 },
  { cx: 335, cy: 850, r: 9, pts: 7, seed: 24 },

  { cx: 60, cy: 360, r: 36, pts: 13, seed: 25 },
  { cx: 45, cy: 405, r: 10, pts: 7, seed: 26 },
  { cx: 92, cy: 422, r: 8, pts: 7, seed: 27 },
  { cx: 50, cy: 318, r: 9, pts: 7, seed: 28 },
  { cx: 95, cy: 300, r: 7, pts: 6, seed: 29 },
  { cx: 28, cy: 380, r: 6, pts: 6, seed: 30 },

  { cx: 88, cy: 130, r: 9, pts: 7, seed: 31 },
  { cx: 115, cy: 105, r: 7, pts: 6, seed: 32 },
  { cx: 75, cy: 95, r: 6, pts: 6, seed: 33 },
  { cx: 50, cy: 145, r: 8, pts: 7, seed: 34 },
];

function islandPath(cx: number, cy: number, r: number, pts: number, seed: number): string {
  const rand = (i: number) => {
    const x = Math.sin(seed * 9.13 + i * 4.47) * 43758.5453;
    return x - Math.floor(x);
  };
  let d = "";
  const points: Pt[] = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = r * (0.7 + rand(i) * 0.55);
    points.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  for (let i = 0; i < points.length; i++) {
    const cur = points[i];
    const nxt = points[(i + 1) % points.length];
    const mx = (cur[0] + nxt[0]) / 2;
    const my = (cur[1] + nxt[1]) / 2;
    if (i === 0) d += `M ${mx.toFixed(1)} ${my.toFixed(1)} `;
    d += `Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)} `;
  }
  return d + "Z";
}

function chevron(cx: number, cy: number, size: number, key: string) {
  const w = size;
  const h = size * 0.95;
  const d = `M ${cx - w} ${cy + h * 0.2} L ${cx} ${cy - h * 0.85} L ${cx + w} ${cy + h * 0.2}`;
  return (
    <path
      key={key}
      d={d}
      fill="none"
      stroke={INK}
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.9}
    />
  );
}

export function PencilMap() {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: PAPER }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: 880, maxHeight: 820, display: "block" }}
      >
        <defs>
          <filter id="pencilFine" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="1.7" numOctaves="2" seed="7" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.1" />
          </filter>
          <filter id="pencilCoast" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="noise" />
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" />
          </filter>
          <filter id="paperGrain">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="2" />
            <feColorMatrix values="0 0 0 0 0.82  0 0 0 0 0.74  0 0 0 0 0.55  0 0 0 0.20 0" />
          </filter>
        </defs>

        <rect x="0" y="0" width={W} height={H} fill={PAPER} />
        <rect x="0" y="0" width={W} height={H} filter="url(#paperGrain)" opacity="0.55" />

        <g filter="url(#pencilFine)" stroke={INK} strokeLinecap="round">
          {HATCH.map((s, i) => (
            <line
              key={`h${i}`}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              strokeWidth={0.7}
              opacity={s.o}
            />
          ))}
        </g>

        <g filter="url(#pencilCoast)">
          <path
            d={COAST_PATH}
            fill="none"
            stroke={INK}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        <g filter="url(#pencilCoast)">
          {ISLANDS.map((isl, i) => (
            <path
              key={`i${i}`}
              d={islandPath(isl.cx, isl.cy, isl.r, isl.pts, isl.seed)}
              fill="none"
              stroke={INK}
              strokeWidth={1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>

        <g filter="url(#pencilFine)">
          {MOUNTAIN_RIDGES.flatMap((ridge, ri) =>
            ridge.map(([x, y], pi) =>
              chevron(x, y, 6 + ((ri + pi) % 3), `m${ri}-${pi}`)
            )
          )}
        </g>
      </svg>
    </div>
  );
}
