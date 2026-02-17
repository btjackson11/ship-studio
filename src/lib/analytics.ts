/**
 * Analytics Service
 *
 * Thin wrapper around the Rust PostHog backend.
 * All events are sent through the Tauri IPC bridge to the Rust backend,
 * which forwards them to PostHog. The API key never touches the frontend.
 *
 * @module lib/analytics
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Track an analytics event. Fire-and-forget — never throws.
 *
 * @param eventName - The event name (e.g., "project_created")
 * @param properties - Optional key-value properties to attach
 */
export async function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    await invoke('track_event', {
      eventName,
      properties: properties ?? null,
      distinctId: null,
    });
  } catch {
    // Never let analytics break the app
  }
}

/**
 * Identify a user by linking their device to a known user ID.
 * Call this when the user authenticates (e.g., GitHub login).
 *
 * @param userId - Unique user identifier (e.g., GitHub username)
 * @param properties - Optional person properties ($set)
 */
export async function identifyUser(
  userId: string,
  properties?: Record<string, unknown>
): Promise<void> {
  try {
    await invoke('identify_user', {
      userId,
      properties: properties ?? null,
    });
  } catch {
    // Never let analytics break the app
  }
}

/**
 * Check if analytics are currently enabled.
 */
export async function getAnalyticsEnabled(): Promise<boolean> {
  try {
    return await invoke<boolean>('get_analytics_enabled');
  } catch {
    return true; // Default to enabled
  }
}

/**
 * Set whether analytics are enabled (persisted across sessions).
 */
export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
  try {
    await invoke('set_analytics_enabled', { enabled });
  } catch {
    // Silently fail
  }
}

/**
 * Get the anonymous device ID.
 */
export async function getDeviceId(): Promise<string> {
  try {
    return await invoke<string>('get_device_id_command');
  } catch {
    return 'unknown';
  }
}

// ============ Error Tracking ============

/**
 * Track an error event. Fire-and-forget — never throws.
 * Call this in catch blocks to understand what's failing for users.
 *
 * @param action - What the user was trying to do (e.g., "git_push", "plugin_install")
 * @param error - The caught error (string, Error, or unknown)
 * @param screenName - Screen where the error occurred
 */
export function trackError(action: string, error: unknown, screenName?: string): void {
  let message = 'Unknown error';
  let errorType = 'unknown';

  if (error instanceof Error) {
    message = error.message;
    errorType = error.name || 'Error';
    // Include cause if available
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) {
      message += ` (${cause.message})`;
    } else if (typeof cause === 'string') {
      message += ` (${cause})`;
    }
  } else if (typeof error === 'string') {
    message = error;
    errorType = 'string';
  } else if (error && typeof error === 'object') {
    message = JSON.stringify(error);
    errorType = 'object';
  }

  void trackEvent('error_occurred', {
    action,
    error_message: message.slice(0, 500), // Cap length for PostHog
    error_type: errorType,
    $screen_name: screenName ?? 'Ship Studio',
  });
}

// ============ Debounced Search Tracking ============

const searchTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/**
 * Track a search query with 1-second debounce.
 * Call this on every keystroke — it only fires after the user stops typing.
 * Empty queries are ignored.
 *
 * @param searchType - Category of search (e.g., "project_search", "skills_search")
 * @param query - The raw search string
 * @param screenName - Screen name for PostHog (e.g., "Dashboard")
 */
export function trackSearch(searchType: string, query: string, screenName?: string): void {
  if (searchTimers[searchType]) clearTimeout(searchTimers[searchType]);

  if (!query.trim()) return;

  searchTimers[searchType] = setTimeout(() => {
    void trackEvent('search_performed', {
      search_type: searchType,
      query: query.trim(),
      $screen_name: screenName ?? 'Ship Studio',
    });
  }, 1000);
}
