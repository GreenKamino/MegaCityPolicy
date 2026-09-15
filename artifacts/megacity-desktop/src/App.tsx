import { useCallback, useEffect, useRef, useState } from "react";

const EXPO_DOMAIN = (import.meta.env.VITE_EXPO_DOMAIN as string | undefined)?.trim() ?? "";
const GAME_URL = EXPO_DOMAIN
  ? `https://${EXPO_DOMAIN}/${typeof window !== "undefined" ? window.location.search : ""}`
  : "";

const STATUS_URL = `${import.meta.env.BASE_URL}__game-status`;
const POLL_INTERVAL_MS = 2000;
const UNREACHABLE_AFTER_MS = 16000;
const IFRAME_LOAD_WATCHDOG_MS = 30000;

type LoadState = "checking" | "ready" | "unreachable";

function useGameServerReachability(enabled: boolean, retryToken: number) {
  const [state, setState] = useState<LoadState>("checking");

  useEffect(() => {
    if (!enabled) return;
    setState("checking");

    let cancelled = false;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(STATUS_URL, { cache: "no-store" });
        if (!cancelled && r.ok) {
          setState("ready");
          return;
        }
      } catch {
        // Network error — Vite proxy itself unreachable. Treat as not ready.
      }
      if (cancelled) return;
      if (Date.now() - startedAt >= UNREACHABLE_AFTER_MS) {
        setState("unreachable");
        return;
      }
      window.setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [enabled, retryToken]);

  return state;
}

function StatusOverlay({
  variant,
  onRetry,
}: {
  variant: "loading" | "error";
  onRetry?: () => void;
}) {
  const retryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (variant === "error") {
      retryRef.current?.focus();
    }
  }, [variant]);

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      aria-busy={variant === "loading"}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0d08",
        color: "#7fff7f",
        fontFamily: "Menlo, monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        textAlign: "center",
        zIndex: 10,
      }}
    >
      <div style={{ fontSize: 16, letterSpacing: 2, marginBottom: 14 }}>
        ▮ MEGACITY
      </div>
      {variant === "loading" ? (
        <div style={{ fontSize: 13, opacity: 0.8 }}>Loading game…</div>
      ) : (
        <>
          <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 6 }}>
            Game server unreachable.
          </div>
          <div style={{ fontSize: 11, opacity: 0.55, maxWidth: 360, marginBottom: 18 }}>
            The Expo dev server is offline or still starting up. This is a
            development-only URL and is not guaranteed to stay alive.
          </div>
          <button
            ref={retryRef}
            type="button"
            onClick={onRetry}
            style={{
              fontFamily: "Menlo, monospace",
              fontSize: 12,
              letterSpacing: 1.5,
              padding: "10px 22px",
              background: "transparent",
              color: "#7fff7f",
              border: "1px solid #7fff7f",
              cursor: "pointer",
            }}
          >
            RETRY
          </button>
        </>
      )}
    </div>
  );
}

function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const reachability = useGameServerReachability(Boolean(GAME_URL), retryToken);

  const focusIframe = useCallback(() => {
    try {
      iframeRef.current?.focus();
    } catch {
      // ignore — focus may fail before the iframe is fully attached
    }
  }, []);

  // The desktop wrapper iframes the Expo web build, which is where the keyboard
  // listener lives. If the outer wrapper holds focus, keys like 1-7 (top nav),
  // Q-U (bottom nav), Space (pause) etc. never reach the game. Auto-focus the
  // iframe on mount, after every load, and whenever the user clicks the page
  // background, so shortcuts work without first clicking inside the game.
  useEffect(() => {
    if (!GAME_URL || reachability !== "ready") return;
    const t = window.setTimeout(focusIframe, 150);
    const onWinFocus = () => focusIframe();
    window.addEventListener("focus", onWinFocus);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("focus", onWinFocus);
    };
  }, [reachability, focusIframe]);

  // Iframe-load watchdog: even when /__game-status returns 200, the iframe
  // itself may never paint (Metro bundle compile failure, slow first-load on
  // mobile, etc.). If onLoad doesn't fire within IFRAME_LOAD_WATCHDOG_MS after
  // the iframe is mounted, surface the error overlay so the user can retry
  // instead of staring at "Loading game…" indefinitely.
  useEffect(() => {
    if (reachability !== "ready" || iframeLoaded) return;
    const t = window.setTimeout(() => {
      setIframeFailed(true);
    }, IFRAME_LOAD_WATCHDOG_MS);
    return () => window.clearTimeout(t);
  }, [reachability, iframeLoaded, retryToken]);

  if (!GAME_URL) {
    return (
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          background: "#0a0d08",
          color: "#7fff7f",
          fontFamily: "Menlo, monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 16, letterSpacing: 2, marginBottom: 12 }}>
            ▮ MEGACITY
          </div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Expo dev domain unavailable. Restart the workflow.
          </div>
        </div>
      </div>
    );
  }

  const showOverlay = reachability !== "ready" || !iframeLoaded || iframeFailed;
  const overlayVariant: "loading" | "error" =
    reachability === "unreachable" || iframeFailed ? "error" : "loading";

  const handleRetry = useCallback(() => {
    setIframeLoaded(false);
    setIframeFailed(false);
    setRetryToken((n) => n + 1);
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#0a0d08",
      }}
      onClick={focusIframe}
    >
      {reachability === "ready" && !iframeFailed && (
        <iframe
          key={retryToken}
          ref={iframeRef}
          src={GAME_URL}
          title="MegaCity: Sector Marshal — Desktop View"
          allow="autoplay; fullscreen; clipboard-read; clipboard-write"
          onLoad={() => {
            setIframeLoaded(true);
            focusIframe();
          }}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            display: "block",
          }}
        />
      )}
      {showOverlay && <StatusOverlay variant={overlayVariant} onRetry={handleRetry} />}
    </div>
  );
}

export default App;
