"use client";

import { useMemo, useState } from "react";

/* -------------------- helpers -------------------- */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type Depot = { lat: number; lng: number };

type Seller = {
  id: number;
  lat: number;
  lng: number;
  twStart: string;   // "HH:MM"
  twEnd: string;     // "HH:MM"
  serviceMin: number;
  available: boolean;
};

type Vehicle = {
  id: number;
  startLat: number;
  startLng: number;
  endLat?: number | null;
  endLng?: number | null;
  shiftStart: string; // "HH:MM"
  shiftEnd: string;   // "HH:MM"
  speedKmph: number;
  active: boolean;
};

type StopTW = {
  seller_id: number;
  arrival_min: number;
  start_service_min: number;
  depart_min: number;
};

type VehiclePlanTW = {
  vehicle_id: number;
  route: StopTW[];
  total_km: number;
  total_time_min: number;
  lateness_min: number;
  wait_min: number;
  shift_overrun_min: number;
};

type VRPTWResponse = {
  plans: VehiclePlanTW[];
  unassigned_sellers: number[];
  total_km: number;
  total_time_min: number;
};

const hhmmToMin = (hhmm?: string) => {
  if (!hhmm) return undefined;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return undefined;
  return h * 60 + m;
};
const minToHHMM = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

/* -------------------- page -------------------- */
export default function VRPTWDemoPage() {
  const [depot, setDepot] = useState<Depot>({ lat: 12.9352, lng: 77.6245 });
  const [roundTrip, setRoundTrip] = useState(true);

  const [sellers, setSellers] = useState<Seller[]>([
    {
      id: 0,
      lat: 12.9354,
      lng: 77.61266,
      twStart: "09:00",
      twEnd: "11:00",
      serviceMin: 6,
      available: true,
    },
    {
      id: 1,
      lat: 12.92607,
      lng: 77.62693,
      twStart: "10:00",
      twEnd: "12:00",
      serviceMin: 6,
      available: true,
    },
  ]);

  const [vehicles, setVehicles] = useState<Vehicle[]>([
    {
      id: 101,
      startLat: 12.9352,
      startLng: 77.6245,
      shiftStart: "09:00",
      shiftEnd: "15:00",
      speedKmph: 25,
      active: true,
    },
  ]);

  const [params, setParams] = useState({
    latePenalty: 4.0,
    waitWeight: 0.2,
    shiftPenalty: 5.0,
    hardWindows: false,
    seed: 42,
  });

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<VRPTWResponse | null>(null);

  const unassignedCount = result?.unassigned_sellers?.length ?? 0;

  /* -------------------- handlers -------------------- */
  const addSeller = () =>
    setSellers((arr) => [
      ...arr,
      {
        id: (arr.at(-1)?.id ?? -1) + 1,
        lat: depot.lat + Math.random() * 0.01 - 0.005,
        lng: depot.lng + Math.random() * 0.01 - 0.005,
        twStart: "10:00",
        twEnd: "12:00",
        serviceMin: 6,
        available: true,
      },
    ]);

  const removeSeller = (id: number) =>
    setSellers((arr) => arr.filter((s) => s.id !== id));

  const updateSeller = (idx: number, patch: Partial<Seller>) =>
    setSellers((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const addVehicle = () =>
    setVehicles((arr) => [
      ...arr,
      {
        id: (arr.at(-1)?.id ?? 100) + 1,
        startLat: depot.lat,
        startLng: depot.lng,
        shiftStart: "09:00",
        shiftEnd: "15:00",
        speedKmph: 25,
        active: true,
      },
    ]);

  const removeVehicle = (id: number) =>
    setVehicles((arr) => arr.filter((v) => v.id !== id));

  const updateVehicle = (idx: number, patch: Partial<Vehicle>) =>
    setVehicles((arr) => arr.map((v, i) => (i === idx ? { ...v, ...patch } : v)));

  async function run() {
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const payload = {
        depot,
        round_trip: roundTrip,
        sellers: sellers.map((s) => ({
          id: s.id,
          lat: Number(s.lat),
          lng: Number(s.lng),
          tw_start: hhmmToMin(s.twStart),
          tw_end: hhmmToMin(s.twEnd),
          service_min: Number(s.serviceMin || 6),
          available: !!s.available,
        })),
        vehicles: vehicles.map((v) => ({
          id: v.id,
          start: { lat: Number(v.startLat), lng: Number(v.startLng) },
          end:
            !roundTrip && v.endLat != null && v.endLng != null
              ? { lat: Number(v.endLat), lng: Number(v.endLng) }
              : undefined,
          shift_start: hhmmToMin(v.shiftStart)!,
          shift_end: hhmmToMin(v.shiftEnd)!,
          speed_kmph: Number(v.speedKmph || 25),
          active: !!v.active,
        })),
        late_penalty_per_min: Number(params.latePenalty),
        early_wait_weight: Number(params.waitWeight),
        shift_violation_penalty_per_min: Number(params.shiftPenalty),
        hard_time_windows: !!params.hardWindows,
        seed: params.seed ? Number(params.seed) : undefined,
      };

      const res = await fetch(`${API_BASE}/optimize/vrptw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`VRPTW failed: ${res.status} ${txt}`);
      }
      const data: VRPTWResponse = await res.json();
      setResult(data);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  /* -------------------- UI -------------------- */
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">VRPTW Demo</h1>
        <span className="text-xs text-slate-400">API: {API_BASE}</span>
      </header>

      {/* Depot + Params */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="font-semibold">Depot</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-slate-300">Lat</span>
              <input
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
                type="number"
                step="0.00001"
                value={depot.lat}
                onChange={(e) =>
                  setDepot((d) => ({ ...d, lat: Number(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-300">Lng</span>
              <input
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
                type="number"
                step="0.00001"
                value={depot.lng}
                onChange={(e) =>
                  setDepot((d) => ({ ...d, lng: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roundTrip}
              onChange={(e) => setRoundTrip(e.target.checked)}
            />
            Round trip (return to depot)
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
          <h2 className="font-semibold">Penalties & Options</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-slate-300">Late penalty / min</span>
              <input
                type="number"
                step="0.1"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
                value={params.latePenalty}
                onChange={(e) =>
                  setParams((p) => ({ ...p, latePenalty: Number(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-300">Early wait weight</span>
              <input
                type="number"
                step="0.1"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
                value={params.waitWeight}
                onChange={(e) =>
                  setParams((p) => ({ ...p, waitWeight: Number(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-300">Shift penalty / min</span>
              <input
                type="number"
                step="0.1"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
                value={params.shiftPenalty}
                onChange={(e) =>
                  setParams((p) => ({ ...p, shiftPenalty: Number(e.target.value) }))
                }
              />
            </label>
            <label className="text-sm inline-flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                checked={params.hardWindows}
                onChange={(e) =>
                  setParams((p) => ({ ...p, hardWindows: e.target.checked }))
                }
              />
              Hard time windows
            </label>
          </div>
          <label className="text-sm block">
            <span className="block text-slate-300">Seed</span>
            <input
              type="number"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
              value={params.seed}
              onChange={(e) =>
                setParams((p) => ({ ...p, seed: Number(e.target.value) }))
              }
            />
          </label>
        </div>
      </section>

      {/* Sellers */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Sellers</h2>
          <button
            className="rounded-xl px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold"
            onClick={addSeller}
          >
            + Add seller
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {sellers.map((s, idx) => (
            <div
              key={s.id}
              className="grid md:grid-cols-8 gap-2 items-end rounded-xl border border-white/10 p-3"
            >
              <div className="text-xs opacity-70 md:col-span-1">#{s.id}</div>
              <label className="text-xs md:col-span-2">
                <span className="block text-slate-300">Lat</span>
                <input
                  type="number"
                  step="0.00001"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={s.lat}
                  onChange={(e) =>
                    updateSeller(idx, { lat: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="block text-slate-300">Lng</span>
                <input
                  type="number"
                  step="0.00001"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={s.lng}
                  onChange={(e) =>
                    updateSeller(idx, { lng: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-300">TW Start</span>
                <input
                  type="time"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={s.twStart}
                  onChange={(e) => updateSeller(idx, { twStart: e.target.value })}
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-300">TW End</span>
                <input
                  type="time"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={s.twEnd}
                  onChange={(e) => updateSeller(idx, { twEnd: e.target.value })}
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-300">Service (min)</span>
                <input
                  type="number"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={s.serviceMin}
                  onChange={(e) =>
                    updateSeller(idx, { serviceMin: Number(e.target.value) })
                  }
                />
              </label>
              <div className="flex items-center justify-end gap-3 md:col-span-1">
                <label className="text-xs inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.available}
                    onChange={(e) =>
                      updateSeller(idx, { available: e.target.checked })
                    }
                  />
                  Available
                </label>
                <button
                  className="text-xs rounded-xl px-2 py-1 border border-white/20 hover:border-red-400 hover:text-red-300"
                  onClick={() => removeSeller(s.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Vehicles */}
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Vehicles</h2>
          <button
            className="rounded-xl px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-semibold"
            onClick={addVehicle}
          >
            + Add vehicle
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {vehicles.map((v, idx) => (
            <div
              key={v.id}
              className="grid md:grid-cols-8 gap-2 items-end rounded-xl border border-white/10 p-3"
            >
              <div className="text-xs opacity-70 md:col-span-1">#{v.id}</div>
              <label className="text-xs md:col-span-2">
                <span className="block text-slate-300">Start Lat</span>
                <input
                  type="number"
                  step="0.00001"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={v.startLat}
                  onChange={(e) =>
                    updateVehicle(idx, { startLat: Number(e.target.value) })
                  }
                />
              </label>
              <label className="text-xs md:col-span-2">
                <span className="block text-slate-300">Start Lng</span>
                <input
                  type="number"
                  step="0.00001"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={v.startLng}
                  onChange={(e) =>
                    updateVehicle(idx, { startLng: Number(e.target.value) })
                  }
                />
              </label>
              {!roundTrip && (
                <>
                  <label className="text-xs">
                    <span className="block text-slate-300">End Lat</span>
                    <input
                      type="number"
                      step="0.00001"
                      className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                      value={v.endLat ?? ""}
                      onChange={(e) =>
                        updateVehicle(idx, {
                          endLat:
                            e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="text-xs">
                    <span className="block text-slate-300">End Lng</span>
                    <input
                      type="number"
                      step="0.00001"
                      className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                      value={v.endLng ?? ""}
                      onChange={(e) =>
                        updateVehicle(idx, {
                          endLng:
                            e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </label>
                </>
              )}
              <label className="text-xs">
                <span className="block text-slate-300">Shift Start</span>
                <input
                  type="time"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={v.shiftStart}
                  onChange={(e) => updateVehicle(idx, { shiftStart: e.target.value })}
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-300">Shift End</span>
                <input
                  type="time"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={v.shiftEnd}
                  onChange={(e) => updateVehicle(idx, { shiftEnd: e.target.value })}
                />
              </label>
              <label className="text-xs">
                <span className="block text-slate-300">Speed (km/h)</span>
                <input
                  type="number"
                  step="1"
                  className="w-full rounded-xl bg-black/40 border border-white/10 px-2 py-1"
                  value={v.speedKmph}
                  onChange={(e) =>
                    updateVehicle(idx, { speedKmph: Number(e.target.value) })
                  }
                />
              </label>
              <div className="flex items-center justify-end gap-3 md:col-span-1">
                <label className="text-xs inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={v.active}
                    onChange={(e) => updateVehicle(idx, { active: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  className="text-xs rounded-xl px-2 py-1 border border-white/20 hover:border-red-400 hover:text-red-300"
                  onClick={() => removeVehicle(v.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Run */}
      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={loading}
          className="rounded-xl px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold disabled:opacity-60"
        >
          {loading ? "Optimizing…" : "Optimize (VRPTW)"}
        </button>
        {err && <div className="text-red-400 text-sm">{err}</div>}
      </div>

      {/* Results */}
      {result && (
        <section className="space-y-6">
          <div className="text-sm opacity-80">
            <b>Total:</b> {result.total_km.toFixed(2)} km •{" "}
            {Math.round(result.total_time_min)} min
            {unassignedCount > 0 && (
              <>
                {" "}|{" "}
                <span className="text-red-400">
                  Unassigned: {result.unassigned_sellers.join(", ")}
                </span>
              </>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {result.plans.map((plan) => (
              <div
                key={plan.vehicle_id}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="font-semibold mb-2">
                  Vehicle #{plan.vehicle_id}
                </div>
                <div className="text-xs opacity-75 mb-3">
                  km: {plan.total_km.toFixed(2)} • time:{" "}
                  {Math.round(plan.total_time_min)}m • wait:{" "}
                  {Math.round(plan.wait_min)}m • late:{" "}
                  {Math.round(plan.lateness_min)}m • shift+ :{" "}
                  {Math.round(plan.shift_overrun_min)}m
                </div>
                <ol className="space-y-1 list-decimal list-inside text-sm">
                  {plan.route.map((st, idx) => (
                    <li key={idx}>
                      Seller {st.seller_id} — arrive {minToHHMM(st.arrival_min)},
                      start {minToHHMM(st.start_service_min)}, depart{" "}
                      {minToHHMM(st.depart_min)}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
