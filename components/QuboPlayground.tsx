"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/** ---------- Utilities ---------- **/

function parseMatrix(text: string): number[][] {
  // Accept JSON like [[...],[...]] or simple rows separated by newlines/commas
  try {
    const j = JSON.parse(text);
    if (!Array.isArray(j)) throw new Error("Not an array");
    return j.map((row: any) => row.map((v: any) => Number(v)));
  } catch {
    // Try loose CSV-ish parse
    const rows = text
      .trim()
      .split(/\n+/)
      .map((r) => r.trim())
      .filter(Boolean);
    const mat = rows.map((r) =>
      r
        .split(/[,\s]+/)
        .map((v) => Number(v))
        .filter((v) => !Number.isNaN(v))
    );
    const n = mat[0]?.length || 0;
    if (!n || mat.some((r) => r.length !== n)) {
      throw new Error("Could not parse matrix. Use JSON or equal-length rows.");
    }
    return mat;
  }
}

function energyQubo(Q: number[][], x: number[]): number {
  // E = x^T Q x
  const n = x.length;
  let E = 0;
  for (let i = 0; i < n; i++) {
    if (x[i] === 0) continue;
    for (let j = 0; j < n; j++) {
      if (x[j] === 0) continue;
      E += Q[i][j];
    }
  }
  return E;
}

function randomBits(n: number): number[] {
  return Array.from({ length: n }, () => (Math.random() < 0.5 ? 0 : 1));
}

function toIsing(x: number[]): number[] {
  // s in {-1, +1} from x in {0,1}: s = 2x - 1
  return x.map((b) => (b === 1 ? 1 : -1));
}

/** ---------- Presets (QUBO) ---------- **/

// Max-Cut on a 6-node weighted graph (symmetric). Lower energy here corresponds to higher cut (with a constant).
// This is a toy example; you can replace with your own Q later.
const PRESET_MAXCUT_6 = [
  [ 0, -1,  0, -1,  0, -2],
  [-1,  0, -2,  0, -1,  0],
  [ 0, -2,  0, -1, -2,  0],
  [-1,  0, -1,  0,  0, -1],
  [ 0, -1, -2,  0,  0, -1],
  [-2,  0,  0, -1, -1,  0],
];

// Small random QUBO (8 vars)
const PRESET_RANDOM_8 = [
  [ 2, -1,  0,  1,  0, -2,  0,  1],
  [-1,  1, -1,  0,  0,  0, -2,  1],
  [ 0, -1,  2, -1,  1,  0,  0, -1],
  [ 1,  0, -1,  1, -2,  0,  1,  0],
  [ 0,  0,  1, -2,  3, -1,  0,  0],
  [-2,  0,  0,  0, -1,  2, -1,  1],
  [ 0, -2,  0,  1,  0, -1,  2, -1],
  [ 1,  1, -1,  0,  0,  1, -1,  1],
];

/** ---------- Simulated Annealing (browser) ---------- **/

type RunState = "idle" | "running" | "stopped";

export default function QuboPlayground() {
  const [matrixText, setMatrixText] = useState(JSON.stringify(PRESET_MAXCUT_6, null, 2));
  const Q = useMemo(() => {
    try {
      return parseMatrix(matrixText);
    } catch {
      return null;
    }
  }, [matrixText]);

  const n = Q?.length ?? 0;

  const [steps, setSteps] = useState(5000);
  const [batch, setBatch] = useState(200); // UI updates every 'batch' steps
  const [t0, setT0] = useState(2.0);
  const [t1, setT1] = useState(0.01);

  const [state, setState] = useState<RunState>("idle");
  const [x, setX] = useState<number[]>([]);
  const [bestX, setBestX] = useState<number[]>([]);
  const [E, setE] = useState<number | null>(null);
  const [bestE, setBestE] = useState<number | null>(null);
  const [iter, setIter] = useState(0);

  // Keep mutable working copies off React state for speed
  const xRef = useRef<number[]>([]);
  const ERef = useRef<number>(0);
  const bestXRef = useRef<number[]>([]);
  const bestERef = useRef<number>(Infinity);
  const stopRef = useRef(false);

  useEffect(() => {
    // Reset on matrix change
    if (Q) {
      const x0 = randomBits(Q.length);
      const E0 = energyQubo(Q, x0);
      xRef.current = x0.slice();
      ERef.current = E0;
      bestXRef.current = x0.slice();
      bestERef.current = E0;
      setX(x0);
      setE(E0);
      setBestX(x0);
      setBestE(E0);
      setIter(0);
      setState("idle");
      stopRef.current = false;
    }
  }, [n]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (!Q) return;
    if (state === "running") return;
    setState("running");
    stopRef.current = false;

    const N = Q.length;
    const total = steps;
    let k = 0;

    while (k < total && !stopRef.current) {
      const limit = Math.min(total, k + batch);
      for (; k < limit; k++) {
        // temperature schedule (linear)
        const T = t0 + (t1 - t0) * (k / Math.max(1, total - 1));
        // pick random bit to flip
        const i = (Math.random() * N) | 0;
        const xi = xRef.current[i];
        const xiNew = xi ^ 1;

        // Try flip and compute new energy (simple O(n^2) recompute for clarity)
        xRef.current[i] = xiNew;
        const Enew = energyQubo(Q, xRef.current);
        const dE = Enew - ERef.current;

        // Metropolis accept
        if (dE <= 0 || Math.random() < Math.exp(-dE / Math.max(1e-9, T))) {
          ERef.current = Enew;
          if (Enew < bestERef.current) {
            bestERef.current = Enew;
            bestXRef.current = xRef.current.slice();
          }
        } else {
          // reject -> revert
          xRef.current[i] = xi;
        }
      }

      // Push UI update
      setX(xRef.current.slice());
      setE(ERef.current);
      setBestX(bestXRef.current.slice());
      setBestE(bestERef.current);
      setIter(k);

      // Yield to keep UI responsive
      await new Promise(requestAnimationFrame);
    }

    setState(stopRef.current ? "stopped" : "idle");
  }

  function stop() {
    stopRef.current = true;
  }

  function loadPreset(preset: "maxcut" | "random") {
    if (preset === "maxcut") setMatrixText(JSON.stringify(PRESET_MAXCUT_6, null, 2));
    else setMatrixText(JSON.stringify(PRESET_RANDOM_8, null, 2));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <button onClick={() => loadPreset("maxcut")} className="rounded-lg px-3 py-2 border border-white/10 bg-white/5">
          Load Max‑Cut (6)
        </button>
        <button onClick={() => loadPreset("random")} className="rounded-lg px-3 py-2 border border-white/10 bg-white/5">
          Load Random (8)
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm text-slate-300">QUBO Matrix (JSON or rows)</label>
          <textarea
            value={matrixText}
            onChange={(e) => setMatrixText(e.target.value)}
            rows={14}
            className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 font-mono text-sm"
          />
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm text-slate-300">
              Steps
              <input type="number" value={steps} onChange={(e) => setSteps(parseInt(e.target.value || "0"))}
                className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
            </label>
            <label className="text-sm text-slate-300">
              Batch
              <input type="number" value={batch} onChange={(e) => setBatch(parseInt(e.target.value || "0"))}
                className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-slate-300">
                T₀
                <input type="number" step="0.01" value={t0} onChange={(e) => setT0(parseFloat(e.target.value || "0"))}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
              </label>
              <label className="text-sm text-slate-300">
                T₁
                <input type="number" step="0.01" value={t1} onChange={(e) => setT1(parseFloat(e.target.value || "0"))}
                  className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
              </label>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={run} disabled={!Q || state === "running"} className="rounded-xl px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold disabled:opacity-50">
              {state === "running" ? "Running…" : "Run"}
            </button>
            <button onClick={stop} disabled={state !== "running"} className="rounded-xl px-5 py-3 border border-white/20">
              Stop
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold">Status</h3>
            <p className="text-sm text-slate-300 mt-2">n = {n || "—"} · iter = {iter}</p>
            <p className="text-sm text-slate-300">E (current) = {E ?? "—"}</p>
            <p className="text-sm text-slate-300">E (best) = {bestE ?? "—"}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold">Assignment (binary)</h3>
            <code className="block text-sm text-emerald-300 break-words">{x.length ? `[${x.join(", ")}]` : "—"}</code>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h3 className="font-semibold">Ising spins (s = 2x − 1)</h3>
            <code className="block text-sm text-cyan-300 break-words">
              {x.length ? `[${toIsing(x).join(", ")}]` : "—"}
            </code>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Tip: Paste your own Q matrix (symmetric is best). Energy here is <code>xᵀQx</code>, so **lower is better**.
      </p>
    </div>
  );
}
