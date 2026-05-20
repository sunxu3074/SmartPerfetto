<!--
SPDX-License-Identifier: AGPL-3.0-or-later
Copyright (C) 2024-2026 Gracker (Chris)
This file is part of SmartPerfetto. See LICENSE for details.
-->

# SmartPerfetto CLI

[English](cli.en.md) | [中文](cli.md)

SmartPerfetto CLI is the official terminal entry point. Use `smp` or
`smartperfetto` to configure, diagnose, analyze traces, ask follow-up questions,
run SQL, run Skills, export reports, and manage local history without starting
the Web UI.

## Install

```bash
npm install -g @gracker/smartperfetto
```

Node.js 24 LTS is required. The npm CLI package bundles pinned
`trace_processor_shell` prebuilts for Linux x64, macOS arm64, and Windows x64.
On unsupported platforms the CLI downloads the pinned binary; if automatic
download is unavailable, set `TRACE_PROCESSOR_PATH` to an existing local
executable.

## Global Options

```text
Usage: smp [options] [command]

Options:
  -V, --version             output the version number
  -f, --file <trace>        trace file to analyze (shortcut for `analyze <trace>`)
  -p, --prompt <question>   analysis prompt (shortcut for --query)
  -q, --query <question>    analysis question (alias for --prompt)
  --session-dir <path>      override session storage root (default: ~/.smartperfetto)
  --env-file <path>         path to .env file (default: backend/.env)
  --verbose                 show verbose event stream
  --no-color                disable ANSI colors
  --resume <sessionId>      start the REPL with this session already loaded
  -h, --help                display help for command
```

## Core Workflow

```bash
smp run trace.perfetto-trace "Analyze why startup is slow"
smp ask <sessionId> "Why is RenderThread slow?"
smp repl --resume <sessionId>
```

Compatibility commands remain available:

```bash
smp analyze trace.perfetto-trace --query "Analyze why startup is slow"
smp resume <sessionId> --query "Follow up"
smp list
smp show <sessionId>
smp report <sessionId> --open
smp rm <sessionId>
```

Analysis commands support machine-readable output:

```bash
smp run trace.perfetto-trace "Analyze why startup is slow" --format json
smp resume <sessionId> --query "Follow up" --format ndjson
```

Supported `--format` values: `text`, `json`, `ndjson`.

## Config And Providers

```bash
smp doctor --format text
smp doctor --format json
smp config init
smp config init --force
smp provider list
smp provider list --format json
smp provider test system
smp provider test <providerId> --format json
```

Runtime checks follow the actually selected provider/runtime:

- Claude Agent SDK accepts API keys, Anthropic-compatible proxies, Bedrock,
  Vertex, and local Claude login fallback.
- OpenAI Agents SDK requires `OPENAI_API_KEY` or a local
  `localhost` / `127.0.0.1` / `0.0.0.0` OpenAI-compatible endpoint.
- Ollama providers use the OpenAI-compatible runtime.

The first CLI productization pass does not include `provider add/edit`; key
writing needs a dedicated secure interaction design.

## Trace Query And Skills

```bash
smp query trace.perfetto-trace --sql "select count(*) as cnt from slice"
smp query trace.perfetto-trace --sql "select count(*) from slice" --format json

smp skill trace.perfetto-trace startup_slow_reasons
smp skill trace.perfetto-trace startup_slow_reasons --params '{"package":"com.example"}' --format json
```

`query` and `skill` do not start the Web UI. `skill` loads SmartPerfetto's YAML
Skills and SQL fragments.

## Trace Comparison

```bash
smp compare current.perfetto-trace reference.perfetto-trace --query "Compare startup differences"
smp compare current.perfetto-trace reference.perfetto-trace --query "Compare jank root causes" --format ndjson
```

`compare` passes the second trace as the reference trace and enables dual-trace
analysis tools in the AI runtime. The CLI automatically appends a deep
comparison contract so reports include metric matrices, phase/hotspot deltas,
blocking and scheduling differences, ruled-out system factors, evidence limits,
and next steps instead of only a duration delta. The CLI also appends a
deterministic SQL-generated comparison appendix covering package, Perfetto's
raw startup_type, duration delta, startup-window top slices, and main-thread
state distribution. The appendix treats startup_type as a raw Perfetto field,
not a second CLI classification; cold/warm conflicts must be called out as
evidence limits in the report body.

## Reports And History

```bash
smp list
smp list --json
smp list --format json
smp show <sessionId>
smp report <sessionId>
smp report <sessionId> --turn 1
smp report <sessionId> --open
smp report export <sessionId> --format html --out report.html
smp report export <sessionId> --turn 1 --format html --out turn-001.html
smp report export <sessionId> --format md --out report.md
smp report export <sessionId> --format json --out report.json
```

CLI files are stored under:

```text
~/.smartperfetto/
├── index.json
├── traces/
└── sessions/<sessionId>/
    ├── config.json
    ├── conclusion.md
    ├── report.html
    ├── transcript.jsonl
    ├── stream.jsonl
    └── turns/
        ├── 001.md
        └── 001.html
```

## Android Capture

The first version supports only a locally connected adb device:

```bash
smp capture android --app com.example.app --duration 10 --out launch.perfetto-trace
smp capture android --app com.example.app --duration 10 --serial <adbSerial> --out launch.perfetto-trace
```

Pass `--serial` when multiple devices are connected.

## REPL

```bash
smp repl
smp repl --resume <sessionId>
```

REPL commands:

| Command | Purpose |
| --- | --- |
| `/load <trace>` | Load a trace and start analysis |
| `/ask <query>` | Ask against the current session |
| `/resume <sessionId>` | Switch to an existing session |
| `/report` | Print the latest report path |
| `/focus` | Show current session state |
| `/clear` | Clear the terminal |
| `/exit` | Exit |
