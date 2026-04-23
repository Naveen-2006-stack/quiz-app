# LevelNLearn Pre-Deploy QA Checklist

Date: 2026-04-23
Scope: Critical fixes for live quiz persistence, anti-cheat cursor exit detection, and quiz form validation.

## Environment Setup

- Run app locally with the same Supabase project used for staging.
- Use 2 browser windows:
  - Window A: Host (teacher account)
  - Window B: Student (student account)
- Prefer desktop for anti-cheat tests (multi-monitor if available).

## Fix 1: Student Page Refresh Persistence

Goal: Student should remain in active session after refresh and continue receiving realtime updates.

### Test 1.1: Refresh While Waiting

1. Host creates and starts a live session but keeps status as waiting.
2. Student joins via PIN and lands on play/wait screen.
3. Student refreshes browser page (F5 / Ctrl+R).
4. Verify student is still in the same session view.
5. Verify student is not redirected to join screen.

Expected:
- Student remains in session.
- Name and participant identity are preserved.

### Test 1.2: Refresh During Active Question

1. Host starts quiz and advances to question 1.
2. Student answers or stays on question view.
3. Student refreshes browser page.
4. Host advances to next question.

Expected:
- Student remains in current session after refresh.
- Student continues receiving host realtime changes (question advancement/status updates).

### Test 1.3: Persistence Cleanup on Exit/Kick

1. Student joins session.
2. Host kicks student OR student clicks Leave Game.
3. Student revisits old play URL.

Expected:
- Student does not silently auto-rejoin with stale session state.
- Student is redirected appropriately (dashboard/join flow).

## Fix 2: Anti-Cheat Mouse Leave Detection

Goal: Cursor leaving browser viewport should trigger the same violation path as tab/app backgrounding.

### Test 2.1: Cursor Exit Strike

1. Start active quiz.
2. Student moves cursor completely outside browser window (edge exit).
3. Repeat once after cooldown period.

Expected:
- Violation event is logged/displayed to host as anti-cheat warning.
- Violation type matches tab-hidden/background path behavior.

### Test 2.2: No Listener Leak

1. Student joins active session.
2. Navigate away from play page (leave session or route change).
3. Rejoin another session.

Expected:
- Anti-cheat still works exactly once per event.
- No duplicated warnings from stale listeners.

## Fix 3: Empty Question/Option Validation

Goal: Prevent save when any question text or option text is empty.

### Test 3.1: Empty Question Text Block

1. Open quiz editor.
2. Add a question with blank title and filled options.
3. Click Save Quiz.

Expected:
- Save is blocked for that question.
- Visible error appears in the save status banner.

### Test 3.2: Empty Option Text Block

1. Open quiz editor.
2. Use non-empty question title.
3. Leave one or more options blank.
4. Click Save Quiz.

Expected:
- Save is blocked for that question.
- Visible error message indicates questions/options cannot be empty.

### Test 3.3: Trimmed Text Save

1. Enter question/options with leading/trailing spaces only around text.
2. Save quiz.

Expected:
- Save succeeds when trimmed values are non-empty.
- Stored text does not include extra surrounding whitespace.

## Fast Smoke Run (5 Minutes)

1. Join as student -> refresh in waiting -> remain in session.
2. Start quiz -> refresh in active -> continue receiving next question.
3. Move cursor out of viewport during active quiz -> host sees violation.
4. Try saving question with blank title -> blocked with visible error.
5. Try saving question with blank option -> blocked with visible error.
6. Save fully valid quiz -> success banner.

## Release Gate

- PASS only if all tests above pass without console/runtime errors.
- If any fail, block deployment and attach screenshot + reproduction steps.
