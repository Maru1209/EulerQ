// app/layout.tsx
import 'leaflet/dist/leaflet.css';   // ✅ global CSS import
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EulerQ – Quantum Optimization for Logistics & E-commerce',
  description:
    'EulerQ leverages quantum-inspired optimization to solve complex logistics and e-commerce challenges in India.',
  keywords: ['Quantum Computing', 'Optimization', 'Logistics', 'E-commerce', 'EulerQ'],
  openGraph: {
    title: 'EulerQ',
    description: 'Quantum Optimization for Logistics & E-commerce',
    url: 'https://eulerq.com',
    siteName: 'EulerQ',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'EulerQ Preview',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

