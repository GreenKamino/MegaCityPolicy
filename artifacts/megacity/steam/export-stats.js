const fs = require("fs");
const path = require("path");

const stats = [
  { name: "stat_total_ticks", displayName: "Total Simulation Ticks", type: "int" },
  { name: "stat_total_credits_earned", displayName: "Total Credits Earned", type: "int" },
  { name: "stat_population_peak", displayName: "Peak Population", type: "int" },
  { name: "stat_districts_managed", displayName: "Districts Managed", type: "int" },
  { name: "stat_technologies_unlocked", displayName: "Technologies Unlocked", type: "int" },
  { name: "stat_events_survived", displayName: "Events Survived", type: "int" },
  { name: "stat_contracts_completed", displayName: "Contracts Completed", type: "int" },
  { name: "stat_factions_allied", displayName: "Factions Allied", type: "int" },
  { name: "stat_total_prestiges", displayName: "Total Prestiges", type: "int" },
  { name: "stat_longest_run_ticks", displayName: "Longest Run (Ticks)", type: "int" },
];

console.log(`Exporting ${stats.length} Steam stats\n`);

let vdf = '"stats"\n{\n';
stats.forEach((stat, i) => {
  vdf += `\t"${i}"\n\t{\n`;
  vdf += `\t\t"name" "${stat.name}"\n`;
  vdf += `\t\t"type" "${stat.type}"\n`;
  vdf += `\t\t"display"\n\t\t{\n`;
  vdf += `\t\t\t"name"\n\t\t\t{\n\t\t\t\t"english" "${stat.displayName}"\n\t\t\t}\n`;
  vdf += `\t\t}\n`;
  vdf += `\t}\n`;
});
vdf += "}\n";

const outPath = path.join(__dirname, "stats.vdf");
fs.writeFileSync(outPath, vdf);
console.log(`Written to ${outPath}`);
