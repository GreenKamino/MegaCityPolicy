const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist-offline");

console.log("=== MEGACITY: Sector Marshal — Offline Web Build (PWA) ===\n");

if (fs.existsSync(distDir)) {
  console.log("Cleaning previous build...");
  fs.rmSync(distDir, { recursive: true, force: true });
}

console.log("Exporting web build (this may take a few minutes)...\n");

try {
  execSync("pnpm exec expo export --platform web --output-dir dist-offline", {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });
} catch (error) {
  console.error("\nBuild failed. Check the errors above.");
  process.exit(1);
}

const indexPath = path.join(distDir, "index.html");
if (!fs.existsSync(indexPath)) {
  console.error("\nBuild produced no index.html — something went wrong.");
  process.exit(1);
}

console.log("Inlining fonts (icons + Inter) for offline rendering...");
execSync(`node "${path.join(projectRoot, "steam", "scripts", "inline-fonts.mjs")}" "${distDir}"`, {
  cwd: projectRoot,
  stdio: "inherit",
});

console.log("Injecting PWA support and boot splash...");

let html = fs.readFileSync(indexPath, "utf-8");

const manifestLink = '<link rel="manifest" href="/manifest.json">';
const metaTheme = '<meta name="theme-color" content="#0A0F0A">';
const metaApple = '<meta name="apple-mobile-web-app-capable" content="yes">';
const metaAppleStatus = '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">';
const appleIcon = '<link rel="apple-touch-icon" href="/icon-192.png">';

const swScript = `<script>
if("serviceWorker"in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("/sw.js")})}
</script>`;

const splashStyles = `<style id="megacity-boot-splash-style">
body { background: #0A0F0A; }
#megacity-boot-splash {
  position: fixed; inset: 0; z-index: 999999;
  background: #0A0F0A; color: #00FF66;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 18px; padding: 24px; text-align: center;
  transition: opacity 320ms ease-out;
}
#megacity-boot-splash.gone { opacity: 0; pointer-events: none; }
#megacity-boot-splash .logo { font-size: 28px; font-weight: 700; letter-spacing: 0.32em; text-shadow: 0 0 12px rgba(0,255,102,0.45); }
#megacity-boot-splash .tagline { font-size: 11px; letter-spacing: 0.28em; opacity: 0.55; text-transform: uppercase; }
#megacity-boot-splash .status { font-size: 12px; letter-spacing: 0.16em; opacity: 0.85; text-transform: uppercase; }
#megacity-boot-splash .status::after { content: ""; display: inline-block; width: 1.4em; text-align: left; animation: mc-dots 1.4s steps(4, end) infinite; }
#megacity-boot-splash .bar { width: min(260px, 70vw); height: 3px; background: rgba(0,255,102,0.12); overflow: hidden; position: relative; border-radius: 2px; }
#megacity-boot-splash .bar::before { content: ""; position: absolute; inset: 0; width: 35%; background: linear-gradient(90deg, transparent, #00FF66, transparent); animation: mc-scan 1.6s linear infinite; }
#megacity-boot-splash .hint { margin-top: 14px; font-size: 10px; letter-spacing: 0.2em; opacity: 0.4; text-transform: uppercase; max-width: 360px; line-height: 1.6; }
@keyframes mc-dots { 0%{content:"";} 25%{content:".";} 50%{content:"..";} 75%{content:"...";} 100%{content:"";} }
@keyframes mc-scan { from { transform: translateX(-100%); } to { transform: translateX(285%); } }
</style>`;

const splashMarkup = `<div id="megacity-boot-splash" aria-hidden="true">
  <div class="logo">MEGACITY</div>
  <div class="tagline">Sector Marshal</div>
  <div class="bar"></div>
  <div class="status">Loading sector data</div>
  <div class="hint">First launch downloads the simulation core. Subsequent launches are instant.</div>
</div>`;

const splashHideScript = `<script>
(function(){
  var s=document.getElementById("megacity-boot-splash");
  var r=document.getElementById("root");
  if(!s||!r)return;
  var hide=function(){if(s.classList.contains("gone"))return;s.classList.add("gone");setTimeout(function(){if(s&&s.parentNode)s.parentNode.removeChild(s);},400);};
  if(r.childNodes.length>0){hide();return;}
  var o=new MutationObserver(function(){if(r.childNodes.length>0){o.disconnect();hide();}});
  o.observe(r,{childList:true});
  setTimeout(function(){o.disconnect();hide();},90000);
})();
</script>`;

if (!html.includes('id="megacity-boot-splash-style"')) {
  html = html.replace(
    "</head>",
    `${manifestLink}\n${metaTheme}\n${metaApple}\n${metaAppleStatus}\n${appleIcon}\n${splashStyles}\n</head>`
  );
}

const rootDivPattern = /<div\s+id=["']root["'][^>]*>\s*<\/div>/i;
if (!html.includes('id="megacity-boot-splash"') && rootDivPattern.test(html)) {
  html = html.replace(
    rootDivPattern,
    (match) => `${match}\n${splashMarkup}\n${splashHideScript}`
  );
}

if (!html.includes("serviceWorker")) {
  html = html.replace("</body>", `${swScript}\n</body>`);
}

fs.writeFileSync(indexPath, html);

const missing = [];
if (!html.includes('id="megacity-boot-splash-style"')) missing.push("splash CSS");
if (!html.includes('id="megacity-boot-splash"')) missing.push("splash markup");
if (!/MutationObserver/.test(html)) missing.push("splash hide script");
if (!html.includes('rel="manifest"')) missing.push("PWA manifest link");
if (!html.includes("serviceWorker")) missing.push("service worker registration");
if (missing.length) {
  console.error("\nERROR: Post-build HTML is missing: " + missing.join(", "));
  process.exit(1);
}

console.log("PWA manifest, service worker, boot splash, and meta tags injected.");

console.log("\n=== Build complete! ===");
console.log(`Output: ${path.relative(process.cwd(), distDir)}/`);
console.log("\nTo play on your phone:");
console.log("  1. Run:  npx serve " + path.relative(process.cwd(), distDir));
console.log("  2. Open http://<your-pc-ip>:3000 in Chrome on your Android");
console.log("  3. Tap the Chrome menu (three dots) → 'Add to Home Screen'");
console.log("  4. The MEGACITY icon appears on your home screen!");
console.log("\nAfter the first load, it works offline too.\n");
