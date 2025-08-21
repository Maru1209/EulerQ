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
    if (sOK) payload.start = { lat: parseFloat(startLat), lng: parseFloat(startLng) };
    if (eOK) payload.end = { lat: parseFloat(endLat), lng: parseFloat(endLng) };
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

  // 📍 New: Use browser geolocation to set start
  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setStartLat(latitude.toFixed(6));
        setStartLng(longitude.toFixed(6));
      },
      (err) => {
        alert("Could not get location: " + err.message);
      }
    );
  }

  // polyline positions
  const routePositions: [number, number][] =
    result?.ok && Array.isArray(result.solution?.order)
      ? (() => {
          const seq = result.solution.order.map(
            (i: number) => [points[i].lat, points[i].lng] as [number, number]
          );
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
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 12 }}>EulerQ Route Optimizer (POC)</h1>

      {/* --- TOP TOOLBAR --- */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 12,
          padding: 10,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#fafafa",
        }}
      >
        <button onClick={handleGenerate} style={{ padding: "8px 14px" }}>
          ➕ Generate Points
        </button>
        <button
          onClick={handleOptimize}
          disabled={!points.length || busy}
          style={{ padding: "8px 14px" }}
        >
          {busy ? "⏳ Optimizing..." : "⚙️ Optimize"}
        </button>
        <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.8 }}>
          Using API: {process.env.NEXT_PUBLIC_API_BASE || "(dev proxy)"}
        </div>
      </div>

      {/* --- Controls --- */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px,1fr))",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {/* Number of stops */}
        <div>
          <label style={{ fontWeight: 600 }}>Number of stops (5–12)</label>
          <input
            type="number"
            min={5}
            max={12}
            value={numPoints}
            onChange={(e) => setNumPoints(parseInt(e.target.value || "8", 10))}
            style={{ width: "100%", padding: 6 }}
          />
          <input
            type="range"
            min={5}
            max={12}
            value={numPoints}
            onChange={(e) => setNumPoints(parseInt(e.target.value, 10))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>

        {/* Round trip */}
        <div>
          <label style={{ fontWeight: 600 }}>Round trip</label>
          <label style={{ display: "flex", gap: 6 }}>
            <input
              type="checkbox"
              checked={roundTrip}
              onChange={(e) => setRoundTrip(e.target.checked)}
            />
            <span>{roundTrip ? "Return to start enabled" : "Open tour"}</span>
          </label>
        </div>

        {/* Start depot */}
        <div>
          <label style={{ fontWeight: 600 }}>Start (lat, lng)</label>
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <input
              placeholder="12.95"
              value={startLat}
              onChange={(e) => setStartLat(e.target.value)}
              style={{ flex: 1, padding: 6 }}
            />
            <input
              placeholder="77.60"
              value={startLng}
              onChange={(e) => setStartLng(e.target.value)}
              style={{ flex: 1, padding: 6 }}
            />
          </div>
          <button
            type="button"
            onClick={handleUseMyLocation}
            style={{
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

        {/* End depot */}
        <div>
          <label style={{ fontWeight: 600 }}>End (lat, lng)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              placeholder="12.96"
              value={endLat}
              onChange={(e) => setEndLat(e.target.value)}
              style={{ flex: 1, padding: 6 }}
            />
            <input
              placeholder="77.62"
              value={endLng}
              onChange={(e) => setEndLng(e.target.value)}
              style={{ flex: 1, padding: 6 }}
            />
          </div>
        </div>
      </div>

      {/* Show results/errors/map... (unchanged below) */}
      {/* ... */}
    </div>
  );
}
