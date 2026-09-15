import { useEffect } from "react";

const FONTS = [
  { name: "Inter (Current)", family: "Inter, sans-serif", url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" },
  { name: "VT323 — CRT Terminal", family: "'VT323', monospace", url: "https://fonts.googleapis.com/css2?family=VT323&display=swap" },
  { name: "Share Tech Mono — Sci-Fi Mono", family: "'Share Tech Mono', monospace", url: "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap" },
  { name: "Press Start 2P — Pixel", family: "'Press Start 2P', monospace", url: "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" },
  { name: "IBM Plex Mono — Clean Terminal", family: "'IBM Plex Mono', monospace", url: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600;700&display=swap" },
  { name: "Silkscreen — Pixel UI", family: "'Silkscreen', monospace", url: "https://fonts.googleapis.com/css2?family=Silkscreen:wght@400;700&display=swap" },
  { name: "Space Mono — Retro Mono", family: "'Space Mono', monospace", url: "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" },
];

export function FontComparison() {
  useEffect(() => {
    FONTS.forEach((f) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = f.url;
      document.head.appendChild(link);
    });
  }, []);

  return (
    <div style={{ background: "#0A0F0A", minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ color: "#00FF41", fontFamily: "Inter, sans-serif", fontSize: 16, letterSpacing: 2, marginBottom: 4, fontWeight: 700 }}>
          MEGACITY FONT COMPARISON
        </h1>
        <p style={{ color: "#5a6e5a", fontFamily: "Inter, sans-serif", fontSize: 11, marginBottom: 24 }}>
          Each panel below shows the same game text rendered in a different font
        </p>

        {FONTS.map((font) => (
          <div
            key={font.name}
            style={{
              border: "1px solid #1a2e1a",
              borderRadius: 6,
              marginBottom: 16,
              padding: 16,
              background: "#0d140d",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#00FF41", fontFamily: "Inter, sans-serif", fontSize: 10, letterSpacing: 1.5, fontWeight: 700 }}>
                {font.name.toUpperCase()}
              </span>
              <span style={{ color: "#3a4e3a", fontFamily: "Inter, sans-serif", fontSize: 9 }}>
                {font.family.split(",")[0].replace(/'/g, "")}
              </span>
            </div>

            <div style={{ fontFamily: font.family }}>
              {/* Header row */}
              <div style={{ color: "#00FF41", fontSize: 22, fontWeight: 700, letterSpacing: 3, marginBottom: 8 }}>
                MEGACITY
              </div>

              {/* Subheader */}
              <div style={{ color: "#8aff8a", fontSize: 13, fontWeight: 600, letterSpacing: 1, marginBottom: 12 }}>
                SECTOR MARSHAL — CITY OVERVIEW
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: 20, marginBottom: 12 }}>
                <div>
                  <div style={{ color: "#5a6e5a", fontSize: 9, letterSpacing: 1 }}>POPULATION</div>
                  <div style={{ color: "#00FF41", fontSize: 16, fontWeight: 700 }}>1,247,831</div>
                </div>
                <div>
                  <div style={{ color: "#5a6e5a", fontSize: 9, letterSpacing: 1 }}>CREDITS</div>
                  <div style={{ color: "#FFD700", fontSize: 16, fontWeight: 700 }}>₵ 84,291</div>
                </div>
                <div>
                  <div style={{ color: "#5a6e5a", fontSize: 9, letterSpacing: 1 }}>STABILITY</div>
                  <div style={{ color: "#ff4444", fontSize: 16, fontWeight: 700 }}>62%</div>
                </div>
                <div>
                  <div style={{ color: "#5a6e5a", fontSize: 9, letterSpacing: 1 }}>DAY</div>
                  <div style={{ color: "#e0e0e0", fontSize: 16, fontWeight: 700 }}>247</div>
                </div>
              </div>

              {/* Nav tabs */}
              <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
                {["CITY", "LAW", "ECONOMY", "MAP", "BUILD", "DIPLO"].map((t, i) => (
                  <div
                    key={t}
                    style={{
                      background: i === 0 ? "#00FF41" : "#1a2e1a",
                      color: i === 0 ? "#0A0F0A" : "#5a6e5a",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: 1,
                      padding: "5px 10px",
                      borderRadius: 3,
                    }}
                  >
                    {t}
                  </div>
                ))}
              </div>

              {/* Body text */}
              <div style={{ color: "#b0c4b0", fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
                WARNING: Food reserves critical — 3 days remaining. Water recycling at 47% capacity. Sector 7 reports civil unrest.
              </div>

              {/* Small text */}
              <div style={{ color: "#5a6e5a", fontSize: 10 }}>
                Research: Quantum Computing III — 67% complete | Next tick: 14:32
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
