import React from "react";
import Svg, { Path, Circle, Rect, Line, Polygon } from "react-native-svg";

type InsigniaId =
  | "megacity"
  | "judges"
  | "gangs"
  | "corps"
  | "mutants"
  | "corrupt"
  | "iron-circuit"
  | "deep-root-collective"
  | "eternal-flame"
  | "free-traders";

type Props = {
  id: InsigniaId;
  size?: number;
  color?: string;
};

function MegaCityInsignia({ s, c }: { s: number; c: string }) {
  const h = s / 2;
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Polygon points="32,4 60,20 60,44 32,60 4,44 4,20" fill="none" stroke={c} strokeWidth="2" />
      <Polygon points="32,12 52,24 52,40 32,52 12,40 12,24" fill="none" stroke={c} strokeWidth="1.5" opacity="0.6" />
      <Circle cx="32" cy="32" r="8" fill="none" stroke={c} strokeWidth="2" />
      <Line x1="32" y1="24" x2="32" y2="10" stroke={c} strokeWidth="1.5" />
      <Line x1="32" y1="40" x2="32" y2="54" stroke={c} strokeWidth="1.5" />
      <Line x1="24" y1="32" x2="10" y2="32" stroke={c} strokeWidth="1.5" />
      <Line x1="40" y1="32" x2="54" y2="32" stroke={c} strokeWidth="1.5" />
      <Circle cx="32" cy="32" r="3" fill={c} />
    </Svg>
  );
}

function AuthorityInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Rect x="28" y="6" width="8" height="52" fill="none" stroke={c} strokeWidth="2" />
      <Rect x="16" y="18" width="32" height="8" fill="none" stroke={c} strokeWidth="2" />
      <Line x1="20" y1="38" x2="44" y2="38" stroke={c} strokeWidth="2" />
      <Circle cx="32" cy="12" r="4" fill={c} />
      <Line x1="24" y1="50" x2="16" y2="58" stroke={c} strokeWidth="2" />
      <Line x1="40" y1="50" x2="48" y2="58" stroke={c} strokeWidth="2" />
    </Svg>
  );
}

function SyndicatesInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Path d="M32 8 L12 32 L32 56 L52 32 Z" fill="none" stroke={c} strokeWidth="2" />
      <Path d="M32 18 L22 32 L32 46 L42 32 Z" fill="none" stroke={c} strokeWidth="1.5" opacity="0.5" />
      <Line x1="12" y1="32" x2="52" y2="32" stroke={c} strokeWidth="1" opacity="0.4" />
      <Line x1="32" y1="8" x2="32" y2="56" stroke={c} strokeWidth="1" opacity="0.4" />
      <Circle cx="32" cy="32" r="4" fill={c} opacity="0.8" />
      <Line x1="8" y1="12" x2="16" y2="20" stroke={c} strokeWidth="2" />
      <Line x1="8" y1="20" x2="16" y2="12" stroke={c} strokeWidth="2" />
      <Line x1="48" y1="44" x2="56" y2="52" stroke={c} strokeWidth="2" />
      <Line x1="48" y1="52" x2="56" y2="44" stroke={c} strokeWidth="2" />
    </Svg>
  );
}

function CorpsInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Rect x="10" y="10" width="44" height="44" fill="none" stroke={c} strokeWidth="2" />
      <Rect x="18" y="18" width="28" height="28" fill="none" stroke={c} strokeWidth="1.5" opacity="0.5" />
      <Polygon points="32,22 38,30 32,38 26,30" fill={c} />
      <Line x1="10" y1="10" x2="18" y2="18" stroke={c} strokeWidth="1" opacity="0.5" />
      <Line x1="54" y1="10" x2="46" y2="18" stroke={c} strokeWidth="1" opacity="0.5" />
      <Line x1="10" y1="54" x2="18" y2="46" stroke={c} strokeWidth="1" opacity="0.5" />
      <Line x1="54" y1="54" x2="46" y2="46" stroke={c} strokeWidth="1" opacity="0.5" />
      <Line x1="32" y1="6" x2="32" y2="10" stroke={c} strokeWidth="2" />
      <Line x1="32" y1="54" x2="32" y2="58" stroke={c} strokeWidth="2" />
    </Svg>
  );
}

function MutantInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="24" fill="none" stroke={c} strokeWidth="2" />
      <Path d="M32 8 Q20 28 32 32 Q44 28 32 8" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 56 Q20 36 32 32 Q44 36 32 56" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M8 32 Q28 20 32 32 Q28 44 8 32" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M56 32 Q36 20 32 32 Q36 44 56 32" fill="none" stroke={c} strokeWidth="1.5" />
      <Circle cx="32" cy="32" r="6" fill="none" stroke={c} strokeWidth="2" />
      <Circle cx="32" cy="32" r="2" fill={c} />
    </Svg>
  );
}

function CorruptInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Polygon points="32,6 58,48 6,48" fill="none" stroke={c} strokeWidth="2" />
      <Polygon points="32,18 48,44 16,44" fill="none" stroke={c} strokeWidth="1.5" opacity="0.5" />
      <Circle cx="32" cy="34" r="6" fill="none" stroke={c} strokeWidth="2" />
      <Circle cx="32" cy="34" r="2" fill={c} />
      <Line x1="32" y1="6" x2="32" y2="18" stroke={c} strokeWidth="1" opacity="0.4" />
      <Line x1="6" y1="48" x2="16" y2="44" stroke={c} strokeWidth="1" opacity="0.4" />
      <Line x1="58" y1="48" x2="48" y2="44" stroke={c} strokeWidth="1" opacity="0.4" />
    </Svg>
  );
}

function IronCircuitInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="26" fill="none" stroke={c} strokeWidth="1.5" />
      <Circle cx="32" cy="32" r="18" fill="none" stroke={c} strokeWidth="1.5" />
      <Circle cx="32" cy="32" r="10" fill="none" stroke={c} strokeWidth="1.5" />
      <Rect x="28" y="28" width="8" height="8" fill={c} />
      <Line x1="32" y1="6" x2="32" y2="14" stroke={c} strokeWidth="2" />
      <Line x1="32" y1="50" x2="32" y2="58" stroke={c} strokeWidth="2" />
      <Line x1="6" y1="32" x2="14" y2="32" stroke={c} strokeWidth="2" />
      <Line x1="50" y1="32" x2="58" y2="32" stroke={c} strokeWidth="2" />
      <Line x1="14" y1="14" x2="20" y2="20" stroke={c} strokeWidth="1.5" />
      <Line x1="50" y1="14" x2="44" y2="20" stroke={c} strokeWidth="1.5" />
      <Line x1="14" y1="50" x2="20" y2="44" stroke={c} strokeWidth="1.5" />
      <Line x1="50" y1="50" x2="44" y2="44" stroke={c} strokeWidth="1.5" />
    </Svg>
  );
}

function DeepRootInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Line x1="32" y1="8" x2="32" y2="56" stroke={c} strokeWidth="2" />
      <Path d="M32 20 Q18 16 12 8" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 20 Q46 16 52 8" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 32 Q16 30 8 24" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 32 Q48 30 56 24" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 44 Q20 44 14 38" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 44 Q44 44 50 38" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 56 Q24 56 18 60" fill="none" stroke={c} strokeWidth="1.5" />
      <Path d="M32 56 Q40 56 46 60" fill="none" stroke={c} strokeWidth="1.5" />
      <Circle cx="32" cy="14" r="3" fill={c} />
    </Svg>
  );
}

function EternalFlameInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Path d="M32 6 Q40 20 38 32 Q36 44 32 48 Q28 44 26 32 Q24 20 32 6" fill="none" stroke={c} strokeWidth="2" />
      <Path d="M32 16 Q36 24 35 32 Q34 38 32 42 Q30 38 29 32 Q28 24 32 16" fill="none" stroke={c} strokeWidth="1.5" opacity="0.6" />
      <Circle cx="32" cy="32" r="3" fill={c} />
      <Rect x="22" y="50" width="20" height="4" fill="none" stroke={c} strokeWidth="1.5" />
      <Rect x="18" y="54" width="28" height="4" fill="none" stroke={c} strokeWidth="1.5" />
    </Svg>
  );
}

function FreeTradersInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Circle cx="32" cy="32" r="24" fill="none" stroke={c} strokeWidth="2" />
      <Line x1="8" y1="32" x2="56" y2="32" stroke={c} strokeWidth="1.5" />
      <Path d="M8 32 Q20 20 32 20 Q44 20 56 32" fill="none" stroke={c} strokeWidth="1" opacity="0.5" />
      <Path d="M8 32 Q20 44 32 44 Q44 44 56 32" fill="none" stroke={c} strokeWidth="1" opacity="0.5" />
      <Polygon points="30,16 34,16 34,28 38,28 32,36 26,28 30,28" fill={c} opacity="0.8" />
      <Polygon points="30,48 34,48 34,36 38,36 32,28 26,36 30,36" fill={c} opacity="0.4" />
    </Svg>
  );
}

const INSIGNIA_MAP: Record<InsigniaId, React.FC<{ s: number; c: string }>> = {
  megacity: MegaCityInsignia,
  judges: AuthorityInsignia,
  gangs: SyndicatesInsignia,
  corps: CorpsInsignia,
  mutants: MutantInsignia,
  corrupt: CorruptInsignia,
  "iron-circuit": IronCircuitInsignia,
  "deep-root-collective": DeepRootInsignia,
  "eternal-flame": EternalFlameInsignia,
  "free-traders": FreeTradersInsignia,
};

function FallbackInsignia({ s, c }: { s: number; c: string }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 64 64">
      <Rect x="8" y="8" width="48" height="48" fill="none" stroke={c} strokeWidth="2" />
      <Line x1="8" y1="8" x2="56" y2="56" stroke={c} strokeWidth="1" opacity="0.3" />
      <Line x1="56" y1="8" x2="8" y2="56" stroke={c} strokeWidth="1" opacity="0.3" />
      <Circle cx="32" cy="32" r="8" fill="none" stroke={c} strokeWidth="1.5" />
    </Svg>
  );
}

export default function Insignia({ id, size = 32, color = "#00FF41" }: Props) {
  const Component = INSIGNIA_MAP[id] ?? FallbackInsignia;
  return <Component s={size} c={color} />;
}

export type { InsigniaId };
