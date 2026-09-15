export function BuyMeTea() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#1b2838",
        fontFamily: "'Arial', sans-serif",
      }}
    >
      <div
        style={{
          width: 306,
          background: "linear-gradient(180deg, #2a475e 0%, #1b2838 100%)",
          borderRadius: 6,
          overflow: "hidden",
          boxShadow:
            "0 0 20px rgba(0,0,0,0.6), 0 0 60px rgba(102,192,244,0.08), inset 0 1px 0 rgba(102,192,244,0.15)",
          border: "1px solid #2a475e",
          position: "relative",
        }}
      >
        {/* Top foil shimmer band */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background:
              "linear-gradient(90deg, transparent 0%, #66c0f4 25%, #c6d4df 50%, #66c0f4 75%, transparent 100%)",
            opacity: 0.6,
          }}
        />

        {/* Card art area */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 410,
            overflow: "hidden",
          }}
        >
          <img
            src="/__mockup/images/buy-me-tea.png"
            alt="Buy Me A Cup of Tea"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: "center top",
              display: "block",
            }}
          />
          {/* Vignette overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(0deg, rgba(27,40,56,0.95) 0%, rgba(27,40,56,0) 25%, rgba(27,40,56,0) 75%, rgba(27,40,56,0.3) 100%)",
              pointerEvents: "none",
            }}
          />
          {/* Side vignette */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(90deg, rgba(27,40,56,0.3) 0%, transparent 15%, transparent 85%, rgba(27,40,56,0.3) 100%)",
              pointerEvents: "none",
            }}
          />

          {/* Card number badge */}
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(0,0,0,0.65)",
              border: "1px solid rgba(102,192,244,0.3)",
              borderRadius: 3,
              padding: "2px 7px",
              fontSize: 10,
              color: "#66c0f4",
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            5 OF 8
          </div>

          {/* Foil star corner */}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              fontSize: 16,
              color: "#66c0f4",
              textShadow: "0 0 8px rgba(102,192,244,0.6)",
              opacity: 0.7,
            }}
          >
            ★
          </div>
        </div>

        {/* Card info footer */}
        <div
          style={{
            padding: "12px 14px 14px",
            background: "linear-gradient(180deg, #1b2838 0%, #171a21 100%)",
            borderTop: "1px solid rgba(102,192,244,0.12)",
          }}
        >
          {/* Card title */}
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#c6d4df",
              letterSpacing: 1.5,
              textTransform: "uppercase",
              marginBottom: 4,
              textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            }}
          >
            Buy Me a Cup of Tea
          </div>

          {/* Game title row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "#66c0f4",
                fontWeight: 600,
                letterSpacing: 0.5,
              }}
            >
              MEGACITY: Sector Marshal
            </div>
            <div
              style={{
                fontSize: 9,
                color: "#4a6a80",
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: "uppercase",
              }}
            >
              Trading Card
            </div>
          </div>

          {/* Divider */}
          <div
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(102,192,244,0.2), transparent)",
              marginBottom: 8,
            }}
          />

          {/* Description */}
          <div
            style={{
              fontSize: 10,
              color: "#8b929a",
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            "Even in the bleakest sectors of the megacity, a small act of
            kindness can mean everything. The destitute of Block West-7 know
            this better than anyone."
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid rgba(102,192,244,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 2,
                  background: "#2a475e",
                  border: "1px solid #3d6c8e",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  color: "#66c0f4",
                  fontWeight: 700,
                }}
              >
                MC
              </div>
              <span
                style={{
                  fontSize: 9,
                  color: "#556b7e",
                  letterSpacing: 0.5,
                }}
              >
                GreenKamino
              </span>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: "#4a6a80",
                  letterSpacing: 0.5,
                }}
              >
                NORMAL
              </span>
              <div
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4a6a80",
                  border: "1px solid #66c0f4",
                  opacity: 0.6,
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom foil shimmer band */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background:
              "linear-gradient(90deg, transparent 0%, #66c0f4 30%, #c6d4df 50%, #66c0f4 70%, transparent 100%)",
            opacity: 0.3,
          }}
        />
      </div>
    </div>
  );
}
