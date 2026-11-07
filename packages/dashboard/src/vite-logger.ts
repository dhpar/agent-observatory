import { createLogger, type Logger, type LogErrorOptions } from 'vite';

/**
 * Dev logger wrapper (vite runtime only, never bundled).
 *
 * The ws proxy legitimately logs an error whenever the browser-side socket
 * aborts while snapshot bytes are still being written into it. On Windows
 * this surfaces as `write ECONNABORTED` from `Socket.ondata` — a benign
 * race: the dashboard's reconnect loop (plan edge case E10) re-establishes
 * the feed automatically and no data is lost (a fresh snapshot arrives on
 * every connection). The error path is real in Vite's source
 * (proxy.ts -> proxyReqWs -> socket.on("error")), but it fires on
 * every fast reload/HMR cycle and is noise, not signal.
 *
 * Filter policy: ONLY the proxy-socket errors that mean "peer vanished
 * mid-write" (ECONNABORTED/ECONNRESET/EPIPE) are silenced. A proxy error
 * that indicates a real problem — e.g. ECONNREFUSED because the backend
 * is not running — still prints, so `pnpm dev:server` failures stay loud.
 */
const BENIGN_SOCKET_ERRORS = /(ECONNABORTED|ECONNRESET|EPIPE)/;

export function createFilteredDevLogger(): Logger {
  const upstream = createLogger('info', { allowClearScreen: false });

  return {
    ...upstream,
    error(msg: string, opts?: LogErrorOptions): void {
      if (msg.includes('ws proxy socket error') && BENIGN_SOCKET_ERRORS.test(msg)) {
        return; // peer vanished mid-write; reconnect loop handles recovery
      }
      upstream.error(msg, opts);
    },
  };
}
