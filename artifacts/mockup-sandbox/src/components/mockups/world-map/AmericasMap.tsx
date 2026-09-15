import "./_group.css";
import { useState, useMemo } from "react";

const MAP_W = 1100;
const MAP_H = 1400;

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
  coastLine: "#8A9DA8",
  sandDark: "#B8A070",
  oceanBg: "#C8D5D9",
};

const AMERICAS = `
  M 155,18 L 140,15 L 120,20 L 105,15 L 90,22 L 75,18 L 60,25
  C 48,30 40,38 35,48
  L 30,60 C 25,70 22,80 28,92
  L 35,100 C 42,108 48,112 42,122
  L 35,132 C 28,142 22,150 18,162
  C 12,178 8,195 15,210
  L 25,222 C 32,228 35,235 30,245
  L 22,258 C 15,272 12,285 18,298
  L 28,308 C 35,318 38,330 32,342
  C 28,355 25,368 30,382
  L 40,395 C 48,405 52,418 48,432
  C 42,448 38,462 42,478
  L 55,490 C 62,498 68,505 72,515
  C 78,528 82,540 78,552
  L 72,562 C 65,570 60,578 58,588

  C 55,600 58,612 68,622
  C 78,632 88,638 95,648
  L 98,660 C 100,672 105,680 115,685
  C 128,692 140,688 150,678
  L 158,668 C 165,658 172,648 182,642
  C 195,635 208,632 218,625
  L 228,615 C 238,605 248,598 262,595

  C 278,592 295,598 308,608
  C 318,618 325,628 335,638
  C 345,645 358,648 372,645
  C 388,640 400,630 408,618
  C 415,605 422,595 432,588
  C 445,582 458,580 472,585
  L 482,592 C 490,600 498,605 508,608

  C 522,612 535,608 545,598
  C 555,588 562,575 572,565
  C 582,555 595,550 608,555
  C 618,558 625,565 632,575
  L 640,588 C 648,598 658,605 670,608
  L 682,610 C 695,612 708,608 718,598
  C 728,588 732,575 730,560
  L 725,545 C 720,530 718,515 722,500
  C 728,485 738,475 750,468
  L 765,458 C 778,452 790,445 798,432
  C 808,418 812,402 808,385
  C 802,368 792,355 778,345
  L 762,338 C 750,332 742,322 740,310
  C 738,295 742,282 752,272
  C 762,262 775,255 788,245
  L 800,235 C 812,225 820,212 822,195
  C 825,178 820,162 808,148
  C 795,135 780,128 762,125
  L 742,122 C 728,120 718,115 712,105
  L 705,92 C 698,82 688,78 675,80
  C 662,82 652,88 642,95
  L 632,105 C 622,112 610,115 598,110
  L 585,102 C 572,98 560,95 548,100
  L 535,108 C 522,115 510,118 498,112
  C 485,105 475,95 462,90
  C 448,85 435,88 422,95
  L 408,105 C 395,112 382,115 368,110
  C 355,105 342,98 328,95
  C 312,92 298,98 285,105
  L 272,115 C 260,122 248,125 235,118
  C 222,112 212,102 198,95
  C 185,90 172,92 162,100
  L 155,108 C 148,115 140,118 130,115
  C 120,112 115,105 115,95
  L 118,80 C 120,68 125,58 132,48
  L 142,35 C 148,28 152,22 155,18 Z

  M 330,618
  C 342,612 358,608 375,612
  C 395,618 412,628 428,642
  C 445,658 458,672 468,688
  C 480,705 495,718 515,728
  C 535,738 552,745 565,758
  C 580,772 592,790 600,810
  C 608,832 612,855 610,878
  C 608,900 600,920 588,938
  C 575,955 558,968 538,975
  C 518,982 498,985 478,988
  C 462,992 450,1000 442,1012
  C 432,1028 428,1045 425,1062
  C 422,1080 418,1098 412,1115
  C 405,1130 395,1142 382,1150
  C 368,1158 355,1160 342,1155
  C 328,1148 318,1135 312,1118
  C 305,1100 302,1082 302,1062
  C 302,1045 305,1030 312,1015
  C 322,998 332,985 340,972
  C 350,958 355,942 355,925
  C 355,908 350,892 340,878
  C 328,862 315,852 298,845
  C 282,840 268,838 255,842
  C 242,848 232,858 225,872
  C 218,888 210,902 198,912
  C 185,920 172,925 158,925
  C 145,922 135,915 128,902
  C 122,888 120,872 122,855
  C 125,838 132,822 142,808
  C 155,795 168,782 182,772
  C 198,762 210,750 218,735
  C 225,718 228,700 225,682
  C 222,665 215,650 205,640
  C 195,632 188,625 185,615
  C 182,605 185,598 195,592
  C 208,588 222,585 238,588
  C 258,590 278,595 298,600
  C 315,605 325,610 330,618 Z
`;

type LocType = "player_city" | "megacity" | "township" | "notable" | "nation" | "resource_node";

interface Location {
  id: string;
  name: string;
  type: LocType;
  ox: number;
  oy: number;
}

const RAW_LOCATIONS: Location[] = [
  { id: "megacity", name: "MEGACITY", type: "player_city", ox: 214, oy: 394 },
  { id: "nova-pacifica", name: "Nova Pacifica", type: "megacity", ox: 141, oy: 330 },
  { id: "iron-khanate", name: "The Iron Khanate", type: "nation", ox: 367, oy: 185 },
  { id: "helix-commune", name: "Helix Commune", type: "megacity", ox: 111, oy: 546 },
  { id: "aureus-dominion", name: "Aureus Dominion", type: "megacity", ox: 284, oy: 198 },
  { id: "verdant-enclave", name: "Verdant Enclave", type: "nation", ox: 62, oy: 719 },
  { id: "null-zone-confederacy", name: "Null Zone Confederacy", type: "nation", ox: 599, oy: 619 },
  { id: "ghost-meridian", name: "Ghost Meridian", type: "megacity", ox: 955, oy: 712 },
  { id: "crimson-reach", name: "Crimson Reach", type: "megacity", ox: 781, oy: 111 },
  { id: "silent-ark", name: "The Silent Ark", type: "nation", ox: 742, oy: 130 },
  { id: "beneath", name: "Beneath", type: "nation", ox: 420, oy: 948 },
  { id: "iron-armada", name: "The Iron Armada", type: "nation", ox: 102, oy: 289 },
  { id: "terminus-prime", name: "Terminus Prime", type: "megacity", ox: 394, oy: 889 },
  { id: "new-olympus", name: "New Olympus", type: "megacity", ox: 699, oy: 106 },
  { id: "panopticon", name: "The Panopticon", type: "megacity", ox: 74, oy: 117 },
  { id: "ashfall-dominion", name: "Ashfall Dominion", type: "megacity", ox: 878, oy: 716 },
  { id: "the-recursion", name: "The Recursion", type: "megacity", ox: 676, oy: 383 },
  { id: "dusthaven", name: "Mexico City", type: "township", ox: 323, oy: 502 },
  { id: "irongate", name: "Irongate", type: "township", ox: 260, oy: 399 },
  { id: "port-sulphur", name: "Port Sulphur", type: "township", ox: 197, oy: 501 },
  { id: "new-eden", name: "New Eden", type: "township", ox: 184, oy: 579 },
  { id: "scrapyard-city", name: "Scrapyard City", type: "township", ox: 743, oy: 486 },
  { id: "blackridge", name: "Blackridge", type: "township", ox: 363, oy: 497 },
  { id: "pilgrim-station", name: "Pilgrim Station", type: "township", ox: 192, oy: 429 },
  { id: "mireholm", name: "Mireholm", type: "township", ox: 131, oy: 738 },
  { id: "vault-town", name: "Vault Town", type: "township", ox: 587, oy: 432 },
  { id: "ember-falls", name: "Ember Falls", type: "township", ox: 734, oy: 573 },
  { id: "rustfield", name: "Rustfield", type: "township", ox: 656, oy: 604 },
  { id: "chem-springs", name: "Chem Springs", type: "township", ox: 191, oy: 690 },
  { id: "fort-stern", name: "Fort Stern", type: "township", ox: 298, oy: 319 },
  { id: "market-crossing", name: "Market Crossing", type: "township", ox: 223, oy: 256 },
  { id: "silo-nine", name: "Silo Nine", type: "township", ox: 673, oy: 423 },
  { id: "candlewick", name: "Candlewick", type: "township", ox: 143, oy: 580 },
  { id: "ashmouth", name: "Ashmouth", type: "township", ox: 742, oy: 671 },
  { id: "scaffold", name: "Scaffold", type: "township", ox: 231, oy: 694 },
  { id: "greywater", name: "Greywater", type: "township", ox: 99, oy: 626 },
  { id: "burnside", name: "Burnside", type: "township", ox: 593, oy: 217 },
  { id: "ghost-relay", name: "Ghost Relay", type: "township", ox: 705, oy: 655 },
  { id: "sunken-arcadia", name: "Sunken Arcadia", type: "township", ox: 44, oy: 788 },
  { id: "the-crucible", name: "The Crucible", type: "township", ox: 770, oy: 642 },
  { id: "sky-haven", name: "Sky Haven", type: "township", ox: 98, oy: 83 },
  { id: "echo-chamber", name: "The Echo Chamber", type: "township", ox: 281, oy: 736 },
  { id: "black-atlantic-rig", name: "Black Atlantic Rig", type: "notable", ox: 94, oy: 400 },
  { id: "cathedral-of-rust", name: "Cathedral of Rust", type: "notable", ox: 258, oy: 462 },
  { id: "monument-of-compliance", name: "Monument of Compliance", type: "notable", ox: 238, oy: 497 },
  { id: "sector-zero-crater", name: "Sector Zero Crater", type: "notable", ox: 285, oy: 432 },
  { id: "undercity-market", name: "Undercity Market", type: "notable", ox: 234, oy: 430 },
  { id: "the-perimeter", name: "Perimeter Wall", type: "notable", ox: 300, oy: 395 },
  { id: "dead-zone-seven", name: "Dead Zone Seven", type: "notable", ox: 654, oy: 564 },
  { id: "sky-needle", name: "Sky Needle", type: "notable", ox: 271, oy: 159 },
  { id: "gene-vault-prime", name: "Gene Vault Prime", type: "notable", ox: 103, oy: 586 },
  { id: "the-glass-desert", name: "The Glass Desert", type: "notable", ox: 820, oy: 667 },
  { id: "bone-road", name: "Bone Road", type: "notable", ox: 242, oy: 537 },
  { id: "signal-grave", name: "Signal Grave", type: "notable", ox: 658, oy: 121 },
  { id: "chrome-cathedral", name: "Chrome Cathedral", type: "notable", ox: 670, oy: 303 },
  { id: "fungal-deeps", name: "Fungal Deeps", type: "notable", ox: 125, oy: 674 },
  { id: "iron-garden", name: "Iron Garden", type: "notable", ox: 585, oy: 472 },
  { id: "echo-bunker", name: "Echo Bunker", type: "notable", ox: 286, oy: 357 },
  { id: "the-screaming-mesa", name: "Screaming Mesa", type: "notable", ox: 696, oy: 615 },
  { id: "the-pit", name: "The Pit", type: "notable", ox: 293, oy: 662 },
  { id: "kharkov-line", name: "Kharkov Line", type: "notable", ox: 722, oy: 249 },
  { id: "old-highway-99", name: "Old Highway 99", type: "notable", ox: 247, oy: 289 },
  { id: "reactor-seven", name: "Reactor Seven", type: "notable", ox: 322, oy: 627 },
  { id: "the-broadcast-tower", name: "Broadcast Tower", type: "notable", ox: 208, oy: 204 },
  { id: "mass-grave-delta", name: "Mass Grave Delta", type: "notable", ox: 702, oy: 342 },
  { id: "trade-nexus-alpha", name: "Trade Nexus Alpha", type: "notable", ox: 207, oy: 294 },
  { id: "frozen-circuit", name: "Frozen Circuit", type: "notable", ox: 823, oy: 225 },
  { id: "abyssal-vent", name: "Abyssal Vent", type: "notable", ox: 889, oy: 803 },
  { id: "the-obelisk-field", name: "Obelisk Field", type: "notable", ox: 350, oy: 459 },
  { id: "graveyard-orbit", name: "Graveyard Orbit", type: "notable", ox: 328, oy: 125 },
  { id: "the-vermillion-lake", name: "Vermillion Lake", type: "notable", ox: 141, oy: 444 },
  { id: "the-hanging-prison", name: "Hanging Prison", type: "notable", ox: 633, oy: 470 },
  { id: "worm-sign", name: "Worm Sign", type: "notable", ox: 950, oy: 753 },
  { id: "tribunal-ruins", name: "Tribunal Ruins", type: "notable", ox: 574, oy: 253 },
  { id: "the-wailing-fields", name: "Wailing Fields", type: "notable", ox: 230, oy: 613 },
  { id: "the-spire-of-names", name: "Spire of Names", type: "notable", ox: 326, oy: 578 },
  { id: "null-zone-bazaar", name: "Null Zone Bazaar", type: "notable", ox: 625, oy: 650 },
  { id: "the-memory-archive", name: "Memory Archive", type: "notable", ox: 213, oy: 334 },
  { id: "petrified-army", name: "Petrified Army", type: "notable", ox: 766, oy: 278 },
  { id: "anchor-point", name: "Anchor Point", type: "notable", ox: 40, oy: 481 },
  { id: "flesh-market", name: "Flesh Market", type: "notable", ox: 607, oy: 546 },
  { id: "the-quiet-zone", name: "Quiet Zone", type: "notable", ox: 272, oy: 697 },
  { id: "the-cradle", name: "The Cradle", type: "notable", ox: 109, oy: 833 },
  { id: "refinery-omega", name: "Refinery Omega", type: "notable", ox: 695, oy: 463 },
  { id: "clock-tower", name: "Clock Tower", type: "notable", ox: 258, oy: 328 },
  { id: "the-parliament-of-crows", name: "Parliament of Crows", type: "notable", ox: 283, oy: 535 },
  { id: "impact-site-phi", name: "Impact Site Phi", type: "notable", ox: 919, oy: 688 },
  { id: "data-cemetery", name: "Data Cemetery", type: "notable", ox: 191, oy: 623 },
  { id: "the-conductor", name: "The Conductor", type: "notable", ox: 603, oy: 281 },
  { id: "blood-falls", name: "Blood Falls", type: "notable", ox: 743, oy: 613 },
  { id: "the-last-library", name: "Last Library", type: "notable", ox: 199, oy: 542 },
  { id: "mirror-lake", name: "Mirror Lake", type: "notable", ox: 147, oy: 152 },
  { id: "the-furnace", name: "The Furnace", type: "notable", ox: 794, oy: 197 },
  { id: "dredge-port", name: "Dredge Port", type: "notable", ox: 59, oy: 419 },
  { id: "thornwall", name: "Thornwall", type: "notable", ox: 247, oy: 216 },
  { id: "copper-hills", name: "Copper Hills", type: "notable", ox: 665, oy: 644 },
  { id: "relay-station-12", name: "Relay Station 12", type: "notable", ox: 597, oy: 679 },
  { id: "glasstown", name: "Glasstown", type: "notable", ox: 341, oy: 859 },
  { id: "piston-camp", name: "Piston Camp", type: "notable", ox: 643, oy: 273 },
  { id: "candleholm", name: "Candleholm", type: "notable", ox: 116, oy: 500 },
  { id: "bunker-84", name: "Bunker 84", type: "notable", ox: 606, oy: 179 },
  { id: "rust-republic", name: "Rust Republic", type: "notable", ox: 353, oy: 898 },
  { id: "sky-citadel", name: "Sky Citadel", type: "notable", ox: 742, oy: 171 },
  { id: "the-drowning-road", name: "Drowning Road", type: "notable", ox: 139, oy: 620 },
  { id: "satellite-graveyard", name: "Satellite Graveyard", type: "notable", ox: 607, oy: 329 },
  { id: "old-parliament", name: "Old Parliament", type: "notable", ox: 338, oy: 378 },
  { id: "vault-zero", name: "Vault Zero", type: "notable", ox: 328, oy: 756 },
  { id: "the-broadcast", name: "The Broadcast", type: "notable", ox: 157, oy: 500 },
  { id: "acid-lake", name: "Acid Lake", type: "notable", ox: 172, oy: 778 },
  { id: "the-antenna-farm", name: "Antenna Farm", type: "notable", ox: 445, oy: 889 },
  { id: "the-wall-of-names", name: "Wall of Names", type: "notable", ox: 325, oy: 165 },
  { id: "reactor-twelve", name: "Reactor Twelve", type: "notable", ox: 690, oy: 146 },
  { id: "the-chorus", name: "The Chorus", type: "notable", ox: 147, oy: 243 },
  { id: "dead-satellite-field", name: "Dead Satellite Field", type: "notable", ox: 601, oy: 394 },
  { id: "the-great-scar", name: "The Great Scar", type: "notable", ox: 266, oy: 632 },
  { id: "bunker-city", name: "Bunker City", type: "notable", ox: 362, oy: 410 },
  { id: "the-hanging-gardens", name: "Hanging Gardens", type: "notable", ox: 47, oy: 589 },
  { id: "engine-block", name: "Engine Block", type: "notable", ox: 706, oy: 502 },
  { id: "quarantine-ring", name: "Quarantine Ring", type: "notable", ox: 609, oy: 506 },
  { id: "the-pillar", name: "The Pillar", type: "notable", ox: 361, oy: 232 },
  { id: "mass-grave-17", name: "Mass Grave 17", type: "notable", ox: 647, oy: 198 },
  { id: "solar-array-east", name: "Solar Array East", type: "notable", ox: 726, oy: 437 },
  { id: "the-maze", name: "The Maze", type: "notable", ox: 896, oy: 762 },
  { id: "weather-station-prime", name: "Weather Station Prime", type: "notable", ox: 265, oy: 252 },
  { id: "the-nursery", name: "The Nursery", type: "notable", ox: 73, oy: 759 },
  { id: "rail-junction-9", name: "Rail Junction 9", type: "notable", ox: 309, oy: 464 },
  { id: "static-forest", name: "Static Forest", type: "notable", ox: 141, oy: 371 },
  { id: "the-eye", name: "The Eye", type: "notable", ox: 384, oy: 929 },
  { id: "pipeline-alpha", name: "Pipeline Alpha", type: "notable", ox: 644, oy: 525 },
  { id: "the-threshold", name: "The Threshold", type: "notable", ox: 746, oy: 217 },
  { id: "overflow-basin", name: "Overflow Basin", type: "notable", ox: 252, oy: 764 },
  { id: "the-museum", name: "The Museum", type: "notable", ox: 187, oy: 364 },
  { id: "crystal-caves", name: "Crystal Caves", type: "notable", ox: 662, oy: 343 },
  { id: "the-orphanage", name: "The Orphanage", type: "notable", ox: 580, oy: 576 },
  { id: "meridian-bridge", name: "Meridian Bridge", type: "notable", ox: 619, oy: 108 },
  { id: "the-cage", name: "The Cage", type: "notable", ox: 333, oy: 261 },
  { id: "salt-flats", name: "Salt Flats", type: "notable", ox: 929, oy: 788 },
  { id: "the-stockpile", name: "The Stockpile", type: "notable", ox: 213, oy: 464 },
  { id: "whalefall", name: "Whalefall", type: "notable", ox: 31, oy: 533 },
  { id: "the-grid", name: "The Grid", type: "notable", ox: 575, oy: 354 },
  { id: "gaslight-alley", name: "Gaslight Alley", type: "notable", ox: 292, oy: 600 },
  { id: "dam-of-saints", name: "Dam of Saints", type: "notable", ox: 111, oy: 171 },
  { id: "the-wound", name: "The Wound", type: "notable", ox: 918, oy: 728 },
  { id: "echo-canyon", name: "Echo Canyon", type: "notable", ox: 187, oy: 238 },
  { id: "the-dock-of-ghosts", name: "Dock of Ghosts", type: "notable", ox: 39, oy: 356 },
  { id: "spore-field", name: "Spore Field", type: "notable", ox: 82, oy: 801 },
  { id: "the-bridge-to-nowhere", name: "Bridge to Nowhere", type: "notable", ox: 734, oy: 533 },
  { id: "cinder-heap", name: "Cinder Heap", type: "notable", ox: 667, oy: 492 },
  { id: "harbor-of-teeth", name: "Harbor of Teeth", type: "notable", ox: 39, oy: 267 },
  { id: "monument-zero", name: "Monument Zero", type: "notable", ox: 642, oy: 158 },
  { id: "rot-garden", name: "Rot Garden", type: "notable", ox: 224, oy: 573 },
  { id: "iron-curtain-wall", name: "Iron Curtain Wall", type: "notable", ox: 692, oy: 219 },
  { id: "the-apothecary", name: "The Apothecary", type: "notable", ox: 153, oy: 703 },
  { id: "the-lighthouse", name: "The Lighthouse", type: "notable", ox: 26, oy: 443 },
  { id: "hollow-mountain", name: "Hollow Mountain", type: "notable", ox: 665, oy: 81 },
  { id: "train-graveyard", name: "Train Graveyard", type: "notable", ox: 334, oy: 337 },
  { id: "the-foundry", name: "The Foundry", type: "notable", ox: 637, oy: 374 },
  { id: "rn-iron-gulch", name: "Iron Gulch", type: "resource_node", ox: 283, oy: 495 },
  { id: "rn-blackwater-seep", name: "Blackwater Seep", type: "resource_node", ox: 620, oy: 585 },
  { id: "rn-verdant-hollow", name: "Verdant Hollow", type: "resource_node", ox: 152, oy: 540 },
  { id: "rn-rust-canyon", name: "Rust Canyon", type: "resource_node", ox: 325, oy: 426 },
  { id: "rn-staghorn-wastes", name: "Staghorn Wastes", type: "resource_node", ox: 232, oy: 654 },
  { id: "rn-aquifer-seven", name: "Aquifer Seven", type: "resource_node", ox: 265, oy: 571 },
  { id: "rn-datacore-crash", name: "Datacore Crash", type: "resource_node", ox: 629, oy: 235 },
  { id: "rn-spore-caves", name: "Spore Caves", type: "resource_node", ox: 86, oy: 664 },
  { id: "rn-pipeline-junction", name: "Pipeline Junction", type: "resource_node", ox: 240, oy: 364 },
  { id: "rn-boneyard-flats", name: "Boneyard Flats", type: "resource_node", ox: 633, oy: 430 },
  { id: "rn-crystal-ridge", name: "Crystal Ridge", type: "resource_node", ox: 170, oy: 277 },
  { id: "rn-marshbloom-delta", name: "Marshbloom Delta", type: "resource_node", ox: 163, oy: 660 },
  { id: "rn-silent-springs", name: "Silent Springs", type: "resource_node", ox: 297, oy: 279 },
  { id: "rn-predator-vale", name: "Predator Vale", type: "resource_node", ox: 684, oy: 535 },
  { id: "rn-bunker-19-wreck", name: "Bunker 19 Wreck", type: "resource_node", ox: 331, oy: 205 },
  { id: "rn-glowing-basin", name: "Glowing Basin", type: "resource_node", ox: 693, oy: 575 },
  { id: "rn-copper-teeth", name: "Copper Teeth", type: "resource_node", ox: 302, oy: 234 },
  { id: "rn-razorback-range", name: "Razorback Range", type: "resource_node", ox: 651, oy: 682 },
];

const BAND_WIDTHS: { y: number; left: number; right: number }[] = [
  { y: 15,   left: 60,  right: 160 },
  { y: 50,   left: 30,  right: 340 },
  { y: 100,  left: 15,  right: 720 },
  { y: 150,  left: 10,  right: 800 },
  { y: 200,  left: 8,   right: 822 },
  { y: 260,  left: 15,  right: 810 },
  { y: 320,  left: 25,  right: 800 },
  { y: 380,  left: 30,  right: 810 },
  { y: 440,  left: 38,  right: 790 },
  { y: 500,  left: 50,  right: 745 },
  { y: 560,  left: 58,  right: 710 },
  { y: 600,  left: 62,  right: 680 },
  { y: 640,  left: 180, right: 640 },
  { y: 700,  left: 170, right: 600 },
  { y: 750,  left: 150, right: 610 },
  { y: 810,  left: 120, right: 615 },
  { y: 870,  left: 128, right: 610 },
  { y: 920,  left: 155, right: 590 },
  { y: 960,  left: 290, right: 545 },
  { y: 1010, left: 300, right: 440 },
  { y: 1060, left: 300, right: 430 },
  { y: 1110, left: 310, right: 415 },
  { y: 1155, left: 340, right: 390 },
];

function getBandBounds(svgY: number): { left: number; right: number } {
  if (svgY <= BAND_WIDTHS[0].y) return BAND_WIDTHS[0];
  if (svgY >= BAND_WIDTHS[BAND_WIDTHS.length - 1].y) return BAND_WIDTHS[BAND_WIDTHS.length - 1];
  for (let i = 0; i < BAND_WIDTHS.length - 1; i++) {
    const a = BAND_WIDTHS[i];
    const b = BAND_WIDTHS[i + 1];
    if (svgY >= a.y && svgY <= b.y) {
      const t = (svgY - a.y) / (b.y - a.y);
      return {
        left: a.left + t * (b.left - a.left),
        right: a.right + t * (b.right - a.right),
      };
    }
  }
  return BAND_WIDTHS[0];
}

function mapToAmericas(ox: number, oy: number): { x: number; y: number } {
  const nx = ox / 1000;
  const ny = oy / 1000;
  const padding = 20;
  const svgY = 25 + ny * 1130;
  const bounds = getBandBounds(svgY);
  const svgX = (bounds.left + padding) + nx * (bounds.right - bounds.left - padding * 2);
  return { x: svgX, y: svgY };
}

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
  { cx: 300, cy: 400, rx: 70, ry: 70, color: C.green, opacity: 0.15, label: "CITY CORE" },
  { cx: 300, cy: 400, rx: 140, ry: 140, color: C.green, opacity: 0.05 },
  { cx: 400, cy: 130, rx: 130, ry: 40, color: C.orange, opacity: 0.07, label: "NORTHERN DEADLANDS" },
  { cx: 350, cy: 890, rx: 90, ry: 40, color: C.sepia, opacity: 0.07, label: "SOUTHERN DEPTHS" },
  { cx: 620, cy: 240, rx: 70, ry: 80, color: C.red, opacity: 0.05, label: "IRON FRONTIER" },
  { cx: 55, cy: 380, rx: 35, ry: 120, color: C.blue, opacity: 0.05, label: "WEST COAST" },
  { cx: 420, cy: 540, rx: 80, ry: 60, color: "#8B2500", opacity: 0.06, label: "IRRADIATED ZONE" },
  { cx: 280, cy: 290, rx: 110, ry: 35, color: C.greenFaded, opacity: 0.05, label: "TRADE CORRIDOR" },
  { cx: 450, cy: 750, rx: 70, ry: 55, color: C.orange, opacity: 0.05, label: "NULL ZONE" },
  { cx: 380, cy: 1020, rx: 50, ry: 40, color: "#8B2500", opacity: 0.05, label: "VERDANT REACHES" },
];

const MOUNTAIN_RANGES = [
  {
    id: "iron-mountains",
    peaks: [[150, 220], [180, 205], [210, 218], [240, 202], [270, 215]] as [number, number][],
    label: "Iron Mountains", lx: 210, ly: 232,
  },
  {
    id: "deadland-ridge",
    peaks: [[440, 120], [470, 105], [500, 118], [530, 102], [560, 115]] as [number, number][],
    label: "Deadland Ridge", lx: 500, ly: 132,
  },
  {
    id: "ashen-peaks",
    peaks: [[200, 760], [230, 745], [260, 758], [290, 742]] as [number, number][],
    label: "Ashen Peaks", lx: 245, ly: 772,
  },
  {
    id: "the-spine",
    peaks: [[540, 350], [548, 380], [538, 410], [546, 440]] as [number, number][],
    label: "The Spine", lx: 562, ly: 395,
  },
  {
    id: "southern-range",
    peaks: [[350, 960], [370, 945], [390, 958], [410, 942]] as [number, number][],
    label: "Shattered Range", lx: 380, ly: 972,
  },
];

const DRIED_RIVERS: { points: [number, number][]; label: string; lx: number; ly: number }[] = [
  {
    points: [[280, 200], [270, 240], [260, 280], [268, 320], [260, 360], [255, 400]],
    label: "Old Meridian (dry)", lx: 240, ly: 300,
  },
  {
    points: [[450, 250], [430, 280], [418, 310], [425, 340]],
    label: "Rust Creek", lx: 405, ly: 290,
  },
  {
    points: [[380, 700], [370, 740], [360, 780], [355, 820]],
    label: "Grey Wash", lx: 340, ly: 760,
  },
];

const PLATEAU_MARKS = [
  { cx: 380, cy: 270, rx: 45, ry: 20, label: "Command Plateau", lx: 380, ly: 250 },
  { cx: 120, cy: 500, rx: 35, ry: 16, label: "Scoria Mesa", lx: 120, ly: 484 },
];

const CANYON_MARKS = [
  { x: 400, y: 350, angle: 30, label: "Irongate Canyon", lx: 400, ly: 332 },
  { x: 300, y: 650, angle: 20, label: "The Rift", lx: 300, ly: 632 },
  { x: 210, y: 260, angle: -15, label: "Echo Rift", lx: 210, ly: 242 },
];

const WATER_BODIES = [
  { label: "T H E   O B S I D I A N   S E A", x: 900, y: 500, fontSize: 13, isOcean: true, rotation: -70 },
  { label: "The Shattered Coast", x: -15, y: 400, fontSize: 9, rotation: -90 },
  { label: "Acid Strait", x: 720, y: 880, fontSize: 10 },
  { label: "S O U T H E R N   R E A C H", x: 420, y: 1250, fontSize: 11, isOcean: true },
  { label: "G U L F  O F  I R O N", x: 550, y: 530, fontSize: 9, isOcean: true },
  { label: "Carrion Bay", x: 650, y: 470, fontSize: 8 },
  { label: "P A C I F I C   D E A D Z O N E", x: -15, y: 900, fontSize: 10, isOcean: true, rotation: -90 },
];

function nodeColor(type: string): string {
  switch (type) {
    case "player_city": return C.green;
    case "megacity": return C.blue;
    case "nation": return C.orange;
    case "township": return C.greenFaded;
    case "notable": return C.inkLight;
    case "resource_node": return "#DAA520";
    default: return C.inkFaded;
  }
}

function nodeSize(type: string): number {
  switch (type) {
    case "player_city": return 8;
    case "megacity": return 5.5;
    case "nation": return 5.5;
    case "township": return 4;
    case "notable": return 3;
    case "resource_node": return 4;
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
    const scale = 1 - inset / 1200;
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

export function AmericasMap() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showTypes, setShowTypes] = useState<Record<LocType, boolean>>({
    player_city: true,
    megacity: true,
    nation: true,
    township: true,
    resource_node: true,
    notable: true,
  });

  const mappedLocs = useMemo(() =>
    RAW_LOCATIONS.map(loc => {
      const { x, y } = mapToAmericas(loc.ox, loc.oy);
      return { ...loc, x, y };
    }), []);

  const visibleLocs = mappedLocs.filter(l => showTypes[l.type]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of RAW_LOCATIONS) c[l.type] = (c[l.type] || 0) + 1;
    return c;
  }, []);

  const TYPE_ORDER: LocType[] = ["player_city", "megacity", "nation", "township", "resource_node", "notable"];
  const TYPE_LABELS: Record<LocType, string> = {
    player_city: "Your City",
    megacity: "Megacity",
    nation: "Nation",
    township: "Township",
    resource_node: "Resource",
    notable: "Notable",
  };

  return (
    <div style={{ width: MAP_W, height: MAP_H, position: "relative", overflow: "hidden", background: C.oceanBg }}>
      <svg width={MAP_W} height={MAP_H} viewBox={`-40 -10 ${MAP_W + 80} ${MAP_H + 20}`}
        style={{ position: "absolute", top: 0, left: 0 }}>
        <defs>
          <clipPath id="clip-americas"><path d={AMERICAS} /></clipPath>
          <filter id="land-shadow">
            <feDropShadow dx="2" dy="3" stdDeviation="4" floodColor="#1a1408" floodOpacity="0.3" />
          </filter>
        </defs>

        <rect x="-40" y="-10" width={MAP_W + 80} height={MAP_H + 20} fill={C.oceanBg} />

        <g filter="url(#land-shadow)">
          <path d={AMERICAS} fill={C.parchment} fillRule="evenodd" />
        </g>
        <path d={AMERICAS} fill={C.parchment} fillRule="evenodd" />

        <g clipPath="url(#clip-americas)">
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
        </g>
        <path d={AMERICAS} fill="none" stroke={C.coastLine} strokeWidth={1} opacity={0.45} fillRule="evenodd" />
        <InnerContours path={AMERICAS} clipId="clip-americas" cx={400} cy={500} count={5} startInset={15} spacing={18} />

        {MOUNTAIN_RANGES.map((range) => (
          <g key={range.id}>
            {range.peaks.map((p, i) => (
              <g key={i}>
                <polygon
                  points={`${p[0]},${p[1]} ${p[0] - 9},${p[1] + 14} ${p[0] + 9},${p[1] + 14}`}
                  fill="none" stroke={C.inkFaded} strokeWidth="0.5" opacity="0.3"
                />
                <line x1={p[0]} y1={p[1]} x2={p[0] + 5} y2={p[1] + 9}
                  stroke={C.inkFaded} strokeWidth="0.4" opacity="0.2" />
              </g>
            ))}
            <text x={range.lx} y={range.ly} textAnchor="middle"
              fill={C.inkFaded} fontSize="7.5" fontFamily="Inter, sans-serif"
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
              fill={C.sandDark} fontSize="7" fontFamily="Inter, sans-serif"
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
              fill={C.inkFaded} fontSize="7" fontFamily="Inter, sans-serif"
              fontStyle="italic" opacity="0.4" letterSpacing="1">
              {p.label}
            </text>
          </g>
        ))}

        {CANYON_MARKS.map((c) => (
          <g key={c.label} transform={`rotate(${c.angle}, ${c.x}, ${c.y})`}>
            <line x1={c.x - 18} y1={c.y} x2={c.x + 18} y2={c.y}
              stroke={C.inkFaded} strokeWidth="1" opacity="0.25" />
            <line x1={c.x - 16} y1={c.y - 3} x2={c.x + 16} y2={c.y - 3}
              stroke={C.inkFaded} strokeWidth="0.35" opacity="0.12" />
            <line x1={c.x - 16} y1={c.y + 3} x2={c.x + 16} y2={c.y + 3}
              stroke={C.inkFaded} strokeWidth="0.35" opacity="0.12" />
            <text x={c.lx} y={c.ly} textAnchor="middle" transform={`rotate(${-c.angle}, ${c.lx}, ${c.ly})`}
              fill={C.inkFaded} fontSize="6.5" fontFamily="Inter, sans-serif"
              fontStyle="italic" opacity="0.4" letterSpacing="1">
              {c.label}
            </text>
          </g>
        ))}

        {WATER_BODIES.map((w, i) => (
          <text key={i} x={w.x} y={w.y} textAnchor="middle"
            fill={w.isOcean ? C.coastLine : C.blueFaded}
            fontSize={w.fontSize} fontFamily="Inter, sans-serif"
            fontStyle="italic" opacity={w.isOcean ? 0.3 : 0.45} letterSpacing="3"
            transform={w.rotation ? `rotate(${w.rotation}, ${w.x}, ${w.y})` : undefined}>
            {w.label}
          </text>
        ))}

        {visibleLocs.map((loc) => {
          const r = nodeSize(loc.type);
          const col = nodeColor(loc.type);
          const isHov = hoveredId === loc.id;
          const s = isHov ? r * 1.6 : r;

          if (loc.type === "player_city") {
            return (
              <g key={loc.id}
                onMouseEnter={() => setHoveredId(loc.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: "pointer" }}>
                <circle cx={loc.x} cy={loc.y} r={s + 10} fill={col} opacity="0.08" />
                <circle cx={loc.x} cy={loc.y} r={s + 5} fill={col} opacity="0.18" />
                <polygon
                  points={`${loc.x},${loc.y - s} ${loc.x + s},${loc.y} ${loc.x},${loc.y + s} ${loc.x - s},${loc.y}`}
                  fill={col} stroke={col} strokeWidth="1.5" />
                <text x={loc.x} y={loc.y + s + 16} textAnchor="middle"
                  fill={col} fontSize="12" fontFamily="Inter, sans-serif"
                  fontWeight="800" letterSpacing="3">
                  {loc.name}
                </text>
                {isHov && (
                  <>
                    <rect x={loc.x + 12} y={loc.y - 14} width={loc.name.length * 7 + 14} height={20}
                      rx={3} fill={C.parchment} stroke={col} strokeWidth={0.8} opacity={0.95} />
                    <text x={loc.x + 19} y={loc.y + 1} fill={C.ink} fontSize={10} fontFamily="Inter, sans-serif" fontWeight={700}>
                      {loc.name}
                    </text>
                  </>
                )}
              </g>
            );
          }
          if (loc.type === "resource_node") {
            return (
              <g key={loc.id}
                onMouseEnter={() => setHoveredId(loc.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ cursor: "pointer" }}>
                <polygon
                  points={`${loc.x},${loc.y - s} ${loc.x + s},${loc.y} ${loc.x},${loc.y + s} ${loc.x - s},${loc.y}`}
                  fill={col} stroke={isHov ? C.ink : col} strokeWidth={isHov ? 1.5 : 1} opacity="0.85" />
                {!isHov && (
                  <text x={loc.x} y={loc.y - s - 3} textAnchor="middle"
                    fill={col} fontSize="6" fontFamily="Inter, sans-serif"
                    fontWeight="600" opacity="0.7" letterSpacing="0.3">
                    {loc.name}
                  </text>
                )}
                {isHov && (
                  <>
                    <rect x={loc.x + 10} y={loc.y - 12} width={loc.name.length * 6.5 + 12} height={18}
                      rx={3} fill={C.parchment} stroke={col} strokeWidth={0.8} opacity={0.95} />
                    <text x={loc.x + 16} y={loc.y + 1} fill={C.ink} fontSize={10} fontFamily="Inter, sans-serif" fontWeight={600}>
                      {loc.name}
                    </text>
                  </>
                )}
              </g>
            );
          }
          const showLabel = loc.type === "megacity" || loc.type === "nation";
          return (
            <g key={loc.id}
              onMouseEnter={() => setHoveredId(loc.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ cursor: "pointer" }}>
              <circle cx={loc.x} cy={loc.y} r={s} fill={col}
                stroke={isHov ? C.ink : "none"} strokeWidth={isHov ? 1.5 : 0}
                opacity={isHov ? 1 : (loc.type === "notable" ? 0.55 : 0.85)} />
              {showLabel && !isHov && (
                <text x={loc.x} y={loc.y - s - 3} textAnchor="middle"
                  fill={C.ink} fontSize="7" fontFamily="Inter, sans-serif"
                  fontWeight="600" opacity="0.6" letterSpacing="0.3">
                  {loc.name}
                </text>
              )}
              {isHov && (
                <>
                  <rect x={loc.x + 10} y={loc.y - 12} width={loc.name.length * 6.5 + 12} height={18}
                    rx={3} fill={C.parchment} stroke={col} strokeWidth={0.8} opacity={0.95} />
                  <text x={loc.x + 16} y={loc.y + 1} fill={C.ink} fontSize={10} fontFamily="Inter, sans-serif" fontWeight={600}>
                    {loc.name}
                  </text>
                </>
              )}
            </g>
          );
        })}

        <g transform="translate(30, 1100)">
          <rect x="-5" y="-5" width="100" height="105" rx="3" fill={C.parchment} opacity="0.9"
            stroke={C.inkFaded} strokeWidth="0.3" />
          <circle cx="45" cy="45" r="40" fill="none" stroke={C.inkFaded} strokeWidth="0.4" opacity="0.25" />
          <line x1="45" y1="8" x2="45" y2="82" stroke={C.inkFaded} strokeWidth="0.4" opacity="0.2" />
          <line x1="8" y1="45" x2="82" y2="45" stroke={C.inkFaded} strokeWidth="0.4" opacity="0.2" />
          <text x="45" y="6" textAnchor="middle" fill={C.inkFaded} fontSize="10" fontFamily="Inter, sans-serif" fontWeight="700" opacity="0.45">N</text>
          <text x="45" y="92" textAnchor="middle" fill={C.inkFaded} fontSize="8" fontFamily="Inter, sans-serif" opacity="0.35">S</text>
          <text x="88" y="48" textAnchor="middle" fill={C.inkFaded} fontSize="8" fontFamily="Inter, sans-serif" opacity="0.35">E</text>
          <text x="2" y="48" textAnchor="middle" fill={C.inkFaded} fontSize="8" fontFamily="Inter, sans-serif" opacity="0.35">W</text>
          <polygon points="45,10 43,18 47,18" fill={C.inkFaded} opacity="0.35" />
        </g>

        <g transform="translate(880, 10)">
          <rect x="0" y="0" width="200" height="130" rx="3" fill={C.parchment} opacity="0.9"
            stroke={C.inkFaded} strokeWidth="0.3" />
          <text x="12" y="18" fill={C.ink} fontSize="8" fontFamily="Inter, sans-serif" fontWeight="700"
            opacity="0.55" letterSpacing="1.5">TACTICAL OVERVIEW</text>
          <line x1="12" y1="24" x2="188" y2="24" stroke={C.inkFaded} strokeWidth="0.25" opacity="0.25" />

          <text x="12" y="38" fill={C.inkLight} fontSize="7" fontFamily="Inter, sans-serif" opacity="0.4"
            letterSpacing="1">{RAW_LOCATIONS.length} LOCATIONS MAPPED</text>

          {TYPE_ORDER.map((type, i) => {
            const col = nodeColor(type);
            const row = Math.floor(i / 2);
            const col2 = i % 2;
            const bx = 16 + col2 * 95;
            const by = 55 + row * 18;
            return (
              <g key={type}>
                {type === "resource_node" || type === "player_city" ? (
                  <polygon points={`${bx},${by - 3} ${bx + 3},${by} ${bx},${by + 3} ${bx - 3},${by}`} fill={col} opacity="0.85" />
                ) : (
                  <circle cx={bx} cy={by} r="3" fill={col} opacity="0.85" />
                )}
                <text x={bx + 8} y={by + 3} fill={C.ink} fontSize="7" fontFamily="Inter, sans-serif" opacity="0.5">
                  {TYPE_LABELS[type]} ({counts[type] || 0})
                </text>
              </g>
            );
          })}

          <text x="16" y="120" fill={C.inkLight} fontSize="9" fontFamily="Inter, sans-serif" opacity="0.18" fontWeight="700">?</text>
          <text x="28" y="120" fill={C.ink} fontSize="7" fontFamily="Inter, sans-serif" opacity="0.5">Undiscovered</text>
        </g>

        <text x="20" y={MAP_H + 5} fill={C.inkLight} fontSize="7" fontFamily="Inter, sans-serif"
          opacity="0.3" letterSpacing="2">
          MEGACITY TACTICAL COMMAND — CLASSIFIED — AMERICAS CONTINENTAL SURVEY — GRID REF: MC-7829
        </text>
      </svg>

      <div style={{
        position: "absolute",
        top: 8,
        left: 8,
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        maxWidth: 420,
      }}>
        {TYPE_ORDER.map((type) => {
          const col = nodeColor(type);
          return (
            <button
              key={type}
              onClick={() => setShowTypes(p => ({ ...p, [type]: !p[type] }))}
              style={{
                background: showTypes[type] ? C.parchment : C.parchmentDark,
                border: `1px solid ${showTypes[type] ? col : C.inkLight}`,
                color: showTypes[type] ? col : C.inkLight,
                padding: "2px 8px",
                borderRadius: 2,
                fontSize: 9,
                cursor: "pointer",
                fontFamily: "Inter, sans-serif",
                letterSpacing: 1,
                fontWeight: 600,
                opacity: showTypes[type] ? 1 : 0.5,
              }}
            >
              {TYPE_LABELS[type]} ({counts[type] || 0})
            </button>
          );
        })}
      </div>
    </div>
  );
}
