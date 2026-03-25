/**
 * useBusTokenUsage — Token usage from bus events.
 */

import { useState, useEffect } from 'react';
import { useBus } from '../context/bus-provider.js';
import type { TokenUsage } from '../../core/types.js';

export function useBusTokenUsage() {
  const bus = useBus();
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  });

  useEffect(() => {
    const unsub = bus.on('stream:finished', (e) => {
      setTokenUsage(e.usage);
    });
    return unsub;
  }, [bus]);

  return tokenUsage;
}
