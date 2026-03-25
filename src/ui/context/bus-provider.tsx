/**
 * BusProvider — React context providing the event bus and subscribers.
 */

import React, { createContext, useContext } from 'react';
import type { GolemEventBus } from '../../bus/event-bus.js';
import type { AllSubscribers } from '../../subscribers/index.js';

interface BusContextValue {
  bus: GolemEventBus;
  subscribers: AllSubscribers;
}

const BusContext = createContext<BusContextValue | null>(null);

export function BusProvider({
  bus,
  subscribers,
  children,
}: {
  bus: GolemEventBus;
  subscribers: AllSubscribers;
  children: React.ReactNode;
}) {
  return (
    <BusContext.Provider value={{ bus, subscribers }}>
      {children}
    </BusContext.Provider>
  );
}

/** Access the event bus. */
export function useBus(): GolemEventBus {
  const ctx = useContext(BusContext);
  if (!ctx) throw new Error('useBus must be used within BusProvider');
  return ctx.bus;
}

/** Access all subscribers. */
export function useSubscribers(): AllSubscribers {
  const ctx = useContext(BusContext);
  if (!ctx) throw new Error('useSubscribers must be used within BusProvider');
  return ctx.subscribers;
}
