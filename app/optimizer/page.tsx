// app/optimizer/page.tsx
import dynamic from "next/dynamic";

// IMPORTANT: do NOT import the component directly.
// This avoids evaluating Leaflet on the server.
const RouteOptimizer = dynamic(
  () => import("../../components/RouteOptimizer"),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 text-sm text-gray-600">Loading optimizer…</div>
    ),
  }
);

// (Optional) If Next still tries to prerender this route:
// export const dynamic = "force-dynamic";

export default function OptimizerPage() {
  return (
    <div className="max-w-6xl mx-auto p-4">
      <RouteOptimizer />
    </div>
  );
}
