#!/bin/bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2024-2026 Gracker (Chris)
# This file is part of SmartPerfetto. See LICENSE for details.
#
# HarmonyOS ftrace Text Collection Script
#
# Collects a comprehensive ftrace text trace from a HarmonyOS device via hdc.
# Output is standard ftrace text format — directly loadable by Perfetto trace_processor_shell
# and fully compatible with all SmartPerfetto Skills.
#
# Usage:
#   ./collect-harmonyos-ftrace.sh [duration_seconds]
#   ./collect-harmonyos-ftrace.sh 5
#
# Default: 5 seconds, all available hitrace tags enabled
#
# Prerequisites:
#   - HarmonyOS device connected via USB
#   - hdc (HarmonyOS Device Connector) installed and in PATH

set -euo pipefail

DURATION="${1:-5}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT_DIR="${HARMONYOS_TRACE_DIR:-/Users/whr/Dataset/ALN-AL00_HarmonyOS}"
OUTPUT_FILE="${OUTPUT_DIR}/hitrace_text_full_${TIMESTAMP}.ftrace"

# ── Pre-flight checks ──────────────────────────────────────────────────

if ! command -v hdc >/dev/null 2>&1; then
  echo "ERROR: hdc not found. Install HarmonyOS SDK command-line tools."
  exit 1
fi

DEVICE=$(hdc list targets 2>/dev/null | grep -v '^\[Empty\]' | head -1 || true)
if [ -z "$DEVICE" ]; then
  echo "ERROR: No HarmonyOS device connected."
  echo "  - Check USB cable"
  echo "  - Run 'hdc list targets' to verify"
  exit 1
fi

echo "=============================================="
echo "HarmonyOS ftrace Text Collection"
echo "=============================================="
echo "  Device:   ${DEVICE}"
echo "  Duration: ${DURATION}s"
echo "  Output:   ${OUTPUT_FILE}"
echo "=============================================="

mkdir -p "$OUTPUT_DIR"

# ── Stop any previous hitrace session ───────────────────────────────────

echo ""
echo "Stopping any previous hitrace session..."
hdc shell "hitrace --trace_finish_nodump" 2>/dev/null || true
sleep 1

# ── Try enabling extra kernel tracepoints ───────────────────────────────
# These require root/debug build but are best-effort on user builds.

echo ""
echo "Attempting to enable extra kernel tracepoints..."

EXTRA_TRACEPOINTS=(
  "power_kernel/phase_task_delta"
  "power/cpu_frequency_limits"
  "sched/sched_process_exit"
  "sched/sched_process_fork"
  "irq/irq_handler_entry"
  "irq/irq_handler_exit"
  "workqueue/workqueue_execute_start"
  "workqueue/workqueue_execute_end"
)

ENABLED_COUNT=0
for tp in "${EXTRA_TRACEPOINTS[@]}"; do
  ENABLE_PATH="/sys/kernel/tracing/events/${tp}/enable"
  # Use cat to verify write succeeded — redirection failures in hdc shell
  # don't propagate exit codes reliably, so read back and check the value.
  READBACK=$(hdc shell "echo 1 > ${ENABLE_PATH} 2>/dev/null && cat ${ENABLE_PATH} 2>/dev/null" 2>/dev/null || true)
  if echo "$READBACK" | grep -q '1'; then
    echo "  ✅ ${tp}"
    ENABLED_COUNT=$((ENABLED_COUNT + 1))
  else
    echo "  ❌ ${tp} (requires root)"
  fi
done

# ── Query and use supported tags from device ────────────────────────────

echo ""
echo "Querying supported hitrace tags from device..."

# Get tag names from 'hitrace -l' output: each tag line has format "tagName - description"
# Skip header line (tagName:) by requiring $2 == "-"
TAG_LIST=$(hdc shell "hitrace -l" 2>/dev/null | awk 'NF >= 3 && $2 == "-" {print $1}' | tr '\n' ' ' | sed 's/ *$//')

if [ -z "$TAG_LIST" ]; then
  echo "ERROR: Could not query hitrace tags from device."
  exit 1
fi

TAG_COUNT=$(echo "$TAG_LIST" | wc -w | tr -d ' ')
echo "  Found ${TAG_COUNT} tags on device"
echo "  Tags: ${TAG_LIST}"

# ── Collect trace ───────────────────────────────────────────────────────

echo ""
echo "Starting hitrace collection (${DURATION}s, ${TAG_COUNT} tags)..."
echo "  (Perform the operation you want to profile on the device now)"
echo ""

# IMPORTANT: hitrace uses SPACE-separated tags, not comma-separated.
# Tag names must match 'hitrace -l' output exactly.
hdc shell "hitrace --text -t ${DURATION} ${TAG_LIST}" > "$OUTPUT_FILE" 2>&1

# ── Verify output ───────────────────────────────────────────────────────

if [ ! -f "$OUTPUT_FILE" ]; then
  echo "ERROR: Trace file was not created."
  exit 1
fi

FILE_SIZE=$(ls -lh "$OUTPUT_FILE" | awk '{print $5}')
LINE_COUNT=$(wc -l < "$OUTPUT_FILE" | tr -d ' ')

# Check for error messages in output
if grep -q "^20[0-9][0-9]/.*error:" "$OUTPUT_FILE"; then
  echo ""
  echo "ERROR: hitrace reported errors:"
  grep "^20[0-9][0-9]/.*error:" "$OUTPUT_FILE"
  exit 1
fi

# Count event types
SCHED_COUNT=$(grep -c 'sched_switch' "$OUTPUT_FILE" 2>/dev/null || echo "0")
TMW_COUNT=$(grep -c 'tracing_mark_write' "$OUTPUT_FILE" 2>/dev/null || echo "0")
FREQ_COUNT=$(grep -c 'cpu_frequency' "$OUTPUT_FILE" 2>/dev/null || echo "0")

echo ""
echo "=============================================="
echo "Trace collected successfully!"
echo "=============================================="
echo "  File:       ${OUTPUT_FILE}"
echo "  Size:       ${FILE_SIZE}"
echo "  Lines:      ${LINE_COUNT}"
echo "  Events:"
echo "    sched_switch:         ${SCHED_COUNT}"
echo "    tracing_mark_write:   ${TMW_COUNT}"
echo "    cpu_frequency:        ${FREQ_COUNT}"
echo ""
echo "  Extra kernel tracepoints: ${ENABLED_COUNT} enabled"
echo ""
echo "  Load in SmartPerfetto:"
echo "    Drag ${OUTPUT_FILE} into http://localhost:10000"
echo "=============================================="

# ── Disable extra tracepoints ───────────────────────────────────────────

echo ""
echo "Disabling extra kernel tracepoints..."
for tp in "${EXTRA_TRACEPOINTS[@]}"; do
  ENABLE_PATH="/sys/kernel/tracing/events/${tp}/enable"
  hdc shell "echo 0 > ${ENABLE_PATH}" 2>/dev/null || true
done
echo "Done."
