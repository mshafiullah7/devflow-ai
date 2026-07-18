// Built-in screen design templates, seeded into the DB on first mount
// (window.db.screenTemplates.seed) — see MockupsPage.mount().

export const SCREEN_TEMPLATES = [
  {
    group: 'Authentication',
    name: 'Login / Sign In',
    description: `Screen: Authentication Flow — Login, OTP, Register, Forgot Password
Platform: Mobile (Flutter) | Web
Purpose: Complete auth flow — sign in with email/password or phone OTP, register a new account, or reset a forgotten password.

─── Screen 1 — Login / Sign In ───────────────────────
- App branding: logo, app name, tagline
- Social sign-in options: Google, Apple, Phone
- Email field and password field, with a show/hide toggle for the password
- "Forgot password" link
- "Sign In" action to submit credentials
- Link to Sign Up for users without an account
Errors: incorrect email or password | account locked after 5 failed attempts (with retry wait time)

─── Screen 2 — OTP / Phone Verification ─────────────
Step 1 — Phone Entry:
- Country code selector + phone number input
- "Send OTP" action, disabled until a valid number is entered

Step 2 — OTP Entry:
- Show which number the code was sent to
- 6-digit code entry, auto-advancing between digits, supports paste
- "Resend OTP" action, disabled during a cooldown countdown
- "Verify & Login" action, disabled until all 6 digits are entered
- Option to go back and change the phone number
Errors: invalid or expired code

Step 3 — Success:
- Confirmation that login succeeded
- Action to continue to the Dashboard

─── Screen 3 — Register / Sign Up ───────────────────
- Fields: First Name, Last Name, Email, Password, Confirm Password
- Live password strength feedback (Weak / Fair / Strong)
- Requirements checklist: 8+ characters, uppercase letter, number
- Terms of Service / Privacy Policy acceptance checkbox (required)
- "Create Account" action, disabled until all fields are valid and terms are accepted
- Link back to Sign In
Errors: email already registered

─── Screen 4 — Forgot / Reset Password ──────────────
Step 1 — Email Entry:
- Email input for the registered account
- "Send Reset Link" action, disabled until a valid email is entered

Step 2 — Confirmation:
- Confirm a reset link was sent to the given email
- "Resend email" action (with cooldown) + link back to Sign In

Step 3 — Set New Password (via emailed link):
- New Password and Confirm Password fields
- Live password strength feedback + requirements checklist (same as Register)
- "Update Password" action, enabled once both fields match and meet the minimum strength
Errors: passwords do not match`,
  },
  {
    group: 'Authentication',
    name: 'Onboarding Carousel',
    description: `Screen: Onboarding Carousel / Welcome Tour
Platform: Mobile (Flutter) | Web
Purpose: First-run experience (shown once after install or signup) highlighting 3–4 key features before the user reaches the main app.

- Skip action, visible on all slides except the last
- 3–4 slides, each with an illustration, headline, and short body text
- Dot indicator showing current slide position
- "Back" (hidden on first slide) and "Next" actions to move between slides
- Swipe left/right to navigate between slides (mobile)
- Tap a dot to jump directly to that slide
- Last slide: "Next" becomes "Get Started"
- Skip or Get Started: mark onboarding complete, navigate to Home (or Login if not authenticated)
- Returning users who already completed onboarding skip straight past it`,
  },

  // ── Dashboard & Navigation ───────────────────────────────────────────────
  {
    group: 'Dashboard & Navigation',
    name: 'Home Dashboard',
    description: `Screen: Home Dashboard
Platform: Mobile (Flutter) | Web
Purpose: Central hub — primary summary stat, quick actions, scrollable content cards, and upcoming items. First screen after login.

- Header: menu icon, app name, notification bell with unread badge
- Primary stat with a trend indicator (e.g. up/down vs last period)
- Horizontal scrollable list of item cards ("Your [Items]") with a "View All" link, each card shows a progress/edit action
- Quick actions grid linking to key tools/screens
- Curated offers/promotions section (optional, horizontal scroll)
- Upcoming/recent items list with a primary action per row (e.g. "Pay Now")
- Bottom navigation bar
- Menu icon opens a navigation drawer: profile summary, grouped nav links, sign out
- Notification bell opens a panel: list grouped by recency, tap to mark read and navigate, "Mark all read"
- Tapping a card navigates to its Detail screen; "View All" navigates to the full list or opens a sheet with more items
Errors: failed to load a section — show retry
States: initial load, empty (no items yet), pull-to-refresh`,
  },
  {
    group: 'Dashboard & Navigation',
    name: 'Analytics Dashboard',
    description: `Screen: Analytics / Reports Dashboard
Platform: Web (Desktop) | Mobile (Flutter)
Purpose: View trends, KPI metrics, charts, and a filterable data table with export.

- Page header: title + date range picker + export action
- KPI metric cards row, each showing a value and trend vs previous period
- Two charts: a time-series trend chart and a category breakdown chart
- Filter bar above the table: search, category filter, date range chips
- Data table: sortable columns, row selection, bulk actions (delete/export/archive), pagination
- Date range picker: presets (Today, 7/30 days, custom range) — refreshes all sections
- Export: choose CSV/PDF/Excel, triggers a file download
- Row click navigates to that record's Detail screen
Errors: failed to load a section — show retry
States: loading (skeletons), empty (no data), filtered-empty (no results match filters)`,
  },
  {
    group: 'Dashboard & Navigation',
    name: 'List / Feed Screen',
    description: `Screen: List / Feed Screen
Platform: Mobile (Flutter) | Web
Purpose: Browsable, searchable, filterable list of records — the primary data-browsing screen.

- Header: title + filter icon (badge when filters active) + add action
- Search bar with live filtering and a clear action
- Filter chips row ("All" + category/status chips), tap to toggle
- Sort control (e.g. by date, amount, name)
- List grouped by date/category; each row shows an icon, title, subtitle, value/date, and status
- Swipe actions on a row (delete, archive) — mobile
- Long-press to enter multi-select mode with bulk actions
- Floating action button to add a new record
- Infinite scroll / pagination to load more results
- Pull-to-refresh (mobile)
- Tapping a row navigates to its Detail screen
Errors: network error loading the list — show retry
States: initial load, loading more, no results (search/filter), empty (no data yet)`,
  },
  {
    group: 'Dashboard & Navigation',
    name: 'Settings / Profile',
    description: `Screen: Settings / Profile Page
Platform: Mobile (Flutter) | Web
Purpose: User account management, app preferences, subscription status, and sign-out.

- Profile header: avatar, name, email, edit profile action
- Stats summary row (optional)
- Grouped settings rows: Account (profile, security, notifications), Preferences (dark mode, language, currency), Subscription (plan + upgrade), Support (help, feedback, legal)
- Sign out and delete account actions, separated at the bottom
- Edit Profile: update name, email, phone, avatar, save changes
- Security: change password, two-factor auth, active sessions
- Notifications: master toggle + per-category toggles, quiet hours
- Dark mode toggle applies immediately and persists
- Language/currency pickers apply immediately
- Sign out: confirm, clear session, navigate to Login
- Delete account: confirm by typing "DELETE", permanently removes account data
Errors: failed to save a setting — show retry`,
  },

  // ── Detail & Forms ───────────────────────────────────────────────────────
  {
    group: 'Detail & Forms',
    name: 'Detail / Item View',
    description: `Screen: Detail / Item View
Platform: Mobile (Flutter) | Web
Purpose: Complete information about a single record — hero summary, tabbed sections, contextual actions, related items.

- Header: back action, title, more-options menu
- Hero summary: primary value, status badge, key stat chips
- Tabs: Overview, History, Documents, Notes
- Overview: grouped detail rows (label + value)
- History: chronological activity list
- Documents: attachment list + upload action
- Notes: editable free-text notes, auto-saved
- Primary action bar (e.g. "Make Payment" / "Mark Complete") + secondary actions (share, download, edit, delete)
- Related/suggested items list at the bottom
- More-options menu: edit, share, duplicate, archive, delete
- Delete: confirm, remove record, navigate back to list, offer undo
Errors: failed to load — show retry
States: loading, overdue/completed status variants`,
  },
  {
    group: 'Detail & Forms',
    name: 'Multi-Step Form / Wizard',
    description: `Screen: Multi-Step Form / Wizard
Platform: Mobile (Flutter) | Web
Purpose: Guides users through a multi-part data-entry task, one step at a time, with a review step before submission.

- Step indicator showing progress and current step
- Each step: a focused group of related fields with validation
- Back/Next navigation; Next validates the current step before advancing
- Users can jump back to any completed step to edit
- Final step: read-only review of all entered data with per-section edit links, plus a confirm/terms checkbox
- Submit: validates terms accepted, shows a loading state, then success or error
- On success: confirmation with a summary and a link to the created record
Errors: field validation errors shown inline; submission failure shows a retry option`,
  },
  {
    group: 'Detail & Forms',
    name: 'Add / Edit Record Form',
    description: `Screen: Add / Edit Record (Single Page Form)
Platform: Mobile (Flutter) | Web
Purpose: Single-page form for creating or editing a record.

- Header: cancel/back action, title ("Add [Item]" / "Edit [Item]"), save action (disabled until form is dirty and valid)
- Form fields grouped logically (basic details, amounts/dates, additional info)
- Live-calculated read-only field where applicable (e.g. derived total)
- Date pickers, category/tag selectors, optional file attachment
- Edit mode: fields pre-filled with existing data; delete action available
- Save: validates required fields, shows loading state, then navigates on success or shows an error
- Cancel with unsaved changes: confirm before discarding
- Delete (edit mode): confirm, remove record, navigate back, offer undo
Errors: inline validation messages; save/delete failure shows a retry option`,
  },
  {
    group: 'Detail & Forms',
    name: 'Empty State',
    description: `Screen: Empty State
Platform: Mobile (Flutter) | Web
Purpose: Shown whenever a list, search, section, or screen has no content — guides the user to the right next action.

Variants:
- No data yet: illustration + headline + short explanation + primary "Add [Item]" action
- No search results: headline showing the query + "Clear Search" action + suggested searches
- No filter results: headline + "Clear All Filters" action + active filter chips (removable)
- Failed to load: headline + short error message + "Try Again" action + link back to Home
- Offline: headline + "Retry Connection" action; show cached data if available
- All done: celebratory headline + optional "View Summary" / "Add More" action
- Coming soon / locked: headline + "Upgrade" or "Notify Me" action`,
  },

  // ── Web / Desktop Specific ───────────────────────────────────────────────
  {
    group: 'Web / Desktop',
    name: 'Admin Sidebar Layout',
    description: `Screen: Admin / App with Sidebar Navigation
Platform: Web (Desktop) | Electron
Purpose: Structural shell for a desktop app — left sidebar, top bar, scrollable main content. All other desktop screens live inside this shell.

- Sidebar: logo, grouped nav links (with badges for counts/overdue/premium), collapse toggle, user info + logout at the bottom
- Top bar: breadcrumb, global search, notification bell, user avatar dropdown
- Main content: page title + primary action(s), then page-specific content
- Nav item click: sets active state, navigates, updates breadcrumb
- Sidebar collapses to an icon-only rail; state persists
- Global search opens a command-palette style search across the app
- Notification bell opens a panel; user avatar opens account menu (profile, billing, sign out)
- Narrow viewport: sidebar becomes a slide-in drawer`,
  },
  {
    group: 'Web / Desktop',
    name: 'Landing / Marketing Page',
    description: `Screen: Landing / Marketing Page
Platform: Web (Desktop + Mobile responsive)
Purpose: Public-facing page introducing the product and driving sign-ups.

- Nav bar: logo, links (Features, Pricing, etc.), Sign In + Get Started actions
- Hero: headline, subheadline, primary + secondary CTA, product screenshot/visual
- Features section: grid of feature cards (icon, title, short description)
- How it works: numbered steps
- Social proof: stats band and/or testimonials
- Pricing: plan cards with feature comparison and a monthly/annual toggle
- FAQ accordion (optional)
- Final CTA banner
- Footer: links, social icons, legal
- Sign In navigates to Login; Get Started navigates to Sign Up
- Nav links smooth-scroll to their section`,
  },
  {
    group: 'Web / Desktop',
    name: 'Modal / Dialog Workflow',
    description: `Screen: Modal / Dialog Workflow
Platform: Web (Desktop) | Mobile (Bottom Sheet)
Purpose: Focused overlay for confirmations, short forms, pickers, and detail previews without leaving the current page.

- Confirmation dialog: icon, headline, short description, Cancel + Confirm actions — used for destructive actions (delete, sign out)
- Form modal: a few fields with inline validation, Cancel + Save actions
- Picker/selector: searchable list with single- or multi-select, Cancel + Select actions
- Detail preview drawer: condensed record summary with a link to the full Detail screen
- Closes on: Cancel, Confirm/Save success, ESC key, or backdrop click (except destructive dialogs, which require an explicit choice)
- Desktop uses a centered modal; mobile uses a bottom sheet
Errors: action failure shows an inline error and keeps the modal open`,
  },

  // ── Flutter & Android ────────────────────────────────────────────────────
  {
    group: 'Flutter & Android',
    name: 'Home Dashboard (Material)',
    description: `Screen: Home Dashboard — debt/finance tracker
Platform: Flutter (Material 3) | Android (Material)
Purpose: Central hub showing total debt, a breakdown of assets vs liabilities, active loans, quick actions, partner offers, and upcoming payments. First screen after login.

- AppBar: menu icon, app name, notification bell with unread badge
- Primary stat: total debt remaining, with a trend indicator and a paid-percentage indicator
- Wealth breakdown: assets vs liabilities bar + net worth summary
- "Your Loans" horizontal scroll list of loan cards, each showing balance and % paid
- Quick actions grid linking to calculators/tools, with a "Go Premium" entry
- Bank offers horizontal scroll list, each with a "Know More" action
- Upcoming payments list with a "Pay Now" action per row
- Bottom navigation bar
- Menu icon opens a navigation drawer: profile summary, mini stats, grouped nav links, sign out
- Notification bell opens a panel grouped by day, tap to mark read and navigate
- "View All" on upcoming payments opens a bottom sheet with the full grouped list and a "Pay All Overdue" action
- Add expense via a bottom sheet: amount, category, note, date
Errors: failed to load a section — show retry
Note: colours, typography, and shape come from the project's active Style Guide — this template defines layout and behaviour only.`,
  },
];
