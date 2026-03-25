/**
 * useBusStreaming — Streaming state with 30fps text batching.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useBus } from '../context/bus-provider.js';

const FLUSH_INTERVAL_MS = 32; // ~30fps

export function useBusStreaming() {
  const bus = useBus();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Text batching
  const bufferRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (bufferRef.current) {
      setStreamingText((prev) => prev + bufferRef.current);
      bufferRef.current = '';
    }
    timerRef.current = null;
  }, []);

  useEffect(() => {
    const unsubs = [
      bus.on('stream:started', () => {
        setStreamingText('');
        setIsStreaming(true);
        setError(null);
      }),
      bus.on('stream:text-delta', (e) => {
        bufferRef.current += e.text;
        if (!timerRef.current) {
          timerRef.current = setTimeout(flush, FLUSH_INTERVAL_MS);
        }
      }),
      bus.on('stream:finished', () => {
        // Flush any remaining text
        if (bufferRef.current) {
          setStreamingText((prev) => prev + bufferRef.current);
          bufferRef.current = '';
        }
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsStreaming(false);
      }),
      bus.on('stream:error', (e) => {
        if (bufferRef.current) {
          setStreamingText((prev) => prev + bufferRef.current);
          bufferRef.current = '';
        }
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setIsStreaming(false);
        setError(e.error);
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [bus, flush]);

  return { isStreaming, streamingText, error };
}
