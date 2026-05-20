// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

/**
 * CLI-internal types.
 *
 * Persisted file schemas for `~/.smartperfetto/`. Stable — bumping a
 * field requires a migration. Everything else is ephemeral / derivable.
 */

import type { BackendAgentRuntimeKind } from '../agentRuntime/runtimeSelection';

/** Written to `<sessionDir>/config.json`. Source of truth for resume. */
export interface CliSessionConfig {
  /** CLI-local session id (same as backend session id — no separate namespace). */
  sessionId: string;
  /** Backend agent session id used for runtime persistence; may differ after degraded CLI resume. */
  backendSessionId?: string;
  /** Trace path the user passed on first analyze. Used to re-load on traceId eviction. */
  tracePath: string;
  /** Trace id assigned by TraceProcessorService (may change across processes). */
  traceId: string;
  /** Optional reference trace path for comparison sessions. */
  referenceTracePath?: string;
  /** Optional reference trace id assigned by TraceProcessorService. */
  referenceTraceId?: string;
  /** Provider Manager profile that supplied runtime credentials; null means env/default fallback. */
  providerId?: string | null;
  /** Runtime that produced the session. Used by resume preflight checks. */
  agentRuntimeKind?: BackendAgentRuntimeKind;
  /** Non-secret provider/runtime snapshot hash captured for diagnostics. */
  providerSnapshotHash?: string | null;
  /** SDK session id for Claude Agent SDK context resume (agentv3 only). */
  sdkSessionId?: string;
  /** Claude model actually used — preserved for consistency across resumes. */
  model?: string;
  /** Unix ms when session was created. */
  createdAt: number;
  /** Unix ms of most recent turn completion. */
  lastTurnAt: number;
  /** Incremented per turn, starts at 1. */
  turnCount: number;
}

/** One row in `~/.smartperfetto/index.json` — the global session catalog. */
export interface CliSessionIndexEntry {
  sessionId: string;
  createdAt: number;
  lastTurnAt: number;
  tracePath: string;
  traceFilename: string;
  firstQuery: string;
  turnCount: number;
  status: 'pending' | 'completed' | 'failed';
}

/** One row in `<sessionDir>/transcript.jsonl` — human-readable turn log. */
export interface CliTranscriptTurn {
  turn: number;
  timestamp: number;
  question: string;
  conclusionMd?: string;
  confidence?: number;
  rounds?: number;
  durationMs?: number;
  reportFile?: string;
  error?: string;
}
