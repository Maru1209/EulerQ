'use client';

import dynamic from 'next/dynamic';

// Safe here because THIS FILE is a Client Component
const RouteOptimizer = dynamic(() => import('../../components/RouteOptimizer'), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-gray-600">Loading optimizer…</div>,
});

export default function ClientOnly() {
  return <RouteOptimizer />;
}
