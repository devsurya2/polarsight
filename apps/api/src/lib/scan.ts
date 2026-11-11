/**
 * Malware scanning through a ClamAV daemon (clamd).
 *
 * The daemon speaks a tiny line protocol over TCP. INSTREAM sends the
 * bytes in length-prefixed chunks and gets one verdict line back, so
 * nothing is written to disk on the scanner's side and the API never
 * shells out to a binary.
 *
 * Three outcomes, and the caller must treat them differently:
 *
 *   clean     → the file may be released from quarantine
 *   infected  → the file is destroyed and the upload refused
 *   error     → the file STAYS quarantined. Unreachable, timed out,
 *               misconfigured or unparseable all land here. Nothing
 *               in this module ever turns an error into "clean".
 */

import net from "node:net";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export type ScanVerdict =
  | { verdict: "clean"; version: string | null }
  | { verdict: "infected"; signature: string; version: string | null }
  | { verdict: "error"; reason: "not_configured" | "unreachable" | "timeout" | "protocol" | "too_large"; detail?: string };

export function isScannerConfigured(): boolean {
  return Boolean(env.CLAMAV_HOST);
}

/** One request/response exchange with clamd. */
function exchange(command: Buffer, payload?: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: env.CLAMAV_HOST!, port: env.CLAMAV_PORT });
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (err?: Error, value?: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve(value ?? "");
    };

    socket.setTimeout(env.CLAMAV_TIMEOUT_MS, () => finish(new Error("timeout")));
    socket.on("error", (err) => finish(err));
    socket.on("data", (d) => chunks.push(d));
    socket.on("end", () => finish(undefined, Buffer.concat(chunks).toString("utf8").trim()));
    socket.on("close", () => finish(undefined, Buffer.concat(chunks).toString("utf8").trim()));

    socket.on("connect", () => {
      socket.write(command);
      if (payload) {
        // INSTREAM: <4-byte big-endian length><chunk>..., then a zero
        // length to terminate.
        const CHUNK = 64 * 1024;
        for (let offset = 0; offset < payload.length; offset += CHUNK) {
          const part = payload.subarray(offset, Math.min(offset + CHUNK, payload.length));
          const header = Buffer.alloc(4);
          header.writeUInt32BE(part.length, 0);
          socket.write(Buffer.concat([header, part]));
        }
        socket.write(Buffer.from([0, 0, 0, 0]));
      }
    });
  });
}

let cachedVersion: { value: string | null; at: number } = { value: null, at: 0 };

/** The daemon's version string, cached for a minute. */
async function scannerVersion(): Promise<string | null> {
  if (Date.now() - cachedVersion.at < 60_000) return cachedVersion.value;
  try {
    const v = await exchange(Buffer.from("zVERSION\0"));
    cachedVersion = { value: v.replace(/\0/g, "") || null, at: Date.now() };
  } catch {
    cachedVersion = { value: null, at: Date.now() };
  }
  return cachedVersion.value;
}

/**
 * Scans a buffer. Never throws.
 *
 * clamd enforces its own StreamMaxLength (25 MB by default) and
 * replies "INSTREAM size limit exceeded" past it; that is reported as
 * an error rather than mistaken for a verdict.
 */
export async function scanBuffer(buffer: Buffer): Promise<ScanVerdict> {
  if (!isScannerConfigured()) return { verdict: "error", reason: "not_configured" };

  let reply: string;
  try {
    reply = await exchange(Buffer.from("zINSTREAM\0"), buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason = message === "timeout" ? "timeout" : "unreachable";
    logger.error({ err, reason }, "malware scan failed");
    return { verdict: "error", reason, detail: message };
  }

  // Replies look like "stream: OK", "stream: Eicar-Test-Signature FOUND"
  // or "INSTREAM size limit exceeded. ERROR".
  const line = reply.replace(/\0/g, "").trim();
  const version = await scannerVersion();

  if (/:\s*OK$/.test(line)) return { verdict: "clean", version };

  const found = /:\s*(.+)\s+FOUND$/.exec(line);
  if (found) {
    logger.warn({ signature: found[1] }, "malware detected in upload");
    return { verdict: "infected", signature: found[1]!, version };
  }

  if (/size limit/i.test(line)) return { verdict: "error", reason: "too_large", detail: line };

  logger.error({ line }, "unexpected reply from scanner");
  return { verdict: "error", reason: "protocol", detail: line };
}

/** Health for the integrations screen: reachable, and which version. */
export async function scannerStatus(): Promise<{
  configured: boolean;
  ok: boolean;
  host: string | null;
  version: string | null;
  error: string | null;
}> {
  if (!isScannerConfigured()) {
    return { configured: false, ok: false, host: null, version: null, error: "CLAMAV_HOST is not set" };
  }
  try {
    const pong = await exchange(Buffer.from("zPING\0"));
    const ok = pong.replace(/\0/g, "").trim() === "PONG";
    return {
      configured: true,
      ok,
      host: `${env.CLAMAV_HOST}:${env.CLAMAV_PORT}`,
      version: ok ? await scannerVersion() : null,
      error: ok ? null : `unexpected reply: ${pong.slice(0, 40)}`,
    };
  } catch (err) {
    return {
      configured: true,
      ok: false,
      host: `${env.CLAMAV_HOST}:${env.CLAMAV_PORT}`,
      version: null,
      error: err instanceof Error ? err.message : "unreachable",
    };
  }
}
