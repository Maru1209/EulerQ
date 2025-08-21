"use client";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };

export default function OptimizerDemo() {
  const [points, setPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // NEW: UI state
  const [roundTrip, setRoundTrip] = useState<boolean>(true);
  const [numPoints, setNumPoints] = useState<number>(8); // 5–12

  // react-leaflet loaded only in the browser (Option B)
  const [leaflet, setLeaflet] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const mod = await import("react-leaflet");
      const L = (await import("leaflet")).default;

      // Fix default marker icons in Next.js
      // @ts-ignore
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      setLeaflet({ ...mod, L });
    })();
  }, []);

  function handleGenerate() {
    const N = Math.min(12, Math.max(5, numPoints)); // clamp 5–12
    const pts: Point[] = Array.from({ length: N }, () => ({
      lat: 12.9 + Math.random() * 0.15,
      lng: 77.5 + Math.random() * 0.15,
    }));
    setPoints(pts);
    setResult(null);
    setError(null);
  }

  async function handleOptimize() {
    try {
      setBusy(true);
      setError(null);

      if (points.length < 5 || points.length > 12) {
        throw new Error("Please generate 5–12 points before optimizing.");
      }

      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
      const res = await fetch(`${API_BASE}/api/solve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problem_type: "route",
          backend: "classical",
          payload: { points, round_trip: roundTrip },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        const msg =
          data?.message ||
          `HTTP ${res.status} ${res.statusText} — check Network tab`;
        throw new Error(msg);
      }

      setResult(data);
    } catch (e: any) {
      console.error(e);
      setResult(null);
      setError(e?.message || "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  // Build polyline positions; if roundTrip, close the loop
  const routePositions: [number, number][] =
    result?.ok && Array.isArray(result.solution.order)
      ? (() => {
          const seq = result.solution.order.map(
            (i: number) => [points[i].lat, points[i].lng] as [number, number]
          );
          return roundTrip && seq.length > 1 ? [...seq, seq[0]] : seq;
        })()
      : [];

  return (
    <div style={{ padding: 20 }}>
      <h1>Eulerq Route Optimizer (POC)</h1>

      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))",
          gap: 12,
          marginTop: 8,
          alignItems: "center",
          maxWidth: 800,
        }}
      >
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Number of stops (5–12)
          </label>
          <input
            type="number"
            min={5}
            max={12}
            value={numPoints}
            onChange={(e) => setNumPoints(parseInt(e.target.value || "8", 10))}
            style={{ padding: 8, width: "100%" }}
          />
          {/* Optional: slider control */}
          <input
            type="range"
            min={5}
            max={12}
            value={numPoints}
            onChange={(e) => setNumPoints(parseInt(e.target.value, 10))}
            style={{ width: "100%", marginTop: 6 }}
          />
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Round trip
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={roundTrip}
              onChange={(e) => setRoundTrip(e.target.checked)}
            />
            <span>{roundTrip ? "Return to start enabled" : "Open tour"}</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "end" }}>
          <button onClick={handleGenerate}>Generate Points</button>
          <button onClick={handleOptimize} disabled={!points.length || busy}>
            {busy ? "Optimizing..." : "Optimize"}
          </button>
        </div>
      </div>

      {points.length > 0 && (
        <pre style={{ marginTop: 12 }}>
          Points {JSON.stringify(points, null, 2)}
        </pre>
      )}

      {error && (
        <div style={{ marginTop: 12, color: "#ef4444" }}>
          <b>Error:</b> {error}
        </div>
      )}

      {result?.ok && (
        <div style={{ marginTop: 12 }}>
          <div>
            <b>Distance:</b>{" "}
            {Number(result.solution.distance_km).toFixed(2)} km
          </div>
          <div>
            <b>Order:</b> {result.solution.order.join(" → ")}
          </div>
          {typeof result.solution.improvement_pct === "number" && (
            <div>
              <b>Improvement vs baseline:</b>{" "}
              {result.solution.improvement_pct.toFixed(1)}%
            </div>
          )}

          {/* Map (only when leaflet is loaded in the browser) */}
          {leaflet && points.length > 0 && routePositions.length > 0 && (
            <div style={{ height: 420, marginTop: 16 }}>
              <leaflet.MapContainer
                center={[points[0].lat, points[0].lng]}
                zoom={12}
                style={{ height: "100%", width: "100%" }}
              >
                <leaflet.TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="© OpenStreetMap contributors"
                />
                {/* Optimized route polyline (closed if roundTrip) */}
                <leaflet.Polyline positions={routePositions} />
                {/* Markers */}
                {points.map((p, idx) => (
                  <leaflet.Marker key={idx} position={[p.lat, p.lng]}>
                    <leaflet.Popup>
                      #{idx} — {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </leaflet.Popup>
                  </leaflet.Marker>
                ))}
              </leaflet.MapContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
