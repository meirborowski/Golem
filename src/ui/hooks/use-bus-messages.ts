/**
 * useBusMessages — Tracks message list from bus events.
 */

import { useState, useEffect } from 'react';
import { useBus } from '../context/bus-provider.js';
import type { ChatMessage } from '../../core/types.js';

export function useBusMessages() {
  const bus = useBus();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const unsubs = [
      bus.on('history:message-added', (e) => {
        setMessages((prev) => [...prev, e.message]);
      }),
      bus.on('history:cleared', () => {
        setMessages([]);
      }),
      bus.on('session:loaded', (e) => {
        setMessages(e.messages);
      }),
      bus.on('command:result', (e) => {
        // Show command output as system messages
        setMessages((prev) => [
          ...prev,
          { role: 'system', content: e.output, timestamp: Date.now() },
        ]);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [bus]);

  return messages;
}
