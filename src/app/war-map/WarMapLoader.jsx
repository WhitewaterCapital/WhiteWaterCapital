'use client';

import dynamic from 'next/dynamic';

// MapLibre GL touches window/document at import time, so WarMapClient can only
// run in the browser. Next 16 forbids `ssr: false` in a Server Component, so the
// dynamic import lives here, in a Client Component, and the server page renders
// this loader (keeping its `metadata` export valid).
const WarMapClient = dynamic(() => import('./WarMapClient'), { ssr: false });

export default function WarMapLoader() {
  return <WarMapClient />;
}
