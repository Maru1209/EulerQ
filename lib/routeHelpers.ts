// lib/routeHelpers.ts

export type LatLng = { lat: number; lng: number };
export type LatLngTuple = [number, number];

/* ---------- math ---------- */
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversine(a: LatLng, b: LatLng): number {
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function routeDistanceKm(
  start: LatLng,
  end: LatLng | null,
  pts: LatLng[],
  order: number[],
  roundTrip: boolean
): number {
  if (!order || order.length === 0) return 0;
  let total = 0;
  let cur = start;
  for (const idx of order) {
    total += haversine(cur, pts[idx]);
    cur = pts[idx];
  }
  if (roundTrip) {
    total += haversine(cur, start);
  } else if (end) {
    total += haversine(cur, end);
  }
  return total;
}

/* ---------- greedy baseline ---------- */
export function greedyRoute(
  start: LatLng,
  _end: LatLng | null,
  pts: LatLng[]
): number[] {
  const N = pts.length;
  const unvis = new Set<number>(Array.from({ length: N }, (_, i) => i));
  let cur = start;
  const order: number[] = [];
  while (unvis.size) {
    let best = -1;
    let bestD = Infinity;
    for (const i of unvis) {
      const d = haversine(cur, pts[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    order.push(best);
    unvis.delete(best);
    cur = pts[best];
  }
  return order;
}

/* ---------- polyline helpers ---------- */
function nearlyEqual(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

export function ensureClosed(
  path: LatLngTuple[],
  roundTrip: boolean
): LatLngTuple[] {
  if (!roundTrip || path.length < 2) return path;
  const [aLat, aLng] = path[0];
  const [zLat, zLng] = path[path.length - 1];
  if (!nearlyEqual(aLat, zLat) || !nearlyEqual(aLng, zLng)) {
    return [...path, [aLat, aLng]];
  }
  return path;
}

/**
 * Convert an order of seller indices into a Leaflet polyline.
 * Always returns LatLngTuple[] for react-leaflet v5.
 */
export function orderToPolyline(
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
    if (opts.start) {
      pts.push([opts.start.lat, opts.start.lng]);
    } else if (order.length > 0) {
      const first = cities[order[0]];
      pts.push([first.lat, first.lng]);
    }
  }

  return ensureClosed(pts, opts.roundTrip);
}
