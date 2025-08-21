"use client";
import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };

export default function OptimizerDemo() {
  const [points, setPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // UI state
  const [roundTrip, setRoundTrip] = useState<boolean>(true);
  const [numPoints, setNumPoints] = useState<number>(8); // 5–12
  const [startLat, setStartLat] = useState<string>("");
  const [startLng, setStartLng] = useState<string>("");
  const [endLat, setEndLat] = useState<string>("");
  const [endLng, setEndLng] = useState<string>("");

  // react-leaflet (client-only)
  const [leaflet, setLeaflet] = useState<any>(null);
  useEffect(() => {
    (async () => {
      const mod = await import("react-leaflet");
      const L = (await import("leaflet")).default;
      // fix marker icons
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
    const N = Math.min(12, Math.max(5, numPoints));
    const pts: Point[] = Array.from({ length: N }, () => ({
      lat: 12.9 + Math.random() * 0.15,
      lng: 77.5 + Math.random() * 0.15,
    }));
    setPoints(pts);
    setResult(null);
    setError(null);
  }

  function buildPayload() {
    const payload: any = { points, round_trip: roundTrip };
    const sOK = startLat.trim() !== "" && startLng.trim() !== "";
    const eOK = endLat.trim() !== "" && endLng.trim() !== "";

    if (sOK) {
      payload.start = { lat: parseFloat(startLat), lng: parseFloat(startLng) };
    }
    if (eOK) {
      payload.end = { lat: parseFloat(endLat), lng: parseFloat(endLng) };
    }
    // If round_trip and only start provided, backend will use start as end as well.
    return payload;
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
          payload: buildPayload(),
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

  // Build polyline (close if roundTrip with no external depots shown here)
  const routePositions: [number, number][] =
    result?.ok && Array.isArray(result.solution?.order)
      ? (() => {
          const seq = result.solution.order.map(
            (i: number) => [points[i].lat, points[i].lng] as [number, number]
          );
          // We don't close visually if external depots used; we draw depots separately.
          const depotsUsed =
            result?.diagnostics?.depots?.has_start ||
            result?.diagnostics?.depots?.has_end;
          return roundTrip && !depotsUsed && seq.length > 1 ? [...seq, seq[0]] : seq;
        })()
      : [];

  const startMarker =
    startLat && startLng
      ? ([parseFloat(startLat), parseFloat(startLng)] as [number, number])
      : null;
  const endMarker =
    endLat && endLng
      ? ([parseFloat(endLat), parseFloat(endLng)] as [number, number])
      : startMarker && roundTrip
      ? startMarker
      : null;

  return (
    <div style={{ padding: 20 }}>
      <h1>EulerQ Route Optimizer (POC)</h1>

      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
          gap: 12,
          marginTop: 8,
          alignItems: "center",
          maxWidth: 1000,
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

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Start (lat, lng)
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder="12.95"
              value={startLat}
              onChange={(e) => setStartLat(e.target.value)}
              style={{ padding: 8, width: "100%" }}
            />
            <input
              placeholder="77.60"
              value={startLng}
              onChange={(e) => setStartLng(e.target.value)}
              style={{ padding: 8, width: "100%" }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            End (lat, lng)
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder="12.96"
              value={endLat}
              onChange={(e) => setEndLat(e.target.value)}
              style={{ padding: 8, width: "100%" }}
            />
            <input
              placeholder="77.62"
              value={endLng}
              onChange={(e) => setEndLng(e.target.value)}
              style={{ padding: 8, width: "100%" }}
            />
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Leave End blank to auto-close to Start if Round trip is enabled.
          </div>
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
          {result?.diagnostics?.depots?.start_end_km != null && (
            <div>
              <b>Start↔End distance:</b>{" "}
              {Number(result.diagnostics.depots.start_end_km).toFixed(2)} km
            </div>
          )}

          {/* QUBO / Solver info */}
          <div style={{ marginTop: 12, fontSize: 13, opacity: 0.85 }}>
            <b>Solver Info:</b>
            <div>
              We formulate the route as a <b>QUBO</b> (quadratic unconstrained
              binary optimization): variables x<sub>i,t</sub> decide city <i>i</i> at position <i>t</i>.
              Constraints (visit once / slot filled) and distances are encoded
              into a single matrix <i>Q</i>. We then use simulated annealing to
              minimize xᵀQx, which is different from “just annealing” a cost:
              here the cost landscape comes explicitly from the QUBO.
            </div>
            <div style={{ marginTop: 6 }}>
              <i>QUBO terms added:</i>{" "}
              L={result?.diagnostics?.qubo_terms?.linear_terms_added ?? 0},{" "}
              Q={result?.diagnostics?.qubo_terms?.quadratic_terms_added ?? 0}.{" "}
              Restarts={result?.diagnostics?.restarts}, Reads/Restart=
              {result?.diagnostics?.reads_per_restart}, Best Restart=
              {result?.diagnostics?.best_restart_idx}.
            </div>
          </div>

          {/* Map */}
          {leaflet && points.length > 0 && (
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
                {/* Optimized route polyline */}
                {Array.isArray(result.solution.order) && (
                  <leaflet.Polyline
                    positions={routePositions}
                  />
                )}
                {/* City markers */}
                {points.map((p, idx) => (
                  <leaflet.Marker key={idx} position={[p.lat, p.lng]}>
                    <leaflet.Popup>
                      Stop #{idx} — {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </leaflet.Popup>
                  </leaflet.Marker>
                ))}
                {/* Depot markers */}
                {startMarker && (
                  <leaflet.Marker position={startMarker}>
                    <leaflet.Popup>Start Depot</leaflet.Popup>
                  </leaflet.Marker>
                )}
                {endMarker && endMarker !== startMarker && (
                  <leaflet.Marker position={endMarker}>
                    <leaflet.Popup>End Depot</leaflet.Popup>
                  </leaflet.Marker>
                )}
              </leaflet.MapContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
