const fs = require("fs");
const path = require("path");

const achFile = path.join(__dirname, "..", "engine", "achievements.ts");
const content = fs.readFileSync(achFile, "utf-8");

const achievements = [];
const regex = /steamApiName:\s*"([^"]+)".*?title:\s*"([^"]+)".*?description:\s*"([^"]+)"/gs;
let match;

while ((match = regex.exec(content)) !== null) {
  achievements.push({
    apiName: match[1],
    displayName: match[2],
    description: match[3],
  });
}

if (achievements.length === 0) {
  const lineRegex = /\{\s*\n\s*id:\s*"[^"]+",\s*\n\s*steamApiName:\s*"([^"]+)",\s*\n\s*title:\s*"([^"]+)",\s*\n\s*description:\s*"([^"]+)"/g;
  while ((match = lineRegex.exec(content)) !== null) {
    achievements.push({
      apiName: match[1],
      displayName: match[2],
      description: match[3],
    });
  }
}

console.log(`Found ${achievements.length} achievements\n`);

let vdf = '"achievements"\n{\n';
achievements.forEach((ach, i) => {
  vdf += `\t"${i}"\n\t{\n`;
  vdf += `\t\t"name" "${ach.apiName}"\n`;
  vdf += `\t\t"display"\n\t\t{\n`;
  vdf += `\t\t\t"name"\n\t\t\t{\n\t\t\t\t"english" "${ach.displayName}"\n\t\t\t}\n`;
  vdf += `\t\t\t"desc"\n\t\t\t{\n\t\t\t\t"english" "${ach.description}"\n\t\t\t}\n`;
  vdf += `\t\t}\n`;
  vdf += `\t}\n`;
});
vdf += "}\n";

const outPath = path.join(__dirname, "achievements.vdf");
fs.writeFileSync(outPath, vdf);
console.log(`Written to ${outPath}`);

const csvRows = ["apiName,displayName,description"];
achievements.forEach((ach) => {
  const desc = ach.description.replace(/"/g, '""');
  const name = ach.displayName.replace(/"/g, '""');
  csvRows.push(`"${ach.apiName}","${name}","${desc}"`);
});

const csvPath = path.join(__dirname, "achievements.csv");
fs.writeFileSync(csvPath, csvRows.join("\n"));
console.log(`CSV written to ${csvPath}`);
