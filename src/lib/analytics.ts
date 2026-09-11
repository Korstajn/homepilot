// Fire-and-forget client instrumentation. Never blocks the UI.
export function trackClient(name: string, props: Record<string, unknown> = {}): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    });
  } catch {
    /* analytics must never break the app */
  }
}
