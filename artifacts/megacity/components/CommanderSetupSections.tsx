import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";

import Insignia from "@/components/Insignia";
import { PortraitPicker } from "@/components/PortraitPicker";
import type { ThemePalette } from "@/context/ThemeContext";
import {
  COMMANDER_ORIGINS,
  type CommanderOriginId,
} from "@/engine/commanderOrigins";
import {
  PLAYER_FACTION_BG_PALETTE,
  PLAYER_FACTION_GLYPHS,
  PLAYER_FACTION_MOTTO_MAX,
  PLAYER_FACTION_NAME_MAX,
  PLAYER_FACTION_PALETTE,
  rollPlayerFactionMotto,
  type PlayerFactionGlyph,
  type PlayerFactionKey,
} from "@/engine/playerFaction";
import type { GameplayMode } from "@/engine/types";
import type { StartingRegion } from "@/engine/worldMap";
import { pickCustomPortrait } from "@/utils/portraitUpload";
import { getPortrait } from "@/utils/portraits";

export type SetupStyles = Record<string, any>;
export type CommanderSex = "male" | "female" | "other";
export type ProfileAttributeKey =
  | "authority"
  | "intelligence"
  | "charisma"
  | "combat"
  | "endurance";
export type ProfileAttributes = Record<ProfileAttributeKey, number>;
export type StartStyle = "guided" | "veteran";

type ShowModal = (
  title: string,
  message: string,
  actions: Array<{ text: string; style?: "cancel" | "destructive" | "default"; onPress?: () => void }>,
) => void;

export interface CommanderIdentitySectionProps {
  styles: SetupStyles;
  Colors: ThemePalette;
  name: string;
  age: number;
  sex: CommanderSex;
  portraitId: string;
  customPortrait: string | null;
  backstory: string;
  onNameChange: (value: string) => void;
  onAgeChange: (value: number) => void;
  onSexChange: (value: CommanderSex) => void;
  onPortraitChange: (value: string) => void;
  onCustomPortraitChange: (value: string | null) => void;
  onBackstoryChange: (value: string) => void;
  showModal: ShowModal;
  showHeading?: boolean;
}

export function CommanderIdentitySection({
  styles,
  Colors,
  name,
  age,
  sex,
  portraitId,
  customPortrait,
  backstory,
  onNameChange,
  onAgeChange,
  onSexChange,
  onPortraitChange,
  onCustomPortraitChange,
  onBackstoryChange,
  showModal,
  showHeading = false,
}: CommanderIdentitySectionProps) {
  return (
    <View>
      {showHeading && (
        <>
          <Text style={[styles.fieldLabel, { fontSize: 14, marginBottom: 6 }]}>
            01 — COMMANDER IDENTITY
          </Text>
          <Text style={styles.stepDesc}>
            Define who will hold the badge. These details belong to your commander and carry into every city they lead.
          </Text>
        </>
      )}

      <Text style={styles.fieldLabel}>COMMANDER NAME</Text>
      <TextInput
        style={styles.textInput}
        value={name}
        onChangeText={onNameChange}
        placeholderTextColor={Colors.textMuted}
        maxLength={30}
        autoCorrect={false}
        accessibilityLabel="Commander name"
      />

      <Text style={styles.fieldLabel}>AGE</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <Pressable
          onPress={() => onAgeChange(Math.max(18, age - 1))}
          style={styles.ageBtn}
          accessibilityRole="button"
          accessibilityLabel="Decrease age"
        >
          <Feather name="minus" size={14} color={Colors.accent} />
        </Pressable>
        <Text style={{ color: Colors.accent, fontFamily: "Inter_700Bold", fontSize: 20, minWidth: 40, textAlign: "center" }}>
          {age}
        </Text>
        <Pressable
          onPress={() => onAgeChange(Math.min(80, age + 1))}
          style={styles.ageBtn}
          accessibilityRole="button"
          accessibilityLabel="Increase age"
        >
          <Feather name="plus" size={14} color={Colors.accent} />
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>SEX</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {(["male", "female", "other"] as const).map((option) => (
          <Pressable
            key={option}
            onPress={() => onSexChange(option)}
            accessibilityRole="button"
            accessibilityLabel={`Commander sex: ${option}`}
            accessibilityState={{ selected: sex === option }}
            style={[styles.sexBtn, sex === option && styles.sexBtnActive]}
          >
            <Text style={[styles.sexBtnText, sex === option && styles.sexBtnTextActive]}>
              {option.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>PORTRAIT</Text>
      <View style={{ alignItems: "center", marginBottom: 8 }}>
        <View style={{ width: 110, height: 110, borderRadius: 8, borderWidth: 1, borderColor: Colors.accent, overflow: "hidden", backgroundColor: Colors.bgCard }}>
          {customPortrait ? (
            <Image
              source={{ uri: customPortrait }}
              style={{ width: 110, height: 110 }}
              resizeMode="cover"
              accessibilityLabel="Uploaded portrait preview"
            />
          ) : getPortrait(portraitId) ? (
            <Image
              source={getPortrait(portraitId)!}
              style={{ width: 110, height: 110 }}
              resizeMode="cover"
              accessibilityLabel="Selected portrait preview"
            />
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginBottom: 8 }}>
        <Pressable
          onPress={async () => {
            const result = await pickCustomPortrait();
            if (result.ok) {
              onCustomPortraitChange(result.dataUri);
            } else if (result.reason === "permission") {
              showModal("PHOTO ACCESS NEEDED", "Allow photo library access in your device settings to upload a portrait.", [{ text: "OK", style: "cancel" }]);
            } else if (result.reason === "invalid") {
              showModal("UPLOAD FAILED", "That image could not be processed. Try a different photo.", [{ text: "OK", style: "cancel" }]);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Upload a portrait photo"
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bgCard }}
        >
          <Feather name="upload" size={13} color={Colors.accent} />
          <Text style={{ color: Colors.text, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>UPLOAD PHOTO</Text>
        </Pressable>
        {customPortrait ? (
          <Pressable
            onPress={() => onCustomPortraitChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Remove uploaded photo"
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 4, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg }}
          >
            <Feather name="x" size={13} color={Colors.textMuted} />
            <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>REMOVE</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ marginBottom: 16 }}>
        <PortraitPicker
          selectedId={customPortrait ? undefined : portraitId}
          onSelect={(id) => {
            onPortraitChange(id);
            onCustomPortraitChange(null);
          }}
        />
      </View>

      <Text style={styles.fieldLabel}>BACKSTORY (OPTIONAL)</Text>
      <TextInput
        style={[styles.textInput, { minHeight: 70, textAlignVertical: "top" }]}
        value={backstory}
        onChangeText={onBackstoryChange}
        placeholder="Optional commander note"
        placeholderTextColor={Colors.textMuted}
        maxLength={400}
        multiline
        autoCorrect={false}
        accessibilityLabel="Commander backstory"
      />
    </View>
  );
}

export interface CommanderAttributesSectionProps {
  styles: SetupStyles;
  Colors: ThemePalette;
  attributes: ProfileAttributes;
  pointsLeft: number;
  onRoll: () => void;
  onAdjust: (key: ProfileAttributeKey, delta: number) => void;
  showHeading?: boolean;
}

export function CommanderAttributesSection({
  styles,
  Colors,
  attributes,
  pointsLeft,
  onRoll,
  onAdjust,
  showHeading = false,
}: CommanderAttributesSectionProps) {
  return (
    <View>
      {showHeading && (
        <Text style={[styles.fieldLabel, { fontSize: 14, marginTop: 24, marginBottom: 6 }]}>
          02 — ATTRIBUTES
        </Text>
      )}
      <Text style={styles.stepDesc}>Roll the dice or spend bonus points to fine-tune your starting attributes.</Text>
      <View style={styles.rollRow}>
        <Pressable onPress={onRoll} style={styles.rollBtn} accessibilityRole="button" accessibilityLabel="Roll commander attributes">
          <MaterialCommunityIcons name="dice-multiple" size={18} color={Colors.bg} />
          <Text style={styles.rollBtnText}>ROLL DICE</Text>
        </Pressable>
        <Text style={styles.pointsLeft}>BONUS POINTS: {pointsLeft}</Text>
      </View>
      {(Object.keys(attributes) as ProfileAttributeKey[]).map((attribute) => (
        <View key={attribute} style={styles.attrRow}>
          <Text style={styles.attrName}>{attribute.toUpperCase()}</Text>
          <View style={styles.attrControls}>
            <Pressable
              onPress={() => onAdjust(attribute, -1)}
              accessibilityRole="button"
              accessibilityLabel={`Decrease ${attribute}`}
              style={[styles.attrBtn, attributes[attribute] <= 1 && styles.attrBtnDisabled]}
            >
              <Text style={styles.attrBtnText}>-</Text>
            </Pressable>
            <View style={styles.attrValueWrap}>
              <Text style={styles.attrValue}>{attributes[attribute]}</Text>
              <View style={styles.attrBar}>
                <View style={[styles.attrBarFill, { width: `${attributes[attribute] * 10}%` }]} />
              </View>
            </View>
            <Pressable
              onPress={() => onAdjust(attribute, 1)}
              accessibilityRole="button"
              accessibilityLabel={`Increase ${attribute}`}
              style={[styles.attrBtn, (pointsLeft <= 0 || attributes[attribute] >= 10) && styles.attrBtnDisabled]}
            >
              <Text style={styles.attrBtnText}>+</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

export interface CommanderTraitsSectionProps {
  styles: SetupStyles;
  Colors: ThemePalette;
  traits: string[];
  availableTraits: string[];
  onToggle: (trait: string) => void;
  showHeading?: boolean;
}

export function CommanderTraitsSection({
  styles,
  Colors,
  traits,
  availableTraits,
  onToggle,
  showHeading = false,
}: CommanderTraitsSectionProps) {
  return (
    <View>
      {showHeading && (
        <Text style={[styles.fieldLabel, { fontSize: 14, marginTop: 24, marginBottom: 6 }]}>
          03 — TRAITS
        </Text>
      )}
      <Text style={styles.stepDesc}>Select up to 3 traits that define your background.</Text>
      <Text style={styles.traitCount}>{traits.length}/3 SELECTED</Text>
      <View style={styles.traitGrid}>
        {availableTraits.map((trait) => {
          const selected = traits.includes(trait);
          const disabled = !selected && traits.length >= 3;
          return (
            <Pressable
              key={trait}
              onPress={() => !disabled && onToggle(trait)}
              accessibilityRole="button"
              accessibilityLabel={`Commander trait: ${trait}`}
              accessibilityState={{ selected, disabled }}
              style={[styles.traitChip, selected && styles.traitChipSelected, disabled && styles.traitChipDisabled]}
            >
              <Text style={[styles.traitChipText, selected && styles.traitChipTextSelected]}>
                {trait.toUpperCase()}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export interface FactionOption {
  id: PlayerFactionKey;
  name: string;
  title: string;
  desc: string;
  bonuses: string;
  icon: string;
  color: string;
  artSrc?: any;
}

export interface CitySetupSectionProps {
  styles: SetupStyles;
  Colors: ThemePalette;
  commanderName: string;
  cityName: string;
  slot: number;
  difficulty: string;
  startStyle: StartStyle;
  defaultStartStyle: StartStyle;
  rememberStartStyle: boolean;
  gameplayMode: GameplayMode;
  commanderOrigin: CommanderOriginId;
  faction: PlayerFactionKey;
  region: StartingRegion;
  regions: StartingRegion[];
  factionOptions: FactionOption[];
  factionName: string;
  motto: string;
  primaryColor: string;
  secondaryColor: string;
  glyph: PlayerFactionGlyph;
  onCityNameChange: (value: string) => void;
  onStartStyleChange: (value: StartStyle) => void;
  onRememberStartStyleChange: (value: boolean) => void;
  onGameplayModeChange: (value: GameplayMode) => void;
  onCommanderOriginChange: (value: CommanderOriginId) => void;
  onFactionChange: (value: PlayerFactionKey) => void;
  onRegionChange: (value: StartingRegion) => void;
  onFactionNameChange: (value: string) => void;
  onMottoChange: (value: string) => void;
  onPrimaryColorChange: (value: string) => void;
  onSecondaryColorChange: (value: string) => void;
  onGlyphChange: (value: PlayerFactionGlyph) => void;
}

export function CitySetupSection({
  styles,
  Colors,
  commanderName,
  cityName,
  slot,
  difficulty,
  startStyle,
  defaultStartStyle,
  rememberStartStyle,
  gameplayMode,
  commanderOrigin,
  faction,
  region,
  regions,
  factionOptions,
  factionName,
  motto,
  primaryColor,
  secondaryColor,
  glyph,
  onCityNameChange,
  onStartStyleChange,
  onRememberStartStyleChange,
  onGameplayModeChange,
  onCommanderOriginChange,
  onFactionChange,
  onRegionChange,
  onFactionNameChange,
  onMottoChange,
  onPrimaryColorChange,
  onSecondaryColorChange,
  onGlyphChange,
}: CitySetupSectionProps) {
  const selectRegion = (offset: number) => {
    const index = regions.findIndex((candidate) => candidate.id === region.id);
    onRegionChange(regions[(index + offset + regions.length) % regions.length]);
  };

  return (
    <View>
      <Text style={styles.stepDesc}>
        Commander {commanderName}, designate your new city and choose how this command begins.
      </Text>

      <Text style={styles.fieldLabel}>CITY DESIGNATION</Text>
      <TextInput
        style={styles.textInput}
        allowFontScaling
        value={cityName}
        onChangeText={onCityNameChange}
        placeholder="Enter city name"
        placeholderTextColor={Colors.textMuted}
        maxLength={30}
        autoCorrect={false}
        autoCapitalize="characters"
        accessibilityLabel="City name"
      />

      <Text style={[styles.fieldLabel, { marginTop: 16 }]}>SLOT {slot} — DIFFICULTY: {difficulty.toUpperCase()}</Text>

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>START STYLE</Text>
      <Text style={styles.stepDesc}>
        Guided eases you in with orientation, a calm first day, and on-screen coaching. Veteran skips all of it and drops you straight into command.
      </Text>
      {([
        { id: "guided" as const, name: "GUIDED", icon: "compass", desc: "Full orientation, calm Day 1, objective marker, and tab coach tips.", color: Colors.accent },
        { id: "veteran" as const, name: "VETERAN", icon: "sword-cross", desc: "Full HUD now, no orientation or coaching, crises from the start.", color: Colors.warning },
      ]).map((option) => {
        const selected = startStyle === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onStartStyleChange(option.id)}
            accessibilityRole="button"
            accessibilityLabel={`Start style: ${option.name}`}
            accessibilityState={{ selected }}
            style={[styles.factionCard, selected && { borderColor: option.color + "80", backgroundColor: option.color + "10" }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <MaterialCommunityIcons name={option.icon as any} size={22} color={selected ? option.color : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.factionName, selected && { color: option.color }]}>
                  {option.name}{option.id === "guided" ? "  (RECOMMENDED)" : ""}
                </Text>
              </View>
              {selected && <Feather name="check-circle" size={18} color={option.color} />}
            </View>
            <Text style={styles.factionDesc}>{option.desc}</Text>
          </Pressable>
        );
      })}
      {startStyle !== defaultStartStyle && (
        <Pressable
          onPress={() => onRememberStartStyleChange(!rememberStartStyle)}
          accessibilityRole="checkbox"
          accessibilityLabel={`Make ${startStyle === "veteran" ? "Veteran" : "Guided"} my new default start style`}
          accessibilityState={{ checked: rememberStartStyle }}
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingVertical: 6 }}
        >
          <Feather name={rememberStartStyle ? "check-square" : "square"} size={18} color={rememberStartStyle ? Colors.accent : Colors.textMuted} />
          <Text style={[styles.factionDesc, { flex: 1, marginTop: 0 }, rememberStartStyle && { color: Colors.accent }]}>
            Make {startStyle === "veteran" ? "VETERAN" : "GUIDED"} my new default (just this city if unchecked)
          </Text>
        </Pressable>
      )}

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>PLAY MODE</Text>
      <Text style={styles.stepDesc}>
        Real-time runs the city continuously, even while you are away. Turn-based only advances when you press End Turn, and always stops for a crisis so you can respond.
      </Text>
      {([
        { id: "realtime" as const, name: "REAL-TIME", icon: "play-circle", desc: "The city runs on its own clock and keeps progressing while you are away.", color: Colors.accent },
        { id: "turnbased" as const, name: "TURN-BASED", icon: "step-forward", desc: "Nothing moves until you press End Turn. A crisis always pauses for your call.", color: Colors.warning },
      ]).map((option) => {
        const selected = gameplayMode === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onGameplayModeChange(option.id)}
            accessibilityRole="button"
            accessibilityLabel={`Play mode: ${option.name}`}
            accessibilityState={{ selected }}
            style={[styles.factionCard, selected && { borderColor: option.color + "80", backgroundColor: option.color + "10" }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <MaterialCommunityIcons name={option.icon as any} size={22} color={selected ? option.color : Colors.textMuted} />
              <View style={{ flex: 1 }}><Text style={[styles.factionName, selected && { color: option.color }]}>{option.name}</Text></View>
              {selected && <Feather name="check-circle" size={18} color={option.color} />}
            </View>
            <Text style={styles.factionDesc}>{option.desc}</Text>
          </Pressable>
        );
      })}

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>COMMANDER ORIGIN</Text>
      <Text style={styles.stepDesc}>
        Choose the record that follows you into command. Origins use existing stats and traits, and every advantage carries a cost.
      </Text>
      {COMMANDER_ORIGINS.map((origin) => {
        const selected = commanderOrigin === origin.id;
        const accent = origin.id === "none" ? Colors.textSecondary : Colors.accent;
        return (
          <Pressable
            key={origin.id}
            onPress={() => onCommanderOriginChange(origin.id)}
            accessibilityRole="button"
            accessibilityLabel={`Commander origin: ${origin.name}`}
            accessibilityState={{ selected }}
            style={[styles.factionCard, selected && { borderColor: accent + "80", backgroundColor: accent + "10" }]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <MaterialCommunityIcons name={origin.icon as any} size={22} color={selected ? accent : Colors.textMuted} />
              <View style={{ flex: 1 }}><Text style={[styles.factionName, selected && { color: accent }]}>{origin.name}</Text></View>
              {selected && <Feather name="check-circle" size={18} color={accent} />}
            </View>
            <Text style={styles.factionDesc}>{origin.description}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 3 }}>
              <Text style={[styles.factionBonus, { color: Colors.statHigh }]}>{origin.advantage}</Text>
              <Text style={[styles.factionBonus, { color: Colors.warning }]}>{origin.tradeoff}</Text>
            </View>
          </Pressable>
        );
      })}

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>BACKGROUND FACTION</Text>
      <Text style={styles.stepDesc}>This determines your starting title, bonuses, and how factions perceive you.</Text>
      {factionOptions.map((option) => {
        const selected = faction === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => onFactionChange(option.id)}
            style={[styles.factionCard, selected && { borderColor: option.color + "80", backgroundColor: option.color + "10" }, { overflow: "hidden" }]}
          >
            {option.artSrc && (
              <Image source={option.artSrc} style={{ position: "absolute", right: -10, top: -10, width: 90, height: 90, opacity: selected ? 0.15 : 0.06, borderRadius: 6 }} resizeMode="cover" accessible={false} />
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, zIndex: 1 }}>
              <MaterialCommunityIcons name={option.icon as any} size={22} color={selected ? option.color : Colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.factionName, selected && { color: option.color }]}>{option.name}</Text>
                <Text style={styles.factionTitle}>{option.title}</Text>
              </View>
              {selected && <Feather name="check-circle" size={18} color={option.color} />}
            </View>
            <Text style={[styles.factionDesc, { zIndex: 1 }]}>{option.desc}</Text>
            <Text style={[styles.factionBonus, { color: option.color, zIndex: 1 }]}>{option.bonuses}</Text>
          </Pressable>
        );
      })}

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>STARTING REGION</Text>
      <Text style={styles.stepDesc}>Sector Command offers several deployment zones. Step through with PREV / NEXT, or roll for a random assignment.</Text>
      <View style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 14, backgroundColor: Colors.bgCard, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.accent }}>{region.name.toUpperCase()}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4 }}>
              Deployment grid ({region.playerX}, {region.playerY}) · {region.initialDiscovered.length} locations pre-scouted
            </Text>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 10, color: Colors.textMuted, marginTop: 6 }}>
              GRID: ({region.playerX}, {region.playerY}) — {region.initialDiscovered.length} locations pre-scouted
            </Text>
            {region.startingBonus?.summary ? (
              <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Feather name="gift" size={12} color={Colors.warning} />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 11, color: Colors.warning, flex: 1 }}>{region.startingBonus.summary}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 8 }}>
          <Pressable onPress={() => selectRegion(-1)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "10", flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Feather name="chevron-left" size={16} color={Colors.accent} />
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.accent }}>PREV</Text>
          </Pressable>
          <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.textMuted }}>{regions.findIndex((candidate) => candidate.id === region.id) + 1} / {regions.length}</Text>
          <Pressable onPress={() => onRegionChange(regions[Math.floor(Math.random() * regions.length)])} accessibilityRole="button" accessibilityLabel="Pick a random starting region" style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "10" }}>
            <MaterialCommunityIcons name="dice-multiple" size={18} color={Colors.accent} />
          </Pressable>
          <Pressable onPress={() => selectRegion(1)} style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 6, borderWidth: 1, borderColor: Colors.accent + "40", backgroundColor: Colors.accent + "10", flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.accent }}>NEXT</Text>
            <Feather name="chevron-right" size={16} color={Colors.accent} />
          </Pressable>
        </View>
      </View>

      <Text style={[styles.fieldLabel, { marginTop: 20 }]}>FACTION IDENTITY</Text>
      <Text style={styles.stepDesc}>Your banner flies above the HUD and stamps every diplomatic broadcast. Cosmetic only.</Text>
      <View style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 14, backgroundColor: Colors.bgCard, marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
          <View style={{ width: 56, height: 56, borderRadius: 6, backgroundColor: secondaryColor, borderWidth: 1, borderColor: primaryColor, justifyContent: "center", alignItems: "center" }}>
            <Insignia id={glyph} size={42} color={primaryColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 14, color: primaryColor, letterSpacing: 1 }}>{(factionName || "UNNAMED").toUpperCase()}</Text>
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary, marginTop: 4, fontStyle: "italic" }}>{motto ? `"${motto}"` : "— no motto —"}</Text>
          </View>
        </View>
        <Text style={styles.fieldLabel}>BANNER NAME</Text>
        <TextInput style={styles.textInput} value={factionName} onChangeText={onFactionNameChange} placeholder="JUSTICE DEPARTMENT" placeholderTextColor={Colors.textMuted} maxLength={PLAYER_FACTION_NAME_MAX} autoCorrect={false} autoCapitalize="characters" accessibilityLabel="Faction banner name" />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
          <Text style={styles.fieldLabel}>MOTTO</Text>
          <Pressable onPress={() => onMottoChange(rollPlayerFactionMotto(motto))} accessibilityLabel="Roll a random motto" style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: Colors.accent, borderRadius: 4 }}>
            <MaterialCommunityIcons name="dice-multiple" size={12} color={Colors.accent} />
            <Text style={{ fontFamily: "Inter_700Bold", fontSize: 9, letterSpacing: 1, color: Colors.accent }}>ROLL</Text>
          </Pressable>
        </View>
        <TextInput style={styles.textInput} value={motto} onChangeText={onMottoChange} placeholder="Order Above All." placeholderTextColor={Colors.textMuted} maxLength={PLAYER_FACTION_MOTTO_MAX} autoCorrect={false} accessibilityLabel="Faction motto" />
        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>PRIMARY COLOR</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PLAYER_FACTION_PALETTE.map((color) => {
            const selected = primaryColor === color.hex;
            return <Pressable key={color.id} onPress={() => onPrimaryColorChange(color.hex)} accessibilityLabel={`Pick color ${color.label}`} style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: color.hex, borderWidth: selected ? 3 : 1, borderColor: selected ? Colors.text : Colors.border }} />;
          })}
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>BACKGROUND COLOR</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PLAYER_FACTION_BG_PALETTE.map((color) => {
            const selected = secondaryColor === color.hex;
            return <Pressable key={color.id} onPress={() => onSecondaryColorChange(color.hex)} accessibilityLabel={`Pick background color ${color.label}`} style={{ width: 36, height: 36, borderRadius: 4, backgroundColor: color.hex, borderWidth: selected ? 3 : 1, borderColor: selected ? Colors.text : Colors.border }} />;
          })}
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 12 }]}>BANNER GLYPH</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {PLAYER_FACTION_GLYPHS.map((option) => {
            const selected = glyph === option.id;
            return (
              <Pressable key={option.id} onPress={() => onGlyphChange(option.id)} accessibilityLabel={`Pick glyph ${option.label}`} style={{ width: 52, height: 52, borderRadius: 4, justifyContent: "center", alignItems: "center", backgroundColor: selected ? primaryColor + "22" : Colors.bg, borderWidth: selected ? 2 : 1, borderColor: selected ? primaryColor : Colors.border }}>
                <Insignia id={option.id} size={36} color={selected ? primaryColor : Colors.textMuted} />
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}