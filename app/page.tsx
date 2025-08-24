"use client";

import { useState } from "react";
import Link from "next/link";
import PilotCTA from "../components/PilotCTA";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Define a safe shape for testResult
type TestResult = Record<string, unknown>;

export default function Home() {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  async function runQuickVRPTWTest() {
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const payload = {
        depot: { lat: 12.9352, lng: 77.6245 },
        round_trip: true,
        sellers: [
          {
            id: 0,
            lat: 12.9354,
            lng: 77.61266,
            tw_start: 540,
            tw_end: 660,
            service_min: 6,
            available: true,
          },
        ],
        vehicles: [
          {
            id: 101,
            start: { lat: 12.9352, lng: 77.6245 },
            shift_start: 540,
            shift_end: 900,
            speed_kmph: 25.0,
            active: true,
          },
        ],
        seed: 42,
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
      const data: TestResult = await res.json();
      setTestResult(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setTestError(err.message);
      } else {
        setTestError(String(err));
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      {/* Navbar */}
      <nav className="sticky top-0 z-40 backdrop-blur bg-black/20 border-b border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-500/20 grid place-items-center ring-1 ring-emerald-400/40">
              <span className="text-lg font-bold">∑Q</span>
            </div>
            <span className="text-xl font-semibold tracking-tight">EulerQ</span>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm text-slate-300">
            <a href="#problem" className="hover:text-white">Problem</a>
            <a href="#solution" className="hover:text-white">Solution</a>
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#pilot" className="hover:text-white">Pilot</a>
            <a href="#contact" className="hover:text-white">Contact</a>
            <Link href="/optimizer-demo" className="hover:text-white">
              Route Optimizer (POC)
            </Link>
          </div>

          <a
            href="#contact"
            className="rounded-xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow"
          >
            Talk to us
          </a>
        </div>
      </nav>

      {/* ... Hero, Pilot CTA, Problem, Solution, How it works sections remain unchanged ... */}

      {/* Quick Backend Test (VRPTW) */}
      <section className="mx-auto max-w-7xl px-4 pb-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-lg">Quick Backend Test (VRPTW)</h3>
            <span className="text-xs text-slate-400">API: {API_BASE}</span>
          </div>
          <p className="text-sm text-slate-300 mt-1">
            Click to POST a tiny VRPTW request to your FastAPI backend and render the JSON result below.
          </p>
          <button
            onClick={runQuickVRPTWTest}
            disabled={testing}
            className="mt-4 rounded-xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold disabled:opacity-60"
          >
            {testing ? "Running..." : "Run sample VRPTW"}
          </button>

          {testError && (
            <div className="mt-4 text-red-400 text-sm">
              {testError}
            </div>
          )}

          {!!testResult && (
            <pre className="mt-4 text-xs md:text-sm text-emerald-300 bg-black/50 rounded-xl p-4 overflow-x-auto">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </div>
      </section>

      {/* ... Contact + Footer remain unchanged ... */}
    </main>
  );
}
