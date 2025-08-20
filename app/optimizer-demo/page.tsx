"use client";
import { useState, useEffect } from "react";
import "leaflet/dist/leaflet.css";

type Point = { lat:number; lng:number };

export default function OptimizerDemo() {
  const [points, setPoints] = useState<Point[]>([]);
  const [result, setResult] = useState<any>(null);
  const [leaflet, setLeaflet] = useState<any>(null);

  // Dynamically import react-leaflet only in browser
  useEffect(() => {
    (async () => {
      const mod = await import("react-leaflet");
      const L = (await import("leaflet")).default;
      setLeaflet({ ...mod, L });
    })();
  }, []);

  async function handleGenerate() {
    const N = 8;
    const pts: Point[] = Array.from({ length: N }, () => ({
      lat: 12.9 + Math.random() * 0.15,
      lng: 77.5 + Math.random() * 0.15,
    }));
    setPoints(pts);
    setResult(null);
  }

  async function handleOptimize() {
    const res = await fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        problem_type: "route",
        backend: "classical",
        payload: { points, round_trip: true },
      }),
    });
    setResult(await res.json());
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Eulerq Route Optimizer (POC)</h1>
      <div>
        Stops (5–12):
        <button onClick={handleGenerate}>Generate Points</button>
        <button onClick={handleOptimize} disabled={!points.length}>
          Optimize
        </button>
      </div>

      {points.length > 0 && (
        <pre>Points {JSON.stringify(points, null, 2)}</pre>
      )}

      {result?.ok && (
        <div>
          <div><b>Distance:</b> {result.solution.distance_km.toFixed(2)} km</div>
          <div><b>Order:</b> {result.solution.order.join(" → ")}</div>

          {/* Render map only if leaflet loaded */}
          {leaflet && (
            <div style={{ height: 420, marginTop: 20 }}>
              <leaflet.MapContainer
                center={[points[0].lat, points[0].lng]}
                zoom={12}
                style={{ height: "100%", width: "100%" }}
              >
                <leaflet.TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution="&copy; OpenStreetMap contributors"
                />
                <leaflet.Polyline
                  positions={result.solution.order.map((i: number) => [
                    points[i].lat,
                    points[i].lng,
                  ])}
                  color="blue"
                />
                {points.map((p, idx) => (
                  <leaflet.Marker key={idx} position={[p.lat, p.lng]}>
                    <leaflet.Popup>#{idx}</leaflet.Popup>
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
