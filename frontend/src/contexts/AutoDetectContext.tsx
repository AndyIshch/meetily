'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Meeting app definitions with process name patterns
export interface MeetingAppConfig {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  // Process names that the system audio detector might report
  patterns: string[];
  // Browser-based apps need a grace period to avoid false positives (YouTube etc.)
  isBrowserBased: boolean;
}

export interface AutoDetectSettings {
  enabled: boolean;
  // Seconds to wait before starting recording (avoids false positives for browser apps)
  gracePeriodSeconds: number;
  // Show notification when auto-recording starts
  showNotification: boolean;
  // Auto-stop when meeting app stops using audio
  autoStop: boolean;
  apps: MeetingAppConfig[];
}

const DEFAULT_SETTINGS: AutoDetectSettings = {
  enabled: false,
  gracePeriodSeconds: 5,
  showNotification: true,
  autoStop: true,
  apps: [
    {
      id: 'google-meet',
      label: 'Google Meet',
      description: 'Browser-based \u2014 detects when your browser uses audio (may trigger on YouTube/Spotify)',
      enabled: true,
      patterns: [
        'Google Chrome', 'Google Chrome Helper',
        'Arc', 'Arc Helper',
        'Safari', 'com.apple.WebKit',
        'Firefox', 'firefox',
        'Microsoft Edge', 'Microsoft Edge Helper',
        'Brave Browser', 'Brave Browser Helper',
        'Chromium', 'Chromium Helper',
        'Opera', 'Vivaldi',
      ],
      isBrowserBased: true,
    },
    {
      id: 'slack',
      label: 'Slack Huddle',
      description: 'Detects Slack desktop app using audio (huddles, calls)',
      enabled: true,
      patterns: ['Slack', 'Slack Helper', 'com.tinyspeck.slackmacgap'],
      isBrowserBased: false,
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      description: 'Detects WhatsApp desktop app calls',
      enabled: true,
      patterns: ['WhatsApp', 'WhatsApp Helper', 'com.WhatsApp'],
      isBrowserBased: false,
    },
  ],
};

const STORAGE_KEY = 'meetily-auto-detect-settings';

interface AutoDetectContextType {
  settings: AutoDetectSettings;
  updateSettings: (patch: Partial<AutoDetectSettings>) => void;
  toggleApp: (appId: string) => void;
  toggleEnabled: () => void;
}

const AutoDetectContext = createContext<AutoDetectContextType | null>(null);

export const useAutoDetectSettings = () => {
  const context = useContext(AutoDetectContext);
  if (!context) {
    throw new Error('useAutoDetectSettings must be used within AutoDetectProvider');
  }
  return context;
};

function loadSettings(): AutoDetectSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(stored) as Partial<AutoDetectSettings>;

    // Merge with defaults to handle new fields added in future versions
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apps: DEFAULT_SETTINGS.apps.map(defaultApp => {
        const storedApp = parsed.apps?.find(a => a.id === defaultApp.id);
        return storedApp ? { ...defaultApp, ...storedApp } : defaultApp;
      }),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: AutoDetectSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('[AutoDetect] Failed to save settings:', e);
  }
}

export function AutoDetectProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AutoDetectSettings>(DEFAULT_SETTINGS);

  // Load on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<AutoDetectSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const toggleApp = useCallback((appId: string) => {
    setSettings(prev => {
      const next = {
        ...prev,
        apps: prev.apps.map(app =>
          app.id === appId ? { ...app, enabled: !app.enabled } : app
        ),
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const toggleEnabled = useCallback(() => {
    setSettings(prev => {
      const next = { ...prev, enabled: !prev.enabled };
      saveSettings(next);
      return next;
    });
  }, []);

  return (
    <AutoDetectContext.Provider value={{ settings, updateSettings, toggleApp, toggleEnabled }}>
      {children}
    </AutoDetectContext.Provider>
  );
}
