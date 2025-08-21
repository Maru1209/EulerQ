"use client";
import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";

type Point = { lat: number; lng: number };

type WarehouseKey =
  | "Hoskote"
  | "Bellandur"
  | "Whitefield"
  | "Peenya"
  | "Yelahanka";

// Preset warehouse city coordinates (approx)
const WAREHOUSES: Record<WarehouseKey, { lat: number; lng: number }> = {
  Hoskote: { lat: 13.0700, lng: 77.8000 },
  Bellandur: { lat: 12.9289, lng: 77.6762 },
  Whitefield: { lat: 12.9698, lng: 77.7499 },
  Peenya: { lat: 13.0275, lng: 77.5150 },
  Yelahanka: { lat: 13.1007, lng: 77.5963 },
};

export default function OptimizerDemo() {
  const [points, setPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // UI state
  const [startWh, setStartWh] = useState<WarehouseKey>("Bellandur");
  const [endWh, setEndWh] = useState<WarehouseKey | "Same as Start">(
    "Same as Start"
  );
  const [roundTrip, setRoundTrip] = useState<boolean>(true);
  const [numPoints, setNumPoints] = useState<number>(8); // 5–12

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

  const startDepot = useMemo(() => WAREHOUSES[startWh], [startWh]);
  const endDepot = useMemo(() => {
    if (endWh === "Same as Start") return WAREHOUSES[startWh];
    return WAREHOUSES[endWh as WarehouseKey];
  }, [endWh, startWh]);

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
    // Generate seller pick-ups around START warehouse
    const pts: Point[] = Array.from({ length: N }, () =>
      randInRadiusKm(startDepot, 8, 12)
    );
    setPoints(pts);
    setResult(null);
    setError(null);
  }

  function buildPayload() {
    const payload: any = {
      points,
      round_trip: endWh === "Same as Start" ? true : roundTrip,
      start: startDepot, // always send start depot
    };
    if (endWh !== "Same as Start") payload.end = endDepot; // open tour if different
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

  // Polyline through seller points (and visually close if pure round-trip without external depots)
  const routePositions: [number, number][] =
    result?.ok && Array.isArray(result.solution?.order)
      ? (() => {
          const seq = result.solution.order.map(
            (i: number) => [points[i].lat, points[i].lng] as [number, number]
          );
          const depotsUsed =
            result?.diagnostics?.depots?.has_start ||
            result?.diagnostics?.depots?.has_end;
          const isRoundTripFinal =
            endWh === "Same as Start" ? true : !!result?.diagnostics?.round_trip;
          return isRoundTripFinal && !depotsUsed && seq.length > 1
            ? [...seq, seq[0]]
            : seq;
        })()
      : [];

  const mapCenter: [number, number] = [startDepot.lat, startDepot.lng];

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>EulerQ Route Optimizer (POC)</h1>

      {/* --- SETTINGS BAR --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))",
          gap: 12,
          marginBottom: 12,
          padding: 12,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        {/* Start WH */}
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            Start Warehouse (City)
          </label>
          <select
            value={startWh}
            onChange={(e) => setStartWh(e.target.value as WarehouseKey)}
            style={{ width: "100%", padding: 8 }}
          >
            {Object.keys(WAREHOUSES).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
            Lat/Lng: {startDepot.lat.toFixed(4)}, {startDepot.lng.toFixed(4)}
          </div>
        </div>

        {/* End WH */}
        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
            End Warehouse (City)
          </label>
          <select
            value={endWh}
            onChange={(e) =>
              setEndWh(e.target.value as WarehouseKey | "Same as Start")
            }
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

        {/* Round trip (only if End != Same as Start) */}
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
                ? "Return to End OFF (cities wrap)"
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
          <b>Generated sellers:</b> {points.length} around {startWh}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 8, color: "#ef4444" }}>
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
              <b>Start ↔ End distance:</b>{" "}
              {Number(result.diagnostics.depots.start_end_km).toFixed(2)} km
            </div>
          )}

          {/* QUBO / Solver info */}
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            <b>Solver Info:</b> We formulate the route as a <b>QUBO</b> and use
            simulated annealing to minimize the energy xᵀQx. Constraints (visit
            each seller once, fill positions) and distances are encoded inside Q.
            <div style={{ marginTop: 6 }}>
              QUBO terms: L=
              {result?.diagnostics?.qubo_terms?.linear_terms_added ?? 0}, Q=
              {result?.diagnostics?.qubo_terms?.quadratic_terms_added ?? 0}. ·
              Restarts={result?.diagnostics?.restarts}, Reads/Restart=
              {result?.diagnostics?.reads_per_restart}, Best Restart=
              {result?.diagnostics?.best_restart_idx}
            </div>
          </div>

          {/* Map */}
          {leaflet && (
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

                {/* Polyline through seller sequence */}
                {Array.isArray(result.solution.order) && (
                  <leaflet.Polyline positions={routePositions} />
                )}

                {/* Sellers */}
                {points.map((p, idx) => (
                  <leaflet.Marker key={idx} position={[p.lat, p.lng]}>
                    <leaflet.Popup>
                      Seller #{idx} — {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
                    </leaflet.Popup>
                  </leaflet.Marker>
                ))}

                {/* Depots */}
                <leaflet.Marker position={[startDepot.lat, startDepot.lng]}>
                  <leaflet.Popup>Start Warehouse — {startWh}</leaflet.Popup>
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
      )}
    </div>
  );
}
