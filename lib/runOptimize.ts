// lib/runOptimize.ts
import { ensureClosed, orderToPolyline, LatLng } from "@/lib/routeHelpers";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export async function runOptimize(params: {
  points: LatLng[];
  roundTrip: boolean;
  start?: LatLng;
  end?: LatLng;      // if "Same as Start", you can set end=start OR omit end with roundTrip=true
  numReads: number;
  lam: number;       // controls lam_visit and lam_step
}) {
  const { points, roundTrip, start, end, numReads, lam } = params;

  // --- JIJ (Quantum-inspired) ---
  const jijBody: any = {
    points,
    round_trip: roundTrip,
    num_reads: numReads,
    lam_visit: lam,
    lam_step: lam,
  };
  if (start) jijBody.start = start;
  if (end) jijBody.end = end;

  const jijRes = await fetch(`${API_BASE}/optimize/jij`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(jijBody),
  }).then(r => r.json());

  const jijPolyline: [number, number][] =
    (jijRes?.polyline as [number, number][]) ??
    orderToPolyline(jijRes?.route ?? [], points, { roundTrip, start, end });

  // --- Classical (QUBO + Greedy baseline) ---
  const clRes = await fetch(`${API_BASE}/api/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      problem_type: "route",
      payload: { points, round_trip: roundTrip, start, end },
    }),
  }).then(r => r.json());

  const quboOrder: number[] = clRes?.solution?.order ?? [];
  const greedyOrder: number[] = clRes?.solution?.baseline_order ?? [];

  const quboPolyline = orderToPolyline(quboOrder, points, { roundTrip, start, end });
  const greedyPolyline = orderToPolyline(greedyOrder, points, { roundTrip, start, end });

  return {
    jij: {
      label: "JIJ (Quantum-inspired)",
      order: jijRes?.route ?? [],
      polyline: ensureClosed(jijPolyline, roundTrip),
      km: jijRes?.distance_km ?? null,
      energy: jijRes?.energy ?? null,
    },
    qubo: {
      label: "QUBO (Simulated Annealing)",
      order: quboOrder,
      polyline: ensureClosed(quboPolyline, roundTrip),
      km: clRes?.solution?.distance_km ?? null,
    },
    greedy: {
      label: "Greedy baseline",
      order: greedyOrder,
      polyline: ensureClosed(greedyPolyline, roundTrip),
      km: clRes?.solution?.baseline_km ?? null,
    },
  };
}
