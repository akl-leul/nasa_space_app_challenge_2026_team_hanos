/**
 * Some archive reads take longer than one web request may last (the first read of a sky position can take about a
 * minute). The API then answers 202 "running" and keeps working; asking again returns the finished, real result.
 * This helper asks again until the answer is ready, the caller aborts, or the overall limit passes.
 */
export interface PollOptions {
  signal?: AbortSignal;
  /** overall limit in ms (default 10 minutes) */
  limitMs?: number;
  /** called each time the API says it is still working */
  onWaiting?: (elapsedMs: number) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

export async function fetchWithPolling(url: string, opts: PollOptions = {}): Promise<Response> {
  const started = Date.now();
  const limit = opts.limitMs ?? 600_000;
  for (;;) {
    const r = await fetch(url, { signal: opts.signal });
    if (r.status !== 202) return r;
    const elapsed = Date.now() - started;
    if (elapsed > limit) throw new Error("The archive is taking longer than usual. Try again in a few minutes.");
    opts.onWaiting?.(elapsed);
    const wait = Math.min(Math.max(Number(r.headers.get("retry-after")) || 3, 1), 10) * 1000;
    await sleep(wait, opts.signal);
  }
}
