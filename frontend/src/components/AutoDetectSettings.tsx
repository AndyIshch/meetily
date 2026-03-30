'use client';

import React from 'react';
import { useAutoDetectSettings } from '@/contexts/AutoDetectContext';
import { Radio, Slack, Phone, Globe, AlertTriangle } from 'lucide-react';

/**
 * Auto-detect settings panel for the Settings page.
 * Allows enabling/disabling auto-recording per meeting app.
 */
export function AutoDetectSettings() {
  const { settings, toggleEnabled, toggleApp, updateSettings } = useAutoDetectSettings();

  const appIcons: Record<string, React.ReactNode> = {
    'google-meet': <Globe className="w-4 h-4" />,
    'slack': <Slack className="w-4 h-4" />,
    'whatsapp': <Phone className="w-4 h-4" />,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-blue-600" />
          <div>
            <h3 className="font-semibold text-sm text-gray-900">Auto-Detect Meetings</h3>
            <p className="text-xs text-gray-500">
              Automatically start recording when a meeting app is detected
            </p>
          </div>
        </div>
        <button
          onClick={toggleEnabled}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {settings.enabled && (
        <div className="ml-7 space-y-3">
          {/* Per-app toggles */}
          <div className="space-y-2">
            {settings.apps.map(app => (
              <div
                key={app.id}
                className="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">
                    {appIcons[app.id] || <Radio className="w-4 h-4" />}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-gray-800">{app.label}</span>
                    <p className="text-xs text-gray-400">{app.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => toggleApp(app.id)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    app.enabled ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      app.enabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>

          {/* Browser warning */}
          {settings.apps.find(a => a.id === 'google-meet')?.enabled && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-50 border border-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                Google Meet runs in your browser. Auto-detect cannot distinguish Meet from
                other browser audio (YouTube, Spotify). A {settings.gracePeriodSeconds}s grace
                period helps filter short sounds, but false positives may occur.
              </p>
            </div>
          )}

          {/* Grace period */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-gray-600">
                Grace period (browser apps)
              </label>
              <span className="text-xs text-gray-500">{settings.gracePeriodSeconds}s</span>
            </div>
            <input
              type="range"
              min={0}
              max={15}
              step={1}
              value={settings.gracePeriodSeconds}
              onChange={(e) => updateSettings({ gracePeriodSeconds: Number(e.target.value) })}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>0s (instant)</span>
              <span>15s (safe)</span>
            </div>
          </div>

          {/* Auto-stop toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">
              Auto-stop when meeting ends
            </span>
            <button
              onClick={() => updateSettings({ autoStop: !settings.autoStop })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                settings.autoStop ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  settings.autoStop ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Notification toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">
              Show notification on auto-record
            </span>
            <button
              onClick={() => updateSettings({ showNotification: !settings.showNotification })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                settings.showNotification ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  settings.showNotification ? 'translate-x-5' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
