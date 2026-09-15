// Static content for the main-menu CREDITS modal. Lifted out of
// app/index.tsx so the menu file stays focused on layout + screen wiring,
// and so credits can be edited without scrolling through 80 lines of JSX.
//
// `colorKey` is a token resolved against the active palette by the renderer
// (so credits respect colorblind palette swaps). Icons are Feather-family
// names except for the optional `link.iconKind: "mcicon"` row marker, which
// is rendered with MaterialCommunityIcons (used today only for the Steam
// glyph next to the Warsim link).
//
// Icon name types are pulled directly from the Feather and
// MaterialCommunityIcons component prop signatures so a typo in this file
// (e.g. iconName: "heartt") fails at compile time instead of at runtime.

import type React from "react";
import type { Feather, MaterialCommunityIcons } from "@expo/vector-icons";

export type FeatherIconName = React.ComponentProps<typeof Feather>["name"];
export type MaterialCommunityIconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

export type CreditColorKey = "accent" | "warning" | "info" | "danger" | "textMuted";

export type CreditLink =
  | { label: string; url: string; iconKind: "feather"; iconName: FeatherIconName }
  | { label: string; url: string; iconKind: "mcicon"; iconName: MaterialCommunityIconName };

export type CreditEntry = {
  id: string;
  name: string;
  blurb: string;
  iconName: FeatherIconName; // Feather glyph for the row badge
  colorKey: CreditColorKey;
  link?: CreditLink;
};

export type CreditSection = {
  id: string;
  heading: string; // rendered with the "// HEADING" prefix already baked in
  intro: string;
  entries: CreditEntry[];
};

export const CREDITS_SECTIONS: CreditSection[] = [
  {
    id: "development",
    heading: "// DEVELOPMENT",
    intro: "MegaCity: City Commander is an independent project.",
    entries: [
      {
        id: "sister",
        name: "My Sister",
        blurb:
          "For showing support by trying to buy the game regardless of not knowing anything about it. That's family.",
        iconName: "heart",
        colorKey: "accent",
      },
    ],
  },
  {
    id: "inspirations",
    heading: "// INSPIRATIONS & ACKNOWLEDGEMENTS",
    intro: "The giants whose shoulders this game stands on.",
    entries: [
      {
        id: "huw2k8",
        name: "Huw Millward (Huw2k8)",
        blurb:
          "For his original engagement, his encouragement, his willingness to help, and for the masterpiece of coding that is Warsim: The Realm of Aslona. A one-man army of procedural generation and limitless ambition. This game would not exist without his inspiration.",
        iconName: "heart",
        colorKey: "warning",
        link: {
          label: "Warsim on Steam",
          url: "https://store.steampowered.com/app/659540/Warsim_The_Realm_of_Aslona/",
          iconKind: "mcicon",
          iconName: "steam",
        },
      },
      {
        id: "2000ad",
        name: "2000AD & Judge Dredd Comics",
        blurb:
          "Decades of dystopian megacity storytelling, total law enforcement, and the question nobody asked: what if cops had even MORE authority? Mega-City One walked so MegaCity could stumble.",
        iconName: "book-open",
        colorKey: "info",
      },
      {
        id: "orwell-1984",
        name: "George Orwell — 1984",
        blurb:
          "The blueprint for surveillance states, wrongthink legislation, and brainpretzel training centers everywhere. We renamed all his stuff but we know. He knows. The snitchscreens know.",
        iconName: "eye",
        colorKey: "danger",
      },
      {
        id: "bradbury-451",
        name: "Ray Bradbury — Fahrenheit 451",
        blurb:
          "For the radical idea that burning books might not actually solve your problems. MegaCity's Book Burning Furnace respectfully disagrees, but we appreciate the warning.",
        iconName: "thermometer",
        colorKey: "accent",
      },
    ],
  },
];

// Placeholder block shown after the development section. Kept here so the
// renderer doesn't need to invent its own copy.
export const CREDITS_COMING_SOON = {
  title: "MORE TO COME",
  body: "Names will appear here as supporters join.",
};
