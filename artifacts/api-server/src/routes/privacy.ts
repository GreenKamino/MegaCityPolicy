import { Router } from "express";
import path from "path";
import fs from "fs";

const router = Router();

const PRIVACY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Privacy Policy — MegaCity: Sector Commander</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 720px; margin: 0 auto; padding: 20px; line-height: 1.7; color: #e0e0e0; background: #0A0F0A; }
  h1 { color: #00FF41; font-size: 24px; border-bottom: 2px solid #00FF41; padding-bottom: 8px; }
  h2 { color: #00FF41; font-size: 18px; margin-top: 32px; }
  p { margin: 12px 0; }
  a { color: #00C8FF; }
  .updated { color: #888; font-size: 13px; }
</style>
</head>
<body>
<h1>Privacy Policy</h1>
<p class="updated">Last updated: March 16, 2026</p>

<h2>Overview</h2>
<p>MegaCity: Sector Commander ("the Game") is a single-player offline city management game. Your privacy is important to us. This policy explains what data the Game collects, how it is used, and your rights.</p>

<h2>Data Collection</h2>
<p>The Game is designed to work entirely offline. We do not collect, store, or transmit any personal information from your device to external servers during normal gameplay.</p>
<p><strong>Game save data</strong> is stored locally on your device using AsyncStorage. This data never leaves your device unless you choose to export it.</p>

<h2>Advertisements</h2>
<p>The free version of the Game may display occasional advertisements (once every 24 in-game hours and when loading or saving a game). Ad networks may collect anonymized device information as described in their own privacy policies. You can remove all ads by purchasing the "Remove Ads" add-on.</p>

<h2>In-App Purchases</h2>
<p>The Game offers optional in-app purchases processed through the Google Play Store. Purchase transactions are handled entirely by Google. We do not collect or store payment information.</p>

<h2>Analytics</h2>
<p>We do not use any analytics, tracking, or telemetry services. No gameplay data, usage patterns, or behavioral information is collected or transmitted.</p>

<h2>Children's Privacy</h2>
<p>The Game is not directed at children under the age of 13. We do not knowingly collect personal information from children.</    p>

<h2>Third-Party Services</h2>
<p>The Game may use the following third-party services:</p>
<ul>
<li><strong>Google Play Services</strong> — for app distribution and in-app purchases</li>
<li><strong>Ad Networks</strong> — for displaying occasional advertisements (free version only)</li>
</ul>
<p>Each third-party service has its own privacy policy governing data collection.</p>

<h2>Data Security</h2>
<p>All game data is stored locally on your device. We do not operate servers that store user data. The security of your game data depends on your device's security settings.</p>

<h2>Changes to This Policy</h2>
<p>We may update this privacy policy from time to time. Any changes will be reflected in the "Last updated" date above.</p>

<h2>Contact</h2>
<p>If you have questions about this privacy policy, contact us at:</p>
<p>Instagram: <a href="https://instagram.com/megacitysim" target="_blank">@MEGACITYSIM</a></p>
</body>
</html>`;

router.get("/privacy", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(PRIVACY_HTML);
});

export default router;
