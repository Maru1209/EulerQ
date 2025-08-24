// components/RouteOptimizer.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type LatLng = { lat: number; lng: number };
type LatLngTuple = [number, number];

/* ----------------- API shapes ----------------- */
type SolveResponse = {
  ok?: boolean;
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

type JIJWire = {
  route: number[];
  energy: number;
  distance_km?: number | null;
  polyline?: LatLngTuple[] | null;
  solver?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';

/* ----------------- presets ----------------- */
const BangalorePresets: { label: string; lat: number; lng: number }[] = [
  { label: 'Bellandur',       lat: 12.9289, lng: 77.6762 },
  { label: 'Koramangala',     lat: 12.9352, lng: 77.6245 },
  { label: 'Indiranagar',     lat: 12.9784, lng: 77.6408 },
  { label: 'Whitefield',      lat: 12.9698, lng: 77.7499 },
  { label: 'HSR Layout',      lat: 12.9081, lng: 77.6476 },
  { label: 'Marathahalli',    lat: 12.9560, lng: 77.7010 },
  { label: 'Electronic City', lat: 12.8399, lng: 77.6770 },
  { label: 'Hebbal',          lat: 13.0355, lng: 77.5970 },
  { label: 'JP Nagar',        lat: 12.9057, lng: 77.5856 },
  { label: 'MG Road',         lat: 12.9740, lng: 77.6122 },
];

/* ----------------- geometry + helpers ----------------- */
const toRad = (d: number) => (d * Math.PI) / 180;
const haversine = (a: LatLng, b: LatLng) => {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

function jitterAround(center: LatLng, kmRadius: number): LatLng {
  const r = kmRadius * Math.sqrt(Math.random());
  const theta = 2 * Math.PI * Math.random();
  const dLat = r / 111;
  const dLng = r / (111 * Math.cos(toRad(center.lat)));
  return { lat: center.lat + dLat * Math.sin(theta), lng: center.lng + dLng * Math.cos(theta) };
}

function buildDistanceMatrix(points: LatLng[]): number[][] {
  const N = points.length;
  const D: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) D[i][j] = i === j ? 0 : haversine(points[i], points[j]);
  return D;
}

function nearlyEqual(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

function ensureClosed(path: LatLngTuple[], roundTrip: boolean): LatLngTuple[] {
  if (!roundTrip || path.length < 2) return path;
  const [aLat, aLng] = path[0];
  const [zLat, zLng] = path[path.length - 1];
  if (!nearlyEqual(aLat, zLat) || !nearlyEqual(aLng, zLng)) {
    return [...path, [aLat, aLng]];
  }
  return path;
}

function orderToPolyline(
  order: number[],
  cities: LatLng[],
  opts: { roundTrip: boolean; start?: LatLng; end?: LatLng }
): LatLngTuple[] {
  const pts: LatLngTuple[] = [];
  if (opts.start) pts.push([opts.start.lat, opts.start.lng]);
  for (const idx of order) {
    const c = cities[idx];
    pts.push([c.lat, c.lng]);
  }
  if (opts.end) {
    pts.push([opts.end.lat, opts.end.lng]);
  } else if (opts.roundTrip) {
    if (opts.start) pts.push([opts.start.lat, opts.start.lng]);
    else if (order.length > 0) {
      const first = cities[order[0]];
      pts.push([first.lat, first.lng]);
    }
  }
  return ensureClosed(pts, opts.roundTrip);
}

function distanceForOrderIncludingDepots(
  order: number[],
  cities: LatLng[],
  start: LatLng,
  end: LatLng,
  roundTrip: boolean
): number {
  if (!order || order.length === 0) return 0;
  const D = buildDistanceMatrix(cities);
  let km = 0;
  km += haversine(start, cities[order[0]]);
  for (let k = 0; k < order.length - 1; k++) km += D[order[k]][order[k + 1]];
  km += roundTrip ? haversine(cities[order[order.length - 1]], start)
                  : haversine(cities[order[order.length - 1]], end);
  return km;
}

function fmtKm(x?: number | null) {
  return x != null ? x.toFixed(2) + ' km' : '—';
}
function fmtPct(x?: number | null) {
  if (x == null) return '—';
  return (x >= 0 ? '−' : '+') + Math.abs(x).toFixed(1) + '%';
}
function savingsKmPct(candidate?: number | null, baseline?: number | null) {
  if (candidate == null || baseline == null || baseline <= 0) return { km: null, pct: null };
  const km = baseline - candidate;
  const pct = (km / baseline) * 100;
  return { km, pct };
}

/* ----------------- Leaflet marker icons ----------------- */
const DefaultIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

/* ========================= Component ========================= */
export default function RouteOptimizer() {
  // Warehouses
  const [start, setStart] = useState<LatLng>(BangalorePresets[0]);
  const [startCity, setStartCity] = useState<string>(BangalorePresets[0].label);
  const [sameAsStart, setSameAsStart] = useState<boolean>(true);
  const [end, setEnd] = useState<LatLng>(BangalorePresets[0]);
  const [endCity, setEndCity] = useState<string>(BangalorePresets[0].label);

  // Sellers
  const [sellerCount, setSellerCount] = useState<number>(8);
  const [sellers, setSellers] = useState<LatLng[]>([]);

  // JIJ params
  const [reads, setReads] = useState<number>(1200);
  const [penalty, setPenalty] = useState<number>(16);

  // UI options
  const [showCompare, setShowCompare] = useState<boolean>(true);
  const [showNaive, setShowNaive] = useState<boolean>(true);

  // State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results
  const [jij, setJij] = useState<{ order: number[]; km: number | null; energy: number | null; polyline: LatLngTuple[] } | null>(null);
  const [qubo, setQubo] = useState<{ order: number[]; km: number | null; polyline: LatLngTuple[] } | null>(null);
  const [greedy, setGreedy] = useState<{ order: number[]; km: number | null; polyline: LatLngTuple[] } | null>(null);
  const [naive, setNaive] = useState<{ order: number[]; km: number | null; polyline: LatLngTuple[] } | null>(null);

  // map size fix
  const [mapReady, setMapReady] = useState(false);
  useEffect(() => { setMapReady(true); }, []);

  function pickStart(label: string) {
    setStartCity(label);
    const p = BangalorePresets.find(c => c.label === label)!;
    setStart({ lat: p.lat, lng: p.lng });
    if (sameAsStart) { setEnd({ lat: p.lat, lng: p.lng }); setEndCity(label); }
  }
  function pickEnd(label: string) {
    setEndCity(label);
    const p = BangalorePresets.find(c => c.label === label)!;
    setEnd({ lat: p.lat, lng: p.lng });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStart(loc);
        setStartCity('My Location');
        if (sameAsStart) { setEnd(loc); setEndCity('My Location'); }
        setError(null);
      },
      (err) => setError('Location error: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function generateSellers() {
    const N = Math.min(12, Math.max(5, sellerCount));
    const pts: LatLng[] = Array.from({ length: N }, () => jitterAround(start, 1 + Math.random() * 3));
    setSellers(pts);
    setError(null);
    setJij(null); setQubo(null); setGreedy(null); setNaive(null);
  }

  /* ========= Auto λ & Auto Reads ========= */
  function autoLambdaFromSellers() {
    if (sellers.length < 2) {
      alert("Generate sellers first, then click Auto.");
      return;
    }
    const D = buildDistanceMatrix(sellers);
    let Dmax = 0;
    for (let i = 0; i < D.length; i++) for (let j = 0; j < D.length; j++) if (i !== j && D[i][j] > Dmax) Dmax = D[i][j];
    const lam = Math.max(8, Math.round(4 * Dmax)); // ~4×Dmax
    setPenalty(lam);
  }
  function autoReadsFromSellers() {
    const r = Math.max(800, sellers.length * 250); // ~250×N, min 800
    setReads(r);
  }
  /* ======================================= */

  async function optimize() {
    try {
      setLoading(true);
      setError(null);
      setJij(null); setQubo(null); setGreedy(null); setNaive(null);

      if (sellers.length < 5) throw new Error('Generate at least 5 seller pick-ups first');

      // Single source of truth for depots and topology
      const effectiveEnd: LatLng = sameAsStart ? start : end;
      const rt = sameAsStart; // round-trip only when Same-as-Start

      // Bodies for API
      const classicalBody = {
        problem_type: 'route',
        backend: 'classical',
        payload: {
          points: sellers,
          round_trip: rt,
          start,
          end: effectiveEnd,
        },
      };

      const jijBody: any = {
        points: sellers,
        round_trip: rt,
        start,
        end: effectiveEnd,
        num_reads: reads,
        lam_visit: penalty,
        lam_step: penalty,
      };

      const [clRes, jijRes] = await Promise.all([
        fetch(`${API_BASE}/api/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(classicalBody),
        }).then(r => r.json()),
        fetch(`${API_BASE}/optimize/jij`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jijBody),
        }).then(async (r) => {
          if (!r.ok) {
            throw new Error(`JIJ endpoint not found at ${API_BASE}/optimize/jij. If you're using Railway, deploy the /optimize/jij route or point NEXT_PUBLIC_API_BASE to your local FastAPI.`);
          }
          return r.json();
        }),
      ]);

      // ----- Naive (0..N-1) including depots (always recomputed on FE)
      const naiveOrder = Array.from({ length: sellers.length }, (_, i) => i);
      const naivePolyline = orderToPolyline(naiveOrder, sellers, { roundTrip: rt, start, end: sameAsStart ? undefined : effectiveEnd });
      const naiveKmU = distanceForOrderIncludingDepots(naiveOrder, sellers, start, effectiveEnd, rt);
      setNaive({ order: naiveOrder, km: naiveKmU, polyline: ensureClosed(naivePolyline, rt) });

      // ----- Classical result (QUBO + Greedy orders)
      if ((clRes as SolveResponse)?.ok === false) throw new Error((clRes as SolveResponse)?.message || 'Classical solver error');

      const cl = clRes as SolveResponse;
      const quboOrder: number[]   = cl?.solution?.order ?? [];
      const greedyOrder: number[] = cl?.solution?.baseline_order ?? [];

      // FE unified totals for QUBO & Greedy (ignore backend distances for comparisons)
      const quboKmU   = quboOrder.length   ? distanceForOrderIncludingDepots(quboOrder,   sellers, start, effectiveEnd, rt) : null;
      const greedyKmU = greedyOrder.length ? distanceForOrderIncludingDepots(greedyOrder, sellers, start, effectiveEnd, rt) : null;

      const quboPolyline = orderToPolyline(quboOrder, sellers,   { roundTrip: rt, start, end: sameAsStart ? undefined : effectiveEnd });
      const greedyPolyline = orderToPolyline(greedyOrder, sellers,{ roundTrip: rt, start, end: sameAsStart ? undefined : effectiveEnd });

      setQubo({   order: quboOrder,   km: quboKmU,   polyline: ensureClosed(quboPolyline, rt) });
      setGreedy({ order: greedyOrder, km: greedyKmU, polyline: ensureClosed(greedyPolyline, rt) });

      // ----- JIJ normalize + FE unified total
      const j: JIJWire = jijRes || {};
      const jijOrder: number[] = Array.isArray(j.route) ? j.route : [];
      const jijPolyline: LatLngTuple[] =
        (Array.isArray(j.polyline) ? j.polyline! : null) ??
        orderToPolyline(jijOrder, sellers, { roundTrip: rt, start, end: sameAsStart ? undefined : effectiveEnd });

      const jijKmU = jijOrder.length ? distanceForOrderIncludingDepots(jijOrder, sellers, start, effectiveEnd, rt) : null;

      setJij({
        order: jijOrder,
        km: jijKmU,
        energy: typeof j.energy === 'number' ? j.energy : null,
        polyline: ensureClosed(jijPolyline, rt),
      });

    } catch (e: any) {
      setError(e?.message || 'Optimization failed');
      setJij(null); setQubo(null); setGreedy(null); setNaive(null);
    } finally {
      setLoading(false);
    }
  }

  // Savings (all computed on unified FE totals)
  const naiveKm  = naive?.km ?? null;
  const greedyKm = greedy?.km ?? null;

  const jijVsNaive    = savingsKmPct(jij?.km ?? null, naiveKm);
  const quboVsNaive   = savingsKmPct(qubo?.km ?? null, naiveKm);
  const greedyVsNaive = savingsKmPct(greedyKm, naiveKm);

  const jijVsGreedy  = savingsKmPct(jij?.km ?? null, greedyKm);
  const quboVsGreedy = savingsKmPct(qubo?.km ?? null, greedyKm);

  // Map center
  const mapCenter: LatLngTuple = [start.lat, start.lng];

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">EulerQ Route Optimizer (POC)</h1>

      {/* headline saving badge */}
      {jij && greedy && (
        <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg inline-block px-3 py-1">
          JIJ saves {fmtKm(jijVsGreedy.km)} ({fmtPct(jijVsGreedy.pct)}) vs Greedy
        </div>
      )}

      {/* Warehouses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border shadow-sm space-y-3">
          <div className="text-sm font-medium">Start Warehouse (City)</div>
          <select
            className="w-full border rounded-xl p-2"
            value={startCity}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'My Location') return;
              const p = BangalorePresets.find(c => c.label === v)!;
              setStartCity(v);
              setStart({ lat: p.lat, lng: p.lng });
              if (sameAsStart) { setEnd({ lat: p.lat, lng: p.lng }); setEndCity(v); }
            }}
          >
            {BangalorePresets.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
            <option value="My Location">My Location</option>
          </select>
          <div className="text-sm">Lat/Lng: {start.lat.toFixed(4)}, {start.lng.toFixed(4)}</div>
          <div className="grid grid-cols-2 gap-2">
            <input className="border rounded-xl p-2" type="number" step="0.0001" value={start.lat}
              onChange={(e)=>setStart(s=>({...s,lat:parseFloat(e.target.value)}))} />
            <input className="border rounded-xl p-2" type="number" step="0.0001" value={start.lng}
              onChange={(e)=>setStart(s=>({...s,lng:parseFloat(e.target.value)}))} />
          </div>
          <button onClick={useMyLocation} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm">
            📍 Use My Location as Start
          </button>
        </div>

        <div className="p-4 rounded-2xl border shadow-sm space-y-3">
          <div className="text-sm font-medium">End Warehouse (City)</div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sameAsStart}
              onChange={(e) => {
                setSameAsStart(e.target.checked);
                if (e.target.checked) { setEnd(start); setEndCity(startCity); }
              }}
            />
            Same as Start (round-trip)
          </label>
          {!sameAsStart && (
            <>
              <select
                className="w-full border rounded-xl p-2"
                value={endCity}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'My Location') return;
                  const p = BangalorePresets.find(c => c.label === v)!;
                  setEndCity(v);
                  setEnd({ lat: p.lat, lng: p.lng });
                }}
              >
                {BangalorePresets.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                <option value="My Location">My Location</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input className="border rounded-xl p-2" type="number" step="0.0001" value={end.lat}
                  onChange={(e)=>setEnd(s=>({...s,lat:parseFloat(e.target.value)}))} />
                <input className="border rounded-xl p-2" type="number" step="0.0001" value={end.lng}
                  onChange={(e)=>setEnd(s=>({...s,lng:parseFloat(e.target.value)}))} />
              </div>
            </>
          )}
          <div className="text-sm">
            {sameAsStart
              ? "Same as Start (round-trip)"
              : `Lat/Lng: ${end.lat.toFixed(4)}, ${end.lng.toFixed(4)}`}
          </div>
        </div>

        {/* Params */}
        <div className="p-4 rounded-2xl border shadow-sm space-y-3">
          <div className="text-sm font-medium">JIJ (Quantum-inspired) parameters</div>

          {/* Reads + Auto */}
          <div>
            <div className="text-xs">Reads</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={100}
                max={5000}
                className="w-full border rounded-xl p-2"
                value={reads}
                onChange={(e)=>setReads(parseInt(e.target.value||'0'))}
              />
              <button
                type="button"
                onClick={autoReadsFromSellers}
                className="px-2 py-1 text-xs rounded bg-gray-100 border"
                title="Scale reads with number of sellers"
              >
                Auto
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Tip: ~250×N sellers, min 800.</div>
          </div>

          {/* Penalty + Auto */}
          <div>
            <div className="text-xs">Penalty (λ)</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={4}
                max={120}
                className="w-full border rounded-xl p-2"
                value={penalty}
                onChange={(e)=>setPenalty(parseInt(e.target.value||'0'))}
              />
              <button
                type="button"
                onClick={autoLambdaFromSellers}
                className="px-2 py-1 text-xs rounded bg-gray-100 border"
                title="Compute λ ≈ 4×Dmax from current sellers"
              >
                Auto
              </button>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Auto uses λ ≈ 4×max(distanceᵢⱼ). Generate sellers first.</div>
          </div>

          <div className="text-sm font-medium">Compare lines</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showCompare} onChange={(e)=>setShowCompare(e.target.checked)} />
            Show QUBO (annealing) & Greedy baseline
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showNaive} onChange={(e)=>setShowNaive(e.target.checked)} />
            Show Naive (0→1→…)
          </label>
        </div>
      </div>

      {/* Sellers + Actions */}
      <div className="p-4 rounded-2xl border shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm font-medium">Seller pick-ups (5–12)</div>
            <input
              type="range" min={5} max={12}
              value={sellerCount}
              onChange={(e)=>setSellerCount(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-sm">{sellerCount}</div>
          </div>
          <div className="flex items-end gap-2">
            <button onClick={generateSellers} className="px-4 py-2 rounded-2xl bg-gray-100 border shadow-sm">
              🧪 Generate Seller Pickups
            </button>
            <button onClick={optimize} disabled={loading || sellers.length < 5} className="px-4 py-2 rounded-2xl bg-black text-white shadow disabled:opacity-50">
              {loading ? '⏳ Optimizing...' : '⚙️ Optimize'}
            </button>
          </div>
          <div className="self-end text-xs text-gray-500">
            API base: {API_BASE}
          </div>
        </div>

        <div>
          <div className="text-sm font-medium">Cities ({sellers.length})</div>
          <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
            {sellers.map((p, i) => (<li key={i}>#{i} — {p.lat.toFixed(5)}, {p.lng.toFixed(5)}</li>))}
          </ol>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>

      {/* Quick stats (with savings) */}
      {(jij || qubo || greedy || naive) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border bg-white">
            <b>JIJ (Quantum-inspired):</b> {fmtKm(jij?.km)}
            <div className="text-xs mt-1 text-gray-600">
              vs Naive: {fmtKm(savingsKmPct(jij?.km ?? null, naive?.km ?? null).km)} ({fmtPct(savingsKmPct(jij?.km ?? null, naive?.km ?? null).pct)})
            </div>
            <div className="text-xs text-gray-600">
              vs Greedy: {fmtKm(savingsKmPct(jij?.km ?? null, greedy?.km ?? null).km)} ({fmtPct(savingsKmPct(jij?.km ?? null, greedy?.km ?? null).pct)})
            </div>
          </div>
          <div className="p-3 rounded-xl border bg-white">
            <b>QUBO (annealing):</b> {fmtKm(qubo?.km)}
            <div className="text-xs mt-1 text-gray-600">
              vs Naive: {fmtKm(savingsKmPct(qubo?.km ?? null, naive?.km ?? null).km)} ({fmtPct(savingsKmPct(qubo?.km ?? null, naive?.km ?? null).pct)})
            </div>
            <div className="text-xs text-gray-600">
              vs Greedy: {fmtKm(savingsKmPct(qubo?.km ?? null, greedy?.km ?? null).km)} ({fmtPct(savingsKmPct(qubo?.km ?? null, greedy?.km ?? null).pct)})
            </div>
          </div>
          <div className="p-3 rounded-xl border bg-white">
            <b>Greedy baseline:</b> {fmtKm(greedy?.km)}
            <div className="text-xs mt-1 text-gray-600">
              vs Naive: {fmtKm(savingsKmPct(greedy?.km ?? null, naive?.km ?? null).km)} ({fmtPct(savingsKmPct(greedy?.km ?? null, naive?.km ?? null).pct)})
            </div>
          </div>
          <div className="p-3 rounded-xl border bg-white">
            <b>Naive (0→1→…):</b> {fmtKm(naive?.km)}
          </div>
        </div>
      )}

      {/* Route orders (including depots) */}
      {(jij || qubo || greedy) && (
        <div className="p-4 rounded-2xl border shadow-sm space-y-3">
          <div className="text-lg font-semibold">Route order (including depots)</div>

          {jij && (
            <div className="text-sm">
              <b>JIJ (Quantum-inspired)</b>
              <div>Start ({startCity})</div>
              <ol className="list-decimal list-inside space-y-1">
                {jij.order.map((idx, k) => <li key={k}>#{idx}</li>)}
              </ol>
              <div>End ({sameAsStart ? startCity : endCity})</div>
            </div>
          )}

          {qubo && (
            <div className="text-sm">
              <b>QUBO (annealing)</b>
              <div>Start ({startCity})</div>
              <ol className="list-decimal list-inside space-y-1">
                {qubo.order.map((idx, k) => <li key={k}>#{idx}</li>)}
              </ol>
              <div>End ({sameAsStart ? startCity : endCity})</div>
            </div>
          )}

          {greedy && (
            <div className="text-sm">
              <b>Greedy baseline</b>
              <div>Start ({startCity})</div>
              <ol className="list-decimal list-inside space-y-1">
                {greedy.order.map((idx, k) => <li key={k}>#{idx}</li>)}
              </ol>
              <div>End ({sameAsStart ? startCity : endCity})</div>
            </div>
          )}
        </div>
      )}

      {/* Map */}
      <div className="p-4 rounded-2xl border shadow-sm">
        <div className="text-sm font-medium mb-2">Map</div>
        {mapReady && (
          <MapContainer
            center={mapCenter}
            zoom={13}
            style={{ height: 460, width: '100%' }}
            scrollWheelZoom={true}
          >
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

            {/* Lines: JIJ primary, optional QUBO + Greedy + Naive */}
            {jij?.polyline && jij.polyline.length >= 2 && (
              <Polyline positions={jij.polyline} pathOptions={{ color: '#2563eb', weight: 5 }} />
            )}
            {showCompare && qubo?.polyline && qubo.polyline.length >= 2 && (
              <Polyline positions={qubo.polyline} pathOptions={{ color: '#f59e0b', weight: 4, dashArray: '8 6' }} />
            )}
            {showCompare && greedy?.polyline && greedy.polyline.length >= 2 && (
              <Polyline positions={greedy.polyline} pathOptions={{ color: '#ef4444', weight: 3, dashArray: '4 8' }} />
            )}
            {showNaive && naive?.polyline && naive.polyline.length >= 2 && (
              <Polyline positions={naive.polyline} pathOptions={{ color: '#64748b', weight: 2, dashArray: '2 8', opacity: 0.8 }} />
            )}

            {/* Sellers */}
            {sellers.map((p, i) => (
              <Marker key={i} position={[p.lat, p.lng]}>
                <Popup>Seller #{i}</Popup>
              </Marker>
            ))}

            {/* Depots */}
            <Marker
              position={[start.lat, start.lng]}
              icon={L.icon({
                ...DefaultIcon.options,
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
              })}
            >
              <Popup>Start: {startCity}</Popup>
            </Marker>
            <Marker
              position={[sameAsStart ? start.lat : end.lat, sameAsStart ? start.lng : end.lng]}
              icon={L.icon({
                ...DefaultIcon.options,
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
              })}
            >
              <Popup>End: {sameAsStart ? startCity : endCity}</Popup>
            </Marker>
          </MapContainer>
        )}

        {/* Legend */}
        <div style={{ position:'relative', marginTop: 10, fontSize: 12 }}>
          <div className="inline-flex flex-col gap-1 px-3 py-2 rounded-md border bg-white/90 shadow">
            <div><span style={{display:'inline-block',width:14,height:3,background:'#2563eb',marginRight:8}}/>JIJ <em>(Quantum-inspired)</em></div>
            <div><span style={{display:'inline-block',width:14,height:3,background:'#f59e0b',marginRight:8,borderBottom:'2px dashed #f59e0b'}}/>QUBO</div>
            <div><span style={{display:'inline-block',width:14,height:3,background:'#ef4444',marginRight:8,borderBottom:'2px dotted #ef4444'}}/>Greedy</div>
            <div><span style={{display:'inline-block',width:14,height:3,background:'#64748b',marginRight:8,borderBottom:'2px dotted #64748b'}}/>Naive</div>
          </div>
        </div>
      </div>
    </div>
  );
}
