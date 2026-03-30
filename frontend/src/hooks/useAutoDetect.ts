import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { useAutoDetectSettings, MeetingAppConfig } from '@/contexts/AutoDetectContext';
import { useRecordingState } from '@/contexts/RecordingStateContext';
import { toast } from 'sonner';

/**
 * useAutoDetect — monitors system audio and auto-starts/stops recording
 * when a configured meeting app (Google Meet, Slack, WhatsApp) is detected.
 *
 * Flow:
 * 1. Starts system audio monitoring via Tauri command
 * 2. Listens for 'system-audio-started' events (array of app names)
 * 3. Matches detected apps against configured patterns
 * 4. For browser-based apps: waits gracePeriodSeconds before triggering
 * 5. Triggers recording via 'start-recording-from-sidebar' custom event
 * 6. On 'system-audio-stopped': auto-stops recording if autoStop enabled
 *
 * Known limitation: Google Meet runs in browser, so detector sees "Google Chrome"
 * not "Google Meet". Grace period mitigates false positives from short audio
 * (notifications, video clips) but can't fully distinguish meetings from media.
 */
export function useAutoDetect() {
  const { settings } = useAutoDetectSettings();
  const { isRecording } = useRecordingState();

  // Track whether current recording was auto-started (for auto-stop logic)
  const autoStartedRef = useRef(false);
  // Grace period timer for browser-based apps
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track detected app for logging
  const detectedAppRef = useRef<string | null>(null);
  // Prevent re-triggering while already starting
  const isStartingRef = useRef(false);
  // Track monitoring state
  const isMonitoringRef = useRef(false);

  /**
   * Match detected app names against configured meeting app patterns.
   * Returns the first matching MeetingAppConfig, or null.
   */
  const matchMeetingApp = useCallback(
    (detectedApps: string[]): MeetingAppConfig | null => {
      const enabledApps = settings.apps.filter(app => app.enabled);

      for (const detectedApp of detectedApps) {
        const normalizedDetected = detectedApp.toLowerCase();
        for (const appConfig of enabledApps) {
          const match = appConfig.patterns.some(
            pattern => normalizedDetected.includes(pattern.toLowerCase())
          );
          if (match) return appConfig;
        }
      }
      return null;
    },
    [settings.apps]
  );

  /**
   * Trigger recording start via the existing sidebar event mechanism.
   * This reuses the full recording start flow (model check, title generation, etc.)
   */
  const triggerRecordingStart = useCallback((appConfig: MeetingAppConfig) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    autoStartedRef.current = true;
    detectedAppRef.current = appConfig.label;

    console.log(`[AutoDetect] Starting recording — detected: ${appConfig.label}`);

    if (settings.showNotification) {
      toast.info(`Auto-recording: ${appConfig.label}`, {
        description: appConfig.isBrowserBased
          ? 'Browser audio detected — recording started'
          : `${appConfig.label} call detected — recording started`,
        duration: 4000,
      });
    }

    // Use the existing auto-start mechanism
    sessionStorage.setItem('autoStartRecording', 'true');
    // If already on home page, dispatch direct event
    window.dispatchEvent(new CustomEvent('start-recording-from-sidebar'));

    // Reset starting flag after a delay
    setTimeout(() => {
      isStartingRef.current = false;
    }, 3000);
  }, [settings.showNotification]);

  /**
   * Trigger recording stop.
   */
  const triggerRecordingStop = useCallback(() => {
    if (!autoStartedRef.current) return;

    console.log(`[AutoDetect] Auto-stopping recording — ${detectedAppRef.current} stopped`);

    if (settings.showNotification) {
      toast.info('Auto-recording stopped', {
        description: `${detectedAppRef.current || 'Meeting app'} audio ended`,
        duration: 3000,
      });
    }

    // Dispatch stop event — RecordingControls listens for this
    window.dispatchEvent(new CustomEvent('auto-detect-stop-recording'));

    autoStartedRef.current = false;
    detectedAppRef.current = null;
  }, [settings.showNotification]);

  // Main effect: start/stop monitoring based on settings
  useEffect(() => {
    if (!settings.enabled) {
      // Cleanup if disabled
      if (isMonitoringRef.current) {
        invoke('stop_system_audio_monitoring').catch(e =>
          console.warn('[AutoDetect] Failed to stop monitoring:', e)
        );
        isMonitoringRef.current = false;
      }
      return;
    }

    let unlistenStarted: UnlistenFn | null = null;
    let unlistenStopped: UnlistenFn | null = null;
    let mounted = true;

    const setup = async () => {
      try {
        // Start the Rust-side system audio monitor
        await invoke('start_system_audio_monitoring');
        isMonitoringRef.current = true;
        console.log('[AutoDetect] System audio monitoring started');

        // Listen for meeting app audio start
        unlistenStarted = await listen<string[]>('system-audio-started', (event) => {
          if (!mounted || isRecording || isStartingRef.current) return;

          const detectedApps = event.payload;
          console.log('[AutoDetect] System audio started by:', detectedApps);

          const matchedApp = matchMeetingApp(detectedApps);
          if (!matchedApp) {
            console.log('[AutoDetect] No matching meeting app found');
            return;
          }

          console.log(`[AutoDetect] Matched: ${matchedApp.label} (browser: ${matchedApp.isBrowserBased})`);

          if (matchedApp.isBrowserBased && settings.gracePeriodSeconds > 0) {
            // For browser apps: wait grace period before starting
            // This filters out short audio (notifications, video previews)
            console.log(`[AutoDetect] Grace period: ${settings.gracePeriodSeconds}s for ${matchedApp.label}`);

            if (graceTimerRef.current) clearTimeout(graceTimerRef.current);

            graceTimerRef.current = setTimeout(() => {
              // Re-check: still not recording after grace period?
              if (!isStartingRef.current) {
                triggerRecordingStart(matchedApp);
              }
              graceTimerRef.current = null;
            }, settings.gracePeriodSeconds * 1000);
          } else {
            // Native apps: start immediately
            triggerRecordingStart(matchedApp);
          }
        });

        // Listen for meeting app audio stop
        unlistenStopped = await listen('system-audio-stopped', () => {
          if (!mounted) return;

          console.log('[AutoDetect] System audio stopped');

          // Cancel pending grace timer (browser audio was short = not a meeting)
          if (graceTimerRef.current) {
            console.log('[AutoDetect] Grace timer cancelled — audio was brief');
            clearTimeout(graceTimerRef.current);
            graceTimerRef.current = null;
            return;
          }

          // Auto-stop if enabled and recording was auto-started
          if (settings.autoStop && autoStartedRef.current) {
            triggerRecordingStop();
          }
        });
      } catch (error) {
        // Monitoring might already be active (e.g., after hot reload)
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('already active')) {
          console.log('[AutoDetect] Monitoring already active, attaching listeners');
          isMonitoringRef.current = true;
        } else {
          console.error('[AutoDetect] Failed to start monitoring:', error);
        }
      }
    };

    setup();

    return () => {
      mounted = false;
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      unlistenStarted?.();
      unlistenStopped?.();
      // Don't stop monitoring on cleanup (hot reload) — let it run
      // It will be stopped explicitly when settings.enabled = false
    };
  }, [settings.enabled, settings.gracePeriodSeconds, settings.autoStop, isRecording, matchMeetingApp, triggerRecordingStart, triggerRecordingStop]);

  // Reset auto-started flag when recording stops (from any source)
  useEffect(() => {
    if (!isRecording && autoStartedRef.current) {
      // Recording ended — reset auto-start tracking
      // (might have been stopped manually, which is fine)
      autoStartedRef.current = false;
      detectedAppRef.current = null;
    }
  }, [isRecording]);
}
