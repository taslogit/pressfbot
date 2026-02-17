import React, { createContext, useContext, useState } from 'react';
import type { BreadcrumbSegment } from '../components/Breadcrumbs';

type BreadcrumbContextValue = { segments: BreadcrumbSegment[] | null; setSegments: (s: BreadcrumbSegment[] | null) => void };
const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [segments, setSegments] = useState<BreadcrumbSegment[] | null>(null);
  return (
    <BreadcrumbContext.Provider value={{ segments, setSegments }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  return useContext(BreadcrumbContext);
}
