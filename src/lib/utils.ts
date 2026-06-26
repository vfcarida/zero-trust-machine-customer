// ============================================================================
// GemmaBridge — Utility Functions
// Pure utility functions used across the application.
// ============================================================================

/** Merges CSS class names, filtering out falsy values. */
export const cn = (...classes: (string | undefined | null | false)[]): string =>
  classes.filter(Boolean).join(' ');

/** Generates a unique ID with an optional prefix. */
export const generateId = (prefix = 'id'): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

/** Formats an ISO date string to a human-readable format. */
export const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/** Formats an ISO date string to a relative time (e.g., "2 hours ago"). */
export const formatRelativeTime = (isoString: string): string => {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};

/** Extracts initials from a name (e.g., "Lucas Silva" → "LS"). */
export const getInitials = (name: string): string =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

/** Speaks text aloud using the browser SpeechSynthesis API. */
export const speakText = (text: string): void => {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.85;
  utterance.pitch = 1.1;
  utterance.volume = 1.0;
  utterance.lang = 'en-US';

  window.speechSynthesis.speak(utterance);
};

/** Safely parses JSON, returning a fallback on failure. */
export const safeJsonParse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};
