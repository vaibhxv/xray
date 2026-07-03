'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

/** Subscribe to a websocket event and get the latest payload. */
export function useWsEvent<T>(event: string): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    const s = getSocket();
    const handler = (payload: T) => setData(payload);
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event]);
  return data;
}

/** Subscribe to an event and accumulate a rolling buffer of the last N items. */
export function useWsBuffer<T>(event: string, max = 100): T[] {
  const [items, setItems] = useState<T[]>([]);
  const ref = useRef<T[]>([]);
  useEffect(() => {
    const s = getSocket();
    const handler = (payload: T) => {
      ref.current = [payload, ...ref.current].slice(0, max);
      setItems([...ref.current]);
    };
    s.on(event, handler);
    return () => {
      s.off(event, handler);
    };
  }, [event, max]);
  return items;
}
