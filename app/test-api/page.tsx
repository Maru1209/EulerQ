"use client";

import { useState } from "react";
import { optimizeJij } from "@/lib/api";

export default function TestApiPage() {
  const [health, setHealth] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://127.0.0.1:8000";

  async function pingHealth() {
    const res = await fetch(`${API_BASE}/health`);
    setHealth(await res.json());
  }

  async function runJij() {
    setLoading(true);
    setResult(null);
    try {
      const payload = {
        points: [
          { lat: 12.9352, lng: 77.6245 }, // Koramangala (start)
          { lat: 12.9365, lng: 77.6280 },
          { lat: 12.9335, lng: 77.6302 },
          { lat: 12.9384, lng: 77.6221 },
          { lat: 12.9401, lng: 77.6264 },
          { lat: 12.9322, lng: 77.6209 },
          { lat: 12.9377, lng: 77.6293 },
          { lat: 12.9343, lng: 77.6187 },
          { lat: 12.9391, lng: 77.6234 },
          { lat: 12.9369, lng: 77.6210 },
        ],
        round_trip: true,
        mode: "fast",
        num_reads: 800
      };
      const out = await optimizeJij(payload);
      setResult(out);
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>API Smoke Test</h1>

      <div style={{ marginTop: 16 }}>
        <button onClick={pingHealth} style={{ padding: "8px 12px", marginRight: 8 }}>
          Ping /health
        </button>
        <button onClick={runJij} style={{ padding: "8px 12px" }} disabled={loading}>
          {loading ? "Running..." : "Run /optimize/jij"}
        </button>
      </div>

      <pre style={{ marginTop: 16, background: "#f7f7f7", padding: 12 }}>
        .env API_BASE = {API_BASE}
      </pre>

      {health && (
        <>
          <h3>Health</h3>
          <pre>{JSON.stringify(health, null, 2)}</pre>
        </>
      )}

      {result && (
        <>
          <h3>JIJ Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
