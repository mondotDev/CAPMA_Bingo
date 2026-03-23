# CAPMA Bingo Context

## What This Project Is
CAPMA Bingo is a small event web app for CAPMA events. Attendees create a bingo entry, mark squares as they complete event activities, and submit a full board to enter a prize drawing. CAPMA staff use an admin dashboard to review entries, edit attendee records, delete entries, draw winners, and lock winners so they cannot be drawn again.

## Stack
- React 19
- TypeScript
- Vite
- React Router
- Firebase Authentication
- Firestore
- Firebase Hosting
- Tailwind CSS
- `canvas-confetti`

## Routes
- `/`: attendee app
- `/admin-login`: admin Google sign-in
- `/admin`: protected admin dashboard

## Core Behavior

### Attendee flow
1. User opens the attendee app.
2. App signs the user into Firebase anonymously.
3. App loads the single active event from Firestore.
4. If the current anonymous user already has an entry for that event, the app restores it.
5. Otherwise the user submits name, company, and email.
6. App creates or loads the attendee entry.
7. User sees onboarding once per event per browser.
8. User marks bingo squares as they complete activities.
9. Progress auto-saves after each square toggle.
10. When all squares are marked, user can submit the full board to enter the drawing.
11. Completion screen confirms prize entry.

### Admin flow
1. Admin signs in with Google.
2. App requires a `@capma.org` email.
3. App also requires an allowlist document at `admins/{uid}`.
4. Admin dashboard loads the active event and all event entries.
5. Admin can view counts, edit entries, delete entries, draw winners, copy winners, and lock winners.

## Data Model

### `events/{eventId}`
Active event configuration. Important fields:
- `eventId`
- `name`
- `isActive`
- `boardSize` (`4` for the current attendee experience)
- `submissionOpen`
- `theme`
- `onboarding`
- `completionMessage`
- `squares`

### `events/{eventId}/entries/{ownerUid}`
Attendee bingo entry. Important fields:
- `eventId`
- `ownerUid`
- `emailKey`
- `name`
- `company`
- `email`
- `normalizedEmail`
- `selectedSquares`
- `markedSquareIds`
- `completed`
- `completedAt`
- `prizeEntryEligible`
- `createdAt`
- `updatedAt`
- `winnerLocked`
- `winnerLockedAt`
- `winnerLockedBy`

### `events/{eventId}/emailIndex/{normalizedEmail}`
Used to enforce one entry per email per event.

Important fields:
- `ownerUid`
- `createdAt`

### `admins/{uid}`
Admin allowlist document. If present, a signed-in CAPMA Google user is allowed into the admin area.

## Entry Rules
- One board per attendee per event.
- Email is normalized to lowercase and trimmed.
- Entry creation uses a Firestore transaction.
- If the email is already claimed by another owner for that event, entry creation fails.
- Regular board saves update square selections only.
- Prize eligibility is only set when the attendee submits a fully completed board.

## Event Configuration
The active event document drives most attendee-facing content and presentation.

Configurable pieces:
- event name
- board size
- whether submissions are open
- square labels
- onboarding copy
- completion copy
- theme colors

Theme fields:
- `primary`
- `secondary`
- `accent`
- `background`
- `text`

## Event Validation
- The app assumes one active event at a time.
- It queries Firestore for `events` where `isActive == true` and uses the first result.
- The attendee experience expects a 4x4 board.
- Active event data must provide `boardSize: 4` and exactly 16 valid squares.
- Each square is rendered with 2 text lines in the attendee board UI.

## Security Model
Firestore rules are a major part of the application logic.

Key rules:
- Event documents are publicly readable but not client-writable.
- Attendees can only read their own entry unless they are admins.
- Attendees can create only their own entry.
- Attendees can update only their own entry and only before completion.
- Immutable ownership and identity fields are protected from attendee edits after creation.
- Admins can list, read, update, and delete entries.
- Admins can list email index records.
- `admins/{uid}` is readable only by the matching signed-in user.

Admin status in rules is granted if either:
- auth custom claim `admin == true`, or
- a Firestore admin record exists at `admins/{uid}`

## Admin Drawing Logic
- Winner drawing is done client-side in the browser.
- Eligible pool can be either completed entries only or all entries.
- Locked winners are excluded from future draws.
- Locking winners persists `winnerLocked`, `winnerLockedAt`, and `winnerLockedBy`.
- This is lightweight internal tooling, not a cryptographically secure raffle system.

## UX Notes
- Mobile-first attendee UI.
- Responsive admin UI with table on desktop and cards on smaller screens.
- Event theming is applied through CSS variables.
- Square taps trigger a small confetti effect.
- Completed boards trigger a larger confetti celebration.
- Onboarding is shown once per event using local storage key:
  - `capma-bingo-onboarding-seen:{eventId}`

## Project Constraints
- Anonymous auth must be enabled in Firebase.
- Google sign-in must be enabled for admin access.
- Event setup is managed outside this repo by editing Firestore data directly.
- There is no event-management UI in the repo.
- There is no server function layer; business logic lives in the client plus Firestore rules.
- There is no automated test suite in the repo.
- There is no analytics or audit/reporting layer.

## Build and Deployment
Scripts:
- `npm run dev`
- `npm run build`
- `npm run preview`

Required environment variables:
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Firebase Hosting:
- serves `dist`
- rewrites all routes to `index.html`

Local Firebase project alias:
- `capma-backend`

## Repo Map
- `src/pages`: attendee and admin pages
- `src/components`: bingo board, entry form, onboarding, completion, route guard
- `src/features/event`: event loading and types
- `src/features/entry`: entry creation, loading, saving, submission, admin updates, deletion, winner locking
- `src/features/auth`: attendee anonymous auth provider
- `src/features/admin`: admin auth logic
- `src/lib`: Firebase initialization and confetti helpers
- `src/styles`: theme and layout styling
- `firestore.rules`: Firestore security rules
- `firebase.json`: Firebase Hosting and Firestore rules config

## Practical Summary For An LLM
Treat this project as:
- a CAPMA-branded event bingo app
- a Firebase-backed single-page app
- a single-active-event system
- an attendee experience built on anonymous auth
- an admin dashboard gated by Google sign-in plus Firestore allowlisting
- a project where Firestore rules enforce much of the business logic
- a system whose event content is mostly data-driven from Firestore

## Caveats
- Winner drawing is client-side and only lightly auditable.
- Anonymous auth means board continuity can depend on session/device persistence.
- Admin/event operations depend on correct Firestore setup outside the codebase.
- Production build currently emits a large bundle size warning, so route-based code splitting may be useful later.
