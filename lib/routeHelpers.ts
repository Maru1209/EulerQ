// src/lib/routeHelpers.ts

export type LatLng = { lat: number; lng: number };

function nearlyEqual(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

/** ensure the last point equals the first when roundTrip is true */
export function ensureClosed(path: [number, number][], roundTrip: boolean) {
  if (!roundTrip || path.length < 2) return path;
  const [aLat, aLng] = path[0];
  const [zLat, zLng] = path[path.length - 1];
  if (!nearlyEqual(aLat, zLat) || !nearlyEqual(aLng, zLng)) {
    return [...path, [aLat, aLng]];
  }
  return path;
}

/** build a polyline from an order of city indices + optional depots */
export function orderToPolyline(
  order: number[],
  cities: LatLng[],
  opts: { roundTrip: boolean; start?: LatLng; end?: LatLng }
): [number, number][] {
  const pts: [number, number][] = [];

  if (opts.start) pts.push([opts.start.lat, opts.start.lng]);

  for (const idx of order) {
    const c = cities[idx];
    pts.push([c.lat, c.lng]);
  }

  if (opts.end) {
    pts.push([opts.end.lat, opts.end.lng]);
  } else if (opts.roundTrip) {
    // No explicit end → return to start or first city
    if (opts.start) pts.push([opts.start.lat, opts.start.lng]);
    else if (order.length > 0) {
      const first = cities[order[0]];
      pts.push([first.lat, first.lng]);
    }
  }

  return ensureClosed(pts, opts.roundTrip);
}
