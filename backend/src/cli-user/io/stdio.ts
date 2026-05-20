// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

/**
 * Keep machine-readable CLI stdout clean while legacy service layers still use
 * console.log for diagnostics. The CLI's own JSON/NDJSON renderers write
 * directly to process.stdout, so redirecting console.log is safe for those
 * commands and keeps incidental logs on stderr.
 */
export async function withConsoleLogToStderr<T>(enabled: boolean, fn: () => T | Promise<T>): Promise<T> {
  if (!enabled) return fn();
  const originalLog = console.log;
  console.log = (...args: unknown[]) => console.error(...args);
  try {
    return await fn();
  } finally {
    console.log = originalLog;
  }
}
