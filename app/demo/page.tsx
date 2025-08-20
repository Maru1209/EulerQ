import QuboPlayground from "@/components/QuboPlayground";
// If the alias @ doesn't work, use: import QuboPlayground from "../../components/QuboPlayground";

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-12 space-y-6">
        <h1 className="text-3xl md:text-4xl font-bold">QUBO / Ising Demo</h1>
        <QuboPlayground />
      </div>
    </main>
  );
}
