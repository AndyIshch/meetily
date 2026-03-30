'use client';

import { useAutoDetect } from '@/hooks/useAutoDetect';

/**
 * Headless component that activates auto-detect monitoring.
 * Renders nothing — just runs the hook.
 * Must be placed inside AutoDetectProvider and RecordingStateProvider.
 */
export function AutoDetectMonitor() {
  useAutoDetect();
  return null;
}
