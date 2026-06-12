# Company Onboarding Enrichment — Mobile Starter

Starter repo for the Seapoint **founding mobile engineer** take-home assessment.

See the full brief for what you're building. This README only covers running it.

## The Stack

- **Backend:** Node + Express + TypeScript (same as the web variant)
- **Mobile:** Expo (React Native + TypeScript), state-driven 3-step wizard

The three onboarding steps (Input → Review → Confirm) are stubbed as state
transitions in `mobile/App.tsx`. Feel free to swap in a navigation library
(`expo-router`, `@react-navigation/native`) if you'd like real back-button or
deep-link support — that's a design call we'd love to hear you reason about.

## Prerequisites

- Node.js 18+
- Either:
  - **iOS Simulator** (macOS only — install Xcode from the App Store), or
  - **Android Emulator** (Android Studio), or
  - **Expo Go** on a physical device — easiest if you're on macOS without Xcode set up, or on Linux/Windows. Install from the App Store / Play Store.

## Install

```bash
npm run install:all
```

## Run

Pick the command for your target:

```bash
npm run dev:ios       # backend + Expo, auto-opens the iOS Simulator
npm run dev:android   # backend + Expo, auto-opens the Android Emulator
npm run dev           # backend + Expo, scan the QR code with Expo Go on your phone
```

Each starts:

- Backend at `http://localhost:3001`
- Expo dev server (for `npm run dev`, it prints a QR code — phone must be on
  the same WiFi)

> Note: Expo's interactive keyboard shortcuts (`i`, `a`, `r`) don't work under
> the combined scripts because `concurrently` doesn't forward keystrokes. Use
> the platform-specific commands above, or run `npm run dev:backend` and
> `npm run dev:mobile` in separate terminals if you want the interactive menu.

### Networking notes

The mobile app auto-detects your dev machine's IP from Expo, so the API call
works in all three setups out of the box. If you need to override it (e.g.
testing against a deployed backend), set `EXPO_PUBLIC_API_URL` in `mobile/.env`.

## Project Structure

```
.
├── backend/                 # Express API (same as the web variant)
│   └── src/routes/enrich.ts # POST /enrich endpoint — implement here
└── mobile/
    ├── App.tsx              # 3-step wizard (extend this)
    ├── src/
    │   ├── api.ts           # API client (already wired)
    │   └── types.ts         # Shared types with the backend
    ├── app.json             # Expo config
    └── .env.example
```

## What's Already Wired

- **Backend:** `POST /enrich` accepts `{ email, website }` and returns an empty `{ company: {}, enrichment: { sources: [], confidence: {} } }`. Implement the enrichment.
- **Mobile:** the three-step state machine runs end to end. Step 1 has a working form. Step 2 dumps the JSON response. Step 3 shows a minimal success screen.
- **Networking:** the mobile app calls the backend without you needing to configure an IP.

## What You're Building

### Backend

- Query at least 2 data sources
- Return structured company data with **source + confidence per field**
- Handle source failures gracefully

### Mobile

- Make Step 2 (Review) a proper editable UI: show source + confidence per
  field, let the user correct anything
- Make Step 3 (Confirm) feel like a real success screen
- **State restoration:** if the user backgrounds or kills the app mid-flow,
  they should resume where they left off with their edits intact. The
  `App.tsx` has a `TODO (candidate)` marker for this — pick a persistence
  library and wire it up. We'll want to hear why you picked the one you did.
- Anything else you think a thoughtful mobile flow needs (keyboard handling,
  scroll, safe area on smaller devices, tap targets, loading states, errors).

## Useful APIs

- [UK Companies House](https://developer.company-information.service.gov.uk) — free, instant API key
- Web search, scraping the company website, LLMs — all fair game

## Environment Variables

```bash
# backend/.env
COMPANIES_HOUSE_API_KEY=your_key_here

# mobile/.env  (optional)
# EXPO_PUBLIC_API_URL=http://192.168.1.10:3001
```

## What to Submit

1. Your code (fork or fresh repo)
2. Updated README with:
   - How to run it (which simulator/device you tested on)
   - Data sources you used and why
   - **Mobile-specific trade-offs you made** (persistence library, keyboard, safe areas, navigation, offline)
   - What you'd improve with more time
   - What AI tools you used (if any) and how
3. Loom video walkthrough — including backgrounding the app mid-flow and reopening to show state restoration
