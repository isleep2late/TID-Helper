#!/bin/bash
# Runs the TID Helper test suite.
#
# WHY THIS IS A SHELL SCRIPT AND NOT AN npm SCRIPT.
# `hackmons-mobile/package.json`'s "scripts" object is an INPUT TO THE EXPO
# FINGERPRINT (`@expo/fingerprint` hashes it as the source `packageJson:scripts`,
# because a script can alter the native build). app.json sets
# runtimeVersion.policy = "fingerprint", so every installed app only accepts OTA
# updates whose runtime version matches the one baked into its binary.
#
# Adding two test aliases here on 2026-09-20 therefore moved the Android runtime
# from 1ad1b7aa to 2584732b and the iOS runtime from 13b036f8 to 3d5ba3a9. The
# very next `eas update` - the one carrying the TID Helper boot fix - published
# under a runtime no installed app had, so the fix was invisible on every phone
# while looking perfectly deployed from this side. The last actual binary build
# was 2026-07-18, so nothing in the field could ever have picked it up.
#
# A test runner must never be able to do that. Nothing in this file is
# fingerprinted, so add whatever you like here.
#
#   ./tests/tid-helper/run.sh            all browser-free tests
#   ./tests/tid-helper/run.sh browser    the headless-Chrome tests as well
#
# A RUNAWAY TEST MUST NOT BE ABLE TO TAKE THE MACHINE DOWN.
# On 2026-09-20 a run of this suite ended with the kernel reporting
#
#   Out of memory: Killed process 2142072 (node) total-vm:357256476kB, anon-rss:356189572kB
#
# - a SINGLE node process at 356 GB, on a 377 GB box with no swap. It was a
# global OOM, not a cgroup one: the kernel killed the test run (exit 137), and
# 25 minutes later the desktop session followed it down. That run was under
# node v22.22.2 from nvm; the suite has since been run to completion under both
# v18.19.1 and v22.22.2, at full concurrency, inside a 24 GB cap, so whatever it
# was has not been reproduced and may well have been fixed by the ReferenceError
# in page-gen2-psr.js render() that the same run reported. Unreproduced is not
# the same as gone, and the cost of being wrong is the user's whole session.
#
# So: cap the memory, and cap the concurrency.
#
# The concurrency cap is worth having on its own. node --test defaults to
# availableParallelism() - 1, which on this 192-core machine means every test
# file at once, each one loading a 16 MB inlined bundle. Nothing is gained over
# ~16 - the suite is ~23 s either way - and the peak is multiplied by the number
# of files. Override either with TID_HELPER_CONCURRENCY / TID_HELPER_MEMMAX.
set -u
cd "$(dirname "$0")/../.." || exit 1

CONC="${TID_HELPER_CONCURRENCY:-16}"
MEMMAX="${TID_HELPER_MEMMAX:-32G}"

# Run under a memory-capped transient scope where one is available. The probe
# matters: --user needs a live user session bus, so this is a no-op over ssh or
# in a container, and there the tests simply run uncapped rather than not at all.
run() {
    if command -v systemd-run >/dev/null 2>&1 \
       && systemd-run --user --scope -p MemoryMax="$MEMMAX" --quiet -- true >/dev/null 2>&1; then
        exec systemd-run --user --scope -p MemoryMax="$MEMMAX" -p MemorySwapMax=0 --quiet -- "$@"
    fi
    echo "note: no user systemd scope available, running without a memory cap" >&2
    exec "$@"
}

node --version
if [ "${1:-}" = "browser" ]; then
    run node --test --test-concurrency="$CONC" tests/tid-helper/smoke.test.cjs tests/tid-helper/calibration.test.cjs
fi
run node --test --test-concurrency="$CONC" tests/tid-helper/*.test.cjs
