'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Header from '@/components/Header';
import SplitSelector from '@/components/SplitSelector';
import { WorkoutSplit } from '@/types';

/**
 * Authenticated dashboard layout.
 * Wraps all pages within the (dashboard) route group.
 * Structure: Header → SplitSelector → children content.
 *
 * Requirements: 2.1 (split navigation), 7.1 (320px viewport), 7.5 (no horizontal scroll)
 */

function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read active split from URL search params, default to UPPER
  const splitParam = searchParams.get('split') as WorkoutSplit | null;
  const [activeSplit, setActiveSplit] = useState<WorkoutSplit>(
    splitParam && ['UPPER', 'LOWER', 'ARMS'].includes(splitParam) ? splitParam : 'UPPER'
  );

  function handleSplitChange(split: WorkoutSplit) {
    setActiveSplit(split);
    // Update URL search params to persist selected split
    const params = new URLSearchParams(searchParams.toString());
    params.set('split', split);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <SplitSelector activeSplit={activeSplit} onSplitChange={handleSplitChange} />
      <main className="flex-1 px-4 py-4 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="flex flex-col min-h-screen bg-gray-50" />}>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </Suspense>
  );
}
