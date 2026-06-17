# Company Onboarding — Mobile

A three-step onboarding flow for a financial platform: enter an email and company website, get back enriched company data, review and edit it, then confirm. The app survives being backgrounded or killed mid-flow and resumes exactly where you left off.

Built as the Seapoint founding mobile engineer take-home assessment.

---

## The Stack

- **Backend:** Node 18+ · Express · TypeScript
- **Mobile:** Expo 54 · React Native 0.81 · React 19 · TypeScript
- **Shared contract:** `shared/src/enrichment.d.ts` — imported by both backend and mobile

---

## Prerequisites

- Node.js 18+
- One of:
  - **iOS Simulator** (macOS — install Xcode from the App Store)
  - **Android Emulator** (Android Studio)
  - **Expo Go** on a physical device (App Store / Play Store)

**Tested on:**
  - iOS Simulator (iPhone 16 Pro, iOS 18)
  - iPhone 17, iOS 27 developer beta, Expo Go app
  - Google Pixel 7, Android 16, Expo Go app

---

## Install

```bash
npm run install:all
```

## Run

```bash
npm run dev:ios       # backend + Expo → auto-opens iOS Simulator
npm run dev:android   # backend + Expo → auto-opens Android Emulator
npm run dev           # backend + Expo → scan QR code with Expo Go
```

Each command starts:

- Backend at `http://localhost:3001`
- Expo dev server (QR code printed for `npm run dev`; phone must be on the same WiFi)

> **Note:** Expo's interactive keyboard shortcuts (`i`, `a`, `r`) don't work under `concurrently` because keystrokes aren't forwarded. Use the platform-specific commands above, or run `npm run dev:backend` and `npm run dev:mobile` in separate terminals if you want the interactive menu.

### Networking

The mobile app derives your dev machine's IP from Expo (`Constants.expoConfig.hostUri`), so it works with iOS Simulator, Android Emulator, and Expo Go on the same WiFi without any configuration. Override via `EXPO_PUBLIC_API_URL` if your backend is hosted elsewhere.

---

## Environment Variables

### `backend/.env`

Copy `backend/.env.example` and fill in your keys.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `COMPANIES_HOUSE_API_KEY` | Yes (for registry data) | — | Get a free key at [developer.company-information.service.gov.uk](https://developer.company-information.service.gov.uk) |
| `COMPANIES_HOUSE_BASE_URL` | No | `https://api.company-information.service.gov.uk` | Set to `https://api-sandbox.company-information.service.gov.uk` for test/sandbox applications. Sandbox keys authenticate successfully but return limited data. |
| `OPENAI_API_KEY` | No | — | Enables LLM-assisted evidence interpretation. Enrichment works without it. |
| `OPENAI_MODEL` | No | `gpt-5.4-mini` | Override OpenAI model. |
| `ENRICHMENT_DEBUG_LOGGING` | No | `false` | Set to `true` to log Companies House and OpenAI payloads to the console. |
| `PORT` | No | `3001` | Backend server port. |

### `mobile/.env`

Copy `mobile/.env.example`. Both variables are optional.

| Variable | Default | Notes |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | auto-detected | Override if your backend is not on localhost. |
| `EXPO_PUBLIC_ENRICH_TIMEOUT_MS` | `10000` | Enrich request timeout in milliseconds. |

---

## Data Sources

The enrichment pipeline runs three sources in sequence, with each downstream source able to improve on the previous one:

### 1. Company website (always attempted)

The submitted website URL is fetched directly (`fetch`, 3.5 s timeout). The HTML is parsed for:

- Company name: `og:site_name` → `application-name` meta → `<title>` (generic parts stripped)
- Legal name: regex over page text for `Limited / Ltd / PLC / LLP` patterns
- Industry hint: `og:description` or `meta description`
- Visible text (up to 12 000 chars): passed to the optional LLM step

This gives low-to-medium-confidence data when the registry lookup fails or finds nothing useful.

### 2. OpenAI evidence interpreter (optional)

If `OPENAI_API_KEY` is set and the website fetch returned visible text, a structured prompt is sent to the OpenAI Responses API (`gpt-5.4-mini` by default) asking it to pick the most likely company name and industry from the scraped evidence. It uses the same evidence the human would read — it doesn't invent facts. The interpreted company name becomes the first search term passed to Companies House.

This step is strictly an **evidence interpreter**: the LLM cannot set high-confidence fields or overwrite registry data.

### 3. UK Companies House (when API key is present)

Search terms are tried in order until a match with score > 0 is found:

1. OpenAI-interpreted name (if available)
2. Legal names extracted from website HTML
3. Domain-derived term (e.g. `acme` from `acme.co.uk`)

A winning match fetches the full company profile (`GET /company/{number}`), populating name, registration number, company type, status, incorporation date, and registered address — all at high confidence when the match is exact.

**Why this ordering:** The website gives us human-readable evidence to find the right company. The registry gives us authoritative legal data. The LLM helps bridge the two when the domain alone is an ambiguous search term.

---

## Confidence Model

Every field in the response carries `sources`, `confidence`, and `reason` metadata under `enrichment.fields`.

| Confidence | Meaning |
|---|---|
| `high` | Exact Companies House registry match, or legal registry data |
| `medium` | Legal name in website HTML, or website title/meta corroborating a CH match |
| `low` | Domain-derived name, weak or partial CH match, raw meta description |

**Guardrail:** a weak CH partial match or LLM guess never overwrites legal fields. If there is no evidence linking the website/email domain to a Companies House candidate, registry fields are left empty rather than showing an unrelated company.

---

## API

### `POST /enrich`

**Request:**

```json
{ "email": "founder@acme.co.uk", "website": "acme.co.uk" }
```

**Response:**

```json
{
  "input": {
    "email": "founder@acme.co.uk",
    "website": "https://acme.co.uk",
    "domain": "acme.co.uk"
  },
  "company": {
    "name": "ACME LIMITED",
    "registrationNumber": "12345678",
    "status": "active",
    "incorporationDate": "2019-03-15",
    "companyType": "ltd",
    "industry": "Technology / Software",
    "registeredAddress": {
      "line1": "123 Main Street",
      "city": "London",
      "postalCode": "EC1A 1BB",
      "country": "United Kingdom"
    }
  },
  "enrichment": {
    "sources": ["Company Website", "Companies House"],
    "fields": {
      "name": {
        "sources": ["Companies House"],
        "confidence": "high",
        "reason": "Exact Companies House name match for normalized website domain."
      },
      "industry": {
        "sources": ["Company Website"],
        "confidence": "medium",
        "reason": "Interpreted from website meta description by OpenAI."
      }
    },
    "warnings": []
  }
}
```

Fields not populated are omitted from `company`. Each field present in `enrichment.fields` has its own `sources`, `confidence`, and `reason`.

**Validation errors (400):** missing/blank email or website, invalid email format, invalid URL.

**All other failures return 200** with partial data and `enrichment.warnings` strings. Examples: Companies House key missing, source unavailable, no match found, ambiguous candidates, personal email domain, email/website domain mismatch, website fetch timeout.

### `GET /health`

Returns `{ "status": "ok" }`.

---

## Mobile Architecture & Trade-offs

### Navigation: state machine, no navigation library

The three steps are a string union (`"input" | "review" | "confirm"`) driven by React state in `App.tsx`, with custom horizontal slide animations (`Animated.timing`, 300 ms). No `expo-router` or `@react-navigation/native` is used.

**Why:** For a linear three-step wizard with no deep-linking or conditional branching, a navigation library adds boilerplate without much benefit. The custom slide is straightforward and keeps the whole flow in one file. If the flow grew to five or more screens, or if back-gesture integration or deep links were required, I'd add `expo-router` — and I'd want to reason about that trade-off in the follow-up conversation.

### Persistence: `expo-sqlite/kv-store`

State is persisted via the key-value store bundled with `expo-sqlite` (`Storage` from `expo-sqlite/kv-store`). The persisted shape is versioned (`version: 1`) and includes step, email, website, enrichment result, edited company data, and saved flag.

On mount the app loads persisted state before showing anything (`hasRestoredState` gate), then saves after every meaningful state change via a chained promise ref to avoid write races. Corrupt or incomplete stored data is discarded rather than crashing.

**Why `expo-sqlite/kv-store` over AsyncStorage:**
- Already in the Expo SDK; no extra native dependency to configure
- Synchronous-style API over SQLite; more predictable than AsyncStorage's older implementation
- For a wizard holding a JSON blob of ~1 KB, the performance difference over MMKV is irrelevant

**When I'd change it:**
- **MMKV** (`react-native-mmkv`): if the persisted payload grew large or writes became a bottleneck (unlikely here)
- **SecureStore** (`expo-secure-store`): if the stored data were sensitive — PII, tokens, or credentials. Company name and registration number are not typically sensitive enough to require encrypted storage, but if email address storage raised a compliance concern I'd move it there.

### Keyboard handling

`KeyboardAvoidingView` with `behavior="padding"` on iOS wraps each step's `ScrollView`. `keyboardDismissMode` is `"interactive"` on iOS and `"on-drag"` on Android. `keyboardShouldPersistTaps="handled"` on scroll views so taps on buttons work while the keyboard is up.

### Safe areas

`SafeAreaProvider` + `useSafeAreaInsets()` throughout. The fixed blur header accounts for `insets.top`; scroll content has `paddingBottom: insets.bottom + 40`. The blur header is implemented with `expo-blur` `BlurView`.

### Tap targets and scroll

All buttons have `minHeight: 54`. The header back button is 44 × 44 with `hitSlop={8}`. The review step scrolls to the first validation error using `measureLayout` on field refs. The date picker on the incorporation date field uses `@react-native-community/datetimepicker` — inline on Android, modal sheet on iOS with Cancel/Done.

### Loading, cancel, and error states

Step 1 shows a spinner and "Checking details…" while enrichment runs. An `AbortController` lets the user cancel mid-request. Errors from the backend (`error` field), network failures, and timeouts each produce a distinct human-readable message shown in the form.

### Save is mocked

The confirm step simulates a 350 ms save delay. In a real app this would `POST` to a `/companies` endpoint. The `TODO (candidate)` comment in `App.tsx` marks the spot.

### Offline behavior

Enrichment requires a network connection; the app shows a timeout or network error if the backend is unreachable. State restoration on relaunch is fully local — the user can resume step 2 and edit fields without a connection, then submit when back online.

---

## Project Structure

```
.
├── package.json                       # Root scripts: dev, install:all, typecheck, test
├── shared/
│   └── src/
│       └── enrichment.d.ts            # Shared request/response TypeScript contract
├── backend/
│   └── src/
│       ├── index.ts                   # Express app, /health, mounts /enrich
│       ├── routes/
│       │   ├── enrich.ts              # POST /enrich orchestration
│       │   └── enrich.test.ts         # Integration tests (node:test)
│       └── enrichment/
│           ├── companiesHouse.ts      # Companies House API client + match scoring
│           ├── domain.ts              # URL normalization + email/domain warnings
│           ├── openaiInterpreter.ts   # Optional OpenAI evidence interpreter
│           ├── response.ts            # Response builder + setField helper
│           ├── website.ts             # Website fetch + HTML parsing
│           └── debugLogger.ts        # Optional debug logging
└── mobile/
    ├── App.tsx                        # 3-step wizard state machine + animations
    ├── src/
    │   ├── api.ts                     # Backend client + Expo IP auto-detection
    │   ├── company.ts                 # Field get/set helpers, formatSources
    │   ├── persistence.ts             # Save/load via expo-sqlite kv-store
    │   ├── reviewFields.ts            # Review step field definitions
    │   ├── styles.ts                  # Design tokens + StyleSheet
    │   ├── types.ts                   # Re-exports from shared/src/enrichment.d.ts
    │   ├── validation.ts              # Email/website client-side validation
    │   └── components/
    │       ├── AppTextInput.tsx       # Focus-styled TextInput wrapper
    │       ├── ConfidenceIndicator.tsx # High/medium/low confidence pill
    │       ├── ConfirmStep.tsx        # Step 3: read-only summary + success
    │       ├── InputStep.tsx          # Step 1: email + website form
    │       ├── ReviewField.tsx        # Single editable field + date picker
    │       └── ReviewStep.tsx         # Step 2: full review/edit list
    ├── app.json
    └── .env.example
```

---

## Testing

```bash
npm run typecheck          # tsc --noEmit for backend + mobile
cd backend && npm test     # builds backend, runs 14 integration tests via node:test
```

Backend tests mock the Companies House HTTP calls and cover: validation errors, website normalization, website-only fallback, full Companies House field mapping, missing API key, CH 401 fallback, sandbox base URL configuration, no-match partial responses, and OpenAI flow.

---

## What I'd Improve With More Time

- **Real save endpoint** — wire `POST /companies` and remove the mock delay
- **Email deep-link callback** — magic link flow with `expo-linking`, app scheme, and a backend token endpoint
- **Retry on bad domain** — when the website is unreachable or returns no useful data, offer the user a prompt to correct the URL and re-enrich before advancing to review
- **DNS/WHOIS as a third data source** — distinguish truly unregistered domains from temporarily unavailable sites and show a clearer warning
- **Navigation library** — add `expo-router` if the flow grows beyond three linear steps or needs URL-based deep linking
- **More backend tests** — the current suite mocks CH; adding an end-to-end test with a real sandbox key would catch auth and schema changes earlier
- **Asset files** — `app.json` references icon and splash images that are missing from the repo

---

## AI Tools Used

This was built with **Cursor** (agent mode) and **Claude** as the primary development environment. A `PLAN.md` working document was maintained throughout to track progress, design decisions, and remaining work — the agent updated it as each piece was completed.

AI helped with: scaffolding the enrichment pipeline, writing the `expo-sqlite` persistence layer, structuring the review field component, generating backend test stubs, and iterating on the confidence scoring logic.

All implementation decisions were reviewed and understood before accepting them. The follow-up conversation is the right place to go deeper on any of them.
