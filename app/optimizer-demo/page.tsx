"use client";
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };
type WarehouseKey = "Hoskote" | "Bellandur" | "Whitefield" | "Peenya" | "Yelahanka";

// Preset warehouse city coordinates (approx)
const WAREHOUSES: Record<WarehouseKey, Point> = {
  Hoskote: { lat: 13.07, lng: 77.8 },
  Bellandur: { lat: 12.9289, lng: 77.6762 },
  Whitefield: { lat: 12.9698, lng: 77.7499 },
  Peenya: { lat: 13.0275, lng: 77.515 },
  Yelahanka: { lat: 13.1007, lng: 77.5963 },
};

export default function OptimizerDemo() {
  const [points, setPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // UI state
  const [startWh, setStartWh] = useState<WarehouseKey>("Bellandur");
  const [endWh, setEndWh] = useState<WarehouseKey | "Same as Start">("Same as Start");
  const [roundTrip, setRoundTrip] = useState<boolean>(true);
  const [numPoints, setNumPoints] = useState<number>(8); // 5–12
  const [showCompare, setShowCompare] = useState<boolean>(true);

  // Optional: override Start with geolocation
  const [startOverride, setStartOverride] = useState<Point | null>(null);

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

  // If End = "Same as Start", enforce round trip
  useEffect(() => {
    if (endWh === "Same as Start") setRoundTrip(true);
  }, [endWh]);

  // Effective depots (with possible geolocation override for start)
  const startDepot: Point = useMemo(
    () => startOverride ?? WAREHOUSES[startWh],
    [startOverride, startWh]
  );
  const endDepot: Point = useMemo(() => {
    if (endWh === "Same as Start") return startDepot;
    return WAREHOUSES[endWh as WarehouseKey];
  }, [endWh, startDepot]);

  // Random sellers around the start depot (8–12 km)
  function randInRadiusKm(center: Point, minKm = 8, maxKm = 12): Point {
    // Rough conversion near Bengaluru: 1° lat ~ 111km, 1° lng ~ 111km * cos(lat)
    const km = minKm + Math.random() * (maxKm - minKm);
    const bearing = Math.random() * 2 * Math.PI;
    const dLat = (km * Math.cos(bearing)) / 111; // degrees
    const dLng =
      (km * Math.sin(bearing)) / (111 * Math.cos((center.lat * Math.PI) / 180));
    return { lat: center.lat + dLat, lng: center.lng + dLng };
  }

  function handleGenerate() {
    const N = Math.min(12, Math.max(5, numPoints));
    const pts: Point[] = Array.from({ length: N }, () => randInRadiusKm(startDepot, 8, 12));
    setPoints(pts);
    setResult(null);
    setError(null);
  }

  function buildPayload() {
    const payload: any = {
      points,
      round_trip: endWh === "Same as Start" ? true : roundTrip,
      start: startDepot, // always include start
    };
    if (endWh !== "Same as Start") payload.end = endDepot;
    return payload;
  }

  async function handleOptimize() {
    try {
      setBusy(true);
      setError(null);
      if (points.length < 5 || points.length > 12) {
        throw new Error("Please generate 5–12 seller pick-ups before optimizing.");
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
        const msg = data?.message || `HTTP ${res.status} ${res.statusText}`;
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

  // 📍 Use browser geolocation to set start override
  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setStartOverride({ lat: latitude, lng: longitude });
      },
      (err) => {
        alert("Could not get location: " + err.message);
      }
    );
  }

  // Map focus on start depot
  const mapCenter: [number, number] = [startDepot.lat, startDepot.lng];

  // ✅ Build full path: Start → sellers (optimized order) → End/Start
  const routePositions: [number, number][] = useMemo(() => {
    if (!result?.ok || !Array.isArray(result.solution?.order) || points.length === 0) {
      return [];
    }

    const seq = result.solution.order.map(
      (i: number) => [points[i].lat, points[i].lng] as [number, number]
    );

    // In this UI we always send a start depot.
    const hasStartDepot = true;
    const hasEndDepot = endWh !== "Same as Start";
    const mustReturnToStart = endWh === "Same as Start"; // enforced round-trip

    const full: [number, number][] = [];

    if (hasStartDepot) {
      full.push([startDepot.lat, startDepot.lng]); // Start
    }

    // Sellers
    full.push(...seq);

    if (mustReturnToStart) {
      // round-trip: go back to start depot
      full.push([startDepot.lat, startDepot.lng]);
    } else if (hasEndDepot) {
      // open tour to explicit end depot
      full.push([endDepot.lat, endDepot.lng]);
    } else if (seq.length > 1 && result?.diagnostics?.round_trip) {
      // no depots provided (unlikely here), wrap sellers
      full.push(seq[0]);
    }

    return full;
  }, [result, points, startDepot, endDepot, endWh]);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>EulerQ Route Optimizer (POC)</h1>

      {/* SETTINGS BAR */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px,1fr))",
          gap: 12,
          marginBottom: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        {/* Start WH + My Location */}
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Start Warehouse (City)
          </label>
          <select
            value={startWh}
            onChange={(e) => {
              setStartWh(e.target.value as WarehouseKey);
              setStartOverride(null); // clear custom override when switching
            }}
            style={{ width: "100%", padding: 8 }}
          >
            {Object.keys(WAREHOUSES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            Lat/Lng: {startDepot.lat.toFixed(4)}, {startDepot.lng.toFixed(4)}{" "}
            {startOverride && <em>(custom)</em>}
          </div>
          <button
            type="button"
            onClick={handleUseMyLocation}
            style={{
              marginTop: 6,
              padding: "6px 10px",
              fontSize: 13,
              background: "#e5e7eb",
              border: "1px solid #ccc",
              borderRadius: 4,
            }}
          >
            📍 Use My Location as Start
          </button>
        </div>

        {/* End WH */}
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            End Warehouse (City)
          </label>
          <select
            value={endWh}
            onChange={(e) => setEndWh(e.target.value as WarehouseKey | "Same as Start")}
            style={{ width: "100%", padding: 8 }}
          >
            <option>Same as Start</option>
            {Object.keys(WAREHOUSES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            {endWh === "Same as Start"
              ? "Returns to Start"
              : `Lat/Lng: ${endDepot.lat.toFixed(4)}, ${endDepot.lng.toFixed(4)}`}
          </div>
        </div>

        {/* Round trip */}
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Round trip
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={endWh === "Same as Start" ? true : roundTrip}
              disabled={endWh === "Same as Start"}
              onChange={(e) => setRoundTrip(e.target.checked)}
            />
            <span>
              {endWh === "Same as Start"
                ? "Forced ON (returns to Start)"
                : roundTrip
                ? "Wrap cities (no external end)"
                : "Open tour (Start→...→End)"}
            </span>
          </label>
        </div>

        {/* Number of sellers */}
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Seller pick-ups (5–12)
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

        {/* Compare toggle */}
        <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={showCompare}
              onChange={(e) => setShowCompare(e.target.checked)}
            />
            <span>Compare QUBO vs. Greedy baseline</span>
          </label>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
          <button onClick={handleGenerate} style={{ padding: "8px 14px" }}>
            🧪 Generate Seller Pickups
          </button>
          <button
            onClick={handleOptimize}
            disabled={!points.length || busy}
            style={{ padding: "8px 14px" }}
          >
            {busy ? "⏳ Optimizing..." : "⚙️ Optimize"}
          </button>
          <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
            API: {process.env.NEXT_PUBLIC_API_BASE || "(dev proxy)"}
          </div>
        </div>
      </div>

      {/* Info */}
      {points.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <b>Generated sellers:</b> {points.length} around{" "}
          {startOverride ? "custom start" : startWh}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, color: "#ef4444" }}>
          <b>Error:</b> {error}
        </div>
      )}

      {/* Results */}
      {result?.ok && (
        <div style={{ marginTop: 12 }}>
          <div>
            <b>Order:</b> {result.solution.order.join(" → ")}
          </div>

          {/* Preferred metric: total distance including depot legs */}
          <div>
            <b>Distance (QUBO):</b>{" "}
            {Number(result.solution.distance_km).toFixed(2)} km
          </div>

          {showCompare && (
            <>
              <div>
                <b>Baseline (greedy):</b>{" "}
                {Number(result.solution.baseline_km).toFixed(2)} km
              </div>
              <div>
                <b>Improvement vs baseline:</b>{" "}
                {Number(result.solution.improvement_pct).toFixed(1)}%
              </div>

              {/* Tiny bar compare (lower is better) */}
              <div style={{ marginTop: 8, maxWidth: 480 }}>
                <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                  Lower is better
                </div>
                {(() => {
                  const q = Math.max(0.001, Number(result.solution.distance_km));
                  const b = Math.max(0.001, Number(result.solution.baseline_km));
                  const max = Math.max(q, b);
                  const qw = Math.round((q / max) * 100);
                  const bw = Math.round((b / max) * 100);
                  return (
                    <div style={{ display: "grid", gap: 6 }}>
                      <div>
                        <div style={{ fontSize: 12 }}>QUBO</div>
                        <div style={{ background: "#e5e7eb", height: 8, borderRadius: 4 }}>
                          <div
                            style={{
                              width: `${qw}%`,
                              height: 8,
                              borderRadius: 4,
                              background: "#10b981",
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12 }}>Greedy</div>
                        <div style={{ background: "#e5e7eb", height: 8, borderRadius: 4 }}>
                          <div
                            style={{
                              width: `${bw}%`,
                              height: 8,
                              borderRadius: 4,
                              background: "#3b82f6",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}

          {/* Optional straight Start–End diagnostic */}
          {typeof result?.diagnostics?.depots?.start_end_km === "number" && (
            <div style={{ marginTop: 6 }}>
              <b>Straight Start–End:</b>{" "}
              {result.diagnostics.depots.start_end_km.toFixed(2)} km
            </div>
          )}

          {/* Solver details */}
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            <b>Solver Info:</b> QUBO (minimize xᵀQx) solved via simulated annealing.
            Terms added: L={result?.diagnostics?.qubo_terms?.linear_terms_added ?? 0}, Q=
            {result?.diagnostics?.qubo_terms?.quadratic_terms_added ?? 0}. · Restarts=
            {result?.diagnostics?.restarts}, Reads/Restart=
            {result?.diagnostics?.reads_per_restart}, Best Restart=
            {result?.diagnostics?.best_restart_idx}
          </div>
        </div>
      )}

      {/* Map */}
      {leaflet && (points.length > 0 || result?.ok) && (
        <div style={{ height: 460, marginTop: 14 }}>
          <leaflet.MapContainer
            center={mapCenter}
            zoom={12}
            style={{ height: "100%", width: "100%" }}
          >
            <leaflet.TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="© OpenStreetMap contributors"
            />

            {/* ✅ Polyline: Start → sellers → End/Start */}
            {routePositions.length >= 2 && (
              <leaflet.Polyline positions={routePositions} />
            )}

            {/* Seller markers */}
            {points.map((p, idx) => (
              <leaflet.Marker key={idx} position={[p.lat, p.lng]}>
                <leaflet.Popup>
                  Seller #{idx} — {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                </leaflet.Popup>
              </leaflet.Marker>
            ))}

            {/* Depots */}
            <leaflet.Marker position={[startDepot.lat, startDepot.lng]}>
              <leaflet.Popup>
                Start Warehouse — {startOverride ? "Custom" : startWh}
              </leaflet.Popup>
            </leaflet.Marker>
            {endWh !== "Same as Start" && (
              <leaflet.Marker position={[endDepot.lat, endDepot.lng]}>
                <leaflet.Popup>End Warehouse — {endWh}</leaflet.Popup>
              </leaflet.Marker>
            )}
          </leaflet.MapContainer>
        </div>
      )}
    </div>
  );
}
