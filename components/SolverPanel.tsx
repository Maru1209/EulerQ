// components/SolverPanel.tsx
'use client';

import React, { useMemo, useState } from 'react';

/* ----------------------------- Types ----------------------------- */
type LatLng = { lat: number; lng: number };

type SolveResponse = {
  ok?: boolean;
  objective_value?: number;
  solution?: {
    order: number[];
    distance_km_cities: number;
    distance_km: number;
    baseline_km: number;
    improvement_pct: number;
    baseline_order: number[];
  };
  diagnostics?: any;
  message?: string;
};

type JIJResponse = { route: number[]; energy: number };

/* --------------------------- Helpers ----------------------------- */
const toRad = (d: number) => (d * Math.PI) / 180;
const haversine = (a: LatLng, b: LatLng) => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function buildDistanceMatrix(points: LatLng[]): number[][] {
  const N = points.length;
  const D: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      D[i][j] = i === j ? 0 : haversine(points[i], points[j]);
    }
  }
  return D;
}

function formatKm(km: number | undefined) {
  if (km == null || Number.isNaN(km)) return '-';
  return `${km.toFixed(2)} km`;
}

/* --------------- Demo points (replace with your data) ------------ */
const demoPoints: LatLng[] = [
  { lat: 12.9716, lng: 77.5946 },
  { lat: 12.9352, lng: 77.6245 },
  { lat: 12.9989, lng: 77.553 },
  { lat: 12.9279, lng: 77.6271 },
  { lat: 12.956, lng: 77.701 },
];

/* =========================== Component =========================== */
export default function SolverPanel() {
  const [points, setPoints] = useState<LatLng[]>(demoPoints);
  const [roundTrip, setRoundTrip] = useState<boolean>(true);
  const [startDepot, setStartDepot] = useState<LatLng | null>({
    lat: 12.9289,
    lng: 77.6762,
  });
  const [endDepot, setEndDepot] = useState<LatLng | null>({
    lat: 12.9698,
    lng: 77.7499,
  });

  const [solver, setSolver] = useState<'classical' | 'jij-openjij'>(
    'jij-openjij',
  );
  const [reads, setReads] = useState<number>(800);
  const [penalty, setPenalty] = useState<number>(16);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const D = useMemo(() => buildDistanceMatrix(points), [points]);

  // Optional: depot linear costs for JIJ if you enable that server-side
  const startCost = useMemo(
    () => (startDepot ? points.map((p) => haversine(startDepot, p)) : undefined),
    [startDepot, points],
  );
  const endCost = useMemo(
    () => (endDepot ? points.map((p) => haversine(p, endDepot)) : undefined),
    [endDepot, points],
  );

  const [classicalOut, setClassicalOut] = useState<SolveResponse | null>(null);
  const [jijOut, setJijOut] = useState<JIJResponse | null>(null);

  // Decoded km for JIJ (open-chain over city order only)
  const jijKm = useMemo(() => {
    if (!jijOut) return undefined;
    const order = jijOut.route;
    let km = 0;
    for (let k = 0; k < order.length - 1; k++) km += D[order[k]][order[k + 1]];
    return km;
  }, [jijOut, D]);

  async function runSolve() {
    setError(null);
    setLoading(true);
    try {
      if (solver === 'classical') {
        const body = {
          problem_type: 'route',
          backend: 'classical',
          payload: {
            points,
            round_trip: roundTrip,
            start: startDepot ?? undefined,
            end: endDepot ?? undefined,
          },
        };
        const res = await fetch('/api/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const data: SolveResponse = await res.json();
        setClassicalOut(data);
        setJijOut(null);
      } else {
        const body: any = {
          cost: D,
          num_reads: reads,
          lam_visit: penalty,
          lam_step: penalty,
          // If you enable depot linear terms server-side, send these too:
          // start_cost: startCost,
          // end_cost: endCost,
        };
        const res = await fetch('/optimize/jij', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const data: JIJResponse = await res.json();
        setJijOut(data);
        setClassicalOut(null);
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  function renderOrder(order: number[]) {
    return (
      <div className="flex flex-wrap gap-2">
        {order.map((idx, k) => (
          <div
            key={k}
            className="px-2 py-1 rounded-xl bg-gray-100 text-gray-800 text-sm shadow"
          >
            {k + 1}. #{idx}
          </div>
        ))}
      </div>
    );
  }

  // If you want to render coordinates, this returns the ordered LatLngs
  function decode(points: LatLng[], order: number[]) {
    return order.map((i) => points[i]);
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">
        EulerQ • Solver Switch (Classical vs JIJ/OpenJij)
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Controls */}
        <div className="space-y-3 p-4 rounded-2xl border shadow-sm">
          <div className="text-sm font-medium">Solver</div>
          <select
            className="w-full border rounded-xl p-2"
            value={solver}
            onChange={(e) => setSolver(e.target.value as any)}
          >
            <option value="classical">
              Classical (neal SA @ /api/solve)
            </option>
            <option value="jij-openjij">
              JIJ (OpenJij local @ /optimize/jij)
            </option>
          </select>

          {solver === 'classical' ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={roundTrip}
                  onChange={(e) => setRoundTrip(e.target.checked)}
                />{' '}
                Round trip
              </label>
              <div className="text-xs text-gray-500 col-span-2">
                Classical endpoint supports depots + round trip.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs">Reads</div>
                <input
                  type="number"
                  className="w-full border rounded-xl p-2"
                  value={reads}
                  onChange={(e) => setReads(parseInt(e.target.value || '0'))}
                />
              </div>
              <div>
                <div className="text-xs">Penalty (visit/step)</div>
                <input
                  type="number"
                  className="w-full border rounded-xl p-2"
                  value={penalty}
                  onChange={(e) => setPenalty(parseInt(e.target.value || '0'))}
                />
              </div>
              <div className="text-xs text-gray-500 col-span-2">
                Current JIJ endpoint solves open chain among cities. Depot
                linear costs can be added server-side.
              </div>
            </div>
          )}

          <button
            onClick={runSolve}
            disabled={loading}
            className="mt-2 px-4 py-2 rounded-2xl bg-black text-white shadow hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Solving…' : 'Run Optimization'}
          </button>
          {error && (
            <div className="text-red-600 text-sm mt-2">{error}</div>
          )}
        </div>

        {/* Cities list */}
        <div className="p-4 rounded-2xl border shadow-sm space-y-3">
          <div className="text-sm font-medium">
            Cities ({points.length})
          </div>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
            {points.map((p, i) => (
              <li key={i}>
                #{i} — {p.lat.toFixed(4)}, {p.lng.toFixed(4)}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Results - Classical */}
      {classicalOut && (
        <div className="p-4 rounded-2xl border shadow-sm space-y-3">
          <div className="text-lg font-semibold">Classical Result</div>
          <div className="text-sm">Order:</div>
          {classicalOut.solution && renderOrder(classicalOut.solution.order)}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-2">
            <div className="p-2 rounded-xl bg-gray-50">
              Cities path: {formatKm(classicalOut.solution?.distance_km_cities)}
            </div>
            <div className="p-2 rounded-xl bg-gray-50">
              Total (depots): {formatKm(classicalOut.solution?.distance_km)}
            </div>
            <div className="p-2 rounded-xl bg-gray-50">
              Baseline: {formatKm(classicalOut.solution?.baseline_km)}
            </div>
            <div className="p-2 rounded-xl bg-gray-50">
              Improvement:{' '}
              {classicalOut.solution
                ? `${classicalOut.solution.improvement_pct.toFixed(1)}%`
                : '-'}
            </div>
          </div>
        </div>
      )}

      {/* Results - JIJ */}
      {jijOut && (
        <div className="p-4 rounded-2xl border shadow-sm space-y-3">
          <div className="text-lg font-semibold">JIJ (OpenJij) Result</div>
          <div className="text-sm">Order:</div>
          {renderOrder(jijOut.route)}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-2">
            <div className="p-2 rounded-xl bg-gray-50">
              Energy: {jijOut.energy}
            </div>
            <div className="p-2 rounded-xl bg-gray-50">
              Decoded km (open chain): {formatKm(jijKm)}
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500">
        Tip: ensure your Next.js rewrites forward <code>/api/*</code> and{' '}
        <code>/optimize/*</code> to FastAPI on <code>127.0.0.1:8000</code>, or
        use full URLs in <code>fetch</code>.
      </div>
    </div>
  );
}
