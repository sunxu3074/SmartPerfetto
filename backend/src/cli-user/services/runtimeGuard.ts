// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import * as fs from 'fs';
import {
  resolveAgentRuntimeSelection,
  type BackendAgentRuntimeKind,
  type RuntimeSelection,
} from '../../agentRuntime/runtimeSelection';
import { getClaudeRuntimeDiagnostics } from '../../agentv3/claudeConfig';
import { getOpenAIRuntimeDiagnostics, hasOpenAICredentials } from '../../agentOpenAI/openAiConfig';
import { getTraceProcessorPath } from '../../services/workingTraceProcessor';
import { getProviderService } from '../../services/providerManager';

export interface RuntimeGuardResult {
  selection: RuntimeSelection;
  diagnostics: any;
}

export interface RuntimeGuardOptions {
  providerId?: string | null;
  runtimeOverride?: BackendAgentRuntimeKind;
}

function providerIdFor(selection: RuntimeSelection): string | null {
  return selection.source === 'provider' ? selection.providerId ?? null : null;
}

export function assertAnalysisRuntimeReady(options: RuntimeGuardOptions = {}): RuntimeGuardResult {
  const selection = resolveAgentRuntimeSelection(options.providerId, options.runtimeOverride);
  const providerId = providerIdFor(selection);

  if (selection.kind === 'openai-agents-sdk') {
    const diagnostics = getOpenAIRuntimeDiagnostics(providerId);
    if (!hasOpenAICredentials(providerId)) {
      throw new Error(
        [
          'OpenAI runtime is selected but no usable OpenAI-compatible credentials were found.',
          'Set OPENAI_API_KEY, configure an active OpenAI/Ollama provider, or use a localhost OpenAI-compatible endpoint.',
          'Run `smp doctor --format text` for the resolved runtime and provider details.',
        ].join(' '),
      );
    }
    return { selection, diagnostics };
  }

  const diagnostics = getClaudeRuntimeDiagnostics(providerId);
  if (!isClaudeSdkBinaryUsable(diagnostics.sdkBinary)) {
    throw new Error(
      [
        'Claude Agent SDK runtime is selected but its native binary is not executable.',
        diagnostics.sdkBinary?.chosenPath
          ? `Resolved binary: ${diagnostics.sdkBinary.chosenPath}`
          : 'No SDK native binary was resolved.',
        'Reinstall backend dependencies, or set CLAUDE_BINARY_PATH to an executable Claude Agent SDK binary.',
      ].join(' '),
    );
  }

  // Claude Agent SDK can use API/proxy credentials, Bedrock/Vertex env, or a
  // local Claude Code login. Do not reject the local-auth fallback here; the SDK
  // will surface a precise auth error if the local account is unavailable.
  return { selection, diagnostics };
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  status: 'ok' | 'warn' | 'error';
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorReport {
  ok: boolean;
  generatedAt: string;
  node: {
    version: string;
    expected: string;
    ok: boolean;
  };
  cliHome: string;
  runtime: RuntimeSelection;
  runtimeDiagnostics: any;
  traceProcessor: {
    path: string;
    exists: boolean;
    executable: boolean;
  };
  providers: {
    count: number;
    active?: {
      id: string;
      name: string;
      type: string;
    };
  };
  checks: DoctorCheck[];
}

export function collectDoctorReport(cliHome: string): DoctorReport {
  const selection = resolveAgentRuntimeSelection();
  const providerId = providerIdFor(selection);
  const runtimeDiagnostics = selection.kind === 'openai-agents-sdk'
    ? getOpenAIRuntimeDiagnostics(providerId)
    : getClaudeRuntimeDiagnostics(providerId);
  const traceProcessorPath = getTraceProcessorPath();
  const traceProcessorExists = fs.existsSync(traceProcessorPath);
  const traceProcessorExecutable = traceProcessorExists && isExecutable(traceProcessorPath);
  const providerSvc = getProviderService();
  const providers = providerSvc.list();
  const active = providers.find((p) => p.isActive);
  const nodeMajor = Number.parseInt(process.version.replace(/^v/, '').split('.')[0] || '0', 10);

  const checks: DoctorCheck[] = [
    {
      name: 'node',
      ok: nodeMajor >= 24 && nodeMajor < 25,
      status: nodeMajor >= 24 && nodeMajor < 25 ? 'ok' : 'error',
      message: `Node.js ${process.version} (expected >=24 <25)`,
    },
    {
      name: 'runtime',
      ok: runtimeDiagnostics.configured || selection.kind === 'claude-agent-sdk',
      status: runtimeDiagnostics.configured
        ? 'ok'
        : selection.kind === 'claude-agent-sdk'
          ? 'warn'
          : 'error',
      message: runtimeDiagnostics.configured
        ? `${selection.kind} credentials/configuration detected`
        : selection.kind === 'claude-agent-sdk'
          ? 'Claude SDK has no explicit credentials; local Claude login fallback will be used if available'
          : 'OpenAI runtime needs OPENAI_API_KEY or a localhost/OpenAI-compatible provider',
      details: {
        source: selection.source,
        providerId: selection.providerId,
        providerName: selection.providerName,
      },
    },
    ...(selection.kind === 'claude-agent-sdk'
      ? [buildClaudeSdkBinaryCheck((runtimeDiagnostics as any).sdkBinary)]
      : []),
    {
      name: 'trace_processor_shell',
      ok: traceProcessorExists && traceProcessorExecutable,
      status: traceProcessorExists && traceProcessorExecutable ? 'ok' : 'warn',
      message: traceProcessorExists
        ? traceProcessorExecutable
          ? 'trace_processor_shell is present and executable'
          : 'trace_processor_shell exists but is not executable'
        : 'trace_processor_shell is missing; CLI will download the pinned binary on first trace command',
      details: { path: traceProcessorPath },
    },
  ];

  return {
    ok: checks.every((c) => c.status !== 'error'),
    generatedAt: new Date().toISOString(),
    node: {
      version: process.version,
      expected: '>=24.0.0 <25.0.0',
      ok: nodeMajor >= 24 && nodeMajor < 25,
    },
    cliHome,
    runtime: selection,
    runtimeDiagnostics,
    traceProcessor: {
      path: traceProcessorPath,
      exists: traceProcessorExists,
      executable: traceProcessorExecutable,
    },
    providers: {
      count: providers.length,
      ...(active ? { active: { id: active.id, name: active.name, type: active.type } } : {}),
    },
    checks,
  };
}

function isExecutable(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function isClaudeSdkBinaryUsable(sdkBinary: any): boolean {
  if (!sdkBinary?.chosenPath || sdkBinary.source === 'none') return false;
  return isExecutable(sdkBinary.chosenPath);
}

function buildClaudeSdkBinaryCheck(sdkBinary: any): DoctorCheck {
  const usable = isClaudeSdkBinaryUsable(sdkBinary);
  return {
    name: 'claude_sdk_binary',
    ok: usable,
    status: usable ? 'ok' : 'error',
    message: usable
      ? 'Claude Agent SDK native binary is present and executable'
      : 'Claude Agent SDK native binary is missing or not executable',
    details: {
      path: sdkBinary?.chosenPath ?? null,
      source: sdkBinary?.source ?? 'none',
      detectedPlatformKey: sdkBinary?.detectedPlatformKey ?? null,
      fallbackUsed: sdkBinary?.fallbackUsed ?? false,
    },
  };
}
