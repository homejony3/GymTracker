# Implementation Plan: Gym Tracker

## Overview

A full-stack TypeScript implementation using Next.js App Router, PostgreSQL, Docker Compose, Caddy reverse proxy, JWT authentication, and EU localization. Tasks are ordered to build foundational infrastructure first, then core services, API routes, frontend components, and finally integration/deployment wiring.

## Tasks

- [x] 1. Set up project structure and core configuration
  - [x] 1.1 Initialize Next.js project with TypeScript and configure tooling
    - Initialize Next.js 14+ project with App Router and TypeScript
    - Configure `tsconfig.json` with strict mode and path aliases (`@/`)
    - Install dependencies: `bcryptjs`, `jsonwebtoken`, `pg`, `uuid`
    - Install dev dependencies: `vitest`, `fast-check`, `@types/bcryptjs`, `@types/jsonwebtoken`, `@types/pg`
    - Create directory structure: `src/app/`, `src/lib/`, `src/services/`, `src/components/`, `src/types/`, `tests/`
    - Configure Vitest in `vitest.config.ts`
    - _Requirements: 11.3_

  - [x] 1.2 Define shared TypeScript types and constants
    - Create `src/types/index.ts` with `WorkoutSplit`, `User`, `Exercise`, `Session`, `WorkoutSet`, `WeightSuggestion` interfaces
    - Create `src/lib/constants.ts` with validation ranges (weight 0.0–500.0, reps 1–999, sets 1–50, name length 1–50)
    - Define split enum: `UPPER`, `LOWER`, `ARMS`
    - _Requirements: 2.1, 4.2, 4.3, 3.1_

  - [x] 1.3 Create Docker Compose configuration
    - Create `docker-compose.yml` with Next.js app service (port 3000) and PostgreSQL 16 service (port 5432)
    - Configure named volume for PostgreSQL data persistence
    - Set `restart: unless-stopped` on both services
    - Add environment variables for DB connection, JWT secret, and bcrypt rounds
    - Create `.env.example` with all required environment variables
    - _Requirements: 10.1, 10.2, 11.3, 11.5, 11.6_

  - [x] 1.4 Create Dockerfile for Next.js application
    - Multi-stage build: deps → build → production
    - Use `node:20-alpine` base image
    - Copy only production artifacts to final stage
    - Expose port 3000
    - Set `NODE_ENV=production`
    - _Requirements: 11.3, 11.4_

- [x] 2. Implement database layer
  - [x] 2.1 Create database connection pool and migration runner
    - Create `src/lib/db.ts` with PostgreSQL connection pool using `pg` library
    - Implement simple migration runner that executes SQL files in order from `migrations/` directory
    - Add health check query function
    - _Requirements: 10.1, 10.2_

  - [x] 2.2 Write database migration scripts
    - Create `migrations/001_create_users.sql` — users table with UUID PK, unique username, password_hash, created_at
    - Create `migrations/002_create_login_attempts.sql` — login_attempts table with FK to users
    - Create `migrations/003_create_exercises.sql` — exercises table with FK to users, name, weight_increment with CHECK constraints
    - Create `migrations/004_create_exercise_splits.sql` — exercise_splits table with FK to exercises, split CHECK, UNIQUE(exercise_id, split)
    - Create `migrations/005_create_sessions.sql` — sessions table with FK to users, split CHECK, session_date, completed
    - Create `migrations/006_create_workout_sets.sql` — workout_sets table with FK to sessions and exercises, CHECK constraints on set_number, weight_kg, reps
    - Create `migrations/007_create_indexes.sql` — all indexes from design (user_id, session_date DESC, exercise_id, etc.)
    - _Requirements: 10.1, 10.2, 4.2, 4.3_

  - [x] 2.3 Implement database retry utility
    - Create `src/lib/retry.ts` with `withRetry<T>` function (max 3 retries, 2s delay)
    - Handle transient database errors (connection reset, timeout)
    - Throw after all retries exhausted
    - _Requirements: 10.3, 10.5_

- [x] 3. Implement authentication system
  - [x] 3.1 Implement AuthService
    - Create `src/services/auth.service.ts`
    - Implement `hashPassword(plain: string): Promise<string>` using bcrypt (12 rounds)
    - Implement `verifyPassword(plain: string, hash: string): Promise<boolean>`
    - Implement `createToken(userId: string): string` — JWT with 30-day expiry
    - Implement `verifyToken(token: string): { userId: string } | null`
    - Implement `recordLoginAttempt(userId: string, success: boolean): Promise<void>`
    - Implement `isAccountLocked(userId: string): Promise<boolean>` — check 5 failures in 15 minutes
    - Implement `authenticate(username: string, password: string): Promise<{ token: string; user: User } | { error: string; locked?: boolean }>`
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 3.2 Implement auth middleware
    - Create `src/middleware.ts` (Next.js middleware)
    - Validate JWT from `auth_token` HTTP-only cookie on all `/api/*` routes (except `/api/auth/login`)
    - Validate JWT on all page routes except `/login`
    - Redirect unauthenticated users to `/login`
    - Attach `userId` to request context for downstream handlers
    - _Requirements: 1.4, 1.5, 9.3, 9.5_

  - [x] 3.3 Implement auth API routes
    - Create `src/app/api/auth/login/route.ts` — POST handler: validate credentials, check lockout, set HTTP-only cookie, return user info
    - Create `src/app/api/auth/logout/route.ts` — POST handler: clear auth cookie
    - Create `src/app/api/auth/me/route.ts` — GET handler: return current user from JWT
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [x] 3.4 Write property tests for authentication
    - **Property 2: Unauthenticated access rejection** — verify all protected endpoints reject requests without valid JWT
    - **Property 3: Authentication error uniformity** — verify same error message for wrong username vs wrong password
    - **Validates: Requirements 1.2, 1.5**

  - [x] 3.5 Write unit tests for AuthService
    - Test lockout after exactly 5 failed attempts within 15 minutes
    - Test lockout resets after 15 minutes
    - Test session expiry after 30 days
    - Test valid login returns token and user
    - _Requirements: 1.1, 1.3, 1.6_

- [x] 4. Checkpoint - Ensure auth tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement exercise management
  - [x] 5.1 Implement ExerciseService
    - Create `src/services/exercise.service.ts`
    - Implement `createExercise(userId: string, name: string, split: WorkoutSplit): Promise<Exercise>` — trim name, validate length, check case-insensitive duplicate within split
    - Implement `getExercisesBySplit(userId: string, split: WorkoutSplit): Promise<Exercise[]>` — ordered by added_at DESC, max 50
    - Implement `updateExerciseName(userId: string, exerciseId: string, newName: string): Promise<Exercise>` — validate, check duplicate
    - Implement `removeExerciseFromSplit(userId: string, exerciseId: string, split: WorkoutSplit): Promise<void>` — remove association, preserve history
    - All queries scoped to userId for data isolation
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1, 9.2_

  - [x] 5.2 Implement exercise API routes
    - Create `src/app/api/exercises/route.ts` — GET (list by split query param), POST (create exercise)
    - Create `src/app/api/exercises/[id]/route.ts` — PUT (rename), DELETE (remove from split)
    - Validate request bodies, return structured errors (400, 404, 409)
    - Scope all queries to authenticated user
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.3, 9.4_

  - [x] 5.3 Write property tests for exercise management
    - **Property 4: Exercise ordering within split** — verify exercises returned in added_at DESC order
    - **Property 5: Multi-split exercise membership** — verify exercise can belong to multiple splits simultaneously
    - **Property 6: Duplicate split association rejection** — verify adding same exercise to same split twice is rejected
    - **Property 7: Exercise name validation and trimming** — verify trim + length validation
    - **Property 8: Case-insensitive exercise name uniqueness** — verify case-insensitive duplicate detection
    - **Validates: Requirements 2.2, 2.3, 2.4, 3.1, 3.4, 3.5, 3.6**

  - [x] 5.4 Write unit tests for exercise edge cases
    - Test empty split displays empty state (Req 2.6)
    - Test removing exercise preserves historical session logs (Req 2.5, 3.3)
    - Test exercise name with only whitespace is rejected
    - Test exercise name at exactly 50 characters is accepted
    - _Requirements: 2.5, 2.6, 3.2, 3.3, 3.6_

- [x] 6. Implement session logging
  - [x] 6.1 Implement SessionService
    - Create `src/services/session.service.ts`
    - Implement `createSession(userId: string, split: WorkoutSplit): Promise<Session>` — associate with current date
    - Implement `completeSession(userId: string, sessionId: string): Promise<Session>` — validate at least 1 set exists
    - Implement `getSessionHistory(userId: string, page: number, split?: WorkoutSplit): Promise<{ sessions: Session[]; total: number }>` — paginated (50/page), ordered by session_date DESC
    - Implement `getSessionDetail(userId: string, sessionId: string): Promise<Session & { sets: WorkoutSet[] }>` — full session with all sets
    - All queries scoped to userId
    - _Requirements: 4.1, 4.4, 4.8, 5.1, 5.2, 9.1, 9.2_

  - [x] 6.2 Implement SetService
    - Create `src/services/set.service.ts`
    - Implement `logSet(userId: string, sessionId: string, exerciseId: string, weightKg: number, reps: number): Promise<WorkoutSet>` — validate ranges, auto-increment set_number, max 50 sets per exercise per session
    - Implement `updateSet(userId: string, setId: string, weightKg: number, reps: number): Promise<WorkoutSet>` — validate session not completed
    - Implement `deleteSet(userId: string, setId: string): Promise<void>` — validate session not completed
    - Validate weight in 0.5 increments, reps 1–999
    - _Requirements: 4.2, 4.3, 4.5, 4.6, 4.7, 9.1_

  - [x] 6.3 Implement session and set API routes
    - Create `src/app/api/sessions/route.ts` — GET (paginated history), POST (create session)
    - Create `src/app/api/sessions/[id]/route.ts` — GET (session detail)
    - Create `src/app/api/sessions/[id]/complete/route.ts` — POST (mark complete)
    - Create `src/app/api/sets/route.ts` — POST (log set)
    - Create `src/app/api/sets/[id]/route.ts` — PUT (edit set), DELETE (delete set)
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.7, 4.8, 5.1, 5.2_

  - [x] 6.4 Write property tests for session and set validation
    - **Property 10: Workout set value validation** — verify weight [0.0, 500.0] in 0.5 steps, reps [1, 999]
    - **Property 11: Session completion round-trip** — verify completed session returns exact sets
    - **Property 12: Session history ordering and pagination** — verify DESC order, max 50 per page
    - **Validates: Requirements 4.2, 4.4, 4.7, 5.1, 5.2**

  - [x] 6.5 Write unit tests for session edge cases
    - Test session with 0 sets cannot be completed (Req 4.8)
    - Test editing/deleting set in completed session is rejected
    - Test max 50 sets per exercise per session
    - Test no history returns empty list with message (Req 5.7)
    - _Requirements: 4.3, 4.5, 4.8, 5.7_

- [x] 7. Implement progressive overload suggestions
  - [x] 7.1 Implement SuggestionService
    - Create `src/services/suggestion.service.ts`
    - Implement `getWeightSuggestion(userId: string, exerciseId: string): Promise<WeightSuggestion>`
    - Logic: compare most recent session log with the one before it
    - If reps per set >= previous session's reps per set in all sets → suggest weight + increment
    - If any set has fewer reps or fewer total sets → suggest same weight (maintain)
    - If no prior history → return null suggestion with 'no_history' reasoning
    - Use exercise's configured `weight_increment` (default 1.0 kg)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6_

  - [x] 7.2 Implement suggestion API route
    - Create `src/app/api/suggestions/[exerciseId]/route.ts` — GET handler
    - Return suggestion within response (target <2s as per requirement)
    - Scope query to authenticated user
    - _Requirements: 6.1, 6.5, 9.2_

  - [x] 7.3 Write property tests for progressive overload
    - **Property 14: Progressive overload — increase suggestion** — verify increase when all sets match or exceed previous
    - **Property 15: Progressive overload — maintain suggestion** — verify maintain when any set regresses
    - **Validates: Requirements 6.3, 6.4**

  - [x] 7.4 Write unit tests for suggestion edge cases
    - Test no prior session returns null suggestion (Req 6.6)
    - Test custom weight increment per exercise (0.5–5.0 kg)
    - Test suggestion with only one prior session (no comparison possible)
    - _Requirements: 6.2, 6.3, 6.6_

- [x] 8. Implement EU localization utilities
  - [x] 8.1 Implement FormatService
    - Create `src/services/format.service.ts`
    - Implement `formatWeight(kg: number): string` — comma decimal, 1 decimal place, "kg" suffix (e.g., "72,5 kg")
    - Implement `formatDate(date: Date): string` — DD.MM.YYYY format
    - Implement `formatTime(date: Date): string` — HH:MM 24-hour format
    - Implement `parseWeightInput(input: string): number | null` — accept comma or dot, reject multiple separators or non-numeric chars
    - Implement `validateWeightInput(input: string): { valid: boolean; error?: string }`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.2 Write property tests for EU formatting
    - **Property 16: Weight formatting (EU locale)** — verify comma separator, 1 decimal, "kg" suffix
    - **Property 17: Date formatting (EU locale)** — verify DD.MM.YYYY pattern
    - **Property 18: Weight input parsing equivalence** — verify comma and dot produce same value
    - **Property 19: Time formatting (24-hour)** — verify HH:MM pattern
    - **Property 20: Malformed weight input rejection** — verify rejection of invalid inputs
    - **Validates: Requirements 4.6, 5.6, 8.1, 8.2, 8.3, 8.4, 8.5**

- [x] 9. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement frontend - authentication and layout
  - [x] 10.1 Create root layout and global styles
    - Create `src/app/layout.tsx` — root layout with metadata, viewport meta for mobile
    - Create `src/app/globals.css` — Tailwind CSS setup, mobile-first base styles
    - Configure `tailwind.config.ts` with custom theme (44px min touch targets)
    - Set viewport meta: `width=device-width, initial-scale=1`
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 10.2 Implement login page
    - Create `src/app/login/page.tsx` — server component with login form
    - Create `src/components/LoginForm.tsx` — client component with username/password inputs
    - Handle error display (invalid credentials, account locked with duration)
    - Style for mobile-first (320px min width, 44px touch targets)
    - _Requirements: 1.1, 1.2, 1.3, 7.1, 7.2_

  - [x] 10.3 Implement authenticated dashboard layout
    - Create `src/app/(dashboard)/layout.tsx` — authenticated layout with navigation
    - Create `src/components/SplitSelector.tsx` — tab navigation for UPPER/LOWER/ARMS
    - Create `src/components/Header.tsx` — app header with logout button
    - Mobile-optimized navigation (bottom tabs or top tabs)
    - _Requirements: 2.1, 7.1, 7.5_

- [x] 11. Implement frontend - exercise management
  - [x] 11.1 Implement exercise list and management UI
    - Create `src/app/(dashboard)/page.tsx` — main dashboard showing exercises for selected split
    - Create `src/components/ExerciseList.tsx` — list exercises with add/edit/remove actions
    - Create `src/components/ExerciseForm.tsx` — form for adding/editing exercise name
    - Display empty state when split has no exercises
    - Inline validation for name length (1–50 chars)
    - Display error messages for duplicates (409 responses)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.4, 3.5, 3.6_

- [x] 12. Implement frontend - session logging
  - [x] 12.1 Implement session creation and set logging UI
    - Create `src/app/(dashboard)/session/page.tsx` — active session view
    - Create `src/components/SessionView.tsx` — session container with exercise list
    - Create `src/components/SetLogger.tsx` — set entry form (weight, reps) with add/edit/delete
    - Create `src/components/WeightInput.tsx` — numeric input accepting comma/dot, displays EU format
    - Create `src/components/RepInput.tsx` — integer input for reps (1–999)
    - Implement inline validation with error messages for out-of-range values
    - Display set count per exercise
    - _Requirements: 4.1, 4.2, 4.3, 4.5, 4.6, 4.7, 7.2, 7.5, 8.1, 8.3_

  - [x] 12.2 Implement weight suggestion display
    - Create `src/components/WeightSuggestion.tsx` — display suggestion with reasoning
    - Fetch suggestion when exercise is selected in session
    - Show "increase" or "maintain" indicator
    - Allow user to override suggestion
    - Show "no prior data" when no history exists
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6_

  - [x] 12.3 Implement session completion flow
    - Add "Complete Session" button with validation (at least 1 set required)
    - Display confirmation before completing
    - Show error if no sets logged
    - Redirect to history after completion
    - _Requirements: 4.4, 4.8_

- [x] 13. Implement frontend - history and comparison
  - [x] 13.1 Implement session history view
    - Create `src/app/(dashboard)/history/page.tsx` — paginated session history
    - Create `src/components/HistoryView.tsx` — list of session cards
    - Create `src/components/SessionCard.tsx` — session summary (date in DD.MM.YYYY, split, set count)
    - Implement pagination (50 sessions per page)
    - Display empty state when no sessions exist
    - _Requirements: 5.1, 5.6, 5.7, 8.2_

  - [x] 13.2 Implement session detail and comparison view
    - Create `src/app/(dashboard)/history/[id]/page.tsx` — session detail page
    - Create `src/components/ComparisonView.tsx` — side-by-side current vs previous session
    - Fetch and display most recent prior session for each exercise
    - Show "no prior data" indicator when no comparison available
    - Display all weights in EU format (comma decimal)
    - _Requirements: 5.2, 5.3, 5.4, 8.1_

- [x] 14. Implement data isolation and error handling
  - [x] 14.1 Implement client-side error handling and retry logic
    - Create `src/lib/api-client.ts` — fetch wrapper with retry logic (3 retries, 2s intervals)
    - Implement toast notification system for transient errors
    - Implement persistent error banner for exhausted retries with manual retry button
    - Handle 401 responses by redirecting to login
    - Preserve unsaved form data on error
    - _Requirements: 10.3, 10.5, 1.6_

  - [x] 14.2 Write property tests for data isolation
    - **Property 1: Data isolation between users** — verify user A cannot access user B's resources
    - **Property 13: Exercise comparison lookup** — verify comparison returns correct prior session for same user
    - **Validates: Requirements 1.4, 5.3, 5.4, 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement deployment and infrastructure
  - [x] 16.1 Configure Caddy reverse proxy
    - Create `Caddyfile` with HTTPS auto-TLS configuration
    - Configure reverse proxy to Next.js container (localhost:3000)
    - Add security headers (HSTS, X-Frame-Options, X-Content-Type-Options)
    - Add Caddy service to `docker-compose.yml` or document standalone Caddy setup
    - _Requirements: 11.2_

  - [x] 16.2 Implement health check endpoint and startup script
    - Create `src/app/api/health/route.ts` — GET handler returning 200 with DB connectivity check
    - Create `scripts/start.sh` — run migrations then start Next.js
    - Configure Docker healthcheck in `docker-compose.yml`
    - _Requirements: 11.1, 11.5_

  - [x] 16.3 Configure automated database backups
    - Create `scripts/backup.sh` — pg_dump to timestamped file, retain 7 days, delete older
    - Create cron job configuration (daily at 02:00)
    - Document backup restoration procedure in README
    - _Requirements: 10.6_

  - [x] 16.4 Create deployment documentation
    - Create `README.md` with setup instructions (prerequisites, environment variables, deployment steps)
    - Document DNS configuration for domain/subdomain
    - Document initial user creation (seed script or admin CLI)
    - Include troubleshooting section
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 17. Implement mobile responsiveness and performance
  - [x] 17.1 Optimize mobile layout and touch targets
    - Audit all interactive elements for 44x44px minimum touch targets
    - Ensure no horizontal scrolling on 320px–767px viewports
    - Test layout reflow on orientation change
    - Add CSS for landscape adaptation
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

  - [x] 17.2 Optimize performance for LCP target
    - Implement server-side rendering for landing page
    - Optimize bundle size (dynamic imports for non-critical components)
    - Add appropriate caching headers
    - Target LCP ≤ 3s on simulated 4G
    - _Requirements: 7.3_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All weight values use 0.5 kg increments with EU comma-decimal formatting
- All dates use DD.MM.YYYY format throughout the application
- JWT tokens stored in HTTP-only cookies with 30-day expiry
- All database queries are scoped to the authenticated user's ID for data isolation

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["3.1", "8.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4", "3.5", "8.2"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2", "5.3", "5.4"] },
    { "id": 8, "tasks": ["6.1", "6.2"] },
    { "id": 9, "tasks": ["6.3", "6.4", "6.5"] },
    { "id": 10, "tasks": ["7.1"] },
    { "id": 11, "tasks": ["7.2", "7.3", "7.4"] },
    { "id": 12, "tasks": ["10.1"] },
    { "id": 13, "tasks": ["10.2", "10.3"] },
    { "id": 14, "tasks": ["11.1"] },
    { "id": 15, "tasks": ["12.1", "12.2"] },
    { "id": 16, "tasks": ["12.3", "13.1"] },
    { "id": 17, "tasks": ["13.2", "14.1"] },
    { "id": 18, "tasks": ["14.2"] },
    { "id": 19, "tasks": ["16.1", "16.2", "16.3", "16.4"] },
    { "id": 20, "tasks": ["17.1", "17.2"] }
  ]
}
```
