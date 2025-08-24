'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

// Lazy‑load react‑leaflet only on client to avoid SSR issues
const Leaflet = {
  MapContainer: dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false }),
  TileLayer: dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false }),
  Marker: dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false }),
  Polyline: dynamic(() => import('react-leaflet').then(m => m.Polyline), { ssr: false }),
  Popup: dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false }),
};

import 'leaflet/dist/leaflet.css';
// Avoid SSR "window is not defined" by requiring leaflet only on client
let L: any = null;
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  L = require('leaflet');
}

// --- Types
export type LatLng = { lat: number; lng: number };

type RouteResult = {
  order: number[];
  distance_km: number | null; // null if invalid/unknown
  label: string;
};

// Predefined warehouses (15 entries)
const WAREHOUSES: { name: string; lat: number; lng: number }[] = [
  { name: 'Bellandur, Bengaluru', lat: 12.9289, lng: 77.6762 },
  { name: 'Whitefield, Bengaluru', lat: 12.9698, lng: 77.7499 },
  { name: 'Hebbal, Bengaluru', lat: 13.0355, lng: 77.5970 },
  { name: 'Yeshwanthpur, Bengaluru', lat: 13.0237, lng: 77.5560 },
  { name: 'Electronic City, Bengaluru', lat: 12.8398, lng: 77.6770 },
  { name: 'Peenya, Bengaluru', lat: 13.0213, lng: 77.5185 },
  { name: 'HSR Layout, Bengaluru', lat: 12.9106, lng: 77.6416 },
  { name: 'Koramangala, Bengaluru', lat: 12.9352, lng: 77.6245 },
  { name: 'Marathahalli, Bengaluru', lat: 12.955, lng: 77.701 },
  { name: 'Kundalahalli, Bengaluru', lat: 12.969, lng: 77.716 },
  { name: 'Banaswadi, Bengaluru', lat: 13.021, lng: 77.643 },
  { name: 'Bommanahalli, Bengaluru', lat: 12.897, lng: 77.624 },
  { name: 'MG Road, Bengaluru', lat: 12.974, lng: 77.607 },
  { name: 'KR Puram, Bengaluru', lat: 13.0027, lng: 77.6956 },
  { name: 'Rajajinagar, Bengaluru', lat: 12.9957, lng: 77.5546 },
];

// Backend API base
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

// --- Helpers (geo & baseline)
function haversine(a: LatLng, b: LatLng): number {
  const R = 6371; // km
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function routeDistanceKm(start: LatLng, end: LatLng | null, pts: LatLng[], order: number[], roundTrip: boolean): number {
  let total = 0;
  let cur = start;
  for (const idx of order) { total += haversine(cur, pts[idx]); cur = pts[idx]; }
  if (roundTrip) total += haversine(cur, start); else if (end) total += haversine(cur, end);
  return total;
}

function greedyRoute(start: LatLng, end: LatLng | null, pts: LatLng[]): number[] {
  const N = pts.length; const unvis = new Set<number>(Array.from({ length: N }, (_, i) => i));
  let cur = start; const order: number[] = [];
  while (unvis.size) { let best = -1, bestD = Infinity; for (const i of unvis) { const d = haversine(cur, pts[i]); if (d < bestD) { bestD = d; best = i; } } order.push(best); unvis.delete(best); cur = pts[best]; }
  return order;
}

// Time helpers
const toHHMM = (minutes: number) => {
  const h = Math.floor(minutes / 60), m = minutes % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};
const fromHHMM = (s: string | null | undefined) => {
  if (!s) return null; const [h, m] = s.split(':').map(Number); if (Number.isNaN(h)) return null; return h*60 + (m || 0);
};

// --- UI helpers (module‑level so all components can use)
function LabeledNumber({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  return (
    <label className="text-sm grid gap-1">
      <span className="text-xs text-foreground/70">{label}</span>
      <input type="number" className="rounded-xl border px-3 py-2 text-sm" value={value} step={step} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function LabeledTime({ label, value, onChange }: { label: string; value: string; onChange: (s: string) => void }) {
  return (
    <label className="text-sm grid gap-1">
      <span className="text-xs text-foreground/70">{label}</span>
      <input type="time" className="rounded-xl border px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function LabeledCoord({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <LabeledNumber label={label} value={value} onChange={onChange} step={0.0001} />;
}

// Default marker icon (only on client)
if (L) {
  const defaultIcon = new L.Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41],
  });
  L.Marker.prototype.options.icon = defaultIcon;
}

export default function OptimizerDemoPage() {
  // --- UI State
  const [activeTab, setActiveTab] = useState<'POC' | 'VRPTW'>('POC');
  const [start, setStart] = useState<LatLng>({ lat: WAREHOUSES[7].lat, lng: WAREHOUSES[7].lng });
  const [end, setEnd] = useState<LatLng | null>(null);
  const [roundTrip, setRoundTrip] = useState(true);

  // Dropdown selections for 15 warehouses
  const [startIdx, setStartIdx] = useState<number>(7); // default Koramangala
  const [endIdx, setEndIdx] = useState<number>(7);

  const [sellerCount, setSellerCount] = useState(10);
  const [sellers, setSellers] = useState<LatLng[]>([]);

  const [reads, setReads] = useState<number>(2500); // JIJ reads
  const [readsAuto, setReadsAuto] = useState<boolean>(true);
  const [lambdaP, setLambdaP] = useState<number>(18); // QUBO penalty
  const [lambdaAuto, setLambdaAuto] = useState<boolean>(true);
  const [mode, setMode] = useState<'fast' | 'balanced' | 'quality'>('fast');

  const [loadingGen, setLoadingGen] = useState(false);
  const [loadingOpt, setLoadingOpt] = useState(false);

  const [qubo, setQubo] = useState<RouteResult | null>(null);
  const [greedy, setGreedy] = useState<RouteResult | null>(null);
  const [naive, setNaive] = useState<RouteResult | null>(null);
  const [jij, setJij] = useState<RouteResult | null>(null);

  const [errQubo, setErrQubo] = useState<string>('');
  const [errJij, setErrJij] = useState<string>('');

  useEffect(() => { const s = WAREHOUSES[startIdx]; setStart({ lat: s.lat, lng: s.lng }); }, [startIdx]);
  useEffect(() => { if (roundTrip) setEnd(null); else { const e = WAREHOUSES[endIdx]; setEnd({ lat: e.lat, lng: e.lng }); } }, [roundTrip, endIdx]);

  // --- Actions
  const generateSellers = useCallback(async () => {
    setLoadingGen(true);
    try {
      const R = 0.04; // ~4-5km box
      const pts: LatLng[] = Array.from({ length: sellerCount }, () => ({ lat: start.lat + (Math.random() * 2 - 1) * R, lng: start.lng + (Math.random() * 2 - 1) * R }));
      setSellers(pts); setQubo(null); setJij(null); setGreedy(null); setNaive(null); setErrQubo(''); setErrJij('');
    } finally { setLoadingGen(false); }
  }, [sellerCount, start]);

  const optimize = useCallback(async () => {
    if (!sellers.length) return; setLoadingOpt(true);
    try {
      setErrQubo(''); setErrJij('');
      const naiveOrder = sellers.map((_, i) => i); const naiveDist = routeDistanceKm(start, end, sellers, naiveOrder, roundTrip); setNaive({ order: naiveOrder, distance_km: naiveDist, label: 'Naive' });
      const greedyOrder = greedyRoute(start, end, sellers); const greedyDist = routeDistanceKm(start, end, sellers, greedyOrder, roundTrip); setGreedy({ order: greedyOrder, distance_km: greedyDist, label: 'Greedy' });

      // QUBO
      try {
        const body: any = { start, end: roundTrip ? null : end, points: sellers, round_trip: roundTrip };
        if (!lambdaAuto) body.lambda = lambdaP;
        const r = await fetch(`${API_BASE}/optimize/qubo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) { setErrQubo(`QUBO HTTP ${r.status}`); setQubo(null); }
        else {
          const data = await r.json(); const order: number[] = Array.isArray(data.order) ? data.order : [];
          if (!order.length) { setErrQubo('QUBO returned empty route'); setQubo(null); }
          else { const dist = routeDistanceKm(start, end, sellers, order, roundTrip); setQubo({ order, distance_km: dist, label: 'QUBO' }); }
        }
      } catch { setErrQubo('QUBO request failed'); setQubo(null); }

      // JIJ
      try {
        const body: any = { points: sellers, round_trip: roundTrip, start, end: roundTrip ? null : end, lambda_mode: 'auto', penalty_factor: 3.0, mode, normalize_costs: true };
        if (!readsAuto) body.num_reads = reads;
        const r = await fetch(`${API_BASE}/optimize/jij`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!r.ok) { setErrJij(`JIJ HTTP ${r.status}`); setJij(null); }
        else {
          const data = await r.json(); const order: number[] = Array.isArray(data.order) ? data.order : (Array.isArray(data.route) ? data.route : []);
          if (!order.length) { setErrJij('JIJ returned empty route'); setJij(null); }
          else { const dist = routeDistanceKm(start, end, sellers, order, roundTrip); setJij({ order, distance_km: dist, label: 'JIJ' }); }
        }
      } catch { setErrJij('JIJ request failed'); setJij(null); }
    } finally { setLoadingOpt(false); }
  }, [sellers, start, end, roundTrip, lambdaP, reads, readsAuto, lambdaAuto, mode]);

  // --- Map Paths (draw all in different shades)
  const allPaths = useMemo(() => {
    const build = (order?: number[] | null): [number, number][] => {
      if (!order || order.length === 0) return [];
      const pts: LatLng[] = [start, ...order.map(i => sellers[i])]; if (roundTrip) pts.push(start); else if (end) pts.push(end);
      return pts.map(p => [p.lat, p.lng]) as [number, number][];
    };
    return { naive: build(naive?.order ?? null), greedy: build(greedy?.order ?? null), qubo: build(qubo?.order ?? null), jij: build(jij?.order ?? null) };
  }, [start, end, roundTrip, sellers, naive, greedy, qubo, jij]);

  // --- Derived: best vs baseline
  const compareText = useMemo(() => {
    if (!greedy) return '';
    const candidates = [jij, qubo].filter(r => r && r.order.length > 0 && r.distance_km !== null) as RouteResult[];
    if (!candidates.length) return '';
    const best = candidates.reduce((a, b) => (a.distance_km! < b.distance_km! ? a : b));
    const delta = greedy.distance_km! - best.distance_km!; const pct = (delta / greedy.distance_km!) * 100;
    if (delta <= 0) return `${best.label} matched/beat Greedy by ~${pct.toFixed(1)}%`;
    return `${best.label} saves ${delta.toFixed(2)} km (−${pct.toFixed(1)}%) vs Greedy`;
  }, [greedy, jij, qubo]);

  return (
    <div className="p-4 md:p-6 grid gap-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold">Optimizer Demo</h1>
        <span className="text-xs">API: <code className="font-mono">{API_BASE}</code></span>
      </header>

      {/* Tabs */}
      <div className="w-full">
        <div className="inline-flex rounded-2xl border overflow-hidden">
          <button className={`px-4 py-2 text-sm ${activeTab === 'POC' ? 'bg-foreground text-background' : ''}`} onClick={() => setActiveTab('POC')}>Route (POC)</button>
          <button className={`px-4 py-2 text-sm ${activeTab === 'VRPTW' ? 'bg-foreground text-background' : ''}`} onClick={() => setActiveTab('VRPTW')}>VRPTW</button>
        </div>
      </div>

      {/* Controls */}
      <section className="grid lg:grid-cols-[360px_1fr] gap-4">
        <div className="grid gap-4">
          <div className="rounded-2xl border p-4 grid gap-3">
            <h2 className="font-medium">Start / End Warehouse</h2>
            <div className="grid gap-3">
              <label className="text-sm grid gap-1">
                <span className="text-xs text-foreground/70">Start Warehouse</span>
                <select className="rounded-xl border px-3 py-2 text-sm" value={startIdx} onChange={(e) => setStartIdx(Number(e.target.value))}>
                  {WAREHOUSES.map((w, i) => (<option key={i} value={i}>{w.name}</option>))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <LabeledCoord label="Start Lat" value={start.lat} onChange={(n) => setStart(s => ({ ...s, lat: n }))} />
                <LabeledCoord label="Start Lng" value={start.lng} onChange={(n) => setStart(s => ({ ...s, lng: n }))} />
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={roundTrip} onChange={e => setRoundTrip(e.target.checked)} />
                <span>Same as start (round-trip)</span>
              </label>
              {!roundTrip && (
                <>
                  <label className="text-sm grid gap-1">
                    <span className="text-xs text-foreground/70">End Warehouse</span>
                    <select className="rounded-xl border px-3 py-2 text-sm" value={endIdx} onChange={(e) => setEndIdx(Number(e.target.value))}>
                      {WAREHOUSES.map((w, i) => (<option key={i} value={i}>{w.name}</option>))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <LabeledCoord label="End Lat" value={end?.lat ?? start.lat} onChange={(n) => setEnd({ lat: n, lng: end?.lng ?? start.lng })} />
                    <LabeledCoord label="End Lng" value={end?.lng ?? start.lng} onChange={(n) => setEnd({ lat: end?.lat ?? start.lat, lng: n })} />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border p-4 grid gap-3">
            <h2 className="font-medium">Seller pick-ups</h2>
            <div className="grid grid-cols-2 gap-3">
              <LabeledNumber label="Count (5–50)" value={sellerCount} onChange={setSellerCount} min={5} max={50} />
            </div>
            <button onClick={generateSellers} className="w-full rounded-xl bg-foreground text-background px-4 py-2 text-sm disabled:opacity-60" disabled={loadingGen}>{loadingGen ? 'Generating…' : '🧪 Generate Seller Pickups'}</button>
          </div>

          <div className="rounded-2xl border p-4 grid gap-3">
            <h2 className="font-medium">Solver parameters</h2>
            <div className="grid gap-2">
              <label className="text-sm grid gap-1">
                <span className="text-xs text-foreground/70">Mode</span>
                <select className="rounded-xl border px-3 py-2 text-sm" value={mode} onChange={(e)=>setMode(e.target.value as any)}>
                  <option value="fast">fast</option><option value="balanced">balanced</option><option value="quality">quality</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={readsAuto} onChange={(e)=>setReadsAuto(e.target.checked)} /><span>Auto reads (JIJ)</span></label>
              {!readsAuto && (<div className="grid grid-cols-2 gap-3"><LabeledNumber label="Reads (JIJ)" value={reads} onChange={setReads} min={100} /></div>)}
              <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={lambdaAuto} onChange={(e)=>setLambdaAuto(e.target.checked)} /><span>Auto λ (QUBO)</span></label>
              {!lambdaAuto && (<div className="grid grid-cols-2 gap-3"><LabeledNumber label="Penalty λ (QUBO)" value={lambdaP} onChange={setLambdaP} min={1} /></div>)}
            </div>
            <button onClick={optimize} className="w-full rounded-xl bg-foreground text-background px-4 py-2 text-sm disabled:opacity-60 mt-2" disabled={loadingOpt || sellers.length === 0}>{loadingOpt ? 'Optimizing…' : '⚙️ Optimize'}</button>
          </div>

          <ComparePanel compareText={compareText} naive={naive} greedy={greedy} qubo={qubo} jij={jij} errQubo={errQubo} errJij={errJij} />
        </div>

        {/* Map Panel */}
        <div className="rounded-2xl border overflow-hidden min-h-[520px]">
          <ClientOnlyMap start={start} end={roundTrip ? null : end} sellers={sellers} paths={allPaths} />
        </div>
      </section>

      {activeTab === 'VRPTW' && (
        <section className="rounded-2xl border p-4 grid gap-3">
          <h2 className="font-medium">VRPTW</h2>
          <VRPTWPanel start={start} end={roundTrip ? null : end} sellers={sellers} roundTrip={roundTrip} qubo={qubo} greedy={greedy} naive={naive} jij={jij} />
        </section>
      )}

      <footer className="text-xs text-foreground/60">Tip: Set <code className="font-mono">NEXT_PUBLIC_API_BASE</code> in your env to point to your FastAPI, e.g. <code className="font-mono">https://your‑railway.app</code>.</footer>
    </div>
  );
}

function ComparePanel({ compareText, naive, greedy, qubo, jij, errQubo, errJij }: { compareText: string; naive: RouteResult | null; greedy: RouteResult | null; qubo: RouteResult | null; jij: RouteResult | null; errQubo: string; errJij: string; }) {
  return (
    <div className="rounded-2xl border p-4 grid gap-3">
      <h2 className="font-medium">Compare</h2>
      {compareText ? (<p className="text-sm">{compareText}</p>) : (<p className="text-sm text-foreground/70">Run optimization to see comparison vs Greedy.</p>)}
      <div className="grid gap-2 text-sm">
        {naive && (<div className="rounded-xl border p-2"><div className="font-medium">Naive</div><div>Distance: {naive.distance_km?.toFixed(2)} km</div><div className="flex flex-wrap gap-1 mt-1">{naive.order.map((i, k) => (<span key={`n-${k}`} className="px-2 py-0.5 rounded-full bg-black/5 border text-xs">#{i}</span>))}</div></div>)}
        {greedy && (<div className="rounded-xl border p-2"><div className="font-medium">Greedy</div><div>Distance: {greedy.distance_km?.toFixed(2)} km</div><div className="flex flex-wrap gap-1 mt-1">{greedy.order.map((i, k) => (<span key={`g-${k}`} className="px-2 py-0.5 rounded-full bg-black/5 border text-xs">#{i}</span>))}</div></div>)}
        {(errQubo || qubo) && (<div className="rounded-xl border p-2"><div className="font-medium">QUBO</div>{errQubo ? (<div className="text-xs text-red-600">{errQubo}</div>) : (<><div>Distance: {qubo?.distance_km?.toFixed(2)} km</div><div className="flex flex-wrap gap-1 mt-1">{qubo?.order.map((i, k) => (<span key={`q-${k}`} className="px-2 py-0.5 rounded-full bg-black/5 border text-xs">#{i}</span>))}</div></>)}</div>)}
        {(errJij || jij) && (<div className="rounded-xl border p-2"><div className="font-medium">JIJ</div>{errJij ? (<div className="text-xs text-red-600">{errJij}</div>) : (<><div>Distance: {jij?.distance_km?.toFixed(2)} km</div><div className="flex flex-wrap gap-1 mt-1">{jij?.order.map((i, k) => (<span key={`j-${k}`} className="px-2 py-0.5 rounded-full bg-black/5 border text-xs">#{i}</span>))}</div></>)}</div>)}
      </div>
    </div>
  );
}

function ClientOnlyMap({ start, end, sellers, paths }: { start: LatLng; end: LatLng | null; sellers: LatLng[]; paths: { naive: [number, number][], greedy: [number, number][], qubo: [number, number][], jij: [number, number][] } }) {
  const [ready, setReady] = useState(false);
  const mapRef = useRef<any>(null);
  useEffect(() => setReady(true), []);
  const { MapContainer, TileLayer, Marker, Polyline, Popup } = Leaflet;

  // Colors for each solver path
  const styles: Record<string, any> = {
    naive: { color: '#9CA3AF', weight: 3, opacity: 0.7 },     // gray
    greedy: { color: '#3B82F6', weight: 4, opacity: 0.8 },    // blue
    qubo: { color: '#F59E0B', weight: 4, opacity: 0.9 },      // amber
    jij: { color: '#8B5CF6', weight: 5, opacity: 0.95 },      // violet
  };

  // Fit bounds whenever points or paths change
  useEffect(() => {
    if (!ready || !mapRef.current || !L) return;
    const pts: [number, number][] = [];
    pts.push([start.lat, start.lng]);
    if (end) pts.push([end.lat, end.lng]);
    sellers.forEach(s => pts.push([s.lat, s.lng]));
    [paths.naive, paths.greedy, paths.qubo, paths.jij].forEach(poly => poly.forEach(p => pts.push(p)));
    if (pts.length >= 2) {
      const bounds = L.latLngBounds(pts.map(p => L.latLng(p[0], p[1])));
      mapRef.current.fitBounds(bounds, { padding: [32, 32] });
    }
  }, [ready, start, end, sellers, paths]);

  if (!ready) return <div className="h-[520px] w-full grid place-items-center text-sm">Loading map…</div>;
  const center: [number, number] = [start.lat, start.lng];

  return (
    <MapContainer center={center} zoom={12} style={{ height: 520, width: '100%' }}  scrollWheelZoom={true} whenReady={(e) => (mapRef.current = e.target)}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {/* Start marker */}
      <Marker position={center}><Popup><div className="text-sm"><div className="font-medium">Start Warehouse</div><div className="text-xs">{start.lat.toFixed(4)}, {start.lng.toFixed(4)}</div></div></Popup></Marker>

      {/* End marker (if any) */}
      {end && (<Marker position={[end.lat, end.lng]}><Popup><div className="text-sm"><div className="font-medium">End Warehouse</div><div className="text-xs">{end.lat.toFixed(4)}, {end.lng.toFixed(4)}</div></div></Popup></Marker>)}

      {/* Seller markers */}
      {sellers.map((p, i) => (<Marker key={i} position={[p.lat, p.lng]}><Popup><div className="text-sm"><div className="font-medium">Seller #{i}</div><div className="text-xs">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</div></div></Popup></Marker>))}

      {/* Draw all available polylines with distinct styles */}
      {paths.naive.length >= 2 && (<Polyline positions={paths.naive as any} pathOptions={styles.naive} />)}
      {paths.greedy.length >= 2 && (<Polyline positions={paths.greedy as any} pathOptions={styles.greedy} />)}
      {paths.qubo.length >= 2 && (<Polyline positions={paths.qubo as any} pathOptions={styles.qubo} />)}
      {paths.jij.length >= 2 && (<Polyline positions={paths.jij as any} pathOptions={styles.jij} />)}

      {/* Legend */}
      <div className="leaflet-bottom leaflet-right m-2 p-2 rounded-lg bg-white/90 shadow text-[11px] leading-4">
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: styles.jij.color }} /> JIJ</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: styles.qubo.color }} /> QUBO</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: styles.greedy.color }} /> Greedy</div>
        <div className="flex items-center gap-2"><span className="inline-block w-3 h-1" style={{ background: styles.naive.color }} /> Naive</div>
      </div>
    </MapContainer>
  );
}

// --- VRPTW Panel ---
function VRPTWPanel({ start, end, sellers, roundTrip, qubo, greedy, naive, jij }: { start: LatLng; end: LatLng | null; sellers: LatLng[]; roundTrip: boolean; qubo: RouteResult | null; greedy: RouteResult | null; naive: RouteResult | null; jij: RouteResult | null; }) {
  // Time & speed
  const [shiftStartStr, setShiftStartStr] = useState<string>(toHHMM(9 * 60));
  const [shiftEndStr, setShiftEndStr] = useState<string>(toHHMM(18 * 60));
  const [placementMin, setPlacementMin] = useState<number>(0); // vehicle placement time at start depot
  const [speed, setSpeed] = useState(25);

  // Vehicles & service
  const [vehCount, setVehCount] = useState(2);
  const [serviceMin, setServiceMin] = useState(5); // on-site handling time per stop
  const [hardTW, setHardTW] = useState(false);

  // Seller availability & TW
  const [avail, setAvail] = useState<boolean[]>(() => sellers.map(() => true));
  const [twStart, setTwStart] = useState<string[]>(() => sellers.map(() => ''));
  const [twEnd, setTwEnd] = useState<string[]>(() => sellers.map(() => ''));

  useEffect(() => { setAvail(sellers.map(() => true)); setTwStart(sellers.map(() => '')); setTwEnd(sellers.map(() => '')); }, [sellers]);

  // Route source
  const [routeSource, setRouteSource] = useState<'auto' | 'best' | 'greedy' | 'naive'>('auto');

  // Fuel calc
  const [kmpl, setKmpl] = useState<number>(15); // vehicle efficiency (km per litre)

  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any>(null);
  const [error, setError] = useState<string>('');
  const [fuelSavings, setFuelSavings] = useState<{ litres: number; kmSaved: number } | null>(null);

  const chooseOrder = (): number[] | null => {
    if (routeSource === 'greedy') return greedy?.order ?? null;
    if (routeSource === 'naive') return naive?.order ?? null;
    if (routeSource === 'best') {
      const candidates = [jij, qubo, greedy].filter(Boolean) as RouteResult[];
      if (!candidates.length) return null;
      const best = candidates.reduce((a, b) => (a.distance_km! < b.distance_km! ? a : b));
      return best.order;
    }
    return null; // auto (backend heuristic)
  };

  const naiveVRPTWkm = (order: number[] | null): number => {
    const idxs = (order && order.length) ? order.slice() : sellers.map((_, i) => i);
    // Split sellers evenly by vehicle count
    const chunks: number[][] = Array.from({ length: vehCount }, () => []);
    idxs.forEach((id, i) => chunks[i % vehCount].push(id));
    // Compute distance per vehicle path: start -> chunk -> (start or end)
    let total = 0;
    for (const ch of chunks) {
      let cur = start; for (const id of ch) { total += haversine(cur, sellers[id]); cur = sellers[id]; }
      if (roundTrip) total += haversine(cur, start); else if (end) total += haversine(cur, end);
    }
    return total;
  };

  const solveVRPTW = async () => {
    setLoading(true); setError(''); setFuelSavings(null);
    try {
      const depot = { lat: start.lat, lng: start.lng };
      const orderHint = chooseOrder();
      const seq = orderHint ?? sellers.map((_, i) => i);
      const sellerObjs = seq.map((i) => ({
        id: i,
        lat: sellers[i].lat,
        lng: sellers[i].lng,
        service_min: serviceMin,
        available: avail[i],
        tw_start: fromHHMM(twStart[i]),
        tw_end: fromHHMM(twEnd[i]),
      }));

      const sStart = (fromHHMM(shiftStartStr) ?? 9 * 60) + placementMin;
      const sEnd = fromHHMM(shiftEndStr) ?? 18 * 60;

      const vehicles = Array.from({ length: vehCount }, (_, i) => ({
        id: i,
        start: depot,
        end: end ? { lat: end.lat, lng: end.lng } : null,
        shift_start: sStart,
        shift_end: sEnd,
        speed_kmph: speed,
        active: true,
      }));

      const body = { depot, sellers: sellerObjs, vehicles, round_trip: roundTrip, hard_time_windows: hardTW };

      const r = await fetch(`${API_BASE}/optimize/vrptw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) { setError(`VRPTW HTTP ${r.status}`); setPlans(null); }
      else {
        const data = await r.json(); setPlans(data);
        // Fuel savings vs naive VRPTW
        const naiveKm = naiveVRPTWkm(orderHint);
        const kmSaved = Math.max(0, naiveKm - (data.total_km || 0));
        const litres = kmpl > 0 ? kmSaved / kmpl : 0;
        setFuelSavings({ litres, kmSaved });
      }
    } catch (e: any) {
      setError('VRPTW request failed'); setPlans(null);
    } finally { setLoading(false); }
  };

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <LabeledNumber label="Vehicles" value={vehCount} onChange={setVehCount} min={1} />
        <LabeledNumber label="Vehicle efficiency (km/l)" value={kmpl} onChange={setKmpl} min={1} />
        <LabeledNumber label="Speed (km/h)" value={speed} onChange={setSpeed} min={5} />
        <LabeledTime label="Shift start" value={shiftStartStr} onChange={setShiftStartStr} />
        <LabeledTime label="Shift end" value={shiftEndStr} onChange={setShiftEndStr} />
        <LabeledNumber label="Placement at depot (min)" value={placementMin} onChange={setPlacementMin} min={0} />
        <LabeledNumber label="Service mins per stop" value={serviceMin} onChange={setServiceMin} min={1} />
        <label className="inline-flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" checked={hardTW} onChange={(e)=>setHardTW(e.target.checked)} />
          <span>Hard time windows (rejects late arrivals)</span>
        </label>
        <label className="text-sm grid gap-1 md:col-span-3">
          <span className="text-xs text-foreground/70">Route source for VRPTW</span>
          <select className="rounded-xl border px-3 py-2 text-sm" value={routeSource} onChange={(e)=>setRouteSource(e.target.value as any)}>
            <option value="auto">Auto (backend heuristic)</option>
            <option value="best">Best of JIJ/QUBO/Greedy</option>
            <option value="greedy">Greedy</option>
            <option value="naive">Naive</option>
          </select>
        </label>
        <p className="text-[11px] text-foreground/60 md:col-span-3">“Service mins per stop” means on‑site handling time at each seller (loading/unloading). Availability and time windows are applied per seller below.</p>
      </div>

      {/* Seller availability + time windows */}
      <details className="rounded-xl border p-3 open:shadow-sm">
        <summary className="cursor-pointer text-sm font-medium">Seller availability & time windows</summary>
        <div className="grid gap-2 mt-2">
          {sellers.map((s, i) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-center">
              <div className="text-xs opacity-70">Seller #{i}</div>
              <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={avail[i]} onChange={(e)=>setAvail(a=>{ const c=[...a]; c[i]=e.target.checked; return c; })} /><span>Available</span></label>
              <LabeledTime label="TW start" value={twStart[i]} onChange={(v)=>setTwStart(a=>{ const c=[...a]; c[i]=v; return c; })} />
              <LabeledTime label="TW end" value={twEnd[i]} onChange={(v)=>setTwEnd(a=>{ const c=[...a]; c[i]=v; return c; })} />
              <div className="text-[11px] col-span-2 md:col-span-2 text-foreground/60">{s.lat.toFixed(4)}, {s.lng.toFixed(4)}</div>
            </div>
          ))}
        </div>
      </details>

      <button onClick={solveVRPTW} className="rounded-xl bg-foreground text-background px-4 py-2 text-sm w-full md:w-max disabled:opacity-60" disabled={loading || sellers.length===0}>{loading ? 'Solving…' : '🗺️ Solve VRPTW'}</button>
      {error && <div className="text-xs text-red-600">{error}</div>}

      {plans && (
        <div className="grid gap-2 text-sm">
          <div className="text-xs opacity-70">Total: {plans.total_km?.toFixed ? plans.total_km.toFixed(2) : plans.total_km} km, {plans.total_time_min} min</div>
          {fuelSavings && (
            <div className="text-xs">Fuel savings vs naive VRPTW: <b>{fuelSavings.kmSaved.toFixed(2)} km</b> ≈ <b>{fuelSavings.litres.toFixed(2)} L</b> @ {kmpl} km/L</div>
          )}
          {plans.plans?.map((p: any) => (
            <div key={p.vehicle_id} className="rounded-xl border p-2">
              <div className="font-medium">Vehicle #{p.vehicle_id}</div>
              <div className="text-xs opacity-70">{p.total_km} km • {p.total_time_min} min • lateness {p.lateness_min} • wait {p.wait_min} • overrun {p.shift_overrun_min}</div>
              <div className="flex flex-wrap gap-1 mt-1">{p.route.map((st: any, idx: number) => (<span key={idx} className="px-2 py-0.5 rounded-full bg-black/5 border text-xs">seller {st.seller_id}</span>))}</div>
            </div>
          ))}
          {plans.unassigned_sellers?.length > 0 && (<div className="text-xs">Unassigned: {plans.unassigned_sellers.join(', ')}</div>)}
        </div>
      )}
    </div>
  );
}
