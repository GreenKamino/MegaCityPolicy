import type { InteractionMenuGroup } from "@/components/InteractionMenu";
import {
  PERSONAL_ACTIONS,
  PERSONAL_ACTOR_ACTION_ORDER,
  evaluatePersonalAction,
  formatPersonalActionSubtitle,
  type PersonalActionHistory,
} from "@/engine/interactionMenu";

// Captain personal actions are shared by the Character dossier and the
// standalone Retinue route so cooldown and affordability feedback cannot drift
// between the two entry points.
export function buildCaptainInteractionGroups(
  captainId: string,
  credits: number,
  personalCooldowns: Record<string, number> | undefined,
  personalActionHistory: PersonalActionHistory | undefined,
  totalTicks: number,
): InteractionMenuGroup[] {
  return [
    {
      key: "personal",
      label: "PERSONAL",
      options: PERSONAL_ACTOR_ACTION_ORDER.map((id) => {
        const def = PERSONAL_ACTIONS[id];
        const elig = evaluatePersonalAction(id, credits, {
          target: { kind: "captain", id: captainId },
          cooldowns: personalCooldowns,
          history: personalActionHistory,
          totalTicks,
        });
        return {
          id,
          label: def.label,
          subtitle: formatPersonalActionSubtitle("captain", id, {
            target: { kind: "captain", id: captainId },
            history: personalActionHistory,
            totalTicks,
          }),
          variant: def.variant,
          eligible: elig.eligible,
          reason: elig.reason,
        };
      }),
    },
  ];
}