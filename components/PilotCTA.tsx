"use client";
import { useState } from "react";

export default function PilotCTA() {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold"
      >
        Run a 4-week Pilot
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
          <form
            action="https://formspree.io/f/xkgzapdk"
            method="POST"
            onSubmit={() => setSent(true)}
            className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-100"
          >
            <h3 className="text-xl font-semibold">Pilot request (Bengaluru)</h3>

            {/* Anti-bot honeypot (hidden) */}
            <input type="text" name="_gotcha" className="hidden" tabIndex={-1} autoComplete="off" />

            <div className="mt-4 grid gap-3">
              <input name="company" required placeholder="Company" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input name="name" required placeholder="Your name" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
                <input type="email" name="email" required placeholder="Email" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input name="phone" placeholder="Phone (+91…)" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
                <input name="startDate" placeholder="Preferred start date" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input name="stopsPerDay" placeholder="Stops/day" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
                <input name="depots" placeholder="Depots" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
                <input name="vehicles" placeholder="Vehicles" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
              </div>
              <textarea name="notes" rows={4} placeholder="Notes / constraints" className="rounded-xl bg-black/40 border border-white/10 px-3 py-2" />
            </div>

            {/* Optional: email subject shown to you */}
            <input type="hidden" name="_subject" value="Pilot request — Bengaluru" />
            {/* Optional: redirect after submit */}
            {/* <input type="hidden" name="_next" value="https://eulerq.com/thanks" /> */}

            <div className="mt-5 flex gap-3">
              <button className="rounded-xl px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold" type="submit">
                Submit
              </button>
              <button className="rounded-xl px-5 py-3 border border-white/20" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>

            {sent && (
              <p className="mt-3 text-emerald-300 text-sm">
                Thanks! Submitted — we’ll respond within 1–2 business days.
              </p>
            )}
          </form>
        </div>
      )}
    </>
  );
}

