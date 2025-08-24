"use client";

import { useState } from "react";
import Link from "next/link";
import PilotCTA from "../components/PilotCTA";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

// Safe shape for the VRPTW test response
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
      setTestError(err instanceof Error ? err.message : String(err));
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

            {/* Links to all pages */}
            <Link href="/optimizer" className="hover:text-white">Optimizer</Link>
            <Link href="/optimizer-demo" className="hover:text-white">Optimizer Demo</Link>
            <Link href="/vrptw-demo" className="hover:text-white">VRPTW Demo</Link>
            <Link href="/solver" className="hover:text-white">Solver</Link>
            <Link href="/demo" className="hover:text-white">Demo</Link>
          </div>

          <a
            href="#contact"
            className="rounded-xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow"
          >
            Talk to us
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-40 -left-40 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -right-40 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        </div>
        <div className="mx-auto max-w-7xl px-4 py-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">
              Hybrid <span className="text-emerald-400">AI + Quantum</span> Optimization
              <br />for India’s Logistics
            </h1>
            <p className="mt-5 text-slate-300 text-lg leading-relaxed">
              We turn combinatorial chaos into on-time deliveries: VRP with time windows,
              fleet & shift planning, and returns consolidation — solved in minutes, not hours.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#pilot" className="rounded-xl px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold shadow">
                Start a 4-week pilot
              </a>
              <a href="mailto:contact@eulerq.com?subject=EulerQ%20—%20Pilot%20Inquiry" className="rounded-xl px-5 py-3 border border-white/20 hover:border-white/40">
                Email us
              </a>
            </div>
            <div className="mt-8 grid grid-cols-3 md:grid-cols-6 gap-6 opacity-70 text-sm">
              {['On-time in-full','−10–20% lateness','−8–12% km/stop','+3–5% drops/vehicle','SLA compliance','CO₂ reduction'].map((t,i)=> (
                <div key={i} className="rounded-xl border border-white/10 px-3 py-2 text-center">{t}</div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-2xl">
              <div className="rounded-xl bg-black p-4">
                <pre className="text-xs md:text-sm text-emerald-300 whitespace-pre-wrap">
{`# QUBO: minimize xᵀQx
# Variables: x_{i,t,v} ∈ {0,1}
# Visit once  : (Σ_{t,v} x_{i,t,v} − 1)²
# Slot unique : (Σ_i x_{i,t,v})²
# Capacity    : (Σ_i d_i Σ_t x_{i,t,v} − cap)²
# Objective   : distance + time-window penalties`}
                </pre>
              </div>
              <div className="mt-3 text-sm text-slate-300">
                Built on graph theory pioneered by Euler — now supercharged with quantum-inspired solvers.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pilot CTA */}
      <section id="pilot" className="mx-auto max-w-7xl px-4 py-16">
        <div className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold">Run a 4-week pilot</h2>
          <p className="mt-3 text-slate-200 max-w-2xl">
            Scope: 2 depots · 20–50 vehicles · 1–2k stops/day · VRP-TW, returns, and shift optimization.
            Success = −8–12% km/stop, −10–20% lateness, +3–5% drops/vehicle.
          </p>
          <div className="mt-6">
            <PilotCTA />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold">The problem we tackle</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-6">
          {[
            {title:'Exploding combinations',desc:'Tens of thousands of daily stops, vehicles, depots, and time windows make exact search infeasible.'},
            {title:'Dynamic reality',desc:'Traffic, rain, no-shows, and priority orders invalidate plans every 30–60 minutes.'},
            {title:'Multiple objectives',desc:'Minimize km, meet SLAs, balance fleets, and respect capacity — all at once.'}
          ].map((c,i)=>(
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-semibold text-lg">{c.title}</h3>
              <p className="mt-2 text-slate-300">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Solution */}
      <section id="solution" className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold">Our solution</h2>
        <div className="mt-6 grid md:grid-cols-3 gap-6">
          {[
            {title:'Hybrid AI + Quantum', desc:'Forecast demand with AI, optimize routes with quantum-inspired solvers (QUBO/Ising).'},
            {title:'Real-time re-planning', desc:'Recompute plans as inputs change; API or batch every 15–60 minutes.'},
            {title:'Easy integration', desc:'CSV/S3 or REST. Keep your current TMS — we plug in and compare A/B.'}
          ].map((c,i)=>(
            <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h3 className="font-semibold text-lg">{c.title}</h3>
              <p className="mt-2 text-slate-300">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold">How it works</h2>
        <ol className="mt-6 grid md:grid-cols-4 gap-6 list-decimal list-inside">
          {[
            'Ingest orders, depots, vehicles, time windows, travel times',
            'Formulate QUBO with constraints (capacity, SLAs, shifts)',
            'Solve via hybrid engine; generate routes + ETAs + exceptions',
            'A/B against current engine; monitor KPIs and iterate'
          ].map((s,i)=>(
            <li key={i} className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <span className="text-slate-300">{s}</span>
            </li>
          ))}
        </ol>
      </section>

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

      {/* Contact */}
      <section id="contact" className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold">Contact</h2>
        <div className="mt-6 grid md:grid-cols-2 gap-8">
          <form className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4" onSubmit={(e)=>e.preventDefault()}>
            <div>
              <label className="block text-sm text-slate-300">Name</label>
              <input className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2" placeholder="Your name" />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Email</label>
              <input type="email" className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2" placeholder="you@email.com" />
            </div>
            <div>
              <label className="block text-sm text-slate-300">Message</label>
              <textarea rows={4} className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2" placeholder="Tell us about your routes, depots, and goals…" />
            </div>
            <button className="rounded-xl px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold">
              Send (opens email)
            </button>
            <p className="text-xs text-slate-400">
              Or email us at <a href="mailto:contact@eulerq.com" className="underline">contact@eulerq.com</a>
            </p>
          </form>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="font-semibold text-lg">Company details</h3>
            <ul className="mt-3 space-y-2 text-slate-300 text-sm">
              <li><span className="text-slate-400">Brand:</span> EulerQ</li>
              <li><span className="text-slate-400">Focus:</span> AI + Quantum Optimization for Logistics</li>
              <li><span className="text-slate-400">HQ:</span> India (Bengaluru / Chennai)</li>
              <li><span className="text-slate-400">Email:</span> contact@eulerq.com</li>
              <li>
                <span className="text-slate-400">Phone:</span>{" "}
                <a href="tel:+917204025576" className="underline hover:text-emerald-400">+91-7204025576</a>
              </li>
            </ul>
            <div className="mt-6 text-sm text-slate-400">
              With the blessings of Kanakanpatti Sidhar Aiyya Palani Swami,
              we are committed to solving India’s logistics inefficiencies with science and service.
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-400 flex flex-col md:flex-row items-center justify-between gap-4">
          <p>© {new Date().getFullYear()} EulerQ. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-slate-200">Privacy</a>
            <a href="#" className="hover:text-slate-200">Security</a>
            <a href="#" className="hover:text-slate-200">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
