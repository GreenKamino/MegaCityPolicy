export type TraitEffect = Partial<{
  productivity: number;
  crime: number;
  happiness: number;
  loyalty: number;
  unrest: number;
  corruption: number;
}>;

export type CitizenTrait = {
  id: string;
  name: string;
  description: string;
  effects: TraitEffect;
};

export const CITIZEN_TRAITS: CitizenTrait[] = [
  { id: "hardworking", name: "Hardworking", description: "Puts in extra hours without complaint.", effects: { productivity: 3, happiness: -1 } },
  { id: "lazy", name: "Lazy", description: "Does the bare minimum at all times.", effects: { productivity: -4, happiness: 1 } },
  { id: "suspicious", name: "Suspicious", description: "Trusts no one. Questions everything.", effects: { loyalty: -2, crime: -1 } },
  { id: "loyal", name: "Loyal", description: "Steadfast devotion to the city and its leadership.", effects: { loyalty: 4, unrest: -2 } },
  { id: "curious", name: "Curious", description: "Always investigating and asking questions.", effects: { productivity: 1, corruption: -1 } },
  { id: "aggressive", name: "Aggressive", description: "Quick to anger. Prone to violent outbursts.", effects: { crime: 3, unrest: 2 } },
  { id: "friendly", name: "Friendly", description: "Gets along with everyone. Community builder.", effects: { happiness: 3, unrest: -1 } },
  { id: "shy", name: "Shy", description: "Avoids social interaction and public spaces.", effects: { productivity: -1, unrest: -1 } },
  { id: "rebellious", name: "Rebellious", description: "Challenges authority at every opportunity.", effects: { unrest: 4, loyalty: -3, crime: 2 } },
  { id: "obedient", name: "Obedient", description: "Follows orders without question.", effects: { loyalty: 3, productivity: 2, happiness: -1 } },
  { id: "ambitious", name: "Ambitious", description: "Driven to climb the social ladder by any means.", effects: { productivity: 3, corruption: 2 } },
  { id: "greedy", name: "Greedy", description: "Motivated entirely by personal gain.", effects: { corruption: 3, crime: 2, productivity: 1 } },
  { id: "generous", name: "Generous", description: "Shares resources and helps neighbors.", effects: { happiness: 3, loyalty: 1 } },
  { id: "cautious", name: "Cautious", description: "Calculates every risk before acting.", effects: { productivity: -1, crime: -2 } },
  { id: "reckless", name: "Reckless", description: "Acts without thinking. High accident rate.", effects: { crime: 2, productivity: -2 } },
  { id: "intelligent", name: "Intelligent", description: "Sharp mind. Quick learner.", effects: { productivity: 4, corruption: -1 } },
  { id: "gullible", name: "Gullible", description: "Easily manipulated by propaganda and scams.", effects: { loyalty: 2, corruption: 1 } },
  { id: "patriotic", name: "Patriotic", description: "Deep love for the megacity.", effects: { loyalty: 5, unrest: -3 } },
  { id: "cynical", name: "Cynical", description: "Believes the worst about everyone and everything.", effects: { happiness: -3, loyalty: -2 } },
  { id: "optimistic", name: "Optimistic", description: "Always sees the bright side. Infectious positivity.", effects: { happiness: 4, unrest: -2 } },
  { id: "pessimistic", name: "Pessimistic", description: "Expects the worst. Constant complainer.", effects: { happiness: -4, unrest: 2 } },
  { id: "risk_taking", name: "Risk-Taking", description: "Thrives on danger and uncertainty.", effects: { crime: 2, productivity: 2 } },
  { id: "law_abiding", name: "Law-Abiding", description: "Strict adherence to all regulations.", effects: { crime: -4, loyalty: 2 } },
  { id: "rule_breaking", name: "Rule-Breaking", description: "Ignores regulations when convenient.", effects: { crime: 3, corruption: 1 } },
  { id: "community_minded", name: "Community Minded", description: "Puts the neighborhood above personal gain.", effects: { happiness: 2, unrest: -2, loyalty: 1 } },
  { id: "independent", name: "Independent", description: "Self-reliant. Dislikes interference.", effects: { productivity: 2, loyalty: -1 } },
  { id: "manipulative", name: "Manipulative", description: "Uses others for personal advantage.", effects: { corruption: 3, crime: 1 } },
  { id: "paranoid", name: "Paranoid", description: "Sees conspiracies everywhere. Trust issues.", effects: { happiness: -3, unrest: 2, crime: -1 } },
  { id: "calm", name: "Calm", description: "Unflappable under pressure.", effects: { unrest: -3, productivity: 1 } },
  { id: "nervous", name: "Nervous", description: "Anxious and easily startled.", effects: { happiness: -2, productivity: -2 } },
  { id: "stoic", name: "Stoic", description: "Endures hardship without complaint.", effects: { unrest: -2, happiness: -1, loyalty: 1 } },
  { id: "emotional", name: "Emotional", description: "Reacts strongly to everything.", effects: { unrest: 2, happiness: 1 } },
  { id: "competitive", name: "Competitive", description: "Must win at everything.", effects: { productivity: 3, happiness: -1 } },
  { id: "cooperative", name: "Cooperative", description: "Works well in teams.", effects: { productivity: 2, happiness: 2 } },
  { id: "resourceful", name: "Resourceful", description: "Makes the most of limited resources.", effects: { productivity: 3, corruption: -1 } },
  { id: "creative", name: "Creative", description: "Innovative problem solver.", effects: { productivity: 2, happiness: 1 } },
  { id: "opportunistic", name: "Opportunistic", description: "Seizes every advantage, ethical or not.", effects: { corruption: 2, crime: 1, productivity: 1 } },
  { id: "faction_loyal", name: "Loyal to Faction", description: "Puts faction above city loyalty.", effects: { loyalty: -3, unrest: 2 } },
  { id: "authority_respecting", name: "Authority-Respecting", description: "Deep respect for the chain of command.", effects: { loyalty: 3, unrest: -2 } },
  { id: "authority_hating", name: "Authority-Hating", description: "Despises all forms of governance.", effects: { loyalty: -4, unrest: 4, crime: 2 } },
  { id: "charismatic", name: "Charismatic", description: "Natural leader. Influences those around them.", effects: { happiness: 2, loyalty: 1 } },
  { id: "quiet", name: "Quiet", description: "Keeps to themselves. Observes.", effects: { unrest: -1 } },
  { id: "talkative", name: "Talkative", description: "Constant chatter. Spreads information fast.", effects: { happiness: 1, corruption: 1 } },
  { id: "industrious", name: "Industrious", description: "Tireless worker. Factory foreman material.", effects: { productivity: 5, happiness: -2 } },
  { id: "distrustful", name: "Distrustful", description: "Refuses to cooperate with authorities.", effects: { loyalty: -3, crime: 1 } },
  { id: "thrill_seeking", name: "Thrill-Seeking", description: "Addicted to adrenaline and danger.", effects: { crime: 3, happiness: 2 } },
  { id: "ethical", name: "Ethical", description: "Strong moral compass. Refuses to compromise.", effects: { corruption: -3, crime: -2, loyalty: 1 } },
  { id: "ruthless", name: "Ruthless", description: "Will do anything to achieve their goals.", effects: { crime: 3, corruption: 2, productivity: 2 } },
  { id: "compassionate", name: "Compassionate", description: "Deeply empathetic. Helps the suffering.", effects: { happiness: 3, unrest: -2, corruption: -1 } },
  { id: "selfish", name: "Selfish", description: "Only cares about personal well-being.", effects: { corruption: 2, happiness: 1, loyalty: -2 } },
];
