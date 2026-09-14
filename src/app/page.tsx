"use client";

import dynamic from 'next/dynamic';

// Disable SSR for the game component since Phaser relies on window/document
const BombermanGame = dynamic(() => import('@/components/BombermanGame'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">
      <p className="text-xl font-bold animate-pulse">Loading Game...</p>
    </div>
  ),
});

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-900">
      <BombermanGame />
    </main>
  );
}
