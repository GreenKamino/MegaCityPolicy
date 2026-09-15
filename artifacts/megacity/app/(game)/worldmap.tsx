import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { withScreenBoundary } from "@/components/withScreenBoundary";
import { getMegacitySigil } from "@/utils/sigils";
import {
  WORLD_MAP_TERRAIN_HIT_TARGET_Z_INDEX,
  getWorldMapHitTargetPriority,
  sortWorldMapLocationsForHitTesting,
} from "@/utils/worldMapHitTargets";
import { View, Text, ScrollView, Pressable, StyleSheet, Modal, Platform, useWindowDimensions, Image } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { useGameActions, useGameStateRef, useGameStateSelector } from "@/context/GameContext";
import { useToast } from "@/context/ToastContext";
import { useGameModal } from "@/hooks/useGameModal";
import type { GameState } from "@/engine/types";
import { applyAtlasCategoryRewards } from "@/engine/atlasCategoryRewards";
import { useAtlasUnlock } from "@/context/AtlasUnlockContext";
import { getEligibleRailEndpoints, STANDARD_RAIL_CREW, getRailCorridorQuote } from "@/engine/railNetwork";
import { WORLD_LOCATIONS, getWorldRoutes, isWorldLocationVisibleOnMap, WORLD_MAP_BOUNDS, DEFAULT_PLAYER_CITY_POSITION, type WorldLocation, type WorldRoute, TERRAIN_LABELS, TERRAIN_ICONS, TERRAIN_COLORS } from "@/engine/worldMap";
import { toGridRef, GRID_COLS, GRID_ROWS, EXT_COLS, EXT_ROWS, TOTAL_COLS, TOTAL_ROWS, getFullColLabel, getFullRowLabel, getFullCellRef } from "@/engine/worldMapGrid";
import { RESOURCE_NODE_LABELS, RESOURCE_NODE_COLORS, RICHNESS_LABELS, RICHNESS_MULT, getNodeDef, createDefaultResourceNodeState } from "@/engine/resourceNodes";
import {
  LOCATION_ACTION_RULES,
  LOCATION_ACTION_META,
  SANDBOX_LOCATION_ACTION_IDS,
  getLocationActionIneligibility,
  getLocationActionCostTiming,
  performLocationActionTransaction,
  type LocationActionId,
} from "@/engine/locationActions";
import {
  normalizeActionCostTiming,
} from "@/engine/actionCostTiming";
import ActionCostTimingReadout from "@/components/ActionCostTimingReadout";
import { Feather } from "@expo/vector-icons";
import { cursorGrab } from "@/hooks/useMouse";
import { useHorizontalWheelScroll } from "@/hooks/useHorizontalWheelScroll";
import { rollEncounter, getEncounterChance } from "@/engine/mapEncounters";
import { getWeatherZonesOnPath, computeWeatherTravelEffect, getZoneSeasonState, isZoneActive, type WeatherZone, type WeatherZoneSeasonState } from "@/engine/worldMapData";
import { getSeason, getSeasonLabel, nextSeason, type Season } from "@/engine/weather";
import { PARTNER_ARCHETYPES, inferArchetype } from "@/engine/partnerDynamics";
import { getOperationalSettlementSections, operationalFromSettlement } from "@/engine/settlementData";
import { CONTINUANCE_ID, getEffectiveContinuanceDiscoveryStage, isContinuanceMapInteractionLocked, normalizeContinuanceOperational } from "@/engine/continuance";
import { getControlledZoneCount, calculateZoneBonuses } from "@/engine/zoneControl";
import { applyResourceDelta } from "@/engine/resourceStorage";
import { summarizeFoodStorageGain } from "@/engine/resourceStorage";
import { canonicalizeLegacyWorldIntelText } from "@/engine/legacyContent";
import { formatInfrastructureAccessibilityLabel, formatInfrastructureSummary } from "@/utils/infrastructurePresentation";
import OperationalEntitySheet from "@/components/OperationalEntitySheet";
import { disclosureEvidenceLabel, getEntityDisclosure } from "@/engine/entitySheets";
import ContextMenu from "@/components/ContextMenu";
import TutorialHint from "@/components/TutorialHint";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { AMERICAS_OVERLAY_PATH_D, AMERICAS_OVERLAY_VIEWBOX } from "@/engine/americasOverlay";
import {
  MAP_COLORS as MAP,
  TERRAIN_ZONES,
  THREAT_TINT,
  MOUNTAIN_RANGES,
  WATER_BODIES,
  COAST_SEGMENTS,
  CANYON_MARKS,
  PLATEAU_MARKS,
  DRIED_RIVERS,
  DUNE_FIELDS,
  SCATTER_DOTS,
  CLIFF_EDGES,
  NODE_COLORS,
  DANGER_LABELS,
  WEATHER_ZONES,
  WEATHER_COLORS,
  YELLOWSTONE_EXCLUSION_ZONE,
  type ThreatLevel,
} from "@/engine/worldMapData";

const CONTENT_W = 2400;
const CONTENT_H = 2400;
const DEFAULT_PLAYER_POS = DEFAULT_PLAYER_CITY_POSITION;
const GRID_SQ = CONTENT_W / 40;
const EXPAND_SQ = 40;
const EXPAND_EXTRA = 20;
const EXPAND_L = (EXPAND_SQ + EXPAND_EXTRA) * GRID_SQ;
const EXPAND_T = (EXPAND_SQ + EXPAND_EXTRA) * GRID_SQ;
const EXPAND_R = EXPAND_SQ * GRID_SQ;
const EXPAND_B = EXPAND_SQ * GRID_SQ;
// Minimum ticks between TRADE MISSIONS to the same partner. Trade returns a
// profit multiple of its cost, so without a cooldown it was an infinite-credits
// loop. 20 ticks = 5 in-game days (4 ticks/day). Scout/aid/raid are unaffected.
const TRADE_COOLDOWN_TICKS = 20;
const MAP_W = EXPAND_L + CONTENT_W + EXPAND_R;
const MAP_H = EXPAND_T + CONTENT_H + EXPAND_B;
// The geographic drawing is square. Keep its initial presentation square too,
// with only a modest parchment margin around the outermost coastline.
const MAP_FRAME_PADDING = 70;
// The panned/zoomed content view (styles.mapContainer) is (MAP_W + 100) x
// (MAP_H + 100). React Native scales a view about its CENTER by default, so any
// "put this world point at a given screen spot" math must include the center
// term: a content point p lands at screen = offset + scale*p + center*(1-scale).
// Centering therefore needs offset = screenTarget - scale*p - center*(1-scale).
const CONTENT_CENTER_X = (MAP_W + 100) / 2;
const CONTENT_CENTER_Y = (MAP_H + 100) / 2;
const CONTENT_PAD_X = 50 + EXPAND_L;
const CONTENT_PAD_Y = 50 + EXPAND_T;
const TILES_X = EXPAND_SQ + EXPAND_EXTRA + 40 + EXPAND_SQ;
const TILES_Y = EXPAND_SQ + EXPAND_EXTRA + 40 + EXPAND_SQ;
const CONTENT_START_X = EXPAND_SQ + EXPAND_EXTRA;
const CONTENT_START_Y = EXPAND_SQ + EXPAND_EXTRA;
const DESIG_CELL_W = CONTENT_W / GRID_COLS;
const DESIG_CELL_H = CONTENT_H / GRID_ROWS;
const EXT_ORIGIN_X = CONTENT_PAD_X - EXT_COLS * DESIG_CELL_W;
const EXT_ORIGIN_Y = CONTENT_PAD_Y - EXT_ROWS * DESIG_CELL_H;

const LOCATION_INDEX = new Map(WORLD_LOCATIONS.map((l) => [l.id, l]));

// --- Coordinated map sizing & zoom -------------------------------------------
// One place to tune the world map's *location markers*: the city/nation/township/
// resource nodes, their decorative rings, their name labels, the supply-route
// lines/labels between them, and the coastline stroke. These are the elements
// that crowd the populated cluster, so they share a coordinated scale.
// MARKER_SCALE is the master knob: lower it to shrink every marker (and its
// rings) together, raise it to grow them.
//
// NOTE: this does NOT govern every drawn element — decorative geography/terrain
// labels, the fog/grid coordinate text, the minimap inset, and the toggleable
// faction-territory overlays keep their own sizing and are intentionally left
// out of scope here.
//
// Markers, labels and routes live inside the zoom-transformed layer. Routes
// scale uniformly with zoom, but node markers + their name labels apply a
// counter-scale (see nodeCounterScale) so zooming IN holds their on-screen size
// ~constant while the positional gaps between them grow. That is what lets
// players zoom in to separate crowded labels instead of the overlap staying
// constant at every zoom level. These *base* sizes still set the look at the
// default zoom, where the counter-scale is 1 (a no-op).
const MARKER_SCALE = 0.42;
const MAP_SIZING = {
  // Base marker (dot/diamond) diameter in content px, before MARKER_SCALE.
  marker: {
    player_city: 18,
    megacity: 14,
    nation: 12,
    township: 9,
    resource_node: 10,
    default: 6,
  } as Record<string, number>,
  // Decorative halo/ring diameter as a multiple of the marker diameter, so
  // rings shrink in lockstep with the markers they wrap.
  ring: {
    hostilePulse: 1.7,
    terrain: 1.45,
    playerDashed: 1.9,
    playerGlowOuter: 2.3,
    playerGlowRing: 1.85,
  },
  // On-map label font sizes (content px).
  font: {
    playerCity: 8,
    node: 7,
    routeDanger: 5,
    routeDetail: 5,
  },
  // Route line thickness (content px) by danger tier.
  route: {
    safe: 1.5,
    contested: 1.5,
    hostile: 2,
    unknown: 1.2,
  },
  // Coastline / landmass outline width in device px (non-scaling stroke, stays
  // a constant on-screen hairline at every zoom level).
  coastStroke: 0.4,
  // Decorative geography and terrain typography/strokes. These stay visually
  // subordinate to location labels while remaining readable at deep zoom.
  geography: {
    mountainGlyph: 12,
    mountainLabel: 7,
    waterLabel: 8,
    canyonLabel: 6,
    canyonStroke: 1,
    plateauLabel: 6,
    riverLabel: 5,
    duneGlyph: 7,
    duneLabel: 5,
    scatterGlyph: 4,
    craterGlyph: 6,
    cliffLabel: 5,
    cliffStroke: 1.5,
    cliffTick: 5,
    weatherLabel: 3.5,
    terrainLabel: 7,
  },
  // Fog and grid annotations are intentionally lighter than the map content.
  annotation: {
    fogDiameter: 36,
    fogQuestion: 12,
    gridExternal: 3.5,
    gridPrimary: 4,
    gridCellReference: 4,
  },
  minimap: {
    hazardMinSize: 2,
    hazardStroke: 0.5,
    routeStroke: 0.5,
    playerMarker: 5,
    megacityMarker: 3,
    nationMarker: 2.5,
    resourceMarker: 2,
    defaultMarker: 1.5,
    legendDot: 4,
    legendText: 5,
    titleText: 5,
    compassOuter: 44,
    compassInner: 36,
    compassCross: 30,
    compassDiagonal: 22,
    compassNorth: 8,
    compassCardinal: 6,
  },
  faction: {
    territoryRing: 42,
    allianceLine: 1.2,
    warLine: 1.6,
    convoyDot: 4,
    caravanDot: 3.5,
  },
};

// Solid backing plate drawn behind every on-map text label (location names and
// route danger badges). Without it the text sat directly on the busy parchment +
// terrain + route lines and dissolved into them ("faded / hard to read"). The
// plate is near-opaque so overlapping labels in dense clusters occlude each other
// cleanly (a readable stack of cards) instead of muddying together, and it hugs
// the text (alignSelf "center", no fixed width) to keep each label's overlap
// footprint as small as possible.
const LABEL_PLATE = {
  alignSelf: "center" as const,
  marginTop: 6,
  paddingHorizontal: 6,
  paddingVertical: 2,
  borderRadius: 3,
  backgroundColor: MAP.parchmentLight + "F8",
  borderWidth: 0.8,
  borderColor: MAP.borderWorn + "EE",
  ...(Platform.OS === "web"
    ? { boxShadow: "0 2px 4px rgba(42,31,14,0.35)" as any }
    : {
        shadowColor: MAP.ink,
        shadowOpacity: 0.22,
        shadowOffset: { width: 0, height: 1 },
        shadowRadius: 2,
        elevation: 2,
      }),
};

// Marker diameter (content px) for a location type, after the master scale.
const markerSize = (type: string): number =>
  (MAP_SIZING.marker[type] ?? MAP_SIZING.marker.default) * MARKER_SCALE;

// Straight-line distance between two world points in "km" (world units × 2), so
// the location detail panel agrees with the on-map route km readout, which uses
// the same ×2 scaling (see renderRoutes' distKm).
const worldDistanceKm = (ax: number, ay: number, bx: number, by: number): number => {
  const dx = (bx - ax) * 2;
  const dy = (by - ay) * 2;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
};

// 8-point compass bearing from A to B. Screen Y grows downward (south), so north
// is -dy. Returns "" when the two points coincide.
const COMPASS_8 = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
const compassBearing = (ax: number, ay: number, bx: number, by: number): string => {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return "";
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const idx = Math.round(((((deg % 360) + 360) % 360) / 45)) % 8;
  return COMPASS_8[idx];
};

// Node markers are wrapped in an animated Pressable so a single shared
// counter-scale animated style (nodeCounterScale) can hold their on-screen size
// roughly constant as the map zooms in. Reused across every node.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Zoom clamp + default. Max raised so players can push in much deeper than
// before (markers/labels counter-scale to stay legible, see nodeCounterScale)
// while strokes stay crisp (coastline uses a non-scaling stroke).
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 12;
const OPERATIONAL_SCREEN_SCALE = 1.5;
const DEFAULT_LABEL_LIMIT = 14;
// Open on a square overview of the drawn Americas instead of a narrow,
// zoomed-in strip. The map remains fully pannable/zoomable, and the existing
// marker counter-scale keeps the detail usable once the player zooms in.
const DEFAULT_ZOOM = 0.5;
const clampZoom = (z: number): number => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

type DefaultLabelRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function getDefaultLocationLabelIds(
  locations: readonly WorldLocation[],
  discoveredIds: ReadonlySet<string>,
  playerPos: { x: number; y: number },
  mapView: { w: number; h: number },
): Set<string> {
  const projected = (loc: WorldLocation) => {
    const x = loc.type === "player_city" ? playerPos.x : loc.x;
    const y = loc.type === "player_city" ? playerPos.y : loc.y;
    return {
      x: ((x / WORLD_MAP_BOUNDS.maxX) * CONTENT_W + CONTENT_PAD_X) * DEFAULT_ZOOM,
      y: ((y / WORLD_MAP_BOUNDS.maxY) * CONTENT_H + CONTENT_PAD_Y) * DEFAULT_ZOOM,
    };
  };
  const playerLocation = locations.find((loc) => loc.type === "player_city");
  const playerPoint = playerLocation ? projected(playerLocation) : { x: 0, y: 0 };
  // Mexico City keeps the legacy Dusthaven ID for save compatibility, but its
  // replacement label is especially easy to lose in the narrow opening view:
  // several nearby megacities can claim the sparse label budget first. Give
  // this user-facing replacement a narrow-map priority without changing the
  // normal desktop label ordering.
  const isNarrowMap = mapView.w > 0 && mapView.w <= 600;
  const candidates = locations
    .filter((loc) => loc.type === "player_city" || loc.discovered || discoveredIds.has(loc.id))
    .sort((a, b) => {
      const playerDelta = Number(b.type === "player_city") - Number(a.type === "player_city");
      if (playerDelta) return playerDelta;
      if (isNarrowMap) {
        const mexicoCityDelta = Number(b.id === "dusthaven") - Number(a.id === "dusthaven");
        if (mexicoCityDelta) return mexicoCityDelta;
      }
      const priorityDelta = getWorldMapHitTargetPriority(b.type) - getWorldMapHitTargetPriority(a.type);
      if (priorityDelta) return priorityDelta;
      const ap = projected(a);
      const bp = projected(b);
      const distanceDelta =
        Math.hypot(ap.x - playerPoint.x, ap.y - playerPoint.y) -
        Math.hypot(bp.x - playerPoint.x, bp.y - playerPoint.y);
      return distanceDelta || a.id.localeCompare(b.id);
    });

  const selected = new Set<string>();
  const occupied: DefaultLabelRect[] = [];
  for (const loc of candidates) {
    const point = projected(loc);
    const width = Math.min(190, Math.max(88, 28 + loc.name.length * 8.5));
    const screenX = mapView.w / 2 + point.x - playerPoint.x;
    const screenY = mapView.h / 2 + point.y - playerPoint.y;
    const rect: DefaultLabelRect = {
      left: screenX - width / 2,
      right: screenX + width / 2,
      top: screenY + 16,
      bottom: screenY + 44,
    };
    const outsideViewport =
      mapView.w > 0 &&
      mapView.h > 0 &&
      (rect.left < 8 || rect.right > mapView.w - 8 || rect.top < 8 || rect.bottom > mapView.h - 8);
    const overlapsBottomControl =
      mapView.h > 0 &&
      rect.bottom > mapView.h - 140 &&
      (rect.left < 64 || rect.right > mapView.w - 130);
    const overlaps = occupied.some(
      (other) =>
        rect.left < other.right + 10 &&
        rect.right > other.left - 10 &&
        rect.top < other.bottom + 8 &&
        rect.bottom > other.top - 8,
    );
    if (loc.type !== "player_city" && (outsideViewport || overlapsBottomControl || overlaps)) continue;
    selected.add(loc.id);
    occupied.push(rect);
    if (selected.size >= DEFAULT_LABEL_LIMIT) break;
  }
  return selected;
}

const TerrainTooltip = React.memo(function TerrainTooltip({
  name,
  charted,
}: {
  name: string;
  // Whether this feature is already recorded in the player's atlas. Drives
  // the footer line so players get explicit feedback that inspecting a
  // landform writes it to the Wasteland Atlas codex.
  charted: boolean;
}) {
  return (
    <View
      style={{
        pointerEvents: "none",
        position: "absolute",
        bottom: "100%",
        left: "50%",
        marginLeft: -110,
        marginBottom: 6,
        width: 220,
        backgroundColor: MAP.parchment + "F5",
        borderWidth: 1,
        borderColor: MAP.borderWorn,
        borderRadius: 4,
        padding: 8,
        zIndex: 9999,
        ...(Platform.OS === "web"
          ? { boxShadow: "0 2px 6px rgba(42,31,14,0.3)" as any }
          : {
              shadowColor: MAP.ink,
              shadowOpacity: 0.25,
              shadowOffset: { width: 0, height: 2 },
              shadowRadius: 6,
              elevation: 4,
            }),
      }}
    >
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 9,
          color: MAP.ink,
          letterSpacing: 1.5,
          marginBottom: 4,
        }}
      >
        {name}
      </Text>
      <View style={{ height: 1, backgroundColor: MAP.borderWorn + "40", marginBottom: 4 }} />
      <Text
        style={{
          fontFamily: "Inter_700Bold",
          fontSize: 8,
          letterSpacing: 1.2,
          color: charted ? MAP.ink : MAP.sepia,
        }}
      >
        {charted ? "✓ RECORDED IN ATLAS" : "+ ADDED TO ATLAS"}
      </Text>
      <View
        style={{
          position: "absolute",
          bottom: -4,
          left: "50%",
          marginLeft: -4,
          width: 0,
          height: 0,
          borderLeftWidth: 4,
          borderRightWidth: 4,
          borderTopWidth: 4,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: MAP.borderWorn,
        }}
      />
    </View>
  );
});

type TerrainHotspotProps = {
  id: string;
  name: string;
  px: number;
  py: number;
  w: number;
  h: number;
  activeId: string | null;
  setActiveId: React.Dispatch<React.SetStateAction<string | null>>;
  // Set of terrain ids already in state.discoveredTerrain. Drives the
  // tooltip's "+ ADDED TO ATLAS" vs "✓ RECORDED IN ATLAS" footer so the
  // discovery side-effect is visible to the player on every inspect.
  chartedTerrainIds: Set<string>;
};

const TerrainHotspot = React.memo(function TerrainHotspot({
  id,
  name,
  px,
  py,
  w,
  h,
  activeId,
  setActiveId,
  chartedTerrainIds,
}: TerrainHotspotProps) {
  const isActive = activeId === id;
  const webHandlers =
    Platform.OS === "web"
      ? {
          onMouseEnter: () => setActiveId(id),
          onMouseLeave: () => setActiveId((prev) => (prev === id ? null : prev)),
        }
      : {};
  return (
    <>
      <Pressable
        onPress={() => setActiveId((prev) => (prev === id ? null : id))}
        {...(webHandlers as any)}
        style={{
          position: "absolute",
          left: px - w / 2,
          top: py - h / 2,
          width: w,
          height: h,
          zIndex: WORLD_MAP_TERRAIN_HIT_TARGET_Z_INDEX,
          ...(Platform.OS === "web" ? { cursor: "help" as any } : {}),
        }}
      />
      {isActive && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: px - w / 2,
            top: py - h / 2,
            width: w,
            height: h,
            zIndex: 200,
          }}
        >
          <TerrainTooltip name={name} charted={chartedTerrainIds.has(id)} />
        </View>
      )}
    </>
  );
});

const TerrainFeaturesLayer = React.memo(function TerrainFeaturesLayer({
  toPixel,
  activeTerrainId,
  setActiveTerrainId,
  chartedTerrainIds,
}: {
  toPixel: (x: number, y: number) => { px: number; py: number };
  activeTerrainId: string | null;
  setActiveTerrainId: React.Dispatch<React.SetStateAction<string | null>>;
  chartedTerrainIds: Set<string>;
}) {
  return (
    <>
      {COAST_SEGMENTS.map((coast) => {
        const pts = coast.points.map(([x, y]) => toPixel(x, y));
        const minX = Math.min(...pts.map((p) => p.px));
        const maxX = Math.max(...pts.map((p) => p.px));
        const minY = Math.min(...pts.map((p) => p.py));
        const maxY = Math.max(...pts.map((p) => p.py));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        return (
          <React.Fragment key={coast.id}>
            {pts.map((p, i) => {
              if (i === pts.length - 1) return null;
              const next = pts[i + 1];
              const dx = next.px - p.px;
              const dy = next.py - p.py;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <React.Fragment key={`${coast.id}-${i}`}>
                  <View
                    style={{
                      position: "absolute",
                      left: p.px,
                      top: p.py,
                      width: len,
                      height: 2,
                      backgroundColor: MAP.inkFaded,
                      opacity: 0.25,
                      transform: [{ rotate: `${angle}deg` }],
                      transformOrigin: "left center",
                    }}
                  />
                  <View
                    style={{
                      position: "absolute",
                      left: p.px + (coast.id === "west-coast" ? -4 : 0),
                      top: p.py + (coast.id === "south-coast" ? 4 : 0),
                      width: len,
                      height: 1,
                      backgroundColor: MAP.inkFaded,
                      opacity: 0.12,
                      transform: [{ rotate: `${angle}deg` }],
                      transformOrigin: "left center",
                    }}
                  />
                </React.Fragment>
              );
            })}
            {coast.label && (
              <TerrainHotspot
                id={`coast-${coast.id}`}
                name={coast.label}
                px={cx}
                py={cy}
                w={Math.max(40, maxX - minX + 24)}
                h={Math.max(40, maxY - minY + 24)}
                activeId={activeTerrainId}
                setActiveId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
            )}
          </React.Fragment>
        );
      })}

      {MOUNTAIN_RANGES.map((range) => {
        const pts = range.peaks.map(([x, y]) => toPixel(x, y));
        const lp = toPixel(range.labelPos[0], range.labelPos[1]);
        const isVertical = range.id === "rockies" || range.id === "appalachians" || range.id === "sierra-madre";
        const minX = Math.min(...pts.map((p) => p.px), lp.px);
        const maxX = Math.max(...pts.map((p) => p.px), lp.px);
        const minY = Math.min(...pts.map((p) => p.py), lp.py);
        const maxY = Math.max(...pts.map((p) => p.py), lp.py);
        const hsW = Math.max(40, maxX - minX + 24);
        const hsH = Math.max(40, maxY - minY + 24);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        return (
          <React.Fragment key={range.id}>
            {pts.map((p, i) => (
              <Text
                key={`${range.id}-p-${i}`}
                style={{
                  position: "absolute",
                  left: p.px - 6,
                  top: p.py - 10,
                  fontSize: MAP_SIZING.geography.mountainGlyph,
                  color: MAP.inkFaded,
                  opacity: 0.25,
                  fontFamily: "Inter_400Regular",
                }}
              >
                {"\u25B3"}
              </Text>
            ))}
            <Text
              style={{
                position: "absolute",
                left: isVertical ? lp.px : lp.px - 50,
                top: isVertical ? lp.py - 50 : lp.py,
                width: isVertical ? 14 : 100,
                textAlign: "center",
                fontFamily: "Inter_400Regular",
                 fontSize: MAP_SIZING.geography.mountainLabel,
                fontStyle: "italic",
                color: MAP.inkFaded,
                opacity: 0.35,
                letterSpacing: 1,
                transform: isVertical ? [{ rotate: "90deg" }] : [],
              }}
            >
              {range.label}
            </Text>
            <TerrainHotspot
              id={`mountain-${range.id}`}
              name={range.label}
              px={cx}
              py={cy}
              w={hsW}
              h={hsH}
              activeId={activeTerrainId}
              setActiveId={setActiveTerrainId}
              chartedTerrainIds={chartedTerrainIds}
            />
          </React.Fragment>
        );
      })}

      {WATER_BODIES.map((water) => {
        const p = toPixel(water.x, water.y);
        return (
          <React.Fragment key={water.id}>
            <Text
              style={{
                position: "absolute",
                left: p.px - 60,
                top: p.py - 8,
                width: 120,
                textAlign: "center",
                fontFamily: "Inter_400Regular",
                 fontSize: water.fontSize ?? MAP_SIZING.geography.waterLabel,
                fontStyle: "italic",
                color: MAP.blueFaded,
                opacity: 0.25,
                letterSpacing: water.fontSize > 10 ? 2 : 1,
                transform: water.rotation ? [{ rotate: `${water.rotation}deg` }] : [],
              }}
            >
              {water.label}
            </Text>
            <TerrainHotspot
              id={`water-${water.id}`}
              name={water.label}
              px={p.px}
              py={p.py}
              w={130}
              h={26}
              activeId={activeTerrainId}
              setActiveId={setActiveTerrainId}
              chartedTerrainIds={chartedTerrainIds}
            />
          </React.Fragment>
        );
      })}

      {CANYON_MARKS.map((canyon) => {
        const p = toPixel(canyon.x, canyon.y);
        const lp = toPixel(canyon.labelPos[0], canyon.labelPos[1]);
        const w = 50;
        return (
          <React.Fragment key={canyon.id}>
            {[0, 1, 2].map((line) => (
              <View
                key={`${canyon.id}-l-${line}`}
                style={{
                  position: "absolute",
                  left: p.px - w / 2,
                  top: p.py + line * 4 - 4,
                  width: w,
                  height: MAP_SIZING.geography.canyonStroke,
                  backgroundColor: MAP.orange,
                  opacity: 0.15 - line * 0.03,
                  transform: [{ rotate: `${canyon.angle}deg` }],
                  transformOrigin: "center center",
                }}
              />
            ))}
            <Text
              style={{
                position: "absolute",
                left: lp.px - 45,
                top: lp.py,
                width: 90,
                textAlign: "center",
                fontFamily: "Inter_400Regular",
                 fontSize: MAP_SIZING.geography.canyonLabel,
                fontStyle: "italic",
                color: MAP.orange,
                opacity: 0.3,
                letterSpacing: 1,
              }}
            >
              {canyon.label}
            </Text>
            <TerrainHotspot
              id={`canyon-${canyon.id}`}
              name={canyon.label}
              px={(p.px + lp.px) / 2}
              py={(p.py + lp.py + 8) / 2}
              w={Math.max(90, Math.abs(lp.px - p.px) + 60)}
              h={Math.max(50, Math.abs(lp.py - p.py) + 30)}
              activeId={activeTerrainId}
              setActiveId={setActiveTerrainId}
              chartedTerrainIds={chartedTerrainIds}
            />
          </React.Fragment>
        );
      })}

      {PLATEAU_MARKS.map((pl) => {
        const { px, py } = toPixel(pl.cx, pl.cy);
        const w = (pl.rx / WORLD_MAP_BOUNDS.maxX) * CONTENT_W * 2;
        const h = (pl.ry / WORLD_MAP_BOUNDS.maxY) * CONTENT_H * 2;
        const lp = toPixel(pl.labelPos[0], pl.labelPos[1]);
        return (
          <React.Fragment key={pl.id}>
            {/* Flat-topped mesa: a soft footprint with a raised inner cap and
                hairline elevation contours. Alpha is baked into the hex so the
                fill and the contour read independently — a whole-View `opacity`
                would dim both together and wash the outline out. */}
            <View
              style={{
                position: "absolute",
                left: px - w / 2,
                top: py - h / 2,
                width: w,
                height: h,
                borderRadius: Math.max(w, h) / 2,
                backgroundColor: MAP.sandDark + "22",
                borderWidth: 0.75,
                borderColor: MAP.inkLight + "40",
              }}
            />
            <View
              style={{
                position: "absolute",
                left: px - (w * 0.6) / 2,
                top: py - (h * 0.6) / 2,
                width: w * 0.6,
                height: h * 0.6,
                borderRadius: Math.max(w, h) / 2,
                backgroundColor: MAP.sepia + "22",
                borderWidth: 0.75,
                borderColor: MAP.sepia + "55",
              }}
            />
            <Text
              style={{
                position: "absolute",
                left: lp.px - 50,
                top: lp.py,
                width: 100,
                textAlign: "center",
                fontFamily: "Inter_400Regular",
                 fontSize: MAP_SIZING.geography.plateauLabel,
                fontStyle: "italic",
                color: MAP.sepia,
                opacity: 0.3,
                letterSpacing: 1,
              }}
            >
              {pl.label}
            </Text>
            <TerrainHotspot
              id={`plateau-${pl.id}`}
              name={pl.label}
              px={px}
              py={py}
              w={Math.max(80, w + 20)}
              h={Math.max(50, h + 20)}
              activeId={activeTerrainId}
              setActiveId={setActiveTerrainId}
              chartedTerrainIds={chartedTerrainIds}
            />
          </React.Fragment>
        );
      })}

      {DRIED_RIVERS.map((river) => {
        const pts = river.points.map(([x, y]) => toPixel(x, y));
        const lp = river.labelPos ? toPixel(river.labelPos[0], river.labelPos[1]) : null;
        const minX = Math.min(...pts.map((p) => p.px));
        const maxX = Math.max(...pts.map((p) => p.px));
        const minY = Math.min(...pts.map((p) => p.py));
        const maxY = Math.max(...pts.map((p) => p.py));
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        return (
          <React.Fragment key={river.id}>
            {pts.map((p, i) => {
              if (i === pts.length - 1) return null;
              const next = pts[i + 1];
              const dx = next.px - p.px;
              const dy = next.py - p.py;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View
                  key={`${river.id}-${i}`}
                  style={{
                    position: "absolute",
                    left: p.px,
                    top: p.py,
                    width: len,
                   height: MAP_SIZING.geography.riverLabel / 6,
                    backgroundColor: MAP.blueFaded,
                    opacity: 0.15,
                    borderStyle: "dotted",
                    borderWidth: 0,
                    borderBottomWidth: 1,
                    borderColor: MAP.blueFaded,
                    transform: [{ rotate: `${angle}deg` }],
                    transformOrigin: "left center",
                  }}
                />
              );
            })}
            {lp && river.label && (
              <Text
                style={{
                  position: "absolute",
                  left: lp.px - 50,
                  top: lp.py,
                  width: 100,
                  textAlign: "center",
                  fontFamily: "Inter_400Regular",
                   fontSize: MAP_SIZING.geography.riverLabel,
                  fontStyle: "italic",
                  color: MAP.blueFaded,
                  opacity: 0.25,
                  letterSpacing: 1,
                }}
              >
                {river.label}
              </Text>
            )}
            {river.label && (
              <TerrainHotspot
                id={`river-${river.id}`}
                name={river.label}
                px={cx}
                py={cy}
                w={Math.max(40, maxX - minX + 24)}
                h={Math.max(40, maxY - minY + 24)}
                activeId={activeTerrainId}
                setActiveId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
            )}
          </React.Fragment>
        );
      })}

      {DUNE_FIELDS.map((dune) => {
        const seeds: number[] = [];
        let hash = dune.cx * 31 + dune.cy * 17;
        for (let i = 0; i < dune.count * 2; i++) {
          hash = (hash * 1103515245 + 12345) & 0x7fffffff;
          seeds.push(hash);
        }
        const center = toPixel(dune.cx, dune.cy);
        const fieldW = (dune.spread / WORLD_MAP_BOUNDS.maxX) * CONTENT_W * 2 + 24;
        const fieldH = (dune.spread / WORLD_MAP_BOUNDS.maxY) * CONTENT_H * 2 + 24;
        const lp = dune.labelPos ? toPixel(dune.labelPos[0], dune.labelPos[1]) : null;
        return (
          <React.Fragment key={dune.id}>
            {Array.from({ length: dune.count }).map((_, i) => {
              const ox = (seeds[i * 2] % (dune.spread * 2)) - dune.spread;
              const oy = (seeds[i * 2 + 1] % (dune.spread * 2)) - dune.spread;
              const p = toPixel(dune.cx + ox, dune.cy + oy);
              return (
                <Text
                  key={`${dune.id}-${i}`}
                  style={{
                    position: "absolute",
                    left: p.px - 8,
                    top: p.py - 4,
                     fontSize: MAP_SIZING.geography.duneGlyph,
                    color: MAP.orangeFaded,
                    opacity: 0.25,
                    transform: [{ rotate: `${dune.angle + (seeds[i] % 10 - 5)}deg` }],
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {"〰"}
                </Text>
              );
            })}
            {lp && dune.label && (
              <Text
                style={{
                  position: "absolute",
                  left: lp.px - 50,
                  top: lp.py,
                  width: 100,
                  textAlign: "center",
                  fontFamily: "Inter_400Regular",
                   fontSize: MAP_SIZING.geography.duneLabel,
                  fontStyle: "italic",
                  color: MAP.orangeFaded,
                  opacity: 0.35,
                  letterSpacing: 1,
                }}
              >
                {dune.label}
              </Text>
            )}
            {dune.label && (
              <TerrainHotspot
                id={`dune-${dune.id}`}
                name={dune.label}
                px={center.px}
                py={center.py}
                w={fieldW}
                h={fieldH}
                activeId={activeTerrainId}
                setActiveId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
            )}
          </React.Fragment>
        );
      })}

      {SCATTER_DOTS.map((scatter) => {
        const seeds: number[] = [];
        let hash = scatter.cx * 37 + scatter.cy * 13;
        for (let i = 0; i < scatter.count * 2; i++) {
          hash = (hash * 1103515245 + 12345) & 0x7fffffff;
          seeds.push(hash);
        }
        const dotChar = scatter.style === "scrub" ? "\u2022" :
          scatter.style === "rubble" ? "\u25AA" :
          scatter.style === "craters" ? "\u25CB" : "\u223C";
        const dotColor = scatter.style === "marsh" ? MAP.greenFaded :
          scatter.style === "craters" ? MAP.redFaded : MAP.inkFaded;
        const center = toPixel(scatter.cx, scatter.cy);
        const fieldW = (scatter.spread / WORLD_MAP_BOUNDS.maxX) * CONTENT_W * 2 + 24;
        const fieldH = (scatter.spread / WORLD_MAP_BOUNDS.maxY) * CONTENT_H * 2 + 24;
        return (
          <React.Fragment key={scatter.id}>
            {Array.from({ length: scatter.count }).map((_, i) => {
              const ox = (seeds[i * 2] % (scatter.spread * 2)) - scatter.spread;
              const oy = (seeds[i * 2 + 1] % (scatter.spread * 2)) - scatter.spread;
              const p = toPixel(scatter.cx + ox, scatter.cy + oy);
              return (
                <Text
                  key={`${scatter.id}-${i}`}
                  style={{
                    position: "absolute",
                    left: p.px - 3,
                    top: p.py - 3,
                     fontSize: scatter.style === "craters"
                       ? MAP_SIZING.geography.craterGlyph
                       : MAP_SIZING.geography.scatterGlyph,
                    color: dotColor,
                    opacity: 0.2,
                    fontFamily: "Inter_400Regular",
                  }}
                >
                  {dotChar}
                </Text>
              );
            })}
            {scatter.label && (
              <TerrainHotspot
                id={`scatter-${scatter.id}`}
                name={scatter.label}
                px={center.px}
                py={center.py}
                w={fieldW}
                h={fieldH}
                activeId={activeTerrainId}
                setActiveId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
            )}
          </React.Fragment>
        );
      })}

      {CLIFF_EDGES.map((cliff) => {
        const pts = cliff.points.map(([x, y]) => toPixel(x, y));
        const lp = cliff.labelPos ? toPixel(cliff.labelPos[0], cliff.labelPos[1]) : null;
        const minX = Math.min(...pts.map((p) => p.px), lp?.px ?? Infinity);
        const maxX = Math.max(...pts.map((p) => p.px), lp?.px ?? -Infinity);
        const minY = Math.min(...pts.map((p) => p.py), lp?.py ?? Infinity);
        const maxY = Math.max(...pts.map((p) => p.py), lp?.py ?? -Infinity);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        return (
          <React.Fragment key={cliff.id}>
            {pts.map((p, i) => {
              if (i === pts.length - 1) return null;
              const next = pts[i + 1];
              const dx = next.px - p.px;
              const dy = next.py - p.py;
              const len = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <React.Fragment key={`${cliff.id}-${i}`}>
                  <View
                    style={{
                      position: "absolute",
                      left: p.px,
                      top: p.py,
                      width: len,
                      height: MAP_SIZING.geography.cliffStroke,
                      backgroundColor: MAP.inkFaded,
                      opacity: 0.2,
                      transform: [{ rotate: `${angle}deg` }],
                      transformOrigin: "left center",
                    }}
                  />
                  {[0, 1, 2, 3].map((tick) => {
                    const t = (tick + 0.5) / 4;
                    const tx = p.px + dx * t;
                    const ty = p.py + dy * t;
                    const perpAngle = angle + 90;
                    return (
                      <View
                        key={`${cliff.id}-t-${i}-${tick}`}
                        style={{
                          position: "absolute",
                          left: tx,
                          top: ty,
                           width: MAP_SIZING.geography.cliffTick,
                          height: 1,
                          backgroundColor: MAP.inkFaded,
                          opacity: 0.15,
                          transform: [{ rotate: `${perpAngle}deg` }],
                          transformOrigin: "left center",
                        }}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
            {lp && cliff.label && (
              <Text
                style={{
                  position: "absolute",
                  left: lp.px - 40,
                  top: lp.py,
                  width: 80,
                  textAlign: "center",
                  fontFamily: "Inter_400Regular",
                   fontSize: MAP_SIZING.geography.cliffLabel,
                  fontStyle: "italic",
                  color: MAP.inkFaded,
                  opacity: 0.3,
                  letterSpacing: 1,
                }}
              >
                {cliff.label}
              </Text>
            )}
            {cliff.label && (
              <TerrainHotspot
                id={`cliff-${cliff.id}`}
                name={cliff.label}
                px={cx}
                py={cy}
                w={Math.max(40, maxX - minX + 24)}
                h={Math.max(40, maxY - minY + 24)}
                activeId={activeTerrainId}
                setActiveId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
});

const WeatherOverlay = React.memo(function WeatherOverlay({ toPixel, season }: { toPixel: (x: number, y: number) => { px: number; py: number }; season?: Season }) {
  return (
    <>
      {WEATHER_ZONES.map((zone) => {
        const { px, py } = toPixel(zone.cx, zone.cy);
        const w = (zone.rx / WORLD_MAP_BOUNDS.maxX) * CONTENT_W * 2;
        const h = (zone.ry / WORLD_MAP_BOUNDS.maxY) * CONTENT_H * 2;
        const colors = WEATHER_COLORS[zone.type];
        const state: WeatherZoneSeasonState = getZoneSeasonState(zone, season);
        const dormant = state === "dormant";
        // Faded styling for dormant zones so the player still sees the
        // hazard footprint and learns the seasonal rhythm, but the visual
        // weight matches the (currently zero) gameplay impact.
        const intensityOpacity = dormant
          ? "04"
          : state === "high" ? "18" : state === "medium" ? "10" : "08";
        const borderOpacity = dormant
          ? "12"
          : state === "high" ? "35" : state === "medium" ? "25" : "15";
        const labelText = dormant ? `· ${zone.label} [dormant]` : `⚠ ${zone.label}`;
        const labelColor = dormant ? colors.text + "80" : colors.text;

        return (
          <React.Fragment key={`weather-${zone.id}`}>
            <View
              style={{
                position: "absolute",
                left: px - w / 2,
                top: py - h / 2,
                width: w,
                height: h,
                borderRadius: w / 2,
                backgroundColor: colors.fill.slice(0, 7) + intensityOpacity,
                borderWidth: MAP_SIZING.annotation.fogQuestion / 12,
                borderColor: colors.border.slice(0, 7) + borderOpacity,
                borderStyle: "dashed",
                opacity: dormant ? 0.55 : 1,
              }}
            />
            <View
              style={{
                position: "absolute",
                left: px - 22,
                top: py - 5,
                backgroundColor: colors.fill.slice(0, 7) + (dormant ? "10" : "20"),
                borderRadius: 2,
                paddingHorizontal: 3,
                paddingVertical: 1,
                borderWidth: 0.5,
                borderColor: colors.border.slice(0, 7) + (dormant ? "20" : "40"),
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                   fontSize: MAP_SIZING.geography.weatherLabel,
                  color: labelColor,
                  letterSpacing: 0.8,
                  textAlign: "center",
                }}
              >
                {labelText}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </>
  );
});

const TerrainLayer = React.memo(function TerrainLayer({
  toPixel,
  activeTerrainId,
  setActiveTerrainId,
  chartedTerrainIds,
}: {
  toPixel: (x: number, y: number) => { px: number; py: number };
  activeTerrainId: string | null;
  setActiveTerrainId: React.Dispatch<React.SetStateAction<string | null>>;
  chartedTerrainIds: Set<string>;
}) {
  return (
    <>
      {/* Yellowstone's periphery is a visual warning band, not a second Atlas
          feature. Keep it non-interactive so the existing scar hotspot and
          every location marker retain their hit priority. */}
      {(() => {
        const { px, py } = toPixel(
          YELLOWSTONE_EXCLUSION_ZONE.periphery.cx,
          YELLOWSTONE_EXCLUSION_ZONE.periphery.cy,
        );
        const w = (YELLOWSTONE_EXCLUSION_ZONE.periphery.rx / WORLD_MAP_BOUNDS.maxX) * CONTENT_W * 2;
        const h = (YELLOWSTONE_EXCLUSION_ZONE.periphery.ry / WORLD_MAP_BOUNDS.maxY) * CONTENT_H * 2;
        return (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: px - w / 2,
              top: py - h / 2,
              width: w,
              height: h,
              borderRadius: Math.max(w, h) / 2,
              backgroundColor: MAP.red + "08",
              borderWidth: 1.25,
              borderColor: MAP.red + "60",
              borderStyle: "dashed",
            }}
          >
            <Text
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: -16,
                textAlign: "center",
                fontFamily: "Inter_700Bold",
                fontSize: MAP_SIZING.geography.weatherLabel,
                letterSpacing: 1.4,
                color: MAP.red,
              }}
            >
              {YELLOWSTONE_EXCLUSION_ZONE.label}
            </Text>
          </View>
        );
      })()}
      {TERRAIN_ZONES.map((zone) => {
        const { px, py } = toPixel(zone.cx, zone.cy);
        const w = (zone.rx / WORLD_MAP_BOUNDS.maxX) * CONTENT_W * 2;
        const h = (zone.ry / WORLD_MAP_BOUNDS.maxY) * CONTENT_H * 2;
        const threatColor = zone.threat ? THREAT_TINT[zone.threat] : null;
        return (
          <React.Fragment key={zone.id}>
            <View
              style={{
                position: "absolute",
                left: px - w / 2,
                top: py - h / 2,
                width: w,
                height: h,
                borderRadius: Math.max(w, h) / 2,
                backgroundColor: zone.color,
                opacity: zone.opacity,
              }}
            />
            {/* Faint solid boundary so the tint reads as a deliberate biome
                region rather than a floating blob. Solid (not dashed) keeps it
                distinct from the dashed weather-hazard footprints; alpha is
                baked into the colour so it stays a hairline. */}
            <View
              style={{
                position: "absolute",
                left: px - w / 2,
                top: py - h / 2,
                width: w,
                height: h,
                borderRadius: Math.max(w, h) / 2,
                borderWidth: 0.75,
                borderColor: zone.color + "38",
              }}
            />
            {threatColor && (
              <View
                style={{
                  position: "absolute",
                  left: px - w / 2,
                  top: py - h / 2,
                  width: w,
                  height: h,
                  borderRadius: Math.max(w, h) / 2,
                  backgroundColor: threatColor,
                  opacity: 0.03,
                }}
              />
            )}
            {zone.label && (
              <Text
                style={{
                  position: "absolute",
                  left: px - 70,
                  top: py - h / 2 - 16,
                  width: 140,
                  textAlign: "center",
                  fontFamily: "Inter_600SemiBold",
                   fontSize: MAP_SIZING.geography.terrainLabel,
                  color: MAP.inkFaded,
                  opacity: 0.7,
                  letterSpacing: 2,
                }}
              >
                {zone.label}
              </Text>
            )}
            {zone.label && (
              <TerrainHotspot
                id={`zone-${zone.id}`}
                name={zone.label}
                px={px}
                py={py}
                w={Math.max(80, w + 20)}
                h={Math.max(50, h + 20)}
                activeId={activeTerrainId}
                setActiveId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
            )}
          </React.Fragment>
        );
      })}
    </>
  );
});

const MapNodeTooltip = React.memo(function MapNodeTooltip({ loc, visible }: { loc: WorldLocation; visible: boolean }) {
  if (!visible || Platform.OS !== "web") return null;
  const terrainLabel = loc.terrain ? TERRAIN_LABELS[loc.terrain] : null;
  const typeLabel = loc.type === "resource_node" ? "RESOURCE" : loc.type === "player_city" ? "YOUR CITY" : loc.type.replace(/_/g, " ").toUpperCase();
  return (
    <View
      testID={`world-map-tooltip-${loc.id}`}
      style={{
      position: "absolute",
      bottom: "100%",
      left: "50%",
      transform: [{ translateX: -70 }],
      marginBottom: 4,
      width: 140,
      backgroundColor: MAP.parchment + "F0",
      borderWidth: 1,
      borderColor: MAP.borderWorn,
      borderRadius: 4,
      padding: 6,
      zIndex: 9999,
      pointerEvents: "none" as any,
      }}
    >
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, color: MAP.ink, marginBottom: 2 }} numberOfLines={1}>{loc.name}</Text>
      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 7, color: MAP.inkLight, letterSpacing: 1, marginBottom: 2 }}>{typeLabel}</Text>
      {terrainLabel && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 7, color: MAP.sepia }}>{terrainLabel}</Text>}
      {loc.population > 0 && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 7, color: MAP.inkFaded }}>Pop: {loc.population.toLocaleString()}</Text>}
      {loc.defenseRating > 0 && (
        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 7, color: loc.defenseRating >= 60 ? MAP.red : loc.defenseRating >= 30 ? MAP.orange : MAP.green }}>
          Def: {loc.defenseRating}
        </Text>
      )}
      {loc.faction !== "None" && <Text style={{ fontFamily: "Inter_400Regular", fontSize: 7, color: MAP.inkFaded }}>{loc.faction}</Text>}
      <View style={{ position: "absolute", bottom: -4, left: 66, width: 0, height: 0, borderLeftWidth: 4, borderRightWidth: 4, borderTopWidth: 4, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: MAP.borderWorn }} />
    </View>
  );
});

const HostilePulseNode = React.memo(function HostilePulseNode({ loc, nodeSize, color, borderColor, onPress, onHover, onContextMenu, toPixel, counterScale, showLabel }: {
  loc: WorldLocation;
  nodeSize: number;
  color: string;
  borderColor: string;
  onPress: (locId: string) => void;
  onHover?: (locId: string | null) => void;
  onContextMenu?: (locId: string, e: any) => void;
  toPixel: (x: number, y: number) => { px: number; py: number };
  counterScale: any;
  showLabel: boolean;
}) {
  const pulseOpacity = useSharedValue(0.3);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(0.7, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const { px, py } = toPixel(loc.x, loc.y);
  const [hovered, setHovered] = useState(false);
  const webHandlers = Platform.OS === "web" ? {
    onMouseEnter: () => { setHovered(true); onHover?.(loc.id); },
    onMouseLeave: () => { setHovered(false); onHover?.(null); },
    onContextMenu: (e: any) => { e.preventDefault?.(); onContextMenu?.(loc.id, e); },
  } : {};

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{
        position: "absolute",
        left: px - nodeSize / 2 - 24,
        top: py - nodeSize / 2 - 10,
        alignItems: "center",
        width: 110,
        zIndex: getWorldMapHitTargetPriority(loc.type),
        transformOrigin: ["50%", (nodeSize * MAP_SIZING.ring.hostilePulse) / 2, 0],
      }, counterScale]}
    >
      <AnimatedPressable
        onPress={() => onPress(loc.id)}
        accessibilityRole="button"
        accessibilityLabel={`${loc.name}, ${loc.type.replace("_", " ")}`}
        hitSlop={8}
        {...(webHandlers as any)}
        style={{
          alignSelf: "center",
          alignItems: "center",
          ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
        }}
      >
        <MapNodeTooltip loc={loc} visible={hovered} />
        <View style={{ width: nodeSize * MAP_SIZING.ring.hostilePulse, height: nodeSize * MAP_SIZING.ring.hostilePulse, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={[
              {
                position: "absolute",
                width: nodeSize * MAP_SIZING.ring.hostilePulse,
                height: nodeSize * MAP_SIZING.ring.hostilePulse,
                borderRadius: (nodeSize * MAP_SIZING.ring.hostilePulse) / 2,
                backgroundColor: MAP.red + "40",
              },
              glowStyle,
            ]}
          />
          <View
            style={{
              width: nodeSize,
              height: nodeSize,
              borderRadius: nodeSize / 2,
              backgroundColor: color,
              borderWidth: 2,
              borderColor: borderColor,
            }}
          />
        </View>
        {showLabel && (
          <View testID={`world-map-label-${loc.id}`} style={LABEL_PLATE}>
            <Text
              style={{
                color: MAP.red,
                fontSize: MAP_SIZING.font.node,
                fontFamily: "Inter_700Bold",
                textAlign: "center",
                letterSpacing: 0.4,
              }}
              numberOfLines={1}
            >
              {loc.name}
            </Text>
          </View>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
});

const StaticNode = React.memo(function StaticNode({ loc, nodeSize, color, borderColor, isUncharted, onPress, onHover, onContextMenu, toPixel, counterScale, showLabel }: {
  loc: WorldLocation;
  nodeSize: number;
  color: string;
  borderColor: string;
  isUncharted?: boolean;
  onPress: (locId: string) => void;
  onHover?: (locId: string | null) => void;
  onContextMenu?: (locId: string, e: any) => void;
  toPixel: (x: number, y: number) => { px: number; py: number };
  counterScale: any;
  showLabel: boolean;
}) {
  const { px, py } = toPixel(loc.x, loc.y);
  const isPlayer = loc.type === "player_city";
  const [hovered, setHovered] = useState(false);
  const webHandlers = Platform.OS === "web" ? {
    onMouseEnter: () => { setHovered(true); onHover?.(loc.id); },
    onMouseLeave: () => { setHovered(false); onHover?.(null); },
    onContextMenu: (e: any) => { e.preventDefault?.(); onContextMenu?.(loc.id, e); },
  } : {};

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{
        position: "absolute",
        left: px - nodeSize / 2 - 24,
        top: py - nodeSize / 2 - 10,
        alignItems: "center",
        width: 110,
        zIndex: getWorldMapHitTargetPriority(loc.type),
        transformOrigin: ["50%", (nodeSize * (isPlayer ? MAP_SIZING.ring.playerDashed : 1)) / 2, 0],
      }, counterScale]}
    >
      <AnimatedPressable
        onPress={() => onPress(loc.id)}
        accessibilityRole="button"
        accessibilityLabel={`${loc.name}, ${loc.type.replace("_", " ")}`}
        hitSlop={8}
        {...(webHandlers as any)}
        style={{
          alignSelf: "center",
          alignItems: "center",
          ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
        }}
      >
        {!isPlayer && <MapNodeTooltip loc={loc} visible={hovered} />}
        <View style={{ width: nodeSize * (isPlayer ? MAP_SIZING.ring.playerDashed : 1), height: nodeSize * (isPlayer ? MAP_SIZING.ring.playerDashed : 1), alignItems: "center", justifyContent: "center" }}>
          {isPlayer && (
            <View
              style={{
                position: "absolute",
                width: nodeSize * MAP_SIZING.ring.playerDashed,
                height: nodeSize * MAP_SIZING.ring.playerDashed,
                borderRadius: (nodeSize * MAP_SIZING.ring.playerDashed) / 2,
                borderWidth: 2,
                borderColor: MAP.green + "60",
                borderStyle: "dashed",
              }}
            />
          )}
          {!isPlayer && loc.terrain && loc.type !== "resource_node" && (
            <View
              style={{
                position: "absolute",
                width: nodeSize * MAP_SIZING.ring.terrain,
                height: nodeSize * MAP_SIZING.ring.terrain,
                borderRadius: (nodeSize * MAP_SIZING.ring.terrain) / 2,
                backgroundColor: (TERRAIN_COLORS[loc.terrain] ?? MAP.inkFaded) + "33",
                borderWidth: 1,
                borderColor: (TERRAIN_COLORS[loc.terrain] ?? MAP.inkFaded) + "66",
              }}
            />
          )}
          <View
            style={{
              width: nodeSize,
              height: nodeSize,
              borderRadius: isPlayer ? 0 : loc.type === "resource_node" ? 2 : nodeSize / 2,
              transform: isPlayer || loc.type === "resource_node" ? [{ rotate: "45deg" }] : [],
              backgroundColor: color,
              borderWidth: isPlayer ? 3 : 2,
               borderColor: loc.type === "resource_node" ? color : isUncharted ? MAP.inkFaded : borderColor,
               borderStyle: isUncharted ? "dashed" : "solid",
               opacity: isUncharted ? 0.78 : 1,
            }}
          />
        </View>
        {showLabel && (
          <View
            testID={`world-map-label-${loc.id}`}
            style={[LABEL_PLATE, isPlayer ? { borderColor: MAP.green + "AA" } : null]}
          >
            <Text
              style={{
                color: isPlayer ? MAP.ink : borderColor === MAP.green ? MAP.green : borderColor === MAP.red ? MAP.red : MAP.ink,
                fontSize: isPlayer ? MAP_SIZING.font.playerCity : MAP_SIZING.font.node,
                fontFamily: isPlayer ? "Inter_700Bold" : "Inter_600SemiBold",
                textAlign: "center",
                letterSpacing: isPlayer ? 1 : 0.3,
              }}
              numberOfLines={1}
            >
              {loc.name}
            </Text>
          </View>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
});

const PlayerGlowNode = React.memo(function PlayerGlowNode({ loc, onPress, toPixel, cityName, counterScale, showLabel }: {
  loc: WorldLocation;
  onPress: (locId: string) => void;
  toPixel: (x: number, y: number) => { px: number; py: number };
  cityName?: string;
  counterScale: any;
  showLabel: boolean;
}) {
  const glowPulse = useSharedValue(0.25);
  const ringPulse = useSharedValue(0.4);

  useEffect(() => {
    glowPulse.value = withRepeat(
      withTiming(0.6, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    ringPulse.value = withRepeat(
      withTiming(0.8, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const outerGlow = useAnimatedStyle(() => ({ opacity: glowPulse.value }));
  const innerRing = useAnimatedStyle(() => ({ opacity: ringPulse.value }));

  const { px, py } = toPixel(loc.x, loc.y);
  const nodeSize = markerSize("player_city");

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[{
        position: "absolute",
        left: px - nodeSize / 2 - 30,
        top: py - nodeSize / 2 - 16,
        alignItems: "center",
        width: 120,
        zIndex: getWorldMapHitTargetPriority(loc.type),
        transformOrigin: ["50%", (nodeSize * MAP_SIZING.ring.playerGlowOuter) / 2, 0],
      }, counterScale]}
    >
      <AnimatedPressable
        onPress={() => onPress(loc.id)}
        accessibilityRole="button"
        accessibilityLabel={`${cityName ?? loc.name}, player city`}
        hitSlop={8}
        style={{
          alignSelf: "center",
          alignItems: "center",
          ...(Platform.OS === "web" ? { cursor: "pointer" as any } : {}),
        }}
      >
        <View style={{ width: nodeSize * MAP_SIZING.ring.playerGlowOuter, height: nodeSize * MAP_SIZING.ring.playerGlowOuter, alignItems: "center", justifyContent: "center" }}>
          <Animated.View
            style={[
              {
                position: "absolute",
                width: nodeSize * MAP_SIZING.ring.playerGlowOuter,
                height: nodeSize * MAP_SIZING.ring.playerGlowOuter,
                borderRadius: (nodeSize * MAP_SIZING.ring.playerGlowOuter) / 2,
                backgroundColor: MAP.green + "30",
              },
              outerGlow,
            ]}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                width: nodeSize * MAP_SIZING.ring.playerGlowRing,
                height: nodeSize * MAP_SIZING.ring.playerGlowRing,
                borderRadius: (nodeSize * MAP_SIZING.ring.playerGlowRing) / 2,
                borderWidth: 2,
                borderColor: MAP.green + "60",
                borderStyle: "dashed",
              },
              innerRing,
            ]}
          />
          <View
            style={{
              width: nodeSize,
              height: nodeSize,
              borderRadius: 0,
              transform: [{ rotate: "45deg" }],
              backgroundColor: MAP.green,
              borderWidth: 3,
              borderColor: MAP.green,
            }}
          />
        </View>
        {showLabel && (
          <View
            testID={`world-map-label-${loc.id}`}
            style={[LABEL_PLATE, { borderColor: MAP.green + "AA" }]}
          >
            <Text
              style={{
                color: MAP.ink,
                fontSize: MAP_SIZING.font.playerCity,
                fontFamily: "Inter_700Bold",
                textAlign: "center",
                letterSpacing: 1.2,
              }}
              numberOfLines={1}
            >
              {cityName ?? loc.name}
            </Text>
          </View>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
});

const TradeCaravanDot = React.memo(function TradeCaravanDot({ fromX, fromY, toX, toY, delay }: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 5000, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: fromX + (toX - fromX) * progress.value - MAP_SIZING.faction.caravanDot / 2,
    top: fromY + (toY - fromY) * progress.value - MAP_SIZING.faction.caravanDot / 2,
    width: MAP_SIZING.faction.caravanDot,
    height: MAP_SIZING.faction.caravanDot,
    borderRadius: MAP_SIZING.faction.caravanDot / 2,
    backgroundColor: MAP.routeSafe,
    opacity: 0.6,
  }));

  return <Animated.View style={dotStyle} />;
});

const FactionConvoyDot = React.memo(function FactionConvoyDot({ fromX, fromY, toX, toY, color, delay }: {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  delay: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, { duration: 7000, easing: Easing.linear }),
        -1,
        false
      )
    );
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: fromX + (toX - fromX) * progress.value - MAP_SIZING.faction.convoyDot / 2,
    top: fromY + (toY - fromY) * progress.value - MAP_SIZING.faction.convoyDot / 2,
    width: MAP_SIZING.faction.convoyDot,
    height: MAP_SIZING.faction.convoyDot,
    borderRadius: MAP_SIZING.faction.convoyDot / 2,
    backgroundColor: color,
    opacity: 0.85,
    shadowColor: color,
    shadowOpacity: 0.7,
    shadowRadius: 3,
  }));

  return <Animated.View style={[dotStyle, { pointerEvents: "none" }]} />;
});

const FogMarkers = React.memo(function FogMarkers({
  locations,
  discoveredIds,
  toPixel,
}: {
  locations: WorldLocation[];
  discoveredIds: string[];
  toPixel: (x: number, y: number) => { px: number; py: number };
}) {
  const undiscovered = locations.filter(
    (l) => l.type !== "megacity" && !l.discovered && !discoveredIds.includes(l.id)
  );

  return (
    <>
      {undiscovered.map((loc) => {
        const { px, py } = toPixel(loc.x, loc.y);
        return (
          <React.Fragment key={`fog-${loc.id}`}>
            <View
              style={{
                position: "absolute",
                 left: px - MAP_SIZING.annotation.fogDiameter / 2,
                 top: py - MAP_SIZING.annotation.fogDiameter / 2,
                 width: MAP_SIZING.annotation.fogDiameter,
                 height: MAP_SIZING.annotation.fogDiameter,
                 borderRadius: MAP_SIZING.annotation.fogDiameter / 2,
                backgroundColor: MAP.sepia + "0A",
                borderWidth: 1,
                borderColor: MAP.inkLight + "15",
                borderStyle: "dashed",
              }}
            />
            <Text
              style={{
                position: "absolute",
                 left: px - MAP_SIZING.annotation.fogQuestion / 2,
                 top: py - MAP_SIZING.annotation.fogQuestion / 2 - 1,
                 fontSize: MAP_SIZING.annotation.fogQuestion,
                fontFamily: "Inter_600SemiBold",
                color: MAP.inkLight + "35",
              }}
            >
              ?
            </Text>
          </React.Fragment>
        );
      })}
    </>
  );
});

const CONTINENT_SCALE = 3;
const CONTINENT_SVG_W = CONTENT_W * CONTINENT_SCALE;
const CONTINENT_SVG_H = CONTENT_H * CONTINENT_SCALE;

// North America coastline = the real map base. Aligned 1:1 with WORLD_MAP_BOUNDS
// (0..1000) so any location at (x,y) maps directly onto the NA landmass.
const SHOW_AMERICAS_TEST_OVERLAY = true;
const AMERICAS_OVERLAY_OPACITY = 1;
const AMERICAS_OVERLAY_W = CONTENT_W;
const AMERICAS_OVERLAY_H = CONTENT_H;
const AMERICAS_OVERLAY_LEFT = CONTENT_PAD_X;
const AMERICAS_OVERLAY_TOP = CONTENT_PAD_Y;
// Tappable "survey pending" hotspot over the South America teaser. Coords are the
// SVG-space label box (viewBox 0..1000) mapped into content px via the same
// LEFT/TOP + fraction*W/H transform AmericasTestOverlay uses for the label text.
const SA_HOTSPOT_LEFT = AMERICAS_OVERLAY_LEFT + (620 / 1000) * AMERICAS_OVERLAY_W;
const SA_HOTSPOT_TOP = AMERICAS_OVERLAY_TOP + (720 / 1000) * AMERICAS_OVERLAY_H;
const SA_HOTSPOT_W = (220 / 1000) * AMERICAS_OVERLAY_W;
const SA_HOTSPOT_H = (150 / 1000) * AMERICAS_OVERLAY_H;
// Anticipation hook for the reserved southern continent. These are flavor-only
// teasers of planned biomes/regions — no playable South America content ships
// with them. Kept here so the survey-brief modal can list concrete named sectors.
const SA_PROJECTED_SECTORS: ReadonlyArray<{ name: string; biome: string; note: string }> = [
  { name: "THE VERDANCE", biome: "OVERGROWTH", note: "Runaway rainforest that swallowed three capitals whole. The canopy hasn't stopped climbing since the Collapse." },
  { name: "ASH CORDILLERA", biome: "VOLCANIC", note: "The mountain spine turned furnace — a run of live calderas venting grey snow the year round." },
  { name: "SALTGLASS PAMPAS", biome: "SALT FLATS", note: "Grassland fused to a mirror by old warhead heat. Nomad rigs cross it under sail like a dead white sea." },
  { name: "THE DROWNED COAST", biome: "FLOODED", note: "Port cities gone to reef and brine. Trade still moves along it — most of it underwater now." },
];
const AmericasTestOverlay = React.memo(function AmericasTestOverlay() {
  if (!SHOW_AMERICAS_TEST_OVERLAY) return null;
  const vb = AMERICAS_OVERLAY_VIEWBOX;
  return (
    <View
      style={{
        pointerEvents: "none",
        position: "absolute",
        left: AMERICAS_OVERLAY_LEFT,
        top: AMERICAS_OVERLAY_TOP,
        width: AMERICAS_OVERLAY_W,
        height: AMERICAS_OVERLAY_H,
        opacity: AMERICAS_OVERLAY_OPACITY,
      }}
    >
      <Svg
        width={AMERICAS_OVERLAY_W}
        height={AMERICAS_OVERLAY_H}
        viewBox={`0 0 ${vb.width} ${vb.height}`}
      >
        <Path
          d={AMERICAS_OVERLAY_PATH_D}
          fill="none"
          stroke="#000000"
          strokeWidth={MAP_SIZING.coastStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* South America landmass — labelled, uninhabited in current content. */}
        <SvgText
          x={730}
          y={770}
          fill="#000000"
          fillOpacity={0.45}
          fontSize={18}
          fontWeight="bold"
          textAnchor="middle"
          letterSpacing={2}
        >
          SOUTH AMERICA
        </SvgText>
        <SvgText
          x={730}
          y={792}
          fill="#000000"
          fillOpacity={0.35}
          fontSize={11}
          textAnchor="middle"
          letterSpacing={1.5}
        >
          // UNDER DEVELOPMENT
        </SvgText>
        <SvgText
          x={730}
          y={808}
          fill="#000000"
          fillOpacity={0.3}
          fontSize={9}
          fontStyle="italic"
          textAnchor="middle"
          letterSpacing={1}
        >
          signal lost — survey pending
        </SvgText>
      </Svg>
    </View>
  );
});

const VignetteOverlay = React.memo(function VignetteOverlay() {
  return (
    <View style={{ position: "absolute", left: 0, top: 0, width: MAP_W + 100, height: MAP_H + 100, pointerEvents: "none" as any }}>
      <View style={{ position: "absolute", left: 0, top: 0, width: MAP_W + 100, height: 60, backgroundColor: MAP.ink, opacity: 0.15 }} />
      <View style={{ position: "absolute", left: 0, bottom: 0, width: MAP_W + 100, height: 60, backgroundColor: MAP.ink, opacity: 0.2 }} />
      <View style={{ position: "absolute", left: 0, top: 0, width: 50, height: MAP_H + 100, backgroundColor: MAP.ink, opacity: 0.12 }} />
      <View style={{ position: "absolute", right: 0, top: 0, width: 50, height: MAP_H + 100, backgroundColor: MAP.ink, opacity: 0.12 }} />
      <View style={{ position: "absolute", left: 0, top: 0, width: 30, height: 30, backgroundColor: MAP.ink, opacity: 0.25, borderBottomRightRadius: 30 }} />
      <View style={{ position: "absolute", right: 0, top: 0, width: 30, height: 30, backgroundColor: MAP.ink, opacity: 0.25, borderBottomLeftRadius: 30 }} />
      <View style={{ position: "absolute", left: 0, bottom: 0, width: 30, height: 30, backgroundColor: MAP.ink, opacity: 0.25, borderTopRightRadius: 30 }} />
      <View style={{ position: "absolute", right: 0, bottom: 0, width: 30, height: 30, backgroundColor: MAP.ink, opacity: 0.25, borderTopLeftRadius: 30 }} />
    </View>
  );
});

const GridOverlay = React.memo(function GridOverlay() {
  const vLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    for (let i = 0; i <= TOTAL_COLS; i++) {
      const isBoundary = i === 0 || i === TOTAL_COLS || i === EXT_COLS;
      const isMajor = i % 4 === 0;
      const isMinor = i % 2 === 0;
      if (!isBoundary && !isMinor && i >= EXT_COLS) continue;
      if (!isBoundary && !isMinor && i < EXT_COLS) continue;
      lines.push(
        <View
          key={`gv-${i}`}
          style={{
            position: "absolute",
            left: EXT_ORIGIN_X + i * DESIG_CELL_W,
            top: EXT_ORIGIN_Y,
            width: isBoundary ? 1 : 0.5,
            height: TOTAL_ROWS * DESIG_CELL_H,
            backgroundColor: MAP.inkLight,
            opacity: isBoundary ? 0.25 : i < EXT_COLS ? 0.04 : isMajor ? 0.12 : 0.06,
          }}
        />
      );
    }
    return lines;
  }, []);

  const hLines = useMemo(() => {
    const lines: React.ReactNode[] = [];
    for (let i = 0; i <= TOTAL_ROWS; i++) {
      const isBoundary = i === 0 || i === TOTAL_ROWS || i === EXT_ROWS;
      const isMajor = i % 4 === 0;
      const isMinor = i % 2 === 0;
      if (!isBoundary && !isMinor && i >= EXT_ROWS) continue;
      if (!isBoundary && !isMinor && i < EXT_ROWS) continue;
      lines.push(
        <View
          key={`gh-${i}`}
          style={{
            position: "absolute",
            left: EXT_ORIGIN_X,
            top: EXT_ORIGIN_Y + i * DESIG_CELL_H,
            width: TOTAL_COLS * DESIG_CELL_W,
            height: isBoundary ? 1 : 0.5,
            backgroundColor: MAP.inkLight,
            opacity: isBoundary ? 0.25 : i < EXT_ROWS ? 0.04 : isMajor ? 0.12 : 0.06,
          }}
        />
      );
    }
    return lines;
  }, []);

  const colLabels = useMemo(() => {
    const labels: React.ReactNode[] = [];
    for (let i = 0; i < TOTAL_COLS; i++) {
      const isExt = i < EXT_COLS;
      if (isExt && i % 4 !== 0) continue;
      const left = EXT_ORIGIN_X + i * DESIG_CELL_W + DESIG_CELL_W / 2;
      labels.push(
        <Text
          key={`gl-${i}`}
          style={{
            position: "absolute",
            left: left - (isExt ? 7 : 5),
            top: EXT_ORIGIN_Y - 10,
            fontSize: isExt ? MAP_SIZING.annotation.gridExternal : MAP_SIZING.annotation.gridPrimary,
            fontFamily: "Inter_700Bold",
            color: isExt ? MAP.inkLight + "60" : MAP.inkLight + "B0",
            textAlign: "center",
            width: isExt ? 16 : 12,
          }}
        >
          {getFullColLabel(i)}
        </Text>
      );
    }
    return labels;
  }, []);

  const rowLabels = useMemo(() => {
    const labels: React.ReactNode[] = [];
    for (let i = 0; i < TOTAL_ROWS; i++) {
      const isExt = i < EXT_ROWS;
      if (isExt && i % 4 !== 0) continue;
      labels.push(
        <Text
          key={`gn-${i}`}
          style={{
            position: "absolute",
            left: EXT_ORIGIN_X - 24,
            top: EXT_ORIGIN_Y + i * DESIG_CELL_H + DESIG_CELL_H / 2 - 3,
            fontSize: isExt ? MAP_SIZING.annotation.gridExternal : MAP_SIZING.annotation.gridPrimary,
            fontFamily: "Inter_700Bold",
            color: isExt ? MAP.inkLight + "60" : MAP.inkLight + "B0",
            textAlign: "right",
            width: 20,
          }}
        >
          {getFullRowLabel(i)}
        </Text>
      );
    }
    return labels;
  }, []);

  const cellRefs = useMemo(() => {
    const refs: React.ReactNode[] = [];
    for (let col = 0; col < GRID_COLS; col += 1) {
      for (let row = 0; row < GRID_ROWS; row += 1) {
        const tc = EXT_COLS + col;
        const tr = EXT_ROWS + row;
        refs.push(
          <Text
            key={`gref-${col}-${row}`}
            style={{
              position: "absolute",
              left: EXT_ORIGIN_X + tc * DESIG_CELL_W + 1,
              top: EXT_ORIGIN_Y + tr * DESIG_CELL_H + 1,
              fontSize: MAP_SIZING.annotation.gridCellReference,
              fontFamily: "Inter_400Regular",
              color: MAP.inkLight + "25",
            }}
          >
            {getFullCellRef(tc, tr)}
          </Text>
        );
      }
    }
    return refs;
  }, []);

  return (
    <View style={styles.gridOverlay}>
      {vLines}
      {hLines}
      {colLabels}
      {rowLabels}
      {cellRefs}
    </View>
  );
});

const CompassRoseDecoration = React.memo(function CompassRoseDecoration() {
  return (
    <View style={{
      position: "absolute",
      right: 30,
      top: 55,
      width: 50,
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      pointerEvents: "none" as any,
    }}>
      <View style={{
    width: MAP_SIZING.minimap.compassOuter,
    height: MAP_SIZING.minimap.compassOuter,
    borderRadius: MAP_SIZING.minimap.compassOuter / 2,
        borderWidth: 1.5,
        borderColor: MAP.sepia + "50",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <View style={{
          width: MAP_SIZING.minimap.compassInner,
          height: MAP_SIZING.minimap.compassInner,
          borderRadius: MAP_SIZING.minimap.compassInner / 2,
          borderWidth: 1,
          borderColor: MAP.sepia + "30",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <View style={{
            position: "absolute",
            width: 1,
            height: MAP_SIZING.minimap.compassCross,
            backgroundColor: MAP.sepia + "40",
          }} />
          <View style={{
            position: "absolute",
            width: MAP_SIZING.minimap.compassCross,
            height: 1,
            backgroundColor: MAP.sepia + "40",
          }} />
          <View style={{
            position: "absolute",
            width: 1,
            height: MAP_SIZING.minimap.compassDiagonal,
            backgroundColor: MAP.sepia + "25",
            transform: [{ rotate: "45deg" }],
          }} />
          <View style={{
            position: "absolute",
            width: MAP_SIZING.minimap.compassDiagonal,
            height: 1,
            backgroundColor: MAP.sepia + "25",
            transform: [{ rotate: "45deg" }],
          }} />
          <Text style={{
            position: "absolute",
            top: -1,
            fontFamily: "Inter_700Bold",
            fontSize: MAP_SIZING.minimap.compassNorth,
            color: MAP.red,
            letterSpacing: 0.5,
          }}>N</Text>
          <Text style={{
            position: "absolute",
            bottom: 0,
            fontFamily: "Inter_400Regular",
            fontSize: MAP_SIZING.minimap.compassCardinal,
            color: MAP.sepia + "60",
          }}>S</Text>
          <Text style={{
            position: "absolute",
            right: 1,
            fontFamily: "Inter_400Regular",
            fontSize: MAP_SIZING.minimap.compassCardinal,
            color: MAP.sepia + "60",
          }}>E</Text>
          <Text style={{
            position: "absolute",
            left: 1,
            fontFamily: "Inter_400Regular",
            fontSize: MAP_SIZING.minimap.compassCardinal,
            color: MAP.sepia + "60",
          }}>W</Text>
        </View>
      </View>
    </View>
  );
});

const MINI_W = 110;
const MINI_H = 110;

// Three-letter zone abbreviations for the minimap hazard legend. Keep these
// short — the legend strip is ~16px tall and labels need to fit beside a
// 5px color dot.
const HAZARD_TYPE_LABELS: Record<WeatherZone["type"], string> = {
  radiation_storm: "RAD",
  dust_cloud: "DST",
  acid_rain: "ACD",
  electromagnetic: "EMP",
  ashfall: "ASH",
  toxic_fog: "TOX",
};

// Full hazard names shown when the player taps the legend strip to
// expand it. The compact RAD/DST/ACD/etc. abbreviations are unreadable
// without context, so the strip is press-to-expand into a vertical
// list with these names. (Task #94.)
const HAZARD_TYPE_FULL_LABELS: Record<WeatherZone["type"], string> = {
  radiation_storm: "RADIATION STORM",
  dust_cloud: "DUST CLOUD",
  acid_rain: "ACID RAIN",
  electromagnetic: "ELECTROMAGNETIC PULSE",
  ashfall: "ASHFALL",
  toxic_fog: "TOXIC FOG",
};

type MutableNumber = { value: number };

const MinimapOverlay = React.memo(function MinimapOverlay({
  locations,
  routes,
  playerPos,
  toPixel,
  offsetX,
  offsetY,
  scale,
  screenW,
  screenH,
}: {
  locations: WorldLocation[];
  routes: WorldRoute[];
  playerPos: { x: number; y: number };
  toPixel: (x: number, y: number) => { px: number; py: number };
  offsetX: MutableNumber;
  offsetY: MutableNumber;
  scale: MutableNumber;
  screenW: number;
  screenH: number;
}) {
  const [showHazards, setShowHazards] = useState(true);
  // Compact abbreviation strip by default; tap to expand into a
  // vertical list with full hazard names. (Task #94.)
  const [legendExpanded, setLegendExpanded] = useState(false);
  // Reset the expand state whenever hazards are hidden so re-enabling
  // them always brings the legend back in its compact starting form.
  useEffect(() => {
    if (!showHazards) setLegendExpanded(false);
  }, [showHazards]);
  const miniScale = (coord: number, max: number) => (coord / max) * (MINI_W - 16) + 8;

  // Tween the main map's pan so the given world coords sit centered on
  // screen at the current zoom. Mirrors the math used by the crosshair
  // recenter button at the map controls.
  const recenterOnWorld = useCallback(
    (wx: number, wy: number) => {
      const { px, py } = toPixel(wx, wy);
      const s = scale.value;
      offsetX.value = withTiming(screenW / 2 - px * s - CONTENT_CENTER_X * (1 - s), { duration: 350 });
      offsetY.value = withTiming(screenH / 2 - py * s - CONTENT_CENTER_Y * (1 - s), { duration: 350 });
    },
    [toPixel, offsetX, offsetY, scale, screenW, screenH],
  );

  // Distinct hazard types currently seeded on the world. Drives the
  // legend strip — empty types are skipped so the strip stays compact.
  // Sorted by HAZARD_TYPE_LABELS key order for stable, deterministic
  // rendering regardless of zone authoring order.
  const legendTypes = React.useMemo(() => {
    const seen = new Set<WeatherZone["type"]>();
    for (const z of WEATHER_ZONES) seen.add(z.type);
    return (Object.keys(HAZARD_TYPE_LABELS) as WeatherZone["type"][]).filter((t) => seen.has(t));
  }, []);

  return (
    <View style={styles.minimap}>
      <View style={styles.minimapInner}>
        {showHazards && WEATHER_ZONES.map((zone) => {
          const mx = miniScale(zone.cx, WORLD_MAP_BOUNDS.maxX);
          const my = miniScale(zone.cy, WORLD_MAP_BOUNDS.maxY);
           const w = Math.max(MAP_SIZING.minimap.hazardMinSize, (zone.rx / WORLD_MAP_BOUNDS.maxX) * (MINI_W - 16) * 2);
           const h = Math.max(MAP_SIZING.minimap.hazardMinSize, (zone.ry / WORLD_MAP_BOUNDS.maxY) * (MINI_W - 16) * 2);
          const colors = WEATHER_COLORS[zone.type];
          const fillOpacity = zone.intensity === "high" ? "55" : zone.intensity === "medium" ? "3A" : "22";
          const borderOpacity = zone.intensity === "high" ? "AA" : zone.intensity === "medium" ? "80" : "55";
          // Pressable wraps the oval so the player can tap a hazard pill on
          // the minimap to slew the main view onto it. hitSlop keeps tiny
          // ovals reachable without inflating the rendered footprint.
          return (
            <Pressable
              key={`mw-${zone.id}`}
              onPress={() => recenterOnWorld(zone.cx, zone.cy)}
              hitSlop={4}
              accessibilityLabel={`Recenter on ${zone.label}`}
              style={{
                position: "absolute",
                left: mx - w / 2,
                top: my - h / 2,
                width: w,
                height: h,
                borderRadius: Math.max(w, h) / 2,
                backgroundColor: colors.fill.slice(0, 7) + fillOpacity,
                 borderWidth: MAP_SIZING.minimap.hazardStroke,
                borderColor: colors.border.slice(0, 7) + borderOpacity,
              }}
            />
          );
        })}
        {routes.map((r, i) => {
          const from = LOCATION_INDEX.get(r.from);
          const to = LOCATION_INDEX.get(r.to);
          if (!from || !to) return null;
          const fx = from.type === "player_city" ? playerPos.x : from.x;
          const fy = from.type === "player_city" ? playerPos.y : from.y;
          const tx = to.type === "player_city" ? playerPos.x : to.x;
          const ty = to.type === "player_city" ? playerPos.y : to.y;
          const x1 = miniScale(fx, WORLD_MAP_BOUNDS.maxX);
          const y1 = miniScale(fy, WORLD_MAP_BOUNDS.maxY);
          const x2 = miniScale(tx, WORLD_MAP_BOUNDS.maxX);
          const y2 = miniScale(ty, WORLD_MAP_BOUNDS.maxY);
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const rColor = r.danger === "hostile" ? MAP.routeHostile : r.danger === "contested" ? MAP.routeContested : r.danger === "safe" ? MAP.routeSafe : MAP.routeUnknown;
          return (
            <View
              key={`mr-${i}`}
              style={{
                position: "absolute",
                left: x1,
                top: y1,
                width: len,
                 height: MAP_SIZING.minimap.routeStroke,
                backgroundColor: rColor + "50",
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: "left center",
              }}
            />
          );
        })}
        {locations.map((loc) => {
          const lx = loc.type === "player_city" ? playerPos.x : loc.x;
          const ly = loc.type === "player_city" ? playerPos.y : loc.y;
          const mx = miniScale(lx, WORLD_MAP_BOUNDS.maxX);
          const my = miniScale(ly, WORLD_MAP_BOUNDS.maxY);
          const isPlayer = loc.type === "player_city";
           const sz = isPlayer ? MAP_SIZING.minimap.playerMarker
             : loc.type === "megacity" ? MAP_SIZING.minimap.megacityMarker
             : loc.type === "nation" ? MAP_SIZING.minimap.nationMarker
             : loc.type === "resource_node" ? MAP_SIZING.minimap.resourceMarker
             : MAP_SIZING.minimap.defaultMarker;
          return (
            <View
              key={`mm-${loc.id}`}
              style={{
                position: "absolute",
                left: mx - sz / 2,
                top: my - sz / 2,
                width: sz,
                height: sz,
                borderRadius: isPlayer || loc.type === "resource_node" ? 0 : sz / 2,
                backgroundColor: isPlayer ? MAP.green : (loc.terrain ? TERRAIN_COLORS[loc.terrain] : NODE_COLORS[loc.type] ?? MAP.inkLight),
                transform: isPlayer || loc.type === "resource_node" ? [{ rotate: "45deg" }] : [],
              }}
            />
          );
        })}
      </View>
      {showHazards && legendTypes.length > 0 && (
        <Pressable
          onPress={() => setLegendExpanded((v) => !v)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityState={{ expanded: legendExpanded }}
          accessibilityLabel={
            legendExpanded ? "Collapse hazard legend" : "Expand hazard legend"
          }
          style={
            legendExpanded ? styles.minimapLegendColumn : styles.minimapLegendRow
          }
        >
          {legendTypes.map((t) => {
            const c = WEATHER_COLORS[t];
            return (
              <View
                key={`leg-${t}`}
                style={
                  legendExpanded
                    ? styles.minimapLegendChipExpanded
                    : styles.minimapLegendChip
                }
              >
                <View
                  style={{
                   width: MAP_SIZING.minimap.legendDot,
                   height: MAP_SIZING.minimap.legendDot,
                   borderRadius: MAP_SIZING.minimap.legendDot / 2,
                    backgroundColor: c.text,
                  }}
                />
                <Text style={styles.minimapLegendText}>
                  {legendExpanded ? HAZARD_TYPE_FULL_LABELS[t] : HAZARD_TYPE_LABELS[t]}
                </Text>
              </View>
            );
          })}
        </Pressable>
      )}
      <Pressable
        onPress={() => setShowHazards((v) => !v)}
        hitSlop={4}
        style={styles.minimapToggleRow}
      >
        <Feather
          name={showHazards ? "cloud" : "cloud-off"}
          size={7}
          color={showHazards ? MAP.orange : MAP.inkLight}
        />
        <Text style={styles.minimapLabel}>TACTICAL OVERVIEW</Text>
      </Pressable>
    </View>
  );
});

type WorldAction = {
  id: string;
  label: string;
  icon: string;
  cost: number;
  available: (loc: WorldLocation, state: any, effectiveStatus: WorldLocation["status"]) => boolean;
  description: string;
};

const WORLD_ACTIONS: WorldAction[] = [
  {
    id: "scout",
    label: "SEND SCOUTS",
    icon: "eye",
    cost: 1000,
    available: (loc, _state, _eff) => loc.type !== "player_city" && !isContinuanceMapInteractionLocked(loc.id),
    description: "Dispatch a recon team. May reveal hidden locations nearby.",
  },
  {
    id: "trade",
    label: "TRADE MISSION",
    icon: "truck",
    cost: 3000,
    available: (loc, _state, effectiveStatus) => loc.type !== "player_city" && !isContinuanceMapInteractionLocked(loc.id) && effectiveStatus !== "hostile" && effectiveStatus !== "undiscovered" && loc.population > 0,
    description: "Send merchants. Better returns with higher disposition.",
  },
  {
    id: "aid",
    label: "SEND AID",
    icon: "heart",
    cost: 5000,
    available: (loc, _state, effectiveStatus) => loc.type !== "player_city" && !isContinuanceMapInteractionLocked(loc.id) && effectiveStatus !== "hostile" && effectiveStatus !== "undiscovered" && loc.population > 0,
    description: "Humanitarian supplies. Significantly improves disposition.",
  },
  {
    id: "raid",
    label: "LAUNCH RAID",
    icon: "zap",
    cost: 8000,
    available: (loc, _state, effectiveStatus) => loc.type !== "player_city" && !isContinuanceMapInteractionLocked(loc.id) && (effectiveStatus === "hostile" || effectiveStatus === "neutral"),
    description: "Military strike. Seize resources. Severely damages relations.",
  },
  {
    id: "survey_node",
    label: "SURVEY DEPOSITS",
    icon: "search",
    cost: 0,
    available: (loc, _state) => {
      if (loc.type !== "resource_node" || !loc.resourceNodeId) return false;
      const nodeDef = getNodeDef(loc.resourceNodeId);
      if (!nodeDef) return false;
      const rnState = _state.resourceNodes ?? createDefaultResourceNodeState();
      return !(rnState.surveyed[loc.resourceNodeId] ?? false);
    },
    description: "Survey the resource node to reveal yield and richness data.",
  },
  {
    id: "exploit_node",
    label: "BEGIN EXTRACTION",
    icon: "tool",
    cost: 0,
    available: (loc, _state) => {
      if (loc.type !== "resource_node" || !loc.resourceNodeId) return false;
      const nodeDef = getNodeDef(loc.resourceNodeId);
      if (!nodeDef) return false;
      const rnState = _state.resourceNodes ?? createDefaultResourceNodeState();
      const isSurveyed = rnState.surveyed[loc.resourceNodeId] ?? false;
      const isExploiting = !!rnState.exploiting[loc.resourceNodeId];
      const isDepleted = rnState.depleted.includes(loc.resourceNodeId);
      return isSurveyed && !isExploiting && !isDepleted;
    },
    description: "Establish extraction operations. Resources delivered each tick.",
  },
  {
    id: "halt_extraction",
    label: "HALT EXTRACTION",
    icon: "pause-circle",
    cost: 0,
    available: (loc, _state) => {
      if (loc.type !== "resource_node" || !loc.resourceNodeId) return false;
      const rnState = _state.resourceNodes ?? createDefaultResourceNodeState();
      return !!rnState.exploiting[loc.resourceNodeId];
    },
    description: "Stop resource extraction from this node.",
  },
  // Sandbox actions (round 3) — Crusader-Kings-style breadth.
  // Logic + costs live in @/engine/locationActions; this catalog is just
  // the UI surface. `available` defers to the engine eligibility check.
  ...(Object.keys(LOCATION_ACTION_RULES) as LocationActionId[]).map<WorldAction>((id) => {
    const meta = LOCATION_ACTION_META[id];
    const rule = LOCATION_ACTION_RULES[id];
    return {
      id,
      label: meta.label,
      icon: meta.icon,
      cost: rule.cost,
      available: (loc, _state, effectiveStatus) =>
        getLocationActionIneligibility(id, loc, effectiveStatus) === null,
      description: meta.description,
    };
  }),
];

function getWorldActionCostTiming(
  action: WorldAction,
  loc: WorldLocation,
  state: GameState,
): ReturnType<typeof normalizeActionCostTiming> {
  let upfrontCostCredits = action.cost;
  if ((action.id === "survey_node" || action.id === "exploit_node") && loc.resourceNodeId) {
    const nodeDef = getNodeDef(loc.resourceNodeId);
    if (nodeDef) upfrontCostCredits = action.id === "survey_node" ? nodeDef.surveyCost : nodeDef.exploitCost;
  }
  const lastTradeTick = action.id === "trade"
    ? state.locationRelations?.[loc.id]?.lastTradeTick
    : undefined;
  return normalizeActionCostTiming({
    kind: "instant",
    upfrontCostCredits,
    availableCredits: state.resources.credits,
    cooldownTicks: action.id === "trade" ? TRADE_COOLDOWN_TICKS : 0,
    cooldownStarts: "activation",
    cooldownUntilTick: lastTradeTick === undefined ? undefined : lastTradeTick + TRADE_COOLDOWN_TICKS,
    currentTick: state.totalTicks,
    cancellation: "unavailable",
  });
}

function WorldMapScreen() {
  // PERFORMANCE: Subscribe to specific GameState slices via useGameStateSelector
  // instead of consuming the full state via useGame(). The world map is a
  // hot-path screen — every tick mutates state.totalTicks, and consuming the
  // full state forced the entire ~3300-line render to re-run every tick.
  // Selectors re-render only when their slice changes by reference (Object.is),
  // and useGameStateRef() gives callbacks read-latest access without
  // subscribing. setState comes from the actions context, which is stable
  // across renders.
  const { setState, proposeRailCorridor, cancelRailCorridor } = useGameActions();
  const { showModal } = useGameModal();
  const { showToast } = useToast();
  const { pushUnlock: pushAtlasUnlock } = useAtlasUnlock();
  const stateRef = useGameStateRef();
  const discoveredLocationIds = useGameStateSelector((s) => s.discoveredLocationIds);
  const discoveredTerrain = useGameStateSelector((s) => s.discoveredTerrain);
  const worldEventLogRaw = useGameStateSelector((s) => s.worldEventLog);
  const playerCityPosition = useGameStateSelector((s) => s.playerCityPosition);
  const megacityRoster = useGameStateSelector((s) => s.megacityRoster);
  const locationRelations = useGameStateSelector((s) => s.locationRelations);
  const externalMegacities = useGameStateSelector((s) => s.externalMegacities);
  const townships = useGameStateSelector((s) => s.townships);
  const diplomacyAdvanced = useGameStateSelector((s) => s.diplomacyAdvanced);
  const resourceNodes = useGameStateSelector((s) => s.resourceNodes);
  const railCorridors = useGameStateSelector((s) => s.railCorridors);
  const intelligenceSecurityLevel = useGameStateSelector((s) => s.intelligence?.securityLevel ?? 0);
  const cityName = useGameStateSelector((s) => s.cityName);
  const credits = useGameStateSelector((s) => s.resources.credits);
  const gameDateMonth = useGameStateSelector((s) => s.gameDate.month);
  const currentSeason: Season = getSeason(gameDateMonth);

  const { width: screenW, height: screenH } = useWindowDimensions();
  const [selectedLocation, setSelectedLocation] = useState<WorldLocation | null>(null);
  const selectedOperational = useMemo(() => {
    if (!selectedLocation || selectedLocation.type === "player_city" || selectedLocation.type === "resource_node") {
      return selectedLocation?.operational;
    }
    const partner = [...(externalMegacities ?? []), ...(townships ?? [])].find((entity) => entity.id === selectedLocation.id);
    return partner ? operationalFromSettlement(partner) : selectedLocation.operational;
  }, [selectedLocation, externalMegacities, townships]);
  const selectedContinuance = useMemo(
    () => selectedLocation?.id === CONTINUANCE_ID
      ? (externalMegacities ?? []).find((entity) => entity.id === CONTINUANCE_ID)
      : undefined,
    [selectedLocation, externalMegacities],
  );
  const continuanceStage = useMemo(
    () => selectedContinuance
      ? getEffectiveContinuanceDiscoveryStage(
        selectedContinuance.continuance,
        discoveredLocationIds,
        intelligenceSecurityLevel,
      )
      : 0,
    [selectedContinuance, discoveredLocationIds, intelligenceSecurityLevel],
  );
  const continuanceOperational = useMemo(
    () => selectedContinuance ? normalizeContinuanceOperational(selectedContinuance.continuance) : undefined,
    [selectedContinuance],
  );
  const [showEventLog, setShowEventLog] = useState(false);
  // Survey brief for the (not-yet-playable) southern continent teaser.
  const [showSaProspect, setShowSaProspect] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const filterScrollRef = useHorizontalWheelScroll();
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [encounterResult, setEncounterResult] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ visible: boolean; position: { x: number; y: number }; locId: string | null }>({ visible: false, position: { x: 0, y: 0 }, locId: null });
  const [weatherNotice, setWeatherNotice] = useState<string | null>(null);
  const [activeTerrainId, setActiveTerrainIdRaw] = useState<string | null>(null);
  // Inspecting a terrain hotspot (tap on mobile, hover on web) records it
  // in discoveredTerrain so the Wasteland Atlas screen can show landform
  // discovery progress. The wrapper sits at the source of truth so every
  // TerrainHotspot call site picks it up without per-site rewiring; only
  // transitions to a non-null id different from the previous active id
  // count as a discovery, so the auto-clear timeout below never re-records.
  //
  // Implementation note (two-part safety):
  //
  //  1. SIDE EFFECTS run OUTSIDE any updater. `setActionResult` and
  //     `pushAtlasUnlock` execute exactly once per call to this wrapper,
  //     so React's Strict/Concurrent double-invoke of updater functions
  //     cannot double-fire popups or toasts.
  //
  //  2. STATE MUTATION uses a FUNCTIONAL setState updater. This is the
  //     ONLY safe way to atomically merge into the latest game state when
  //     two terrain discoveries fire in the same React batch — a stale
  //     `stateRef.current` snapshot would lose the first discovery on the
  //     second write. Pure functional updaters are double-invoke-safe
  //     because they're idempotent: the side-effect-free computation just
  //     produces the same next state both times.
  //
  // The previous activeTerrainId is tracked via a ref (kept in sync with
  // both wrapper calls AND the auto-clear timeout below) so we can detect
  // "first time we see this id" without going through React's setState
  // queue. The reward decision is recomputed inside the functional
  // setState updater so it sees the freshest discoveredTerrain list.
  const activeTerrainIdRef = useRef<string | null>(null);
  useEffect(() => { activeTerrainIdRef.current = activeTerrainId; }, [activeTerrainId]);
  const setActiveTerrainId = useCallback<React.Dispatch<React.SetStateAction<string | null>>>((updater) => {
    const prev = activeTerrainIdRef.current;
    const next = typeof updater === "function" ? (updater as (p: string | null) => string | null)(prev) : updater;
    activeTerrainIdRef.current = next;
    setActiveTerrainIdRaw(next);
    if (!next || next === prev) return;

    // Compute side-effect payload from the current snapshot so we can
    // decide once whether to fire the popup/toast. The functional
    // setState below uses the SAME logic against the freshest state,
    // ensuring atomicity even under batched/concurrent calls.
    const snap = stateRef.current;
    if ((snap.discoveredTerrain ?? []).includes(next)) return;
    const snapWith: GameState = { ...snap, discoveredTerrain: [...(snap.discoveredTerrain ?? []), next] };
    const { granted, capstone } = applyAtlasCategoryRewards(snapWith);

    setState((prevState) => {
      const list = prevState.discoveredTerrain ?? [];
      if (list.includes(next)) return prevState;
      const withTerrain: GameState = { ...prevState, discoveredTerrain: [...list, next] };
      // Pure: same input → same output. Safe under Strict-Mode double-invoke.
      return applyAtlasCategoryRewards(withTerrain).state;
    });

    if (granted.length > 0 || capstone) {
      const parts: string[] = [];
      if (granted.length > 0) {
        const labels = granted.map((g) => g.label).join(", ");
        const totalXp = granted.reduce((sum, g) => sum + g.xp, 0);
        parts.push(
          `Atlas category fully charted: ${labels}. Council awards +${totalXp} XP for completing the survey.`
        );
      }
      if (capstone) {
        parts.push(
          `WASTELAND ATLAS COMPLETE — every category charted. Council confers the title "${capstone.title}" and a +${capstone.xp} XP capstone bonus.`
        );
      }
      setActionResult(parts.join(" "));
      pushAtlasUnlock(granted, capstone);
    }
  }, [setState, pushAtlasUnlock, stateRef]);
  const enteredWeatherZonesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (activeTerrainId === null) return;
    if (Platform.OS === "web") return;
    const t = setTimeout(() => {
      // Keep ref + state in sync. Calling the raw setter directly would
      // leave activeTerrainIdRef stale until the useEffect above runs,
      // creating a brief window where setActiveTerrainId would compare
      // against the wrong "prev" value.
      activeTerrainIdRef.current = null;
      setActiveTerrainIdRaw(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [activeTerrainId]);

  const discoveredIds = useMemo(() => discoveredLocationIds ?? [], [discoveredLocationIds]);
  // Snapshot of charted terrain ids passed down to every TerrainHotspot so
  // its tooltip can render the "RECORDED IN ATLAS" footer. The Set is
  // rebuilt only when the underlying list reference changes, so memoized
  // hotspots only re-render when discovery state actually shifts.
  const chartedTerrainIds = useMemo(() => new Set(discoveredTerrain ?? []), [discoveredTerrain]);
  const worldEventLog = useMemo(
    () => (worldEventLogRaw ?? []).map((entry) => ({
      ...entry,
      title: canonicalizeLegacyWorldIntelText(entry.title, entry.revealed),
      description: canonicalizeLegacyWorldIntelText(entry.description, entry.revealed),
    })),
    [worldEventLogRaw],
  );

  const playerPos = playerCityPosition ?? DEFAULT_PLAYER_POS;

  const visibleLocations = useMemo(() => {
    const rosterIds = new Set(megacityRoster?.entries.map((entry) => entry.id) ?? []);
    const all = WORLD_LOCATIONS.filter((loc) => isWorldLocationVisibleOnMap(loc, discoveredIds))
      .filter((loc) => loc.type !== "megacity" || rosterIds.size === 0 || rosterIds.has(loc.id))
      .map((loc) => {
        if (loc.type === "player_city" && playerPos) {
          return { ...loc, x: playerPos.x, y: playerPos.y };
        }
        return loc;
      });
    if (!typeFilter) return all;
    return all.filter((loc) => loc.type === typeFilter);
  }, [discoveredIds, megacityRoster, typeFilter, playerPos]);

  const routes = useMemo(() => getWorldRoutes(discoveredIds), [discoveredIds]);

  const playerPxX = (playerPos.x / WORLD_MAP_BOUNDS.maxX) * CONTENT_W + CONTENT_PAD_X;
  const playerPxY = (playerPos.y / WORLD_MAP_BOUNDS.maxY) * CONTENT_H + CONTENT_PAD_Y;
  // Center the initial view on the player city. Uses the center-origin aware
  // formula (see CONTENT_CENTER_X/Y) so the player stays centered at any
  // DEFAULT_ZOOM; the simpler screenCenter - px*scale form drifts the view off
  // the player as zoom rises because the content scales about its own center.
  const offsetX = useSharedValue(
    screenW / 2 - playerPxX * DEFAULT_ZOOM - CONTENT_CENTER_X * (1 - DEFAULT_ZOOM),
  );
  const offsetY = useSharedValue(
    screenH / 2 - playerPxY * DEFAULT_ZOOM - CONTENT_CENTER_Y * (1 - DEFAULT_ZOOM),
  );
  const scale = useSharedValue(DEFAULT_ZOOM);
  const savedOffset = useRef({ x: 0, y: 0 });
  const savedScale = useRef(DEFAULT_ZOOM);
  // Actual on-screen size of the map pane. useWindowDimensions reports the whole
  // window, but this pane is smaller (the header sits above it and, on desktop,
  // the comms sidebar sits to its right), so centering on the window drifts the
  // player off. We measure the pane via onLayout and center on that. Starts at
  // {0,0} so the effect waits for a real measurement. We keep re-centering on
  // every measurement change (on first paint the header reflows a few times —
  // the legend wraps to two rows on narrow screens, fonts load and change text
  // heights) until the player first pans/zooms, so the initial framing settles
  // on the true pane center instead of locking onto an early pre-reflow size.
  const [mapView, setMapView] = useState({ w: 0, h: 0 });
  const userInteracted = useRef(false);
  useEffect(() => {
    if (userInteracted.current) return;
    if (mapView.w <= 0 || mapView.h <= 0) return;
    offsetX.value = mapView.w / 2 - playerPxX * DEFAULT_ZOOM - CONTENT_CENTER_X * (1 - DEFAULT_ZOOM);
    offsetY.value = mapView.h / 2 - playerPxY * DEFAULT_ZOOM - CONTENT_CENTER_Y * (1 - DEFAULT_ZOOM);
  }, [mapView.w, mapView.h, playerPxX, playerPxY, offsetX, offsetY]);

  const panGesture = Gesture.Pan()
    // Require a small drag threshold before the pan activates so a stationary
    // tap/click falls through to the location Pressables underneath. On web,
    // react-native-gesture-handler's pointer capture otherwise steals the click
    // from child nodes the instant the pan engages (even from 1–2px of mouse
    // jitter), which made map locations feel completely un-tappable on desktop.
    .minDistance(8)
    .onStart(() => {
      userInteracted.current = true;
      savedOffset.current = { x: offsetX.value, y: offsetY.value };
    })
    .onUpdate((e) => {
      offsetX.value = savedOffset.current.x + e.translationX;
      offsetY.value = savedOffset.current.y + e.translationY;
    });

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      userInteracted.current = true;
      savedScale.current = scale.value;
    })
    .onUpdate((e) => {
      scale.value = clampZoom(savedScale.current * e.scale);
    });

  const composedGesture = Gesture.Simultaneous(panGesture, pinchGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
    ],
  }));

  // Node markers + their name labels counter-scale against the map zoom so that
  // zooming IN holds them ~constant on screen while the gaps between them grow
  // (separating crowded labels). Capped at 1 so zooming OUT still shrinks them
  // with the map like before; at DEFAULT_ZOOM the factor is exactly 1 (a no-op,
  // so the default look is unchanged). Each node pivots this scale at its own
  // dot via transformOrigin, and they all share this one style so there is a
  // single UI-thread subscription to `scale`.
  const nodeCounterScale = useAnimatedStyle(() => {
    const ls = OPERATIONAL_SCREEN_SCALE / scale.value;
    return { transform: [{ scale: Math.max(0.04, Math.min(20, ls)) }] };
  });

  // Bridge zoom level into React state so label visibility can react to it.
  // Threshold tuned: at the default zoom the map is already legible but verbose
  // route distance/cost text would crowd the rest state — only reveal it once
  // the player deliberately zooms in past this point.
  const ZOOM_DETAIL_THRESHOLD = 1.4;
  const ZOOM_LABEL_THRESHOLD = 1;
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [showAllLabels, setShowAllLabels] = useState(false);

  useAnimatedReaction(
    () => scale.value >= ZOOM_DETAIL_THRESHOLD,
    (cur, prev) => {
      if (cur !== prev) runOnJS(setShowRouteDetails)(cur);
    },
    [],
  );

  useAnimatedReaction(
    () => scale.value >= ZOOM_LABEL_THRESHOLD,
    (cur, prev) => {
      if (cur !== prev) runOnJS(setShowAllLabels)(cur);
    },
    [],
  );

  const toPixel = useCallback((x: number, y: number) => {
    return {
      px: (x / WORLD_MAP_BOUNDS.maxX) * CONTENT_W + CONTENT_PAD_X,
      py: (y / WORLD_MAP_BOUNDS.maxY) * CONTENT_H + CONTENT_PAD_Y,
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const PAN_STEP = 40;
    const ZOOM_STEP = 0.15;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if ("wWsSaAdD+=-_".includes(e.key) || e.key.startsWith("Arrow")) {
        userInteracted.current = true;
      }
      switch (e.key) {
        case "w": case "W": case "ArrowUp": offsetY.value += PAN_STEP; e.preventDefault(); break;
        case "s": case "S": case "ArrowDown": offsetY.value -= PAN_STEP; e.preventDefault(); break;
        case "a": case "A": case "ArrowLeft": offsetX.value += PAN_STEP; e.preventDefault(); break;
        case "d": case "D": case "ArrowRight": offsetX.value -= PAN_STEP; e.preventDefault(); break;
        case "+": case "=": scale.value = clampZoom(scale.value + ZOOM_STEP); e.preventDefault(); break;
        case "-": case "_": scale.value = clampZoom(scale.value - ZOOM_STEP); e.preventDefault(); break;
        case "Escape":
          if (selectedLocation) { setSelectedLocation(null); e.preventDefault(); }
          else if (showEventLog) { setShowEventLog(false); e.preventDefault(); }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedLocation, showEventLog]);

  const handleNodeContextMenu = useCallback((locId: string, e: any) => {
    const x = e.nativeEvent?.pageX ?? e.pageX ?? 0;
    const y = e.nativeEvent?.pageY ?? e.pageY ?? 0;
    setCtxMenu({ visible: true, position: { x, y }, locId });
  }, []);

  const handleLocationPress = useCallback((loc: WorldLocation) => {
    setSelectedLocation(loc);
    setActionResult(null);
    setEncounterResult(null);
  }, []);

  useEffect(() => {
    if (!weatherNotice) return;
    const timer = setTimeout(() => setWeatherNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [weatherNotice]);

  const getRelation = useCallback((locId: string) => {
    const rels = locationRelations ?? {};
    return rels[locId] ?? { disposition: 0, aidSent: 0, raidsSent: 0, tradesMade: 0, scoutsMade: 0, lastInteractionTick: 0 };
  }, [locationRelations]);

  const getEffectiveStatus = useCallback((loc: WorldLocation): WorldLocation["status"] => {
    const rel = getRelation(loc.id);
    if (rel.disposition > 50) return "allied";
    if (rel.disposition < -20) return "hostile";
    if (rel.aidSent > 0 || rel.tradesMade > 0 || rel.scoutsMade > 0 || rel.raidsSent > 0) return "neutral";
    return loc.status;
  }, [getRelation]);

  const handleAction = useCallback((action: WorldAction, loc: WorldLocation) => {
    if (isContinuanceMapInteractionLocked(loc.id)) {
      setActionResult("USR remains sealed. Only the intelligence report is available.");
      return;
    }
    // Sandbox actions (round 3) — dispatched FIRST so eligibility checks
    // run before any cost validation, and so the pure helper owns its own
    // credits/ammo gating. We compute the transaction synchronously from
    // stateRef.current, then call setState only on success — no async
    // side-channel between updater and post-update read (which is unsafe
    // under StrictMode double-invocation).
    if (SANDBOX_LOCATION_ACTION_IDS.has(action.id as LocationActionId)) {
      const sandboxId = action.id as LocationActionId;
      const txn = performLocationActionTransaction(
        stateRef.current,
        loc,
        sandboxId,
        getEffectiveStatus(loc),
        WORLD_LOCATIONS,
      );
      if (!txn.ok) {
        setActionResult(txn.reason);
        return;
      }
      setState((prev) => ({ ...prev, ...txn.next }));
      const meta = LOCATION_ACTION_META[sandboxId];
      const reveal = txn.revealedLocationId;
      const revealName = reveal
        ? WORLD_LOCATIONS.find((wl) => wl.id === reveal)?.name ?? reveal
        : null;
      setActionResult(
        revealName
          ? `${meta.label} on ${loc.name}. Connected site revealed: ${revealName}.`
          : `${meta.label} on ${loc.name}. ${meta.description}`,
      );
      setEncounterResult(null);
      return;
    }

    let effectiveCost = action.cost;
    if ((action.id === "survey_node" || action.id === "exploit_node") && loc.resourceNodeId) {
      const nd = getNodeDef(loc.resourceNodeId);
      if (nd) effectiveCost = action.id === "survey_node" ? nd.surveyCost : nd.exploitCost;
    }

    if (stateRef.current.resources.credits < effectiveCost) {
      setActionResult(`Insufficient credits. Need ${effectiveCost.toLocaleString()}.`);
      return;
    }

    if (action.id === "survey_node" && loc.resourceNodeId) {
      const nd = getNodeDef(loc.resourceNodeId);
      if (!nd) return;
      setState((prev) => {
        if ((prev.resources?.credits ?? 0) < nd.surveyCost) return prev;
        const rnState = prev.resourceNodes ?? createDefaultResourceNodeState();
        if (rnState.surveyed[loc.resourceNodeId!]) return prev;
        return {
          ...prev,
          resources: { ...prev.resources, credits: prev.resources.credits - nd.surveyCost },
          resourceNodes: { ...rnState, surveyed: { ...rnState.surveyed, [loc.resourceNodeId!]: true } },
        };
      });
      setActionResult(`Survey complete. ${RESOURCE_NODE_LABELS[nd.resourceType]} — ${RICHNESS_LABELS[nd.richness]} deposits confirmed. Extraction teams can now be deployed.`);
      return;
    }

    if (action.id === "exploit_node" && loc.resourceNodeId) {
      const nd = getNodeDef(loc.resourceNodeId);
      if (!nd) return;
      setState((prev) => {
        if ((prev.resources?.credits ?? 0) < nd.exploitCost) return prev;
        const rnState = prev.resourceNodes ?? createDefaultResourceNodeState();
        if (!(rnState.surveyed[loc.resourceNodeId!])) return prev;
        if (rnState.exploiting[loc.resourceNodeId!]) return prev;
        if (rnState.depleted.includes(loc.resourceNodeId!)) return prev;
        const haltedRemaining = rnState.haltedRemaining?.[loc.resourceNodeId!];
        const ticksRemaining = haltedRemaining ?? nd.depletionTicks;
        const newHalted = { ...(rnState.haltedRemaining ?? {}) };
        delete newHalted[loc.resourceNodeId!];
        return {
          ...prev,
          resources: { ...prev.resources, credits: prev.resources.credits - nd.exploitCost },
          resourceNodes: {
            ...rnState,
            exploiting: { ...rnState.exploiting, [loc.resourceNodeId!]: { startTick: prev.totalTicks, ticksRemaining } },
            haltedRemaining: newHalted,
          },
        };
      });
      setActionResult(`Extraction operations established at ${loc.name}. Resources will be delivered each tick. ${nd.depletionTicks > 0 ? `Estimated reserves: ${nd.depletionTicks} ticks.` : "Renewable source — extraction is sustainable."}`);
      return;
    }

    if (action.id === "halt_extraction" && loc.resourceNodeId) {
      setState((prev) => {
        const rnState = prev.resourceNodes ?? createDefaultResourceNodeState();
        const nodeInfo = rnState.exploiting[loc.resourceNodeId!];
        if (!nodeInfo) return prev;
        const newExploiting = { ...rnState.exploiting };
        delete newExploiting[loc.resourceNodeId!];
        const haltedMap = { ...(rnState.haltedRemaining ?? {}) };
        if (nodeInfo.ticksRemaining > 0) {
          haltedMap[loc.resourceNodeId!] = nodeInfo.ticksRemaining;
        }
        return { ...prev, resourceNodes: { ...rnState, exploiting: newExploiting, haltedRemaining: haltedMap } };
      });
      setActionResult(`Extraction halted at ${loc.name}. Operations can be resumed later.`);
      return;
    }

    const currentRels = stateRef.current.locationRelations ?? {};
    const currentRel = currentRels[loc.id] ?? { disposition: 0, aidSent: 0, raidsSent: 0, tradesMade: 0, scoutsMade: 0, lastInteractionTick: 0 };
    const rel = { ...currentRel, lastInteractionTick: stateRef.current.totalTicks };

    // TRADE cooldown: block repeat trade missions to the same partner within
    // TRADE_COOLDOWN_TICKS. Trade pays out a multiple of its cost, so without
    // this it was an infinite-credits loop. Checked here (before any weather
    // side effects) so it covers every entry point — detail panel, context
    // menu, and keyboard dispatch all route through handleAction.
    if (action.id === "trade") {
      const lastTradeTick = currentRel.lastTradeTick ?? -Infinity;
      const sinceLastTrade = stateRef.current.totalTicks - lastTradeTick;
      if (sinceLastTrade < TRADE_COOLDOWN_TICKS) {
        const ticksLeft = TRADE_COOLDOWN_TICKS - sinceLastTrade;
        setActionResult(
          `Trade convoy to ${loc.name} is still on the road. Next mission available in ${Math.ceil(ticksLeft / 4)} day(s).`,
        );
        return;
      }
    }

    let resultMsg = "";
    let creditsDelta = -action.cost;
    let ammoDelta = 0;
    let foodDelta = 0;
    let weatherFoodDelta = 0;
    let revealedLocId: string | null = null;

    // Compute weather hazards along the convoy path from the player's city
    // out to the target location. Effects are stacked from each zone the
    // path samples through, and intensities multiply the per-zone numbers.
    const playerCurr = stateRef.current.playerCityPosition ?? DEFAULT_PLAYER_POS;
    // Use the current in-game season so dormant hazards don't drain supplies
    // and active hazards apply their season-shifted intensity.
    const actionSeason = getSeason(stateRef.current.gameDate.month);
    const zonesOnPath = getWeatherZonesOnPath(playerCurr.x, playerCurr.y, loc.x, loc.y, 12, actionSeason);
    const weatherEff = computeWeatherTravelEffect(zonesOnPath, actionSeason);
    const newlyEnteredZones = zonesOnPath.filter((z) => !enteredWeatherZonesRef.current.has(z.id));
    for (const z of newlyEnteredZones) enteredWeatherZonesRef.current.add(z.id);

    if (action.id === "scout") {
      rel.scoutsMade += 1;
      rel.disposition += 3;

      const undiscovered = WORLD_LOCATIONS.filter(
        wl => !wl.discovered && !(stateRef.current.discoveredLocationIds ?? []).includes(wl.id) && wl.connectedTo.includes(loc.id)
      );
      const discoverThreshold = Math.min(0.95, 0.4 + weatherEff.scoutIntelPenalty);
      if (undiscovered.length > 0 && Math.random() > discoverThreshold) {
        const revealed = undiscovered[Math.floor(Math.random() * undiscovered.length)];
        revealedLocId = revealed.id;
        resultMsg = `Recon complete. Scouts discovered ${revealed.name}! Defense assessment: ${loc.defenseRating > 50 ? "heavily fortified" : loc.defenseRating > 25 ? "moderate defenses" : "lightly defended"}.`;
      } else {
        const intel = [
          `Recon complete. ${loc.name} defense assessment: ${loc.defenseRating > 50 ? "heavily fortified" : loc.defenseRating > 25 ? "moderate defenses" : "lightly defended"}.`,
          `Scouts report movement near ${loc.name}. Population estimate ${loc.population > 0 ? "confirmed at ~" + loc.population.toLocaleString() : "indeterminate"}.`,
          `Intel gathered on ${loc.name}. Faction: ${loc.faction}. ${rel.scoutsMade > 3 ? "Detailed tactical maps acquired." : "Approach with caution."}`,
        ];
        resultMsg = intel[Math.floor(Math.random() * intel.length)];
      }
    } else if (action.id === "trade") {
      rel.lastTradeTick = stateRef.current.totalTicks;
      rel.tradesMade += 1;
      const dispositionBonus = Math.max(0, rel.disposition) / 100;
      const multiplier = (0.5 + Math.random() * 1.2 + dispositionBonus * 0.5) * (1 - weatherEff.tradeRevenuePenalty);
      const revenue = Math.floor(action.cost * multiplier);
      creditsDelta += revenue;
      rel.disposition += 8;
      const net = revenue - action.cost;
      resultMsg = net > 0
        ? `Trade mission profitable. Net gain: ${net.toLocaleString()} credits. Relations with ${loc.name} warming.`
        : `Trade completed. Revenue: ${revenue.toLocaleString()} credits. Margins thin, but goodwill established.`;
    } else if (action.id === "aid") {
      rel.aidSent += 1;
      const prevDisp = rel.disposition;
      rel.disposition += 15;
      const reached = loc.population > 0 ? ` ${Math.floor(loc.population * 0.1).toLocaleString()} citizens reached.` : "";
      const statusShift = prevDisp <= 50 && rel.disposition > 50 ? ` ${loc.name} now considers you an ally!` : "";
      resultMsg = `Aid delivered to ${loc.name}. Disposition improved significantly.${reached}${statusShift}`;
    } else if (action.id === "raid") {
      rel.raidsSent += 1;
      rel.disposition -= 25;
      const successThreshold = Math.min(0.9, 0.35 + weatherEff.raidSuccessPenalty);
      const success = Math.random() > successThreshold;
      if (success) {
        const loot = Math.floor(action.cost * (0.6 + Math.random() * 0.8));
        ammoDelta = Math.floor(20 + Math.random() * 40);
        creditsDelta += loot;
        resultMsg = `Raid successful. Seized ${loot.toLocaleString()} credits and ${ammoDelta} ammo. ${loc.name} defenses weakened. Relations damaged severely.`;
      } else {
        resultMsg = `Raid repelled. ${loc.name} defenses held. Casualties sustained. Relations damaged. They will remember this.`;
      }
    }

    // Apply weather supply drains on top of action outcome.
    if (zonesOnPath.length > 0) {
      creditsDelta -= weatherEff.creditsDrain;
      ammoDelta -= weatherEff.ammoDrain;
      weatherFoodDelta = -weatherEff.foodDrain;
      const zoneList = zonesOnPath.map((z) => `${z.label} [${getZoneSeasonState(z, actionSeason)}]`).join(", ");
      const drainParts: string[] = [];
      if (weatherEff.creditsDrain > 0) drainParts.push(`-${weatherEff.creditsDrain.toLocaleString()} cr`);
      if (weatherEff.ammoDrain > 0) drainParts.push(`-${weatherEff.ammoDrain} ammo`);
      if (weatherEff.foodDrain > 0) drainParts.push(`-${weatherEff.foodDrain} food`);
      const drainStr = drainParts.length > 0 ? ` (${drainParts.join(", ")})` : "";
      resultMsg = `${resultMsg ? resultMsg + " " : ""}⚠ Convoy crossed ${zoneList}${drainStr}.`;
    }

    rel.disposition = Math.max(-100, Math.min(100, rel.disposition));

    const encounter = rollEncounter(action.id, loc, stateRef.current, zonesOnPath);

    // Preview the same ordered food mutations used below so map feedback can
    // report what actually entered storage rather than the nominal encounter
    // reward. Weather consumption happens before an encounter reward, which
    // also means a full reserve can still make room for food during travel.
    const foodRewardPreview = {
      resources: { ...stateRef.current.resources },
      buildings: stateRef.current.buildings,
    };
    let foodRewardResult = { applied: 0, rejected: 0 };
    for (const delta of [weatherFoodDelta, foodDelta]) {
      if (delta !== 0) {
        const foodResult = applyResourceDelta(foodRewardPreview, "food", delta);
        if (delta > 0) {
          foodRewardResult = {
            applied: foodRewardResult.applied + foodResult.applied,
            rejected: foodRewardResult.rejected + foodResult.rejected,
          };
        }
      }
    }
    if (encounter?.effects.foodDelta) {
      const encounterFood = applyResourceDelta(foodRewardPreview, "food", encounter.effects.foodDelta);
      if (encounter.effects.foodDelta > 0) {
        foodRewardResult = {
          applied: foodRewardResult.applied + encounterFood.applied,
          rejected: foodRewardResult.rejected + encounterFood.rejected,
        };
      }
    }
    const foodRewardText = foodRewardResult.applied > 0 || foodRewardResult.rejected > 0
      ? summarizeFoodStorageGain(foodRewardPreview, foodRewardResult)
      : null;

    setState((prev) => {
      const s = { ...prev };
      s.resources = { ...s.resources };
      applyResourceDelta(s, "credits", creditsDelta);
      if (ammoDelta !== 0) applyResourceDelta(s, "ammo", ammoDelta);
      if (weatherFoodDelta !== 0) applyResourceDelta(s, "food", weatherFoodDelta);
      if (foodDelta !== 0) applyResourceDelta(s, "food", foodDelta);
      if (revealedLocId && !(s.discoveredLocationIds ?? []).includes(revealedLocId)) {
        s.discoveredLocationIds = [...(s.discoveredLocationIds ?? []), revealedLocId];
      }
      s.locationRelations = { ...(s.locationRelations ?? {}), [loc.id]: rel };
      if (encounter) {
        const eff = encounter.effects;
        if (eff.creditsDelta) applyResourceDelta(s, "credits", eff.creditsDelta);
        if (eff.ammoDelta) applyResourceDelta(s, "ammo", eff.ammoDelta);
        if (eff.foodDelta) applyResourceDelta(s, "food", eff.foodDelta);
        if (eff.dispositionDelta) {
          const updRel = { ...s.locationRelations[loc.id] };
          updRel.disposition = Math.max(-100, Math.min(100, (updRel.disposition ?? 0) + eff.dispositionDelta));
          s.locationRelations = { ...s.locationRelations, [loc.id]: updRel };
        }
        if (eff.discoveredLocationId && !(s.discoveredLocationIds ?? []).includes(eff.discoveredLocationId)) {
          // Guard against duplicate appends: encounter effects can reveal a
          // location the marshal already knows. The sanitizer dedupes on
          // load either way, but there is no reason to write the bloat.
          s.discoveredLocationIds = [...(s.discoveredLocationIds ?? []), eff.discoveredLocationId];
        }
        // Hazard-zone encounters (the signature event of a crossed weather
        // zone) are easy to miss in the transient toast. Mirror them into
        // the news feed so the marshal has a record of what bit the convoy.
        if (encounter.hazardType) {
          const deltas: string[] = [];
          if (eff.creditsDelta) deltas.push(`${eff.creditsDelta > 0 ? "+" : ""}${eff.creditsDelta.toLocaleString()} cr`);
          if (eff.ammoDelta) deltas.push(`${eff.ammoDelta > 0 ? "+" : ""}${eff.ammoDelta} ammo`);
          if (eff.foodDelta && eff.foodDelta > 0 && foodRewardText) deltas.push(foodRewardText);
          else if (eff.foodDelta) deltas.push(`${eff.foodDelta > 0 ? "+" : ""}${eff.foodDelta} food`);
          if (eff.dispositionDelta) deltas.push(`${eff.dispositionDelta > 0 ? "+" : ""}${eff.dispositionDelta} rel`);
          const tail = deltas.length > 0 ? `\nLog: ${deltas.join(", ")}.` : "";
          const sev = encounter.severity;
          const isBad = sev === "negative" || sev === "warning";
          const msg = {
            id: `hazlog-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
            timestamp: { ...s.gameDate },
            tick: s.totalTicks ?? 0,
            category: "alert" as const,
            title: `${encounter.title} — ${loc.name}`,
            body: `${encounter.description}${tail}`,
            read: false,
            priority: (isBad ? "high" : "normal") as "high" | "normal",
          };
          s.messages = [msg, ...(s.messages ?? [])].slice(0, 200);
        }
      }
      return s;
    });

    if (resultMsg) setActionResult(foodRewardText ? `${resultMsg} ${foodRewardText}` : resultMsg);
    if (encounter) {
      setEncounterResult(
        `⚡ ${encounter.title}: ${encounter.description}${foodRewardText ? ` ${foodRewardText}` : ""}`,
      );
    }
    else setEncounterResult(null);
    if (newlyEnteredZones.length > 0) {
      const noticeNames = newlyEnteredZones.map((z) => z.label).join(" · ");
      setWeatherNotice(`ENTERING ${noticeNames.toUpperCase()}`);
    } else {
      setWeatherNotice(null);
    }
    // PERFORMANCE: This callback reads all state via stateRef.current (a stable
    // ref) and writes via setState (stable). It has no real dependencies, so
    // the closure identity stays stable across renders, preventing downstream
    // memo invalidation.
  }, [setState]);

  const handleCtxMenuSelect = useCallback((action: string) => {
    setCtxMenu((prev) => ({ ...prev, visible: false }));
    const locId = ctxMenu.locId;
    if (!locId) return;
    const loc = LOCATION_INDEX.get(locId);
    if (!loc) return;
    if (action === "open") {
      setSelectedLocation(loc);
      setActionResult(null);
      return;
    }
    const worldAction = WORLD_ACTIONS.find((a) => a.id === action);
    if (worldAction && worldAction.available(loc, stateRef.current, getEffectiveStatus(loc))) {
      handleAction(worldAction, loc);
    }
  }, [ctxMenu.locId, handleAction, getEffectiveStatus]);

  const ctxMenuItems = useMemo(() => {
    if (!ctxMenu.locId) return [];
    const loc = LOCATION_INDEX.get(ctxMenu.locId);
    if (!loc) return [];
    const effStatus = getEffectiveStatus(loc);
    const items: { label: string; action: string; icon?: string; danger?: boolean }[] = [
      { label: `Open ${loc.name} Details`, action: "open", icon: "info" },
    ];
    for (const wa of WORLD_ACTIONS) {
      if (wa.available(loc, stateRef.current, effStatus)) {
        items.push({ label: wa.label, action: wa.id, danger: wa.id === "raid" });
      }
    }
    return items;
    // PERFORMANCE: WORLD_ACTIONS.available reads state slices indirectly. We
    // recompute when any subscribed slice that affects availability changes
    // (credits, resourceNodes, locationRelations via getEffectiveStatus).
  }, [ctxMenu.locId, getEffectiveStatus, credits, resourceNodes]);

  const locationEvents = useMemo(() => {
    if (!selectedLocation) return [];
    return worldEventLog.filter((evt: any) => {
      if (evt.revealed === selectedLocation.id) return true;
      const desc = (evt.description ?? "").toLowerCase();
      const name = selectedLocation.name.toLowerCase();
      return desc.includes(name);
    }).slice(-5);
  }, [selectedLocation, worldEventLog]);

  const renderRoutes = useCallback(() => {
    return routes.map((route, i) => {
      let from = LOCATION_INDEX.get(route.from);
      let to = LOCATION_INDEX.get(route.to);
      if (!from || !to) return null;

      if (from.type === "player_city") from = { ...from, x: playerPos.x, y: playerPos.y };
      if (to.type === "player_city") to = { ...to, x: playerPos.x, y: playerPos.y };

      if (typeFilter) {
        if (from.type !== typeFilter && from.type !== "player_city") {
          if (to.type !== typeFilter && to.type !== "player_city") return null;
        }
      }

      const f = toPixel(from.x, from.y);
      const t = toPixel(to.x, to.y);

      const dx = t.px - f.px;
      const dy = t.py - f.py;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);

      const routeColor = route.danger === "hostile" ? MAP.routeHostile
        : route.danger === "contested" ? MAP.routeContested
        : route.danger === "unknown" ? MAP.routeUnknown
        : MAP.routeSafe;

      const routeOpacity = route.danger === "safe" ? "7A"
        : route.danger === "contested" ? "66"
        : route.danger === "hostile" ? "55"
        : "40";

      const routeHeight = route.danger === "safe" ? MAP_SIZING.route.safe
        : route.danger === "contested" ? MAP_SIZING.route.contested
        : route.danger === "hostile" ? MAP_SIZING.route.hostile
        : MAP_SIZING.route.unknown;

      const midX = (f.px + t.px) / 2;
      const midY = (f.py + t.py) / 2;
      const showDangerLabel =
        showAllLabels &&
        (route.danger === "hostile" || route.danger === "contested");

      const worldDx = (to.x - from.x) * 2;
      const worldDy = (to.y - from.y) * 2;
      const distKm = Math.round(Math.sqrt(worldDx * worldDx + worldDy * worldDy));
      const costMultiplier = route.danger === "hostile" ? 3 : route.danger === "contested" ? 2 : route.danger === "unknown" ? 2.5 : 1;
      const travelCost = Math.round(distKm * costMultiplier * 10);

      return (
        <React.Fragment key={`route-${i}`}>
          <View
            style={{
              position: "absolute",
              left: f.px,
              top: f.py,
              width: len,
              height: routeHeight,
              backgroundColor: routeColor + routeOpacity,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: "left center",
              borderStyle: route.danger === "unknown" || route.danger === "hostile" ? "dashed" : "solid",
            }}
          />
          {len > 40 && (showDangerLabel || showRouteDetails) && (
            <Animated.View
              style={[{
                position: "absolute",
                left: midX - (showDangerLabel ? 24 : 16),
                top: midY - (showDangerLabel ? 12 : 5),
                alignItems: "center",
              }, nodeCounterScale]}
            >
              {showDangerLabel && (
                <View
                  testID={`world-map-route-danger-${i}`}
                  style={{
                    backgroundColor: MAP.parchmentLight + "F2",
                    borderWidth: 0.6,
                    borderColor: routeColor + "CC",
                    borderRadius: 3,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    marginBottom: 1,
                    ...(Platform.OS === "web"
                      ? { boxShadow: "0 1px 2px rgba(42,31,14,0.25)" as any }
                      : { elevation: 2 }),
                  }}
                >
                  <Text style={{
                    fontFamily: "Inter_700Bold",
                    fontSize: MAP_SIZING.font.routeDanger,
                    color: routeColor,
                    letterSpacing: 0.4,
                    textAlign: "center",
                  }}>
                    {DANGER_LABELS[route.danger as ThreatLevel]?.text ?? route.danger.toUpperCase()}
                  </Text>
                </View>
              )}
              {showRouteDetails && (
                <View
                  testID={`world-map-route-detail-${i}`}
                  style={{
                    backgroundColor: MAP.parchmentLight + "E6",
                    borderRadius: 2,
                    paddingHorizontal: 3,
                  }}
                >
                  <Text style={{
                    fontFamily: "Inter_500Medium",
                    fontSize: MAP_SIZING.font.routeDetail,
                    color: MAP.inkFaded,
                    textAlign: "center",
                  }}>
                    {distKm}km · {travelCost >= 1000 ? `${(travelCost / 1000).toFixed(1)}k` : travelCost} cr
                  </Text>
                </View>
              )}
            </Animated.View>
          )}
        </React.Fragment>
      );
    });
  }, [routes, playerPos, typeFilter, toPixel, showRouteDetails, showAllLabels, nodeCounterScale]);

  const safeRoutes = useMemo(() => {
    return routes.filter((r) => r.danger === "safe").slice(0, 6);
  }, [routes]);

  const factionOverlays = useMemo(() => {
    const partners: Array<{ id: string; name: string; archetypeColor: string; loc: WorldLocation }> = [];
    const allPartners = [
      ...(externalMegacities ?? []).filter((m) => m.isActive),
      ...(townships ?? []).filter((t) => t.status !== "undiscovered"),
    ];
    for (const p of allPartners) {
      const loc = LOCATION_INDEX.get(p.id);
      if (!loc) continue;
      const arch = p.archetype ?? inferArchetype(p);
      partners.push({ id: p.id, name: p.name, archetypeColor: PARTNER_ARCHETYPES[arch].color, loc });
    }

    const adv = diplomacyAdvanced;
    const allianceLines: Array<{ a: string; b: string }> = [];
    const warLines: Array<{ a: string; b: string }> = [];
    if (adv && Array.isArray(adv.factionRelations)) {
      for (const r of adv.factionRelations) {
        if (r.disposition >= 75) allianceLines.push({ a: r.factionA, b: r.factionB });
      }
    }
    if (adv && Array.isArray(adv.wars)) {
      for (const w of adv.wars) {
        if (!Array.isArray(w.belligerents) || w.belligerents.length < 2) continue;
        warLines.push({ a: w.belligerents[0], b: w.belligerents[1] });
      }
    }
    return { partners, allianceLines, warLines };
  }, [externalMegacities, townships, diplomacyAdvanced]);

  const renderFactionOverlays = useCallback(() => {
    const elements: React.ReactNode[] = [];
    const partnerLocById = new Map<string, WorldLocation>();
    for (const p of factionOverlays.partners) partnerLocById.set(p.id, p.loc);

    // Territory rings
    for (const p of factionOverlays.partners) {
      const px = toPixel(p.loc.x, p.loc.y);
       const ringSize = MAP_SIZING.faction.territoryRing;
      elements.push(
        <View
          key={`ring-${p.id}`}
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: px.px - ringSize / 2,
            top: px.py - ringSize / 2,
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: 1,
            borderColor: p.archetypeColor + "55",
            backgroundColor: p.archetypeColor + "15",
          }}
        />
      );
    }

    const drawLine = (key: string, fromId: string, toId: string, color: string, dashed: boolean, height: number) => {
      const f = partnerLocById.get(fromId);
      const t = partnerLocById.get(toId);
      if (!f || !t) return;
      const fp = toPixel(f.x, f.y);
      const tp = toPixel(t.x, t.y);
      const dx = tp.px - fp.px;
      const dy = tp.py - fp.py;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      elements.push(
        <View
          key={key}
          style={{
            pointerEvents: "none",
            position: "absolute",
            left: fp.px,
            top: fp.py,
            width: len,
            height,
            backgroundColor: color,
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: "left center",
            borderStyle: dashed ? "dashed" : "solid",
            opacity: 0.65,
          }}
        />
      );
    };

    factionOverlays.allianceLines.forEach((l, i) => drawLine(`ally-${i}-${l.a}-${l.b}`, l.a, l.b, MAP.green + "AA", false, MAP_SIZING.faction.allianceLine));
    factionOverlays.warLines.forEach((l, i) => drawLine(`war-${i}-${l.a}-${l.b}`, l.a, l.b, MAP.red + "CC", true, MAP_SIZING.faction.warLine));

    // Animated convoy dots travelling along alliance lines (originating-faction colored).
    const partnerColorById = new Map<string, string>();
    for (const p of factionOverlays.partners) partnerColorById.set(p.id, p.archetypeColor);
    factionOverlays.allianceLines.forEach((l, i) => {
      const f = partnerLocById.get(l.a);
      const t = partnerLocById.get(l.b);
      if (!f || !t) return;
      const fp = toPixel(f.x, f.y);
      const tp = toPixel(t.x, t.y);
      const color = partnerColorById.get(l.a) ?? MAP.green;
      elements.push(
        <FactionConvoyDot
          key={`convoy-${i}-${l.a}-${l.b}`}
          fromX={fp.px}
          fromY={fp.py}
          toX={tp.px}
          toY={tp.py}
          color={color}
          delay={i * 600}
        />
      );
    });

    return elements;
  }, [factionOverlays, toPixel]);

  const renderTradeCaravans = useCallback(() => {
    return safeRoutes.map((route, i) => {
      let from = LOCATION_INDEX.get(route.from);
      let to = LOCATION_INDEX.get(route.to);
      if (!from || !to) return null;
      if (from.type === "player_city") from = { ...from, x: playerPos.x, y: playerPos.y };
      if (to.type === "player_city") to = { ...to, x: playerPos.x, y: playerPos.y };
      const fPx = toPixel(from.x, from.y);
      const tPx = toPixel(to.x, to.y);
      return (
        <TradeCaravanDot
          key={`caravan-${i}`}
          fromX={fPx.px}
          fromY={fPx.py}
          toX={tPx.px}
          toY={tPx.py}
          delay={i * 800}
        />
      );
    });
  }, [safeRoutes, playerPos, toPixel]);

  const onNodePress = useCallback((locId: string) => {
    const loc = visibleLocations.find((l) => l.id === locId) ?? LOCATION_INDEX.get(locId);
    if (loc) handleLocationPress(loc);
  }, [visibleLocations, handleLocationPress]);

  const defaultLabelIds = useMemo(
    () => getDefaultLocationLabelIds(visibleLocations, new Set(discoveredIds), playerPos, mapView),
    [visibleLocations, discoveredIds, playerPos, mapView],
  );

  const renderNodes = useCallback(() => {
    return sortWorldMapLocationsForHitTesting(visibleLocations).map((loc) => {
      const isPlayer = loc.type === "player_city";
      const nodeSize = markerSize(loc.type);
      const color = NODE_COLORS[loc.type] ?? MAP.inkLight;
      const isUncharted = !loc.discovered && !discoveredIds.includes(loc.id);
      const effStatus = isPlayer ? loc.status : getEffectiveStatus(loc);
      const borderColor = effStatus === "allied" ? MAP.green
        : effStatus === "hostile" ? MAP.red
        : effStatus === "neutral" ? MAP.orange
        : MAP.inkLight;

      const keepMexicoCityLabelOnNarrowMap =
        mapView.w > 0 && mapView.w <= 600 && loc.id === "dusthaven";
      const showLabel =
        keepMexicoCityLabelOnNarrowMap ||
        showAllLabels ||
        typeFilter !== null ||
        defaultLabelIds.has(loc.id);

      if (isPlayer) {
        return (
          <PlayerGlowNode
            key={loc.id}
            loc={loc}
            onPress={onNodePress}
            toPixel={toPixel}
            cityName={cityName}
            counterScale={nodeCounterScale}
            showLabel={showLabel}
          />
        );
      }

      if (effStatus === "hostile") {
        return (
          <HostilePulseNode
            key={loc.id}
            loc={loc}
            nodeSize={nodeSize}
            color={color}
            borderColor={borderColor}
            onPress={onNodePress}
            onHover={undefined}
            onContextMenu={handleNodeContextMenu}
            toPixel={toPixel}
            counterScale={nodeCounterScale}
            showLabel={showLabel}
          />
        );
      }

      return (
        <StaticNode
          key={loc.id}
          loc={loc}
          nodeSize={nodeSize}
          color={color}
          borderColor={borderColor}
          isUncharted={isUncharted}
          onPress={onNodePress}
          onHover={undefined}
          onContextMenu={handleNodeContextMenu}
          toPixel={toPixel}
          counterScale={nodeCounterScale}
          showLabel={showLabel}
        />
      );
    });
  }, [visibleLocations, discoveredIds, getEffectiveStatus, onNodePress, handleNodeContextMenu, toPixel, cityName, nodeCounterScale, showAllLabels, typeFilter, defaultLabelIds]);

  const allDiscovered = useMemo(() => WORLD_LOCATIONS.filter((loc) => loc.discovered || discoveredIds.includes(loc.id)), [discoveredIds]);
  const totalDiscovered = allDiscovered.length;
  const totalLocations = WORLD_LOCATIONS.length;
  const hiddenCount = totalLocations - totalDiscovered;
  const hostileCount = allDiscovered.filter((l) => getEffectiveStatus(l) === "hostile").length;
  const alliedCount = allDiscovered.filter((l) => getEffectiveStatus(l) === "allied").length;
  const controlledZones = useMemo(() => getControlledZoneCount(stateRef.current), [locationRelations, resourceNodes, discoveredLocationIds]);
  const zoneBonuses = useMemo(() => calculateZoneBonuses(stateRef.current), [locationRelations, resourceNodes, discoveredLocationIds]);

  const TYPE_FILTERS: { key: string | null; label: string }[] = [
    { key: null, label: "ALL" },
    { key: "megacity", label: "MEGACITIES" },
    { key: "nation", label: "NATIONS" },
    { key: "township", label: "TOWNSHIPS" },
    { key: "notable", label: "NOTABLE" },
    { key: "resource_node", label: "RESOURCES" },
  ];

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>WORLD MAP</Text>
          <View style={styles.compassRose}>
            <View style={{ position: "absolute", width: 1, height: 18, backgroundColor: MAP.sepia + "40" }} />
            <View style={{ position: "absolute", width: 18, height: 1, backgroundColor: MAP.sepia + "40" }} />
            <Text style={[styles.compassText, { color: MAP.red }]}>N</Text>
          </View>
        </View>
        <View style={styles.headerStats}>
          <Text style={styles.headerSub}>
            {totalDiscovered} charted{hiddenCount > 0 ? ` | ${hiddenCount} terra incognita` : ""}
          </Text>
          <View style={styles.statPill}>
            <View style={[styles.statDot, { backgroundColor: MAP.green }]} />
            <Text style={[styles.statPillText, { color: MAP.green }]}>{alliedCount}</Text>
          </View>
          <View style={styles.statPill}>
            <View style={[styles.statDot, { backgroundColor: MAP.red }]} />
            <Text style={[styles.statPillText, { color: MAP.red }]}>{hostileCount}</Text>
          </View>
          {controlledZones > 0 && (
            <View style={styles.statPill}>
              <Feather name="flag" size={8} color={MAP.sepia} />
              <Text style={[styles.statPillText, { color: MAP.sepia }]}>{controlledZones} zones</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.filterBar}>
        <ScrollView ref={filterScrollRef} horizontal showsHorizontalScrollIndicator={Platform.OS === "web"} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
          {TYPE_FILTERS.map((f) => (
            <Pressable
              key={f.key ?? "all"}
              onPress={() => setTypeFilter(f.key)}
              style={[
                styles.filterChip,
                typeFilter === f.key && styles.filterChipActive,
                Platform.OS === "web" && { cursor: "pointer" as any },
              ]}
            >
              {f.key && (
                <View style={[styles.filterDot, { backgroundColor: NODE_COLORS[f.key] ?? MAP.inkLight }]} />
              )}
              <Text style={[styles.filterChipText, typeFilter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          style={styles.eventLogBtn}
          onPress={() => setShowEventLog(true)}
          accessibilityRole="button"
          accessibilityLabel="Open world intel log"
          testID="world-map-open-event-log"
        >
          <Feather name="radio" size={14} color={MAP.sepia} />
          <Text style={styles.eventLogBtnText}>INTEL</Text>
        </Pressable>
      </View>

      <View style={styles.legendBar}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: MAP.green, transform: [{ rotate: "45deg" }], borderRadius: 0, width: 6, height: 6 }]} />
          <Text style={styles.legendText}>Your City</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: MAP.blue }]} />
          <Text style={styles.legendText}>Megacity</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: MAP.orange }]} />
          <Text style={styles.legendText}>Nation</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: MAP.greenFaded }]} />
          <Text style={styles.legendText}>Township</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: MAP.inkLight }]} />
          <Text style={styles.legendText}>Notable</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#DAA520", borderRadius: 0, transform: [{ rotate: "45deg" }] }]} />
          <Text style={styles.legendText}>Resource</Text>
        </View>
      </View>

      <View
        testID="world-map-viewport"
        style={styles.mapViewport}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setMapView({ w: width, h: height });
        }}
      >
      <GestureDetector gesture={composedGesture}>
        <View
          style={[StyleSheet.absoluteFill, cursorGrab as any]}
          {...(Platform.OS === "web"
            ? {
                onWheel: (e: any) => {
                  userInteracted.current = true;
                  const delta = -e.deltaY * 0.001;
                  scale.value = clampZoom(scale.value + delta);
                },
              }
            : {})}
        >
          {/* Base Layer: Geographic background / heavily transformed vectors */}
          <Animated.View
            style={[
              styles.mapContainer,
              animatedStyle,
              // Promote the panned/zoomed map to its own compositor layer on web
              // so dragging repaints the transform instead of the whole DOM —
              // this is the main fix for the "slow and janky" pan on desktop.
              Platform.OS === "web" ? ({ willChange: "transform" } as any) : null,
            ]}
          >
            <View style={styles.mapBackground}>
              <View testID="world-map-frame" pointerEvents="none" style={styles.mapFrame} />
              <AmericasTestOverlay />
              <GridOverlay />
              <TerrainLayer
                toPixel={toPixel}
                activeTerrainId={activeTerrainId}
                setActiveTerrainId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
              <TerrainFeaturesLayer
                toPixel={toPixel}
                activeTerrainId={activeTerrainId}
                setActiveTerrainId={setActiveTerrainId}
                chartedTerrainIds={chartedTerrainIds}
              />
              <WeatherOverlay toPixel={toPixel} season={currentSeason} />
            </View>
          </Animated.View>

          {/* Entity Layer: Player-facing location entities, markers, routes, and UI overlays.
              Separated from the massive Base Layer to avoid exceeding browser compositor limits
              (which previously caused extreme blur on all map text when scaled).
              pointerEvents="box-none" ensures empty space falls through to the Base Layer so
              gestures and terrain hovers still work. */}
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.mapContainer,
              { position: "absolute", top: 0, left: 0 },
              animatedStyle,
            ]}
          >
            <View style={[styles.mapBackground, { position: "absolute", top: 0, left: 0 }]} pointerEvents="box-none">
              {SHOW_AMERICAS_TEST_OVERLAY && (
                <Pressable
                  onPress={() => setShowSaProspect(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Inspect the southern continent survey"
                  style={{
                    position: "absolute",
                    left: SA_HOTSPOT_LEFT,
                    top: SA_HOTSPOT_TOP,
                    width: SA_HOTSPOT_W,
                    height: SA_HOTSPOT_H,
                    alignItems: "center",
                    justifyContent: "flex-end",
                    ...(Platform.OS === "web" ? { cursor: "help" as any } : {}),
                  }}
                >
                  <View style={styles.saProspectChip}>
                    <Feather name="compass" size={9} color={MAP.sepia} />
                    <Text style={styles.saProspectChipText}>SURVEY</Text>
                  </View>
                </Pressable>
              )}
              <FogMarkers locations={WORLD_LOCATIONS} discoveredIds={discoveredIds} toPixel={toPixel} />
              {renderRoutes()}
              {renderFactionOverlays()}
              {renderTradeCaravans()}
              {renderNodes()}
              <CompassRoseDecoration />
              <VignetteOverlay />

              <View style={styles.mapCartouche} pointerEvents="none">
                <View style={styles.cartoucheBorder}>
                  <Text style={styles.cartoucheTitle}>WASTELAND TERRITORIES</Text>
                  <View style={styles.cartoucheDivider} />
                  <Text style={styles.cartoucheSub}>SECTOR MARSHAL EYES ONLY</Text>
                  <Text style={styles.cartoucheDate}>CLASSIFICATION: RESTRICTED</Text>
                </View>
              </View>

              <View style={styles.scaleBarWrap} pointerEvents="none">
                <View style={styles.scaleBar}>
                  <View style={styles.scaleSegment} />
                  <View style={[styles.scaleSegment, { backgroundColor: "transparent" }]} />
                  <View style={styles.scaleSegment} />
                  <View style={[styles.scaleSegment, { backgroundColor: "transparent" }]} />
                </View>
                <View style={styles.scaleLabels}>
                  <Text style={styles.scaleLabelText}>0</Text>
                  <Text style={styles.scaleLabelText}>50</Text>
                  <Text style={styles.scaleLabelText}>100</Text>
                  <Text style={styles.scaleLabelText}>150</Text>
                  <Text style={styles.scaleLabelText}>200km</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </GestureDetector>
      </View>

      {/* Onboarding tip floats over the map as an overlay instead of living in
          the layout flow. It used to reserve ~130px between the header and the
          filter bar while being buried behind the full-bleed map layer — that
          pushed the toolbar low into the map and the hint could never be seen or
          dismissed. As an overlay the toolbar stays tight under the header and
          the tip is visible/tappable above the map. */}
      <View style={styles.tutorialOverlay}>
        <TutorialHint
          id="worldmap_intro"
          message="This is the post-collapse Americas. 203 locations across North America — megacities, townships, ruins, resource sites. Pan and zoom to explore, then send expeditions to discover what's hidden in the fog. South America is drawn on the map but reserved for future content (UNDER DEVELOPMENT)."
        />
      </View>

      <View style={styles.mapControls}>
        <Pressable
          style={styles.mapControlBtn}
          onPress={() => {
            scale.value = withTiming(clampZoom(scale.value + 0.25), { duration: 200 });
          }}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
        >
          <Feather name="plus" size={16} color={MAP.ink} />
        </Pressable>
        <Pressable
          style={styles.mapControlBtn}
          onPress={() => {
            scale.value = withTiming(clampZoom(scale.value - 0.25), { duration: 200 });
          }}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
        >
          <Feather name="minus" size={16} color={MAP.ink} />
        </Pressable>
        <View style={styles.mapControlDivider} />
        <Pressable
          style={styles.mapControlBtn}
          onPress={() => {
            offsetX.value = withTiming(mapView.w / 2 - playerPxX * DEFAULT_ZOOM - CONTENT_CENTER_X * (1 - DEFAULT_ZOOM), { duration: 400 });
            offsetY.value = withTiming(mapView.h / 2 - playerPxY * DEFAULT_ZOOM - CONTENT_CENTER_Y * (1 - DEFAULT_ZOOM), { duration: 400 });
            scale.value = withTiming(DEFAULT_ZOOM, { duration: 400 });
          }}
          accessibilityRole="button"
          accessibilityLabel="Recenter map on player"
        >
          <Feather name="crosshair" size={16} color={MAP.green} />
        </Pressable>
      </View>

      {weatherNotice && (
        <View
          style={{
            pointerEvents: "none",
            position: "absolute",
            top: 70,
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 200,
          }}
        >
          <View
            style={{
              backgroundColor: MAP.parchment,
              borderWidth: 2,
              borderColor: MAP.orange,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 4,
              shadowColor: "#000",
              shadowOpacity: 0.25,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 4,
            }}
          >
            <Text
              style={{
                fontFamily: "Inter_700Bold",
                fontSize: 11,
                color: MAP.orange,
                letterSpacing: 1.5,
              }}
            >
              ⚠ {weatherNotice}
            </Text>
          </View>
        </View>
      )}

      {showSaProspect && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setShowSaProspect(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowSaProspect(false)}>
            <Pressable style={[styles.infoPanel, { width: Math.min(screenW - 32, 380), maxHeight: screenH * 0.8 }]} onPress={() => {}}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.infoPanelHeader}>
                  <View style={[styles.infoPanelDot, { backgroundColor: MAP.sepia }]} />
                  <Text style={styles.infoPanelTitle}>SOUTHERN CONTINENT</Text>
                  <Pressable onPress={() => setShowSaProspect(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close survey brief">
                    <Feather name="x" size={18} color={MAP.inkLight} />
                  </Pressable>
                </View>

                <View style={styles.infoPanelTypeBadge}>
                  <Text style={styles.infoPanelType}>SURVEY PENDING</Text>
                  <View style={[styles.statusBadge, { borderColor: MAP.orange + "80", backgroundColor: MAP.orange + "15" }]}>
                    <Text style={[styles.statusBadgeText, { color: MAP.orange }]}>UNDER DEVELOPMENT</Text>
                  </View>
                </View>

                <Text style={styles.infoPanelDesc}>
                  Long-range recon confirms a landmass south of the isthmus — dense, storm-wracked, and silent since the Collapse. Several sectors already read hot on the long scopes. Command has flagged the whole theatre for a future expedition mandate; no routes and no charted sites yet.
                </Text>

                <View style={styles.infoStats}>
                  <View style={styles.infoStatRow}>
                    <Text style={styles.infoStatLabel}>STATUS</Text>
                    <Text style={[styles.infoStatVal, { color: MAP.orange }]}>UNSURVEYED</Text>
                  </View>
                  <View style={styles.infoStatRow}>
                    <Text style={styles.infoStatLabel}>CHARTED SITES</Text>
                    <Text style={styles.infoStatVal}>0</Text>
                  </View>
                  <View style={styles.infoStatRow}>
                    <Text style={styles.infoStatLabel}>ACCESS</Text>
                    <Text style={[styles.infoStatVal, { color: MAP.inkLight }]}>LOCKED</Text>
                  </View>
                </View>

                <View style={styles.connectedSection}>
                  <Text style={styles.connectedHeader}>PROJECTED SECTORS</Text>
                  {SA_PROJECTED_SECTORS.map((s) => (
                    <View key={s.name} style={styles.saRegionRow}>
                      <View style={styles.saRegionBullet} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.saRegionTitleRow}>
                          <Text style={styles.saRegionName}>{s.name}</Text>
                          <Text style={styles.saRegionBiome}>{s.biome}</Text>
                        </View>
                        <Text style={styles.saRegionNote}>{s.note}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.connectedSection}>
                  <Text style={styles.connectedHeader}>UNLOCK PATH</Text>
                  <Text style={styles.connectedList}>Expedition mandate held in reserve. When Command opens the southern theatre in a future dispatch, these sectors chart first — no crossing until then.</Text>
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <MinimapOverlay
        locations={visibleLocations}
        routes={routes}
        playerPos={playerPos}
        toPixel={toPixel}
        offsetX={offsetX}
        offsetY={offsetY}
        scale={scale}
        screenW={mapView.w}
        screenH={mapView.h}
      />

      {selectedLocation && (
        <Modal transparent animationType="fade" visible onRequestClose={() => setSelectedLocation(null)}>
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedLocation(null)}>
            <Pressable style={[styles.infoPanel, { width: Math.min(screenW - 32, 400), maxHeight: screenH * 0.75 }]} onPress={() => {}}>
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: screenH * 0.65 }}>
                <View style={styles.infoPanelHeader}>
                  {(() => {
                    const sigil = getMegacitySigil(selectedLocation.id);
                    return sigil ? (
                      <Image
                        source={sigil}
                        style={{ width: 20, height: 25, borderRadius: 2, marginRight: 2 }}
                        resizeMode="cover"
                        accessibilityLabel={`${selectedLocation.name} sigil`}
                      />
                    ) : (
                      <View style={[styles.infoPanelDot, { backgroundColor: NODE_COLORS[selectedLocation.type] ?? MAP.inkLight }]} />
                    );
                  })()}
                  <Text style={styles.infoPanelTitle}>{selectedLocation.type === "player_city" ? (cityName ?? selectedLocation.name) : selectedLocation.name}</Text>
                  <Pressable onPress={() => setSelectedLocation(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close location details">
                    <Feather name="x" size={18} color={MAP.inkLight} />
                  </Pressable>
                </View>

                <View style={styles.infoPanelTypeBadge}>
                  <Text style={styles.infoPanelType}>
                    {selectedLocation.type.toUpperCase().replace("_", " ")}
                  </Text>
                  <View style={[styles.statusBadge, { borderColor: MAP.inkLight + "60", backgroundColor: MAP.inkLight + "10" }]}>
                    <Text style={[styles.statusBadgeText, { color: MAP.inkLight + "CC" }]}>
                      {toGridRef(selectedLocation.x, selectedLocation.y)}
                    </Text>
                  </View>
                  {(() => {
                    const eff = getEffectiveStatus(selectedLocation);
                    const sc = eff === "allied" ? MAP.green : eff === "hostile" ? MAP.red : eff === "neutral" ? MAP.orange : MAP.inkLight;
                    return (
                      <View style={[styles.statusBadge, { borderColor: sc, backgroundColor: sc + "15" }]}>
                        <Text style={[styles.statusBadgeText, { color: sc }]}>
                          {eff.toUpperCase()}
                        </Text>
                      </View>
                    );
                  })()}
                </View>

                {(!selectedOperational || selectedLocation.type === "player_city" || selectedLocation.type === "resource_node") && (
                  <Text style={styles.infoPanelDesc}>{selectedLocation.description}</Text>
                )}

                {selectedLocation.type === "resource_node" && selectedLocation.resourceNodeId && (() => {
                  const nodeDef = getNodeDef(selectedLocation.resourceNodeId);
                  if (!nodeDef) return null;
                  const rnState = resourceNodes ?? createDefaultResourceNodeState();
                  const isSurveyed = rnState.surveyed[selectedLocation.resourceNodeId] ?? false;
                  const isExploiting = !!rnState.exploiting[selectedLocation.resourceNodeId];
                  const isDepleted = rnState.depleted.includes(selectedLocation.resourceNodeId);
                  const nodeColor = RESOURCE_NODE_COLORS[nodeDef.resourceType] ?? "#DAA520";
                  return (
                    <View style={{ marginTop: 8, padding: 10, backgroundColor: nodeColor + "10", borderWidth: 1, borderColor: nodeColor + "30", borderRadius: 6 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <View style={{ width: 10, height: 10, backgroundColor: nodeColor, borderRadius: 2, transform: [{ rotate: "45deg" }] }} />
                        <Text style={{ fontFamily: "Inter_700Bold", fontSize: 12, color: nodeColor, letterSpacing: 0.5 }}>
                          {RESOURCE_NODE_LABELS[nodeDef.resourceType]}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
                        {isSurveyed && (
                          <View>
                            <Text style={styles.infoStatLabel}>RICHNESS</Text>
                            <Text style={[styles.infoStatVal, { color: nodeDef.richness === "abundant" ? MAP.green : nodeDef.richness === "rich" ? "#DAA520" : MAP.inkFaded }]}>
                              {RICHNESS_LABELS[nodeDef.richness]}
                            </Text>
                          </View>
                        )}
                        <View>
                          <Text style={styles.infoStatLabel}>DANGER</Text>
                          <Text style={[styles.infoStatVal, { color: nodeDef.dangerLevel >= 50 ? MAP.red : nodeDef.dangerLevel >= 30 ? MAP.orange : MAP.green }]}>
                            {nodeDef.dangerLevel}%
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.infoStatLabel}>STATUS</Text>
                          <Text style={[styles.infoStatVal, {
                            color: isDepleted ? MAP.red : isExploiting ? MAP.green : isSurveyed ? "#DAA520" : MAP.inkFaded,
                          }]}>
                            {isDepleted ? "DEPLETED" : isExploiting ? "EXTRACTING" : isSurveyed ? "SURVEYED" : "UNSURVEYED"}
                          </Text>
                        </View>
                      </View>
                      {isSurveyed && !isDepleted && (() => {
                        const mult = RICHNESS_MULT[nodeDef.richness] ?? 1;
                        const y = nodeDef.yieldPerTick;
                        const exploitInfo = rnState.exploiting[selectedLocation.resourceNodeId!];
                        const haltedRem = rnState.haltedRemaining?.[selectedLocation.resourceNodeId!];
                        const liveRemaining = exploitInfo ? exploitInfo.ticksRemaining : haltedRem ?? nodeDef.depletionTicks;
                        return (
                          <View style={{ marginTop: 4 }}>
                            <Text style={[styles.infoStatLabel, { marginBottom: 3 }]}>YIELD PER TICK</Text>
                            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                              {y.credits ? <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: "#DAA520" }}>{Math.floor(y.credits * mult)} credits</Text> : null}
                              {y.food ? <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: MAP.green }}>{Math.floor(y.food * mult)} food</Text> : null}
                              {y.fuel ? <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: MAP.orange }}>{Math.floor(y.fuel * mult)} fuel</Text> : null}
                              {y.steel ? <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: MAP.inkLight }}>{Math.floor(y.steel * mult)} steel</Text> : null}
                              {y.medSupplies ? <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: MAP.blue }}>{Math.floor(y.medSupplies * mult)} med</Text> : null}
                              {y.ammo ? <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: MAP.red }}>{Math.floor(y.ammo * mult)} ammo</Text> : null}
                            </View>
                            {nodeDef.depletionTicks > 0 && (
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: liveRemaining < nodeDef.depletionTicks * 0.2 ? MAP.red : MAP.inkFaded, marginTop: 3 }}>
                                Reserves remaining: {liveRemaining} / {nodeDef.depletionTicks} ticks
                              </Text>
                            )}
                            {nodeDef.depletionTicks === 0 && (
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: MAP.green, marginTop: 3 }}>
                                Renewable source — does not deplete
                              </Text>
                            )}
                          </View>
                        );
                      })()}
                      {!isSurveyed && (
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: MAP.inkFaded, fontStyle: "italic", marginTop: 2 }}>
                          Survey required to reveal yield data
                        </Text>
                      )}
                      {nodeDef.notes !== selectedLocation.description && (
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: MAP.sepia, marginTop: 4, fontStyle: "italic" }}>
                          {nodeDef.notes}
                        </Text>
                      )}
                    </View>
                  );
                })()}

                <View style={styles.infoStats}>
                  {selectedLocation.type !== "player_city" && (() => {
                    const distKm = worldDistanceKm(playerPos.x, playerPos.y, selectedLocation.x, selectedLocation.y);
                    const bearing = compassBearing(playerPos.x, playerPos.y, selectedLocation.x, selectedLocation.y);
                    return (
                      <View style={styles.infoStatRow}>
                        <Text style={styles.infoStatLabel}>DISTANCE</Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Feather name="navigation" size={10} color={MAP.sepia} />
                          <Text style={styles.infoStatVal}>{distKm.toLocaleString()} km{bearing ? ` ${bearing}` : ""}</Text>
                        </View>
                      </View>
                    );
                  })()}
                  {selectedLocation.terrain && (
                    <View style={styles.infoStatRow}>
                      <Text style={styles.infoStatLabel}>TERRAIN</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                        <Feather name={TERRAIN_ICONS[selectedLocation.terrain] as any} size={10} color={MAP.sepia} />
                        <Text style={styles.infoStatVal}>{TERRAIN_LABELS[selectedLocation.terrain]}</Text>
                      </View>
                    </View>
                  )}
                  {selectedLocation.population > 0 && (
                    <View style={styles.infoStatRow}>
                      <Text style={styles.infoStatLabel}>POPULATION</Text>
                      <Text style={styles.infoStatVal}>{selectedLocation.population.toLocaleString()}</Text>
                    </View>
                  )}
                  {selectedLocation.defenseRating > 0 && (
                    <View style={styles.infoStatRow}>
                      <Text style={styles.infoStatLabel}>DEFENSE</Text>
                      <Text style={[styles.infoStatVal, {
                        color: selectedLocation.defenseRating >= 60 ? MAP.red : selectedLocation.defenseRating >= 30 ? MAP.orange : MAP.green,
                      }]}>{selectedLocation.defenseRating}</Text>
                    </View>
                  )}
                  {selectedLocation.faction !== "None" && (
                    <View style={styles.infoStatRow}>
                      <Text style={styles.infoStatLabel}>FACTION</Text>
                      <Text style={styles.infoStatVal}>{selectedLocation.faction}</Text>
                    </View>
                  )}
                  <View style={styles.infoStatRow}>
                    <Text style={styles.infoStatLabel}>CONNECTIONS</Text>
                    <Text style={styles.infoStatVal}>{selectedLocation.connectedTo.length} routes</Text>
                  </View>
                </View>

                {continuanceOperational && continuanceStage > 0 && (
                  <View
                    accessibilityLabel="Continuance intelligence report"
                    style={{ marginTop: 10, padding: 10, borderWidth: 1, borderColor: MAP.inkLight + "35", backgroundColor: MAP.inkLight + "08", borderRadius: 5 }}
                  >
                    <Text style={[styles.connectedHeader, { marginBottom: 8 }]}>CONTINUANCE INTELLIGENCE REPORT</Text>
                    <Text style={[styles.infoStatLabel, { marginBottom: 8 }]}>CLEARANCE STAGE {continuanceStage} · {continuanceStage < 4 ? "ESTIMATED" : "CONFIRMED"}</Text>
                    {continuanceStage === 1 && (
                      <View style={{ gap: 5 }}>
                        <Text style={styles.infoStatVal}>SEALED MOUNTAIN FACILITY CONFIRMED.</Text>
                        <Text style={styles.infoStatVal}>POPULATION ESTIMATE: 4,000–6,000</Text>
                        <Text style={styles.infoStatVal}>BUNKER CAPACITY ESTIMATE: 5,000–7,000</Text>
                      </View>
                    )}
                    {continuanceStage === 2 && (
                      <View style={{ gap: 5 }}>
                        <Text style={styles.infoStatVal}>POPULATION ESTIMATE: 4,600–5,000 · CAPACITY: 5,800–6,200</Text>
                        <Text style={styles.infoStatVal}>LIFE SUPPORT ESTIMATE: FOOD {continuanceOperational.bunker.food - 5}–{Math.min(100, continuanceOperational.bunker.food + 5)}% · WATER {continuanceOperational.bunker.water - 5}–{Math.min(100, continuanceOperational.bunker.water + 5)}% · AIR {continuanceOperational.bunker.air - 5}–{Math.min(100, continuanceOperational.bunker.air + 5)}%</Text>
                        <Text style={styles.infoStatVal}>READINESS ESTIMATE: {continuanceOperational.weapons.readiness - 8}–{Math.min(100, continuanceOperational.weapons.readiness + 8)}%</Text>
                        <Text style={styles.infoStatVal}>DOCTRINE: {continuanceOperational.doctrine}</Text>
                        <Text style={styles.infoStatVal}>STATUS: SEALED · COMMAND STRUCTURE ACTIVE</Text>
                      </View>
                    )}
                    {continuanceStage === 3 && (
                      <View style={{ gap: 5 }}>
                        <Text style={styles.infoStatVal}>COHORT TOTALS: {continuanceOperational.cohorts.totalSurvivors.toLocaleString()} SURVIVORS · {continuanceOperational.cohorts.dependents.toLocaleString()} DEPENDENTS · {continuanceOperational.cohorts.workers.toLocaleString()} WORKERS · {continuanceOperational.cohorts.administrators.toLocaleString()} ADMINISTRATORS · {continuanceOperational.cohorts.activeDuty.toLocaleString()} ACTIVE · {continuanceOperational.cohorts.reserves.toLocaleString()} RESERVES · {continuanceOperational.cohorts.command.toLocaleString()} COMMAND</Text>
                        <Text style={styles.infoStatVal}>MILITARY OFFICE: {continuanceOperational.militaryCommander.name} · {continuanceOperational.militaryCommander.role} · AUTHORITY {continuanceOperational.militaryCommander.authority}% · APPROVAL {continuanceOperational.militaryCommander.approval}% · LOYALTY {continuanceOperational.militaryCommander.loyalty}%</Text>
                        <Text style={styles.infoStatVal}>CIVILIAN OFFICE: {continuanceOperational.civilianPresident.name} · {continuanceOperational.civilianPresident.role} · AUTHORITY {continuanceOperational.civilianPresident.authority}% · APPROVAL {continuanceOperational.civilianPresident.approval}% · LOYALTY {continuanceOperational.civilianPresident.loyalty}%</Text>
                        <Text style={styles.infoStatVal}>RESTORATION PROGRESS: PLANNING {continuanceOperational.restorationPlan.planning}% · INFILTRATION {continuanceOperational.restorationPlan.infiltration}% · RECONNAISSANCE {continuanceOperational.restorationPlan.reconnaissance}% · MOBILIZATION {continuanceOperational.restorationPlan.mobilization}%</Text>
                      </View>
                    )}
                    {continuanceStage === 4 && (
                      <View style={{ gap: 5 }}>
                        <Text style={styles.infoStatVal}>SURVIVORS {continuanceOperational.cohorts.totalSurvivors.toLocaleString()} · DEPENDENTS {continuanceOperational.cohorts.dependents.toLocaleString()} · WORKERS {continuanceOperational.cohorts.workers.toLocaleString()} · ADMIN {continuanceOperational.cohorts.administrators.toLocaleString()} · ACTIVE {continuanceOperational.cohorts.activeDuty.toLocaleString()} · RESERVES {continuanceOperational.cohorts.reserves.toLocaleString()} · COMMAND {continuanceOperational.cohorts.command.toLocaleString()}</Text>
                        <Text style={styles.infoStatVal}>BUNKER: CAPACITY {continuanceOperational.bunker.capacity.toLocaleString()} · HOUSING {continuanceOperational.bunker.housing.toLocaleString()} · FOOD {continuanceOperational.bunker.food}% · WATER {continuanceOperational.bunker.water}% · POWER {continuanceOperational.bunker.power}% · AIR {continuanceOperational.bunker.air}%</Text>
                        <Text style={styles.infoStatVal}>OPERATIONS: INDUSTRY {continuanceOperational.industry.capacity}%/{continuanceOperational.industry.output}% · WEAPONS {continuanceOperational.weapons.readiness}%/{continuanceOperational.weapons.stockpile}% · MORALE {continuanceOperational.morale}% · LEGITIMACY {continuanceOperational.legitimacy}% · SECRECY {continuanceOperational.secrecy}% · INTELLIGENCE {continuanceOperational.intelligenceReach}% · RECLAMATION {continuanceOperational.reclamationCapability}%</Text>
                        <Text style={styles.infoStatVal}>DOCTRINE: {continuanceOperational.doctrine}</Text>
                        <Text style={styles.infoStatVal}>MILITARY OFFICE: {continuanceOperational.militaryCommander.name} · {continuanceOperational.militaryCommander.role} · AUTHORITY {continuanceOperational.militaryCommander.authority}% · APPROVAL {continuanceOperational.militaryCommander.approval}% · LOYALTY {continuanceOperational.militaryCommander.loyalty}% · SUCCESSION: {continuanceOperational.militaryCommander.succession}</Text>
                        <Text style={styles.infoStatVal}>CIVILIAN OFFICE: {continuanceOperational.civilianPresident.name} · {continuanceOperational.civilianPresident.role} · AUTHORITY {continuanceOperational.civilianPresident.authority}% · APPROVAL {continuanceOperational.civilianPresident.approval}% · LOYALTY {continuanceOperational.civilianPresident.loyalty}% · SUCCESSION: {continuanceOperational.civilianPresident.succession}</Text>
                        <Text style={styles.infoStatVal}>RESTORATION: PLANNING {continuanceOperational.restorationPlan.planning}% · INFILTRATION {continuanceOperational.restorationPlan.infiltration}% · RECON {continuanceOperational.restorationPlan.reconnaissance}% · MOBILIZATION {continuanceOperational.restorationPlan.mobilization}% · TARGETS {continuanceOperational.restorationPlan.targetRegions.join(", ")} · THRESHOLDS I{continuanceOperational.restorationPlan.readinessThresholds.infiltration}/R{continuanceOperational.restorationPlan.readinessThresholds.reconnaissance}/M{continuanceOperational.restorationPlan.readinessThresholds.mobilization} · DISCOVERY RISK {continuanceOperational.restorationPlan.discoveryRisk}%</Text>
                      </View>
                    )}
                  </View>
                )}

                {selectedOperational && selectedLocation.type !== "player_city" && selectedLocation.id !== CONTINUANCE_ID && (
                  <React.Fragment>
                  <OperationalEntitySheet
                    name={selectedLocation.name}
                    kind={selectedLocation.type}
                    summary={`${selectedOperational.setting.terrain}${selectedOperational.setting.coastal ? " · coastal" : ""}${selectedOperational.setting.wasteland ? " · wasteland" : ""}`}
                    disclosureLabel={getEntityDisclosure({
                      entityId: selectedLocation.id,
                      kind: selectedLocation.type === "nation" ? "nation" : selectedLocation.type === "megacity" ? "megacity" : "settlement",
                      isDiscovered: discoveredIds.includes(selectedLocation.id),
                      relation: getRelation(selectedLocation.id),
                      intel: (stateRef.current.intelItems ?? []).filter((item) => item.subjectId === selectedLocation.id || item.sourceId === selectedLocation.id),
                    }).label}
                    evidenceLabel={disclosureEvidenceLabel(getEntityDisclosure({
                      entityId: selectedLocation.id,
                      kind: selectedLocation.type === "nation" ? "nation" : selectedLocation.type === "megacity" ? "megacity" : "settlement",
                      isDiscovered: discoveredIds.includes(selectedLocation.id),
                      relation: getRelation(selectedLocation.id),
                      intel: (stateRef.current.intelItems ?? []).filter((item) => item.subjectId === selectedLocation.id || item.sourceId === selectedLocation.id),
                    }).evidence)}
                    level={getEntityDisclosure({
                      entityId: selectedLocation.id,
                      kind: selectedLocation.type === "nation" ? "nation" : selectedLocation.type === "megacity" ? "megacity" : "settlement",
                      isDiscovered: discoveredIds.includes(selectedLocation.id),
                      relation: getRelation(selectedLocation.id),
                      intel: (stateRef.current.intelItems ?? []).filter((item) => item.subjectId === selectedLocation.id || item.sourceId === selectedLocation.id),
                    }).level}
                    compact
                    accessibilityLabel={`${selectedLocation.name} operational sheet`}
                    sections={getOperationalSettlementSections(selectedOperational)}
                  />
                  </React.Fragment>
                )}

                {selectedLocation.connectedTo.length > 0 && (
                  <View style={styles.connectedSection}>
                    <Text style={styles.connectedHeader}>CONNECTED TO:</Text>
                    <Text style={styles.connectedList}>
                      {selectedLocation.connectedTo
                        .map((id) => {
                          const loc = LOCATION_INDEX.get(id);
                          if (!loc) return null;
                          if (!loc.discovered && !discoveredIds.includes(id)) return "???";
                          return loc.type === "player_city" ? (cityName ?? loc.name) : loc.name;
                        })
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                )}

                {selectedLocation.type !== "player_city" && (() => {
                  const rel = getRelation(selectedLocation.id);
                  const effStatus = getEffectiveStatus(selectedLocation);
                  const hasInteractions = rel.aidSent > 0 || rel.raidsSent > 0 || rel.tradesMade > 0 || rel.scoutsMade > 0;
                  const statusColor = effStatus === "allied" ? MAP.green : effStatus === "hostile" ? MAP.red : MAP.orange;
                  const dispNorm = (rel.disposition + 100) / 200;
                  const barWidth = Math.max(0, Math.min(1, dispNorm));
                  const barColor = rel.disposition > 50 ? MAP.green : rel.disposition > 0 ? MAP.greenFaded : rel.disposition > -20 ? MAP.orange : MAP.red;
                  return hasInteractions ? (
                    <View style={styles.connectedSection}>
                      <Text style={styles.connectedHeader}>DISPOSITION</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <Text style={[styles.infoStatVal, { color: statusColor, fontSize: 16 }]}>{effStatus.toUpperCase()}</Text>
                        <Text style={[styles.infoStatLabel, { fontSize: 11 }]}>({rel.disposition > 0 ? "+" : ""}{Math.round(rel.disposition)})</Text>
                      </View>
                      <View style={styles.dispositionBarBg}>
                        <View style={[styles.dispositionBarFill, { width: `${barWidth * 100}%`, backgroundColor: barColor }]} />
                        <View style={styles.dispositionBarCenter} />
                      </View>
                      <View style={styles.dispositionBarLabels}>
                        <Text style={[styles.dispositionBarLabel, { color: MAP.red }]}>HOSTILE</Text>
                        <Text style={[styles.dispositionBarLabel, { color: MAP.inkLight }]}>NEUTRAL</Text>
                        <Text style={[styles.dispositionBarLabel, { color: MAP.green }]}>ALLIED</Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                        {rel.scoutsMade > 0 && <Text style={styles.infoStatLabel}>Scouted: {rel.scoutsMade}x</Text>}
                        {rel.tradesMade > 0 && <Text style={styles.infoStatLabel}>Traded: {rel.tradesMade}x</Text>}
                        {rel.aidSent > 0 && <Text style={styles.infoStatLabel}>Aid sent: {rel.aidSent}x</Text>}
                        {rel.raidsSent > 0 && <Text style={[styles.infoStatLabel, { color: MAP.red }]}>Raided: {rel.raidsSent}x</Text>}
                      </View>
                    </View>
                  ) : null;
                })()}

                {selectedLocation.type !== "player_city" && (() => {
                  // Season-aware: dormant zones drop out and active zones use
                  // the current season's intensity in both the warning text
                  // and the convoy-loss math.
                  const selZones = getWeatherZonesOnPath(playerPos.x, playerPos.y, selectedLocation.x, selectedLocation.y, 12, currentSeason);
                  const selWeather = computeWeatherTravelEffect(selZones, currentSeason);
                  // Surface dormant-but-overlapping zones so players can spot
                  // hazards that will return next season.
                  const allOverlapping = getWeatherZonesOnPath(playerPos.x, playerPos.y, selectedLocation.x, selectedLocation.y);
                  const dormantZones = allOverlapping.filter((z) => !isZoneActive(z, currentSeason));
                  // Task #97: next-season forecast for this route — list any
                  // zones whose intensity state changes after the season turns
                  // so the marshal can delay risky convoys until a hazard
                  // quiets (or push them before a dormant zone wakes).
                  const nextSeasonValue = nextSeason(currentSeason);
                  const forecastChanges = allOverlapping
                    .map((z) => ({
                      zone: z,
                      cur: getZoneSeasonState(z, currentSeason),
                      next: getZoneSeasonState(z, nextSeasonValue),
                    }))
                    .filter((c) => c.cur !== c.next);
                  return (
                  <View style={styles.actionsSection}>
                    <Text style={styles.actionsSectionTitle}>OPERATIONS</Text>
                    {selZones.length > 0 && (
                      <View style={{ marginBottom: 8, padding: 6, backgroundColor: MAP.orange + "12", borderWidth: 1, borderColor: MAP.orange + "40", borderRadius: 4 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: MAP.orange, letterSpacing: 0.5, marginBottom: 2 }}>
                          ⚠ ROUTE CROSSES {selZones.length} WEATHER HAZARD{selZones.length === 1 ? "" : "S"} · {getSeasonLabel(currentSeason)}
                        </Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: MAP.sepia }}>
                          {selZones.map((z) => `${z.label} [${getZoneSeasonState(z, currentSeason)}]`).join(" · ")}
                        </Text>
                        {(selWeather.creditsDrain > 0 || selWeather.ammoDrain > 0 || selWeather.foodDrain > 0) && (
                          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: MAP.red, marginTop: 2 }}>
                            Convoy losses: {selWeather.creditsDrain > 0 ? `${selWeather.creditsDrain.toLocaleString()}cr ` : ""}{selWeather.ammoDrain > 0 ? `${selWeather.ammoDrain} ammo ` : ""}{selWeather.foodDrain > 0 ? `${selWeather.foodDrain} food` : ""}
                          </Text>
                        )}
                      </View>
                    )}
                    {selZones.length === 0 && dormantZones.length > 0 && (
                      <View style={{ marginBottom: 8, padding: 6, backgroundColor: MAP.inkLight + "10", borderWidth: 1, borderColor: MAP.inkLight + "30", borderRadius: 4, borderStyle: "dashed" }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: MAP.inkLight, letterSpacing: 0.5, marginBottom: 2 }}>
                          · ROUTE CROSSES {dormantZones.length} DORMANT HAZARD{dormantZones.length === 1 ? "" : "S"} · {getSeasonLabel(currentSeason)}
                        </Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: MAP.sepia }}>
                          {dormantZones.map((z) => `${z.label} [quiet]`).join(" · ")}
                        </Text>
                      </View>
                    )}
                    {forecastChanges.length > 0 && (
                      <View style={{ marginBottom: 8, padding: 6, backgroundColor: MAP.sepia + "10", borderWidth: 1, borderColor: MAP.sepia + "40", borderRadius: 4 }}>
                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: MAP.sepia, letterSpacing: 0.5, marginBottom: 2 }}>
                          → FORECAST · {getSeasonLabel(nextSeasonValue)} APPROACHING
                        </Text>
                        <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: MAP.sepia }}>
                          {forecastChanges.map((c) => `${c.zone.label} [${c.cur}→${c.next}]`).join(" · ")}
                        </Text>
                      </View>
                    )}

                    {(() => {
                      const endpoints = getEligibleRailEndpoints(stateRef.current);
                      const isEligible = endpoints.some(e => e.id === selectedLocation.id);
                      const activeCorridor = (railCorridors || []).find(r => r.endpointId === selectedLocation.id);
                      if (!isEligible && !activeCorridor) return null;
                      const hasBasicRail = (stateRef.current.unlockedTechnologies || []).includes("basic_railways");

                      return (
                        <View style={{ marginBottom: 12, padding: 8, backgroundColor: MAP.ink + "08", borderWidth: 1, borderColor: MAP.ink + "20", borderRadius: 4 }}>
                          <Text style={{ fontFamily: "Inter_700Bold", fontSize: 10, color: MAP.ink, letterSpacing: 0.5, marginBottom: 4 }}>
                            RAIL NETWORK
                          </Text>
                          {activeCorridor ? (
                            <View>
                              <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: MAP.inkLight, marginBottom: 2 }}>
                                STATUS: {activeCorridor.status.replace("_", " ").toUpperCase()}
                              </Text>
                              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: MAP.inkFaded, marginBottom: 6 }}>
                                {activeCorridor.status === "under_construction" ? `Progress: ${Math.floor(activeCorridor.progressTicks / activeCorridor.totalTicks * 100)}%` :
                                 activeCorridor.status === "consent_pending" ? "Awaiting partner response" :
                                 activeCorridor.status === "completed" ? "Operational" :
                                 activeCorridor.reason ? activeCorridor.reason.replace(/_/g, " ") : "Disrupted"}
                              </Text>
                              {activeCorridor.status !== "consent_pending" && activeCorridor.status !== "cancelled" && activeCorridor.status !== "rejected" && (
                                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 8, color: MAP.inkFaded, marginBottom: 6 }}>
                                  STAFFING: {Object.values(activeCorridor.staffing).reduce((a,b)=>a+b, 0)} ASSIGNED
                                </Text>
                              )}
                              {activeCorridor.status !== "completed" && activeCorridor.status !== "cancelled" && activeCorridor.status !== "rejected" && (
                                <Pressable
                                  onPress={() => cancelRailCorridor(activeCorridor.id)}
                                  style={{ paddingVertical: 4, paddingHorizontal: 8, backgroundColor: MAP.red + "20", alignSelf: "flex-start", borderRadius: 3, borderWidth: 1, borderColor: MAP.red + "40" }}
                                >
                                  <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: MAP.red }}>CANCEL CORRIDOR</Text>
                                </Pressable>
                              )}
                            </View>
                          ) : (
                            <View>
                              {!hasBasicRail ? (
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: MAP.red, marginBottom: 4 }}>
                                  Requires Basic Railways technology
                                </Text>
                              ) : (
                                (() => {
                                  const quote = getRailCorridorQuote(stateRef.current, selectedLocation.id);
                                  if (!quote.ok) {
                                    return (
                                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: MAP.red, marginBottom: 4 }}>
                                        RAIL QUOTE UNAVAILABLE: {quote.reason.replace(/_/g, " ")}
                                      </Text>
                                    );
                                  }
                                  return (
                                    <View>
                                      <Text style={{ fontFamily: "Inter_500Medium", fontSize: 9, color: MAP.inkLight, marginBottom: 2 }}>
                                        QUOTE: {quote.distance} KM · {quote.years} YEARS
                                      </Text>
                                      <Text style={{ fontFamily: "Inter_400Regular", fontSize: 9, color: MAP.inkFaded, marginBottom: 6 }}>
                                        COMMITMENT: {quote.committedCredits.toLocaleString()} CREDITS · {quote.committedSteel.toLocaleString()} STEEL · {quote.endpoint.needsConsent ? "PARTNER CONSENT REQUIRED" : "CONTROLLED ENDPOINT"}
                                      </Text>
                                      <Pressable
                                        onPress={() => {
                                          const res = proposeRailCorridor(selectedLocation.id, STANDARD_RAIL_CREW);
                                          if (res.ok) {
                                            showToast("Rail corridor proposed.", "success");
                                          } else {
                                            showToast(`Failed to propose rail corridor: ${res.reason.replace(/_/g, " ")}`, "danger");
                                          }
                                        }}
                                        style={{ paddingVertical: 6, paddingHorizontal: 10, backgroundColor: MAP.ink, alignSelf: "flex-start", borderRadius: 3 }}
                                      >
                                        <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 9, color: MAP.parchment }}>PROPOSE CORRIDOR</Text>
                                      </Pressable>
                                    </View>
                                  );
                                })()
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })()}

                    {WORLD_ACTIONS.filter((a) => a.available(selectedLocation, stateRef.current, getEffectiveStatus(selectedLocation))).map((action) => {
                      const timing = Object.prototype.hasOwnProperty.call(LOCATION_ACTION_RULES, action.id)
                        ? getLocationActionCostTiming(stateRef.current, action.id as LocationActionId)
                        : getWorldActionCostTiming(action, selectedLocation, stateRef.current);
                      const canAfford = timing.activationAffordable !== false;
                      const onCooldown = timing.phase === "cooldown";
                      const disabled = !canAfford || onCooldown;
                      const encChance = ["scout", "trade", "aid", "raid"].includes(action.id) ? getEncounterChance(action.id, selectedLocation, stateRef.current, selZones) : 0;
                      return (
                        <Pressable
                          key={action.id}
                          style={({ pressed }) => [
                            styles.actionBtn,
                            pressed && styles.actionBtnPressed,
                            disabled && styles.actionBtnDisabled,
                          ]}
                          onPress={() => handleAction(action, selectedLocation)}
                          disabled={disabled}
                        >
                          <View style={styles.actionBtnLeft}>
                            <Feather name={action.icon as any} size={14} color={!disabled ? MAP.ink : MAP.inkLight} />
                            <View>
                              <Text style={[styles.actionBtnLabel, disabled && { color: MAP.inkLight }]}>
                                {action.label}
                              </Text>
                              <Text style={styles.actionBtnDesc}>{action.description}</Text>
                              {onCooldown ? (
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: MAP.orange, marginTop: 1 }}>
                                  On cooldown · ready in {timing.cooldownRemainingTicks} tick{timing.cooldownRemainingTicks === 1 ? "" : "s"}
                                </Text>
                              ) : encChance > 0 && (
                                <Text style={{ fontFamily: "Inter_400Regular", fontSize: 8, color: encChance > 25 ? MAP.orange : MAP.inkLight, marginTop: 1 }}>
                                  Encounter risk: {encChance}%
                                </Text>
                              )}
                            </View>
                          </View>
                          <Text style={[styles.actionBtnCost, !canAfford && { color: MAP.red }]}>
                            {timing.upfrontCostCredits.toLocaleString()}c
                          </Text>
                          <View style={{ flexBasis: "100%" }}>
                            <ActionCostTimingReadout model={timing} includeBehavior compact />
                          </View>
                        </Pressable>
                      );
                    })}
                    {actionResult && (
                      <View style={styles.actionResultBox}>
                        <Feather name="terminal" size={12} color={MAP.sepia} />
                        <Text style={styles.actionResultText}>{actionResult}</Text>
                      </View>
                    )}
                    {encounterResult && (
                      <View style={[styles.actionResultBox, { borderColor: MAP.orange + "60", backgroundColor: MAP.orange + "10" }]}>
                        <Feather name="alert-triangle" size={12} color={MAP.orange} />
                        <Text style={[styles.actionResultText, { color: MAP.orange }]}>{encounterResult}</Text>
                      </View>
                    )}
                  </View>
                  );
                })()}

                {(() => {
                  const locBonuses = zoneBonuses.filter((b) => b.locationName === selectedLocation?.name);
                  if (locBonuses.length === 0) return null;
                  return (
                    <View style={styles.connectedSection}>
                      <Text style={styles.connectedHeader}>ZONE CONTROL BONUSES</Text>
                      {locBonuses.map((b) => (
                        <View key={b.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <Text style={{ fontFamily: "Inter_400Regular", fontSize: 10, color: MAP.inkFaded }}>{b.reason}</Text>
                          <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 10, color: MAP.green }}>+{b.amount} {b.type}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })()}

                {locationEvents.length > 0 && (
                  <View style={styles.locationEventsSection}>
                    <Text style={styles.locationEventsTitle}>RECENT INTEL</Text>
                    {locationEvents.map((evt: any, i: number) => (
                      <View
                        key={i}
                        style={styles.locationEventItem}
                        testID={`world-map-location-recent-intel-${evt.event ?? i}`}
                      >
                        <Text style={styles.locationEventTick}>T{evt.tick}</Text>
                        <Text style={styles.locationEventText}>
                          {`${String(evt.type ?? evt.event ?? "event").toUpperCase()} RECORD`}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {showEventLog && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setShowEventLog(false)}>
          <Pressable style={styles.modalOverlay} onPress={() => setShowEventLog(false)}>
            <Pressable style={[styles.eventLogPanel, { width: Math.min(screenW - 32, 400), maxHeight: screenH * 0.75 }]} onPress={() => {}}>
              <View style={styles.eventLogHeader}>
                <Text style={styles.eventLogTitle}>WORLD INTEL LOG</Text>
                <Pressable onPress={() => setShowEventLog(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close world intel log">
                  <Feather name="x" size={18} color={MAP.inkLight} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: screenH * 0.6 }}>
                {worldEventLog.length === 0 && (
                  <Text style={styles.eventLogEmpty}>No world events recorded.</Text>
                )}
                {[...worldEventLog].reverse().map((evt, i) => (
                  <View key={i} style={styles.eventLogItem} testID={`world-map-event-log-item-${evt.event ?? i}`}>
                    <View style={styles.eventLogItemHeader}>
                      <Text style={[styles.eventLogType, {
                        color: evt.type === "conflict" ? MAP.red
                          : evt.type === "discovery" ? MAP.green
                          : evt.type === "broadcast" ? MAP.blue
                          : evt.type === "distress" ? MAP.orange
                          : evt.type === "weather" ? MAP.blueFaded
                          : evt.type === "rumor" ? MAP.sepia
                          : MAP.inkFaded,
                      }]}>
                        {evt.type.toUpperCase()}
                      </Text>
                      <Text style={styles.eventLogTick}>Tick {evt.tick}</Text>
                    </View>
                    <Text style={styles.eventLogItemTitle}>
                      {evt.revealed ? "LOCATION IDENTIFIED" : "NO LOCATION CONFIRMED"}
                    </Text>
                    {evt.revealed && (
                      <Text
                        style={styles.eventLogRevealed}
                        testID={`world-map-event-log-revealed-${evt.revealed}`}
                      >
                        {">"} Discovered: {LOCATION_INDEX.get(evt.revealed)?.name ?? evt.revealed}
                      </Text>
                    )}
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <ContextMenu
        visible={ctxMenu.visible}
        position={ctxMenu.position}
        items={ctxMenuItems}
        onSelect={handleCtxMenuSelect}
        onDismiss={() => setCtxMenu((prev) => ({ ...prev, visible: false }))}
      />

      {Platform.OS === "web" && (
        <View style={styles.keyHintBar}>
          <Text style={styles.keyHintText}>WASD/Arrows: Pan | +/-: Zoom | Esc: Close | Right-click: Quick Actions</Text>
        </View>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MAP.parchmentDark,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: MAP.parchmentLight,
    borderBottomWidth: 2,
    borderBottomColor: MAP.borderWorn,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: MAP.ink,
    letterSpacing: 3,
  },
  compassRose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: MAP.sepia,
    alignItems: "center",
    justifyContent: "center",
  },
  compassText: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: MAP.sepia,
  },
  headerStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 2,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: MAP.inkFaded,
    flex: 1,
  },
  statPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statPillText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    backgroundColor: MAP.parchment,
    borderBottomWidth: 1,
    borderBottomColor: MAP.borderWorn + "80",
    zIndex: 10,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: MAP.borderWorn,
    backgroundColor: MAP.parchmentLight + "80",
  },
  filterChipActive: {
    borderColor: MAP.sepia,
    backgroundColor: MAP.sepia + "20",
  },
  filterDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  filterChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: MAP.inkLight,
    letterSpacing: 1,
  },
  filterChipTextActive: {
    color: MAP.ink,
  },
  eventLogBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginLeft: 8,
    marginRight: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: MAP.sepia,
    borderRadius: 4,
    backgroundColor: MAP.parchmentLight + "80",
  },
  eventLogBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: MAP.sepia,
    letterSpacing: 1,
  },
  legendBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: MAP.parchmentLight,
    borderBottomWidth: 1,
    borderBottomColor: MAP.borderWorn + "60",
    flexWrap: "wrap",
    gap: 12,
    zIndex: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: MAP.inkFaded,
  },
  saProspectChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 0.8,
    borderStyle: "dashed",
    borderColor: MAP.sepia + "AA",
    backgroundColor: MAP.parchmentLight + "E6",
  },
  saProspectChipText: {
    fontFamily: "Inter_700Bold",
    fontSize: 8,
    letterSpacing: 1,
    color: MAP.sepia,
  },
  mapViewport: {
    flex: 1,
    overflow: "hidden",
    backgroundColor: MAP.parchment,
  },
  mapContainer: {
    width: MAP_W + 100,
    height: MAP_H + 100,
  },
  mapBackground: {
    width: MAP_W + 100,
    height: MAP_H + 100,
    backgroundColor: "transparent",
  },
  mapFrame: {
    position: "absolute",
    left: CONTENT_PAD_X - MAP_FRAME_PADDING,
    top: CONTENT_PAD_Y - MAP_FRAME_PADDING,
    width: CONTENT_W + MAP_FRAME_PADDING * 2,
    height: CONTENT_H + MAP_FRAME_PADDING * 2,
    backgroundColor: MAP.parchment,
    borderWidth: 2,
    borderColor: MAP.borderWorn,
  },
  gridOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    width: MAP_W + 100,
    height: MAP_H + 100,
  },
  mapCartouche: {
    position: "absolute",
    bottom: 20,
    right: 20,
    pointerEvents: "none" as any,
  },
  cartoucheBorder: {
    borderWidth: 1.5,
    borderColor: MAP.sepia + "60",
    borderRadius: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: MAP.parchment + "30",
    alignItems: "center",
  },
  cartoucheTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: MAP.ink,
    letterSpacing: 2.5,
    textAlign: "center",
  },
  cartoucheDivider: {
    width: 60,
    height: 1,
    backgroundColor: MAP.sepia + "50",
    marginVertical: 4,
  },
  cartoucheSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 6,
    color: MAP.inkLight + "80",
    letterSpacing: 1.5,
    textAlign: "center",
  },
  cartoucheDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 5,
    color: MAP.inkLight + "50",
    letterSpacing: 1,
    marginTop: 2,
    textAlign: "center",
  },
  scaleBarWrap: {
    position: "absolute",
    bottom: 20,
    left: 55,
    pointerEvents: "none" as any,
  },
  scaleBar: {
    flexDirection: "row",
    height: 4,
    width: 80,
    borderWidth: 0.5,
    borderColor: MAP.inkLight + "60",
  },
  scaleSegment: {
    flex: 1,
    backgroundColor: MAP.inkLight + "40",
  },
  scaleLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: 80,
    marginTop: 1,
  },
  scaleLabelText: {
    fontFamily: "Inter_400Regular",
    fontSize: 5,
    color: MAP.inkLight + "70",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(42,31,14,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  infoPanel: {
    backgroundColor: MAP.parchmentLight,
    borderWidth: 2,
    borderColor: MAP.borderWorn,
    borderRadius: 8,
    padding: 16,
  },
  infoPanelHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  infoPanelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  infoPanelTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: MAP.ink,
    flex: 1,
  },
  infoPanelTypeBadge: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
    marginLeft: 20,
  },
  infoPanelType: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: MAP.inkLight,
    letterSpacing: 1.5,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    letterSpacing: 1,
  },
  infoPanelDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: MAP.inkFaded,
    lineHeight: 19,
    marginBottom: 12,
  },
  infoStats: {
    borderTopWidth: 1,
    borderTopColor: MAP.borderWorn + "60",
    paddingTop: 8,
    gap: 4,
  },
  infoStatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 4,
  },
  infoStatLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: MAP.inkLight,
    letterSpacing: 1,
  },
  infoStatVal: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: MAP.ink,
  },
  connectedSection: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: MAP.borderWorn + "60",
    paddingTop: 8,
  },
  connectedHeader: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: MAP.inkLight,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  connectedList: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: MAP.inkFaded,
    lineHeight: 17,
  },
  saRegionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 8,
  },
  saRegionBullet: {
    width: 6,
    height: 6,
    borderRadius: 1,
    marginTop: 5,
    backgroundColor: MAP.orange + "AA",
    transform: [{ rotate: "45deg" }],
  },
  saRegionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  saRegionName: {
    fontFamily: "Inter_700Bold",
    fontSize: 12,
    color: MAP.ink,
    letterSpacing: 0.5,
  },
  saRegionBiome: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 8,
    color: MAP.sepia,
    letterSpacing: 1,
  },
  saRegionNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: MAP.inkFaded,
    lineHeight: 16,
    marginTop: 2,
  },
  actionsSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: MAP.borderWorn + "60",
    paddingTop: 10,
  },
  actionsSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: MAP.sepia,
    letterSpacing: 2,
    marginBottom: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: MAP.borderWorn,
    borderRadius: 4,
    backgroundColor: MAP.parchment,
  },
  actionBtnPressed: {
    backgroundColor: MAP.parchmentDark,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  actionBtnLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  actionBtnLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: MAP.ink,
    letterSpacing: 0.5,
  },
  actionBtnDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: MAP.inkLight,
    marginTop: 1,
  },
  actionBtnCost: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: MAP.sepia,
    marginLeft: 8,
  },
  actionResultBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 4,
    padding: 8,
    backgroundColor: MAP.parchment,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: MAP.sepia + "40",
  },
  actionResultText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: MAP.ink,
    lineHeight: 16,
    flex: 1,
  },
  locationEventsSection: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: MAP.borderWorn + "60",
    paddingTop: 8,
  },
  locationEventsTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: MAP.sepia,
    letterSpacing: 2,
    marginBottom: 6,
  },
  locationEventItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  locationEventTick: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    color: MAP.inkLight,
    width: 32,
  },
  locationEventText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: MAP.inkFaded,
    flex: 1,
  },
  eventLogPanel: {
    backgroundColor: MAP.parchmentLight,
    borderWidth: 2,
    borderColor: MAP.borderWorn,
    borderRadius: 8,
    padding: 16,
  },
  eventLogHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: MAP.borderWorn + "60",
    paddingBottom: 8,
  },
  eventLogTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: MAP.ink,
    letterSpacing: 2,
  },
  eventLogScroll: {},
  eventLogEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: MAP.inkLight,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20,
  },
  eventLogItem: {
    borderBottomWidth: 1,
    borderBottomColor: MAP.borderWorn + "40",
    paddingVertical: 8,
  },
  eventLogItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  eventLogType: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 9,
    letterSpacing: 1,
  },
  eventLogTick: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: MAP.inkLight,
  },
  eventLogItemTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: MAP.ink,
    marginBottom: 2,
  },
  eventLogItemDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: MAP.inkFaded,
    lineHeight: 16,
  },
  eventLogRevealed: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: MAP.green,
    marginTop: 4,
  },
  minimap: {
    position: "absolute",
    bottom: 12,
    right: 12,
    width: MINI_W,
    backgroundColor: MAP.parchment + "E8",
    borderWidth: 1.5,
    borderColor: MAP.borderWorn,
    borderRadius: 4,
    padding: 2,
    elevation: 5,
  },
  minimapLegendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  minimapLegendColumn: {
    flexDirection: "column",
    gap: 2,
    paddingHorizontal: 3,
    paddingTop: 2,
    paddingBottom: 1,
  },
  minimapLegendChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  minimapLegendChipExpanded: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  minimapLegendText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: MAP_SIZING.minimap.legendText,
    color: MAP.inkLight,
    letterSpacing: 1,
  },
  minimapInner: {
    width: MINI_W - 4,
    height: MINI_H - 4,
    backgroundColor: MAP.parchmentDark + "80",
    borderRadius: 2,
  },
  minimapLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: MAP_SIZING.minimap.titleText,
    color: MAP.inkLight,
    letterSpacing: 1.5,
    textAlign: "center",
    marginTop: 2,
  },
  minimapToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    marginTop: 1,
  },
  tutorialOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 168,
    zIndex: 50,
    pointerEvents: "box-none",
  },
  mapControls: {
    position: "absolute",
    left: 12,
    bottom: 12,
    backgroundColor: MAP.parchmentLight + "E8",
    borderWidth: 1.5,
    borderColor: MAP.borderWorn,
    borderRadius: 6,
    padding: 4,
    gap: 2,
    elevation: 5,
  },
  mapControlBtn: {
    width: 32,
    height: 32,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: MAP.parchment,
    borderWidth: 1,
    borderColor: MAP.borderWorn + "80",
  },
  mapControlDivider: {
    height: 1,
    backgroundColor: MAP.borderWorn + "60",
    marginVertical: 2,
  },
  dispositionBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: MAP.parchmentDark,
    borderWidth: 1,
    borderColor: MAP.borderWorn + "60",
    overflow: "hidden",
  },
  dispositionBarFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
    opacity: 0.7,
  },
  dispositionBarCenter: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: MAP.inkLight + "60",
    marginLeft: -0.75,
  },
  dispositionBarLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  dispositionBarLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 7,
    letterSpacing: 0.5,
  },
  keyHintBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: MAP.parchmentDark + "E0",
    borderTopWidth: 1,
    borderTopColor: MAP.borderWorn + "40",
    zIndex: 20,
  },
  keyHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: MAP.inkLight + "80",
    letterSpacing: 0.5,
    textAlign: "center",
  },
});

export default withScreenBoundary(WorldMapScreen, "worldmap");
