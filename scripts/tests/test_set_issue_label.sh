#!/usr/bin/env bash
# test_set_issue_label.sh — behavioral tests for the set_issue_label() helper
# in scripts/dispatcher.sh (issue #280: verify GitHub label edits via re-read
# + retry; fix orphaned agent-doing/agent-review state).
#
# The helper is EXTRACTED from the real dispatcher.sh (not copied) so these
# tests always run the shipped code. A mock `gh` on PATH simulates GitHub
# label state, including the observed incident signature: `gh issue edit`
# exiting 0 while the label change never lands.
#
# Usage: bash scripts/tests/test_set_issue_label.sh
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DISPATCHER="$ROOT/scripts/dispatcher.sh"
MOCKDIR="$(mktemp -d)"
trap 'rm -rf "$MOCKDIR"' EXIT

FAILS=0
pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; FAILS=$((FAILS+1)); }

# ---- extract the real helper from dispatcher.sh (function block + header) ----
HELPER="$MOCKDIR/helper.sh"
sed -n '/^# ---- helper: apply a label transition AND verify/,/^}$/p' "$DISPATCHER" > "$HELPER"
grep -q '^set_issue_label() {' "$HELPER" || { echo "FATAL: could not extract set_issue_label from dispatcher.sh"; exit 1; }

# minimal environment the helper expects
export REPO="example/repo"
export LABEL_RETRY_SLEEP=0   # keep retries instant in tests
log() { echo "MOCKLOG $*" >> "$MOCKDIR/log.txt"; }

# ---- mock gh: label state per issue + sabotage knobs ----
#   labels_<n>          current labels, one per line
#   swallow_<n>         N: next N `edit` calls exit 0 WITHOUT applying
#   partial_<n>         1: edit adds the label but never removes the old one
#   viewdown            1: `issue view` fails (labels read as empty)
#   edits_<n>           count of edit calls issued
mkdir -p "$MOCKDIR/bin"
cat > "$MOCKDIR/bin/gh" <<'EOF'
#!/usr/bin/env bash
MOCKDIR="${MOCK_STATE_DIR:?}"
cmd="$2"; shift 2
num=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo|--remove-label|--add-label)
      case "$1" in
        --repo) : ;;
        --remove-label) rmv="$2" ;;
        --add-label) add="$2" ;;
      esac
      shift 2 ;;
    --json|--jq) shift 2 ;;
    -*) shift ;;
    *) [ -z "$num" ] && num="$1"; shift ;;
  esac
done
state="$MOCKDIR/labels_${num}"
touch "$state"

if [ "$cmd" = "view" ]; then
  [ -f "$MOCKDIR/viewdown" ] && exit 1
  cat "$state"
  exit 0
fi

# cmd = edit
echo 1 >> "$MOCKDIR/edits_${num}"
if [ -f "$MOCKDIR/swallow_${num}" ] && [ "$(cat "$MOCKDIR/swallow_${num}")" -gt 0 ]; then
  echo $(( $(cat "$MOCKDIR/swallow_${num}") - 1 )) > "$MOCKDIR/swallow_${num}"
  exit 0   # the incident signature: success exit, no effect on GitHub
fi
if [ -n "$add" ]; then grep -Fxq "$add" "$state" || echo "$add" >> "$state"; fi
if [ -n "$rmv" ] && [ ! -f "$MOCKDIR/partial_${num}" ]; then
  tmp="$state.tmp"; grep -Fvx "$rmv" "$state" > "$tmp" || true; mv "$tmp" "$state"
fi
exit 0
EOF
chmod +x "$MOCKDIR/bin/gh"
export MOCK_STATE_DIR="$MOCKDIR"
export PATH="$MOCKDIR/bin:$PATH"

edits_of() { if [ -f "$MOCKDIR/edits_$1" ]; then wc -l < "$MOCKDIR/edits_$1" | tr -d ' '; else echo 0; fi; }
labels_of() { tr '\n' ',' < "$MOCKDIR/labels_$1" | sed 's/,$//'; }
run_helper() {
  : > "$MOCKDIR/log.txt"
  # shellcheck disable=SC1090  # HELPER path is computed from the repo root above
  ( . "$HELPER"; set_issue_label "$1" "$2" "$3" )
}

echo "== test 1: clean transition (happy path) =="
printf 'agent-doing\n' > "$MOCKDIR/labels_101"
run_helper 101 agent-doing agent-review; rc=$?
[ "$rc" -eq 0 ] && pass "returns 0" || fail "returns 0 (got $rc)"
[ "$(labels_of 101)" = "agent-review" ] && pass "final state agent-review" || fail "final state (got [$(labels_of 101)])"
[ "$(edits_of 101)" -eq 1 ] && pass "single edit, no wasted retries" || fail "edit count (got $(edits_of 101))"
grep -q "LABEL-MISMATCH" "$MOCKDIR/log.txt" && fail "no LABEL-MISMATCH expected" || pass "no LABEL-MISMATCH logged"

echo "== test 2: incident signature — edit exits 0 but never lands, recovers on retry =="
printf 'agent-doing\n' > "$MOCKDIR/labels_102"; echo 1 > "$MOCKDIR/swallow_102"
run_helper 102 agent-doing agent-review; rc=$?
[ "$rc" -eq 0 ] && pass "returns 0 after retry" || fail "returns 0 (got $rc)"
[ "$(labels_of 102)" = "agent-review" ] && pass "final state agent-review" || fail "final state (got [$(labels_of 102)])"
[ "$(edits_of 102)" -eq 2 ] && pass "exactly 2 edits (1 swallowed + 1 verified)" || fail "edit count (got $(edits_of 102))"
grep -q "unverified (attempt 1" "$MOCKDIR/log.txt" && pass "logs unverified attempt" || fail "no unverified-attempt log"
grep -q "verified on attempt 2" "$MOCKDIR/log.txt" && pass "logs verified on attempt 2" || fail "no verified-attempt log"
grep -q "LABEL-MISMATCH" "$MOCKDIR/log.txt" && fail "no LABEL-MISMATCH expected" || pass "no LABEL-MISMATCH logged"

echo "== test 3: persistent failure — LABEL-MISMATCH after exactly 3 attempts =="
printf 'agent-doing\n' > "$MOCKDIR/labels_103"; echo 99 > "$MOCKDIR/swallow_103"
run_helper 103 agent-doing agent-review; rc=$?
[ "$rc" -eq 1 ] && pass "returns 1" || fail "returns 1 (got $rc)"
[ "$(edits_of 103)" -eq 3 ] && pass "3 edit attempts (1 + 2 retries)" || fail "edit count (got $(edits_of 103))"
grep -q "LABEL-MISMATCH: issue #103 expected labels \[-agent-doing +agent-review\] got \[agent-doing" "$MOCKDIR/log.txt" \
  && pass "greppable LABEL-MISMATCH line with expected/got state" || fail "LABEL-MISMATCH line (log: $(cat "$MOCKDIR/log.txt"))"
[ "$(labels_of 103)" = "agent-doing" ] && pass "state untouched by failed verify" || fail "unexpected state [$(labels_of 103)]"

echo "== test 4: partial application — add lands, remove does not =="
printf 'agent-doing\n' > "$MOCKDIR/labels_104"; touch "$MOCKDIR/partial_104"
run_helper 104 agent-doing agent-review; rc=$?
[ "$rc" -eq 1 ] && pass "partial application detected, returns 1" || fail "returns 1 (got $rc)"
grep -q "LABEL-MISMATCH.*agent-doing agent-review" "$MOCKDIR/log.txt" && pass "mismatch shows both labels" || fail "mismatch line (log: $(cat "$MOCKDIR/log.txt"))"

echo "== test 5: gh view down (read fails) — treated as unverified =="
printf 'agent-doing\n' > "$MOCKDIR/labels_105"; touch "$MOCKDIR/viewdown"
run_helper 105 agent-doing agent-review; rc=$?
[ "$rc" -eq 1 ] && pass "returns 1 when read-back fails" || fail "returns 1 (got $rc)"
grep -q "LABEL-MISMATCH" "$MOCKDIR/log.txt" && pass "LABEL-MISMATCH logged" || fail "no LABEL-MISMATCH"

echo
if [ "$FAILS" -eq 0 ]; then echo "ALL TESTS PASSED"; exit 0; fi
echo "$FAILS TEST(S) FAILED"; exit 1
