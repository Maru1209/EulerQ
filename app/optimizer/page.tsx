// app/optimizer/page.tsx
import ClientOnly from "./ClientOnly";

// (Optional) If Next still tries to prerender this route:
// export const dynamic = "force-dynamic";

export default function OptimizerPage() {
  return <ClientOnly />;
}


