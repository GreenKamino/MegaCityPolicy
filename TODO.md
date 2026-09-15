# MEGACITY — To Do

## Difficulty System
- [ ] Wire difficulty selection (Easy / Medium / Hard) to actual gameplay modifiers
- [ ] Easy: +20% income, −30% crime, slower unrest growth, higher starting resources
- [ ] Medium: Default balance (no modifiers)
- [ ] Hard: −20% income, +30% crime, faster unrest, lower starting resources, more aggressive factions
- [ ] Store difficulty in GameState, apply multipliers in runTick subsystems
- [ ] Display active difficulty on Overview / pause screen

## Trade Dynamics
- [ ] Dynamic commodity pricing — supply/demand curves that shift based on city production, consumption, and stockpile levels
- [ ] Price volatility — random market events (shortages, gluts, speculation) that spike or crash prices
- [ ] Trade route profitability — routes between locations affected by distance, terrain, threat level, and infrastructure
- [ ] Merchant caravans — NPC trade convoys that move between locations; can be raided, taxed, or protected
- [ ] Trade embargoes & sanctions — diplomatic actions that restrict trade with specific factions/megacities
- [ ] Smuggling networks — black market trade routes that bypass embargoes at higher risk/reward
- [ ] Commodity futures — ability to buy/sell forward contracts on commodities (speculate on future prices)
- [ ] Trade agreements tiers — basic, preferred, exclusive tiers with escalating bonuses and obligations
- [ ] Import/export tariffs — configurable tax rates on incoming/outgoing goods affecting faction relations
- [ ] Resource scarcity events — periodic global shortages that drive up prices and create diplomatic tension
- [ ] Trade influence — high trade volume with a faction increases disposition and unlocks diplomatic options
- [ ] Market manipulation — player actions to artificially inflate/deflate commodity prices (costs credits, risks backlash)
- [ ] Trade hub bonuses — districts/buildings that reduce trade costs or increase volume capacity
- [ ] Seasonal trade patterns — certain commodities fluctuate with weather/seasons (fuel demand in winter, food in drought)
- [ ] Trade log & analytics — historical price charts, trade volume tracking, profit/loss per route

## Mouse Support (Steam Ready)
- [x] Hover states on buttons/tabs — Add visual feedback when mousing over all interactive elements
- [x] World map mouse controls — Scroll wheel zoom + grab cursor on map container
- [x] Cursor changes — Pointer cursor on all clickable elements (map nodes, filter chips, district cards, buttons, tabs)
- [x] Hover tooltips — HoverTooltip component + resource tooltips on overview screen
- [x] Right-click context menus — ContextMenu component ready for use on districts/units
