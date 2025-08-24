// app/optimizer/page.tsx
import ClientOnly from './ClientOnly';

// If Next still tries to prerender this route, you can force dynamic rendering:
// export const dynamic = 'force-dynamic';

export default function OptimizerPage() {
  return (
    <div className="max-w-6xl mx-auto p-4">
      <ClientOnly />
    </div>
  );
}

