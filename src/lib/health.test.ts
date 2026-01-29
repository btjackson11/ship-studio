/**
 * Tests for the health utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeTime, formatDuration, getFixPrompt } from './health';

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return "just now" for recent timestamps', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-15T11:59:55Z').toISOString(); // 5 seconds ago
    expect(formatRelativeTime(timestamp)).toBe('just now');
  });

  it('should return seconds ago for timestamps less than a minute old', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-15T11:59:30Z').toISOString(); // 30 seconds ago
    expect(formatRelativeTime(timestamp)).toBe('30 seconds ago');
  });

  it('should return "1 minute ago" for timestamps around a minute old', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-15T11:59:00Z').toISOString(); // 1 minute ago
    expect(formatRelativeTime(timestamp)).toBe('1 minute ago');
  });

  it('should return minutes ago for timestamps less than an hour old', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-15T11:45:00Z').toISOString(); // 15 minutes ago
    expect(formatRelativeTime(timestamp)).toBe('15 minutes ago');
  });

  it('should return "1 hour ago" for timestamps around an hour old', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-15T11:00:00Z').toISOString(); // 1 hour ago
    expect(formatRelativeTime(timestamp)).toBe('1 hour ago');
  });

  it('should return hours ago for timestamps less than a day old', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-15T07:00:00Z').toISOString(); // 5 hours ago
    expect(formatRelativeTime(timestamp)).toBe('5 hours ago');
  });

  it('should return "yesterday" for timestamps around a day old', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-14T12:00:00Z').toISOString(); // 1 day ago
    expect(formatRelativeTime(timestamp)).toBe('yesterday');
  });

  it('should return days ago for timestamps less than a week old', () => {
    const now = new Date('2024-01-15T12:00:00Z');
    vi.setSystemTime(now);

    const timestamp = new Date('2024-01-12T12:00:00Z').toISOString(); // 3 days ago
    expect(formatRelativeTime(timestamp)).toBe('3 days ago');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds for short durations', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(100)).toBe('100ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('should format seconds for longer durations', () => {
    expect(formatDuration(1000)).toBe('1.0s');
    expect(formatDuration(1500)).toBe('1.5s');
    expect(formatDuration(2000)).toBe('2.0s');
    expect(formatDuration(12345)).toBe('12.3s');
  });
});

describe('getFixPrompt', () => {
  it('should return correct prompt for test failures', () => {
    const prompt = getFixPrompt('test');
    expect(prompt).toContain('tests are failing');
    expect(prompt).toContain('Fix ALL errors and warnings');
  });

  it('should return correct prompt for lint errors', () => {
    const prompt = getFixPrompt('lint');
    expect(prompt).toContain('lint errors');
    expect(prompt).toContain('Fix ALL errors and warnings');
  });

  it('should return correct prompt for typecheck errors', () => {
    const prompt = getFixPrompt('typecheck');
    expect(prompt).toContain('TypeScript errors');
    expect(prompt).toContain('Fix ALL errors and warnings');
  });

  it('should return correct prompt for format errors', () => {
    const prompt = getFixPrompt('format');
    expect(prompt).toContain('formatting issues');
    expect(prompt).toContain('Fix ALL errors and warnings');
  });
});
