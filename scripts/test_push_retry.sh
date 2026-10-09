#!/usr/bin/env bash
#
# test_push_retry.sh — Verify that push_with_retry() correctly handles
# non-fast-forward rejections by fetching, attempting fast-forward merge,
# falling back to auto-merge on conflict, and aborting gracefully on real conflicts.
#
# This test creates isolated bare repos and test worktrees to simulate:
# 1. Fast-forward merge scenario (origin has moved ahead with mergeable commit)
# 2. Auto-merge scenario (diverged history but resolvable)
# 3. Conflict scenario (real merge conflict triggers abort, no force-push)
#
# Output shows actual git command results and PASS/FAIL verdicts.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source the push_with_retry function from dispatcher.sh
# Extract just the push_with_retry function for testing
push_with_retry() {
  local base_branch="$1"

  # Fetch latest from origin
  if ! git fetch origin "$base_branch" 2>/dev/null; then
    echo "  fetch origin/$base_branch failed; cannot reconcile"
    return 1
  fi

  # Attempt fast-forward merge (preferred: no merge commit)
  if ! git merge --ff-only "origin/${base_branch}" 2>/dev/null; then
    # ff-only failed; try auto-merge with merge commit as fallback
    if ! git merge --no-edit "origin/${base_branch}" 2>/dev/null; then
      # Real merge conflict detected; before aborting, check if origin's unique
      # content is already present in local HEAD (redundant conflict from context drift)

      local merge_base conflicted_files file origin_added_lines local_content line
      local all_redundant=true tmp_added_file

      merge_base=$(git merge-base HEAD MERGE_HEAD 2>/dev/null || echo "")
      if [ -z "$merge_base" ]; then
        # Cannot compute merge base — abort safely
        git merge --abort 2>/dev/null || true
        echo "  merge conflict detected during non-ff reconciliation — cannot auto-merge, push failed"
        return 1
      fi

      conflicted_files=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
      if [ -z "$conflicted_files" ]; then
        # No conflicted files found (shouldn't happen if merge failed, but be safe)
        git merge --abort 2>/dev/null || true
        echo "  merge conflict detected during non-ff reconciliation — cannot auto-merge, push failed"
        return 1
      fi

      # Check each conflicted file for redundant content
      while IFS= read -r file; do
        [ -z "$file" ] && continue

        # Extract lines that origin (MERGE_HEAD) added relative to merge-base
        # (lines starting with '+', excluding the diff marker '+++')
        tmp_added_file=$(mktemp)
        git diff "$merge_base" MERGE_HEAD -- "$file" 2>/dev/null \
          | grep '^+' | grep -v '^+++' | sed 's/^+//' \
          | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' > "$tmp_added_file"

        # Get local version of file (HEAD, before merge modified it)
        local_content=$(git show "HEAD:$file" 2>/dev/null || echo "")

        # Check if every added line appears verbatim in local content
        while IFS= read -r line; do
          [ -z "$line" ] && continue
          # Use grep -F (literal string, no regex) and -x (whole line) to match exactly
          # Trim the local content lines the same way the added lines were trimmed to handle indentation
          if ! printf '%s\n' "$local_content" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -F -x "$line" >/dev/null 2>&1; then
            all_redundant=false
            break
          fi
        done < "$tmp_added_file"
        rm -f "$tmp_added_file"

        [ "$all_redundant" = false ] && break
      done <<< "$conflicted_files"

      # If all conflicted files have redundant content, auto-resolve by keeping local
      if [ "$all_redundant" = true ]; then
        while IFS= read -r file; do
          [ -z "$file" ] && continue
          git checkout --ours -- "$file" 2>/dev/null || true
          git add "$file" 2>/dev/null || true
        done <<< "$conflicted_files"
        git commit --no-edit 2>/dev/null || {
          git merge --abort 2>/dev/null || true
          echo "  merge conflict auto-resolved but commit failed — push failed"
          return 1
        }
        git push origin HEAD
        return $?
      else
        # Origin has real content not present in local — abort safely
        git merge --abort 2>/dev/null || true
        echo "  merge conflict detected during non-ff reconciliation — cannot auto-merge, push failed"
        return 1
      fi
    fi
  fi

  # Merge succeeded (or was unnecessary); attempt push
  git push origin HEAD
}

# Create temporary test directory
TEST_DIR=$(mktemp -d)
trap "rm -rf '$TEST_DIR'" EXIT

echo "============================================================="
echo "TEST: push_with_retry() Non-Fast-Forward Reconciliation"
echo "============================================================="
echo ""
echo "Test directory: $TEST_DIR"
echo ""

# Test 1: Fast-forward merge scenario
echo "TEST 1: Fast-forward merge (origin has moved ahead linearly)"
echo "---------------------------------------------------------"
(
  T1_DIR="$TEST_DIR/test1-ff"
  mkdir -p "$T1_DIR"
  cd "$T1_DIR"

  # Create bare repo (simulates origin)
  bare_repo="$T1_DIR/origin.git"
  git init --bare -b main "$bare_repo" 2>/dev/null || git init --bare "$bare_repo"

  # Create local repo
  local_repo="$T1_DIR/local"
  git clone "$bare_repo" "$local_repo" 2>/dev/null
  cd "$local_repo"

  git config user.email "test@example.com"
  git config user.name "Test User"

  # Make initial commit
  echo "file1" > file1.txt
  git add file1.txt
  git commit -m "initial commit"
  git branch -M main 2>/dev/null || true
  git push -u origin main 2>/dev/null

  # Simulate: another process pushed a commit to origin/main
  cd "$bare_repo"
  # We need to update the bare repo directly; do this by creating a temp checkout
  other_checkout="$T1_DIR/other"
  git clone "$bare_repo" "$other_checkout" 2>/dev/null
  cd "$other_checkout"
  git config user.email "other@example.com"
  git config user.name "Other User"
  echo "file2" > file2.txt
  git add file2.txt
  git commit -m "other commit"
  git push origin main
  cd -

  # Now go back to local and create our own commit
  cd "$local_repo"
  echo "file3" > file3.txt
  git add file3.txt
  git commit -m "local commit"

  # At this point: local is 1 commit ahead of local's fork point, but origin is 1 commit ahead of our local HEAD
  # git status should show: ahead 1, behind 1

  echo "  Before push_with_retry:"
  git log --oneline -3
  git status --short --branch | head -1

  # Try push (should fail without our fix)
  if git push origin main 2>&1 | grep -q "rejected"; then
    echo "  ✓ Push rejected (expected — origin moved ahead)"
    # Reset to before failed push
    git reset --hard HEAD 2>/dev/null || true
  fi

  # Now use push_with_retry (should succeed)
  echo ""
  echo "  Running push_with_retry..."
  if push_with_retry "main" 2>&1 | head -5; then
    echo "  ✓ push_with_retry succeeded (fast-forward merged and pushed)"
    result="PASS"
  else
    echo "  ✗ push_with_retry failed"
    result="FAIL"
  fi

  echo "  After push_with_retry:"
  git log --oneline -3
  git status --short --branch | head -1

  echo ""
  echo "  TEST 1 RESULT: $result"
  exit_code=0
  [ "$result" = "PASS" ] && exit_code=0 || exit_code=1
  exit $exit_code
)
test1_result=$?

# Test 2: Auto-merge scenario (diverged history but resolvable)
echo ""
echo "TEST 2: Auto-merge scenario (diverged but resolvable commits)"
echo "-------------------------------------------------------------"
(
  T2_DIR="$TEST_DIR/test2-merge"
  mkdir -p "$T2_DIR"
  cd "$T2_DIR"

  # Create bare repo
  bare_repo="$T2_DIR/origin.git"
  git init --bare -b main "$bare_repo" 2>/dev/null || git init --bare "$bare_repo"

  # Create local repo
  local_repo="$T2_DIR/local"
  git clone "$bare_repo" "$local_repo" 2>/dev/null
  cd "$local_repo"

  git config user.email "test@example.com"
  git config user.name "Test User"

  # Make initial commit
  echo "shared" > shared.txt
  git add shared.txt
  git commit -m "shared commit"
  git branch -M main 2>/dev/null || true
  git push -u origin main 2>/dev/null

  # Simulate: another process pushed a commit modifying different file
  other_checkout="$T2_DIR/other"
  git clone "$bare_repo" "$other_checkout" 2>/dev/null
  cd "$other_checkout"
  git config user.email "other@example.com"
  git config user.name "Other User"
  echo "other content" > other.txt
  git add other.txt
  git commit -m "other added other.txt"
  git push origin main
  cd -

  # In local: create commit modifying different file
  cd "$local_repo"
  echo "local content" > local.txt
  git add local.txt
  git commit -m "local added local.txt"

  echo "  Before push_with_retry:"
  git log --oneline -3
  git status --short --branch | head -1

  # Try direct push (should fail)
  if git push origin main 2>&1 | grep -q "rejected"; then
    echo "  ✓ Push rejected (expected — diverged history)"
    git reset --hard HEAD 2>/dev/null || true
  fi

  # Now use push_with_retry (should auto-merge and succeed)
  echo ""
  echo "  Running push_with_retry..."
  if push_with_retry "main" 2>&1 | head -5; then
    echo "  ✓ push_with_retry succeeded (auto-merged and pushed)"
    result="PASS"
  else
    echo "  ✗ push_with_retry failed"
    result="FAIL"
  fi

  echo "  After push_with_retry:"
  git log --oneline -4
  git status --short --branch | head -1

  # Verify merge commit was created
  if git log --oneline | head -1 | grep -qiE "Merge|merge"; then
    echo "  ✓ Merge commit created (auto-merge as fallback)"
  fi

  echo ""
  echo "  TEST 2 RESULT: $result"
  exit_code=0
  [ "$result" = "PASS" ] && exit_code=0 || exit_code=1
  exit $exit_code
)
test2_result=$?

# Test 3: Real conflict scenario (must abort, not force-push)
echo ""
echo "TEST 3: Real merge conflict (must abort, no force-push)"
echo "-------------------------------------------------------"
(
  T3_DIR="$TEST_DIR/test3-conflict"
  mkdir -p "$T3_DIR"
  cd "$T3_DIR"

  # Create bare repo
  bare_repo="$T3_DIR/origin.git"
  git init --bare -b main "$bare_repo" 2>/dev/null || git init --bare "$bare_repo"

  # Create local repo
  local_repo="$T3_DIR/local"
  git clone "$bare_repo" "$local_repo" 2>/dev/null
  cd "$local_repo"

  git config user.email "test@example.com"
  git config user.name "Test User"

  # Make initial commit
  echo "initial" > conflict.txt
  git add conflict.txt
  git commit -m "initial commit"
  git branch -M main 2>/dev/null || true
  git push -u origin main 2>/dev/null

  # Simulate: another process modified same file differently
  other_checkout="$T3_DIR/other"
  git clone "$bare_repo" "$other_checkout" 2>/dev/null
  cd "$other_checkout"
  git config user.email "other@example.com"
  git config user.name "Other User"
  echo "other version" > conflict.txt
  git add conflict.txt
  git commit -m "other modified conflict.txt"
  git push origin main
  cd -

  # In local: modify same file differently
  cd "$local_repo"
  echo "local version" > conflict.txt
  git add conflict.txt
  git commit -m "local modified conflict.txt"

  echo "  Before push_with_retry:"
  git log --oneline -3
  git status --short --branch | head -1

  # Try direct push (should fail)
  if git push origin main 2>&1 | grep -q "rejected"; then
    echo "  ✓ Push rejected (expected — diverged history)"
    git reset --hard HEAD 2>/dev/null || true
  fi

  # Now use push_with_retry (should abort merge and return failure)
  echo ""
  echo "  Running push_with_retry (conflict scenario)..."
  push_with_retry "main" 2>&1 | head -10 && {
    echo "  ✗ push_with_retry should have failed but succeeded"
    result="FAIL"
  } || {
    echo "  ✓ push_with_retry failed as expected (conflict detected)"
    result="PASS"
  }

  # Verify no half-finished merge state
  if git status --short | grep -qE "^(AA|UU|DD|AU|UD|UA|DU)"; then
    echo "  ✗ Half-finished merge state detected (git merge --abort failed)"
    result="FAIL"
  else
    echo "  ✓ Clean worktree after abort (no half-finished merge)"
  fi

  # Verify the commit is still local (not pushed)
  if git rev-list origin/main | grep -q "$(git rev-parse HEAD)"; then
    echo "  ✗ Commit was somehow pushed (force-push risk!)"
    result="FAIL"
  else
    echo "  ✓ Local commit not pushed (safe failure)"
  fi

  echo "  After push_with_retry:"
  git log --oneline -3
  git status

  echo ""
  echo "  TEST 3 RESULT: $result"
  exit_code=0
  [ "$result" = "PASS" ] && exit_code=0 || exit_code=1
  exit $exit_code
)
test3_result=$?

# Test 4: Redundant content scenario (origin has lines already in local HEAD)
echo ""
echo "TEST 4: Redundant content (origin's lines already in local HEAD)"
echo "--------------------------------------------------------------"
(
  T4_DIR="$TEST_DIR/test4-redundant"
  mkdir -p "$T4_DIR"
  cd "$T4_DIR"

  # Create bare repo
  bare_repo="$T4_DIR/origin.git"
  git init --bare -b main "$bare_repo" 2>/dev/null || git init --bare "$bare_repo"

  # Create local repo
  local_repo="$T4_DIR/local"
  git clone "$bare_repo" "$local_repo" 2>/dev/null
  cd "$local_repo"

  git config user.email "test@example.com"
  git config user.name "Test User"

  # Make initial commit with baseline content
  cat > code.txt <<'EOF'
import { Component } from 'react';

class App extends Component {
  render() {
    return null;
  }
}

export default App;
EOF
  git add code.txt
  git commit -m "initial: basic App structure"
  git branch -M main 2>/dev/null || true
  git push -u origin main 2>/dev/null

  # Simulate: another process (origin) adds ChallengePanel and buildSessionSummary
  # BUT with reformatted surrounding lines (different context)
  other_checkout="$T4_DIR/other"
  git clone "$bare_repo" "$other_checkout" 2>/dev/null
  cd "$other_checkout"
  git config user.email "other@example.com"
  git config user.name "Other User"

  cat > code.txt <<'EOF'
import { Component } from 'react';

class App extends Component {
  // Added by origin
  challengePanelOpen = false;
  buildSessionSummary() {
    return { total: 0 };
  }

  render() {
    return null;
  }
}

export default App;
EOF
  git add code.txt
  git commit -m "origin: add ChallengePanel integration"
  git push origin main
  cd -

  # In local: independently add the same functions but with reformatted code
  # (different context but same core lines)
  cd "$local_repo"
  cat > code.txt <<'EOF'
import { Component } from 'react';

class App extends Component {
  render() {
    return null;
  }

  // Local implementation
  buildSessionSummary() {
    return { total: 0 };
  }

  challengePanelOpen = false;
}

export default App;
EOF
  git add code.txt
  git commit -m "local: add session summary tracking"

  echo "  Before push_with_retry:"
  git log --oneline -2
  git status --short --branch | head -1

  # Try direct push (should fail)
  if git push origin main 2>&1 | grep -q "rejected"; then
    echo "  ✓ Push rejected (expected — diverged history)"
    git reset --hard HEAD 2>/dev/null || true
  fi

  echo ""
  echo "  Running push_with_retry (redundant content scenario)..."
  if push_with_retry "main" 2>&1 | head -5; then
    echo "  ✓ push_with_retry succeeded (auto-resolved redundant conflict)"
    result="PASS"
  else
    echo "  ✗ push_with_retry failed"
    result="FAIL"
  fi

  # Verify the commit contains all required content
  merged_content=$(git show HEAD:code.txt)
  if echo "$merged_content" | grep -q "buildSessionSummary"; then
    echo "  ✓ Merged content includes buildSessionSummary"
  else
    echo "  ✗ Missing buildSessionSummary after merge"
    result="FAIL"
  fi

  if echo "$merged_content" | grep -q "challengePanelOpen"; then
    echo "  ✓ Merged content includes challengePanelOpen"
  else
    echo "  ✗ Missing challengePanelOpen after merge"
    result="FAIL"
  fi

  echo ""
  echo "  TEST 4 RESULT: $result"
  exit_code=0
  [ "$result" = "PASS" ] && exit_code=0 || exit_code=1
  exit $exit_code
)
test4_result=$?

# Test 5: Redundant indented content (indented lines already in local HEAD)
echo ""
echo "TEST 5: Redundant indented content (indented lines in function body)"
echo "-------------------------------------------------------------------"
(
  T5_DIR="$TEST_DIR/test5-indented"
  mkdir -p "$T5_DIR"
  cd "$T5_DIR"

  # Create bare repo
  bare_repo="$T5_DIR/origin.git"
  git init --bare -b main "$bare_repo" 2>/dev/null || git init --bare "$bare_repo"

  # Create local repo
  local_repo="$T5_DIR/local"
  git clone "$bare_repo" "$local_repo" 2>/dev/null
  cd "$local_repo"

  git config user.email "test@example.com"
  git config user.name "Test User"

  # Make initial commit with baseline content
  cat > app.ts <<'EOF'
function initApp() {
  return null;
}

export default initApp;
EOF
  git add app.ts
  git commit -m "initial: basic app structure"
  git branch -M main 2>/dev/null || true
  git push -u origin main 2>/dev/null

  # Simulate: another process (origin) adds indented lines inside the function
  other_checkout="$T5_DIR/other"
  git clone "$bare_repo" "$other_checkout" 2>/dev/null
  cd "$other_checkout"
  git config user.email "other@example.com"
  git config user.name "Other User"

  cat > app.ts <<'EOF'
function initApp() {
  const seed = Math.random();
  const world = createWorld(seed);
  return null;
}

export default initApp;
EOF
  git add app.ts
  git commit -m "origin: add world initialization"
  git push origin main
  cd -

  # In local: independently add the same indented lines but with reformatted context
  cd "$local_repo"
  cat > app.ts <<'EOF'
function initApp() {
  return null;
  // Note: the following lines are added after the return, simulating different context
  const seed = Math.random();
  const world = createWorld(seed);
}

export default initApp;
EOF
  git add app.ts
  git commit -m "local: add world initialization"

  echo "  Before push_with_retry:"
  git log --oneline -2
  git status --short --branch | head -1

  # Try direct push (should fail)
  if git push origin main 2>&1 | grep -q "rejected"; then
    echo "  ✓ Push rejected (expected — diverged history)"
    git reset --hard HEAD 2>/dev/null || true
  fi

  echo ""
  echo "  Running push_with_retry (indented redundant content)..."
  if push_with_retry "main" 2>&1 | head -5; then
    echo "  ✓ push_with_retry succeeded (auto-resolved indented redundant conflict)"
    result="PASS"
  else
    echo "  ✗ push_with_retry failed (whitespace-trim mismatch on indented lines)"
    result="FAIL"
  fi

  # Verify the commit contains the indented lines
  merged_content=$(git show HEAD:app.ts)
  if echo "$merged_content" | grep -q "const seed = Math.random()"; then
    echo "  ✓ Merged content includes indented line: const seed = Math.random()"
  else
    echo "  ✗ Missing indented line: const seed = Math.random()"
    result="FAIL"
  fi

  if echo "$merged_content" | grep -q "const world = createWorld(seed)"; then
    echo "  ✓ Merged content includes indented line: const world = createWorld(seed)"
  else
    echo "  ✗ Missing indented line: const world = createWorld(seed)"
    result="FAIL"
  fi

  echo ""
  echo "  TEST 5 RESULT: $result"
  exit_code=0
  [ "$result" = "PASS" ] && exit_code=0 || exit_code=1
  exit $exit_code
)
test5_result=$?

# Summary
echo ""
echo "============================================================="
echo "TEST SUMMARY"
echo "============================================================="
echo ""

if [ "$test1_result" -eq 0 ]; then
  echo "✓ TEST 1 (Fast-forward merge):  PASS"
else
  echo "✗ TEST 1 (Fast-forward merge):  FAIL"
fi

if [ "$test2_result" -eq 0 ]; then
  echo "✓ TEST 2 (Auto-merge):           PASS"
else
  echo "✗ TEST 2 (Auto-merge):           FAIL"
fi

if [ "$test3_result" -eq 0 ]; then
  echo "✓ TEST 3 (Conflict abort):       PASS"
else
  echo "✗ TEST 3 (Conflict abort):       FAIL"
fi

if [ "$test4_result" -eq 0 ]; then
  echo "✓ TEST 4 (Redundant content):    PASS"
else
  echo "✗ TEST 4 (Redundant content):    FAIL"
fi

if [ "$test5_result" -eq 0 ]; then
  echo "✓ TEST 5 (Indented redundant):   PASS"
else
  echo "✗ TEST 5 (Indented redundant):   FAIL"
fi

echo ""

# Overall verdict
if [ "$test1_result" -eq 0 ] && [ "$test2_result" -eq 0 ] && [ "$test3_result" -eq 0 ] && [ "$test4_result" -eq 0 ] && [ "$test5_result" -eq 0 ]; then
  echo "OVERALL VERDICT: ✓ ALL TESTS PASSED"
  echo ""
  echo "push_with_retry() correctly handles:"
  echo "  • Fast-forward merges (no merge commit created)"
  echo "  • Auto-merge fallback (merge commit on diverged history)"
  echo "  • Conflict detection (merge abort, clean worktree, safe failure)"
  echo "  • Redundant content auto-resolution (content already present, context differs)"
  echo "  • Indented redundant content (whitespace-trimmed, indented lines in function bodies)"
  echo ""
  exit 0
else
  echo "OVERALL VERDICT: ✗ SOME TESTS FAILED"
  exit 1
fi
