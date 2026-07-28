// Built-in screen design templates, seeded into the DB on first mount
// (window.db.screenTemplates.seed) — see MockupsPage.mount().
//
// Grouped by target platform (Web vs Mobile) rather than by feature area —
// the "New Screen" dropdown groups strictly by `group`, so Web and Mobile
// stay in separate optgroups instead of mixing platforms together.
//
// Login / Sign In and Home Dashboard are the two fully-detailed reference
// templates per platform (full flows, states, error cases). The remaining
// templates are intentionally lighter — they call out their own structure
// but defer to the reference template's layout/component conventions for
// visual consistency, instead of re-deriving full interaction detail for
// every screen.

export const SCREEN_TEMPLATES = [
  // ══════════════════════════════════════════════════════════════════════
  // WEB
  // ══════════════════════════════════════════════════════════════════════
  {
    group: 'Web',
    name: 'Login / Sign In (Web)',
    description: `Screen: Authentication Flow — Login, Register, Forgot Password
Platform: Web (Desktop)
Purpose: Complete auth flow for a desktop web app — centered card layout, no swipe/gesture affordances.

─── Screen 1 — Login / Sign In ───────────────────────
- Centered card: logo, app name, tagline
- Social sign-in options: Google, Microsoft, SSO
- Email field and password field, with a show/hide toggle for the password
- "Remember me" checkbox + "Forgot password" link
- "Sign In" action to submit credentials
- Link to Sign Up for users without an account
Errors: incorrect email or password | account locked after 5 failed attempts (with retry wait time)

─── Screen 2 — Register / Sign Up ───────────────────
- Fields: First Name, Last Name, Email, Password, Confirm Password
- Live password strength feedback (Weak / Fair / Strong)
- Requirements checklist: 8+ characters, uppercase letter, number
- Terms of Service / Privacy Policy acceptance checkbox (required)
- "Create Account" action, disabled until all fields are valid and terms are accepted
- Link back to Sign In
Errors: email already registered

─── Screen 3 — Forgot / Reset Password ──────────────
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
    group: 'Web',
    name: 'Home Dashboard (Web)',
    description: `Screen: Home Dashboard
Platform: Web (Desktop)
Purpose: Central hub inside the app shell — KPI summary, quick actions, and scannable content sections. First screen after login.

- Sits inside the Admin Sidebar Layout shell (sidebar nav + top bar) — see the "Admin Sidebar Layout" template for the surrounding chrome
- Page header: title + date range or quick filter + primary action
- KPI stat cards row, each with a value and trend indicator vs previous period
- Two-column layout: main content (recent items table/list, activity feed) + side panel (quick actions, notifications summary, upcoming items)
- Quick actions grid or button row linking to key tools/screens
- Recent/upcoming items list with a primary action per row (e.g. "View", "Approve")
- Row/card click navigates to that record's Detail screen
- Notification bell (top bar) opens a panel: list grouped by recency, tap to mark read and navigate, "Mark all read"
Errors: failed to load a section — show retry
States: initial load (skeletons), empty (no data yet), refreshing`,
  },
  {
    group: 'Web',
    name: 'Analytics Dashboard',
    description: `Screen: Analytics / Reports Dashboard
Platform: Web (Desktop)
Purpose: View trends, KPI metrics, charts, and a filterable data table with export.
Style: follows the same page-shell and card conventions as "Home Dashboard (Web)" — this template layers trend charts and a data table on top of that shell.

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
    group: 'Web',
    name: 'List / Table View',
    description: `Screen: List / Table View
Platform: Web (Desktop)
Purpose: Browsable, searchable, filterable data table — the primary data-browsing screen on web.
Style: follows the same page-shell conventions as "Home Dashboard (Web)".

- Header: title + primary "add" action
- Search bar with live filtering + filter chips row ("All" + category/status), tap to toggle
- Sortable table columns; header click toggles sort direction
- Row selection checkboxes + bulk action bar (delete/export/archive) when rows are selected
- Row shows: icon/avatar, title, status badge, key value, date
- Row click navigates to its Detail screen; row-level overflow menu for quick actions
- Pagination or "load more" at the bottom
Errors: network error loading the list — show retry
States: initial load, no results (search/filter), empty (no data yet)`,
  },
  {
    group: 'Web',
    name: 'Detail / Record View',
    description: `Screen: Detail / Record View
Platform: Web (Desktop)
Purpose: Complete information about a single record inside the app shell — hero summary, tabbed sections, contextual actions.
Style: follows the same page-shell conventions as "Home Dashboard (Web)".

- Header: breadcrumb back to the list, title, more-options menu
- Hero summary: primary value, status badge, key stat chips
- Tabs: Overview, History, Documents, Notes
- Overview: grouped detail rows (label + value) in a two-column layout
- History: chronological activity list
- Documents: attachment list + upload action
- Notes: editable free-text notes, auto-saved
- Primary action bar (e.g. "Approve" / "Mark Complete") + secondary actions (share, download, edit, delete)
- Related/suggested items list in a side panel
- Delete: confirm, remove record, navigate back to list, offer undo
Errors: failed to load — show retry
States: loading, overdue/completed status variants`,
  },
  {
    group: 'Web',
    name: 'Settings / Profile (Web)',
    description: `Screen: Settings / Profile Page
Platform: Web (Desktop)
Purpose: User account management, app preferences, subscription status, and sign-out.
Style: two-column settings layout — a left-hand section list, right-hand detail panel — inside the Admin Sidebar shell.

- Left nav list: Account, Security, Notifications, Preferences, Subscription, Support
- Right panel shows the selected section's fields
- Account: avatar, name, email, phone, edit + save
- Security: change password, two-factor auth, active sessions (with "revoke" per session)
- Notifications: master toggle + per-category toggles, quiet hours
- Preferences: dark mode toggle (applies immediately), language, currency
- Subscription: current plan + usage, upgrade/downgrade action
- Sign out and delete account actions at the bottom of Account
- Delete account: confirm by typing "DELETE", permanently removes account data
Errors: failed to save a setting — show retry`,
  },
  {
    group: 'Web',
    name: 'Multi-Step Form / Wizard (Web)',
    description: `Screen: Multi-Step Form / Wizard
Platform: Web (Desktop)
Purpose: Guides users through a multi-part data-entry task, one step at a time, with a review step before submission.
Style: centered card with a horizontal step bar across the top (rather than the dot-indicator mobile pattern).

- Horizontal step bar showing all steps, current step highlighted, completed steps checked
- Each step: a focused group of related fields with validation, in a centered card
- Back/Next navigation; Next validates the current step before advancing
- Users can click any completed step in the bar to jump back and edit
- Final step: read-only review of all entered data with per-section edit links, plus a confirm/terms checkbox
- Submit: validates terms accepted, shows a loading state, then success or error
- On success: confirmation with a summary and a link to the created record
Errors: field validation errors shown inline; submission failure shows a retry option`,
  },
  {
    group: 'Web',
    name: 'Add / Edit Record Form (Web)',
    description: `Screen: Add / Edit Record (Single Page Form)
Platform: Web (Desktop)
Purpose: Single-page form for creating or editing a record, inside the app shell or as a centered modal for short forms.

- Header: cancel/back action, title ("Add [Item]" / "Edit [Item]"), save action (disabled until form is dirty and valid)
- Form fields grouped logically in a two-column layout (basic details, amounts/dates, additional info)
- Live-calculated read-only field where applicable (e.g. derived total)
- Date pickers, category/tag selectors, optional file attachment (drag-and-drop)
- Edit mode: fields pre-filled with existing data; delete action available
- Save: validates required fields, shows loading state, then navigates on success or shows an error
- Cancel with unsaved changes: confirm before discarding
- Delete (edit mode): confirm, remove record, navigate back, offer undo
Errors: inline validation messages; save/delete failure shows a retry option`,
  },
  {
    group: 'Web',
    name: 'Empty State (Web)',
    description: `Screen: Empty State
Platform: Web (Desktop)
Purpose: Shown whenever a list, table, section, or page has no content — guides the user to the right next action.

Variants:
- No data yet: illustration + headline + short explanation + primary "Add [Item]" action
- No search results: headline showing the query + "Clear Search" action + suggested searches
- No filter results: headline + "Clear All Filters" action + active filter chips (removable)
- Failed to load: headline + short error message + "Try Again" action + link back to Home
- Offline: headline + "Retry Connection" action; show cached data if available
- All done: celebratory headline + optional "View Summary" / "Add More" action
- Coming soon / locked: headline + "Upgrade" or "Contact Sales" action`,
  },
  {
    group: 'Web',
    name: 'Admin Sidebar Layout',
    description: `Screen: Admin / App with Sidebar Navigation
Platform: Web (Desktop) | Electron
Purpose: Structural shell for a desktop app — left sidebar, top bar, scrollable main content. All other Web screens live inside this shell.

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
    group: 'Web',
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

  // ══════════════════════════════════════════════════════════════════════
  // MOBILE
  // ══════════════════════════════════════════════════════════════════════
  {
    group: 'Mobile',
    name: 'Login / Sign In',
    description: `Screen: Authentication Flow — Login, OTP, Register, Forgot Password
Platform: Mobile (Flutter) | Android
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
    group: 'Mobile',
    name: 'Onboarding Carousel',
    description: `Screen: Onboarding Carousel / Welcome Tour
Platform: Mobile (Flutter) | Android
Purpose: First-run experience (shown once after install or signup) highlighting 3–4 key features before the user reaches the main app.

- Skip action, visible on all slides except the last
- 3–4 slides, each with an illustration, headline, and short body text
- Dot indicator showing current slide position
- "Back" (hidden on first slide) and "Next" actions to move between slides
- Swipe left/right to navigate between slides
- Tap a dot to jump directly to that slide
- Last slide: "Next" becomes "Get Started"
- Skip or Get Started: mark onboarding complete, navigate to Home (or Login if not authenticated)
- Returning users who already completed onboarding skip straight past it`,
  },
  {
    group: 'Mobile',
    name: 'Home Dashboard',
    description: `Screen: Home Dashboard
Platform: Mobile (Flutter) | Android
Purpose: Central hub — primary summary stat, quick actions, scrollable content cards, and upcoming items. First screen after login.

- Header: menu icon, app name, notification bell with unread badge
- Primary stat with a trend indicator (e.g. up/down vs last period)
- Horizontal scrollable list of item cards ("Your [Items]") with a "View All" link, each card shows a progress/edit action
- Quick actions grid linking to key tools/screens (e.g. a "Go Premium" entry)
- Curated offers/promotions horizontal scroll section, each with a "Know More" action (optional)
- Upcoming/recent items list with a primary action per row (e.g. "Pay Now")
- Bottom navigation bar
- Menu icon opens a navigation drawer: profile summary, mini stats, grouped nav links, sign out
- Notification bell opens a panel grouped by recency, tap to mark read and navigate, "Mark all read"
- Tapping a card navigates to its Detail screen; "View All" opens a bottom sheet with the full grouped list and a bulk primary action (e.g. "Pay All Overdue")
- Adding a new item is available via a bottom sheet: key fields, note, date
Errors: failed to load a section — show retry
States: initial load, empty (no items yet), pull-to-refresh`,
  },
  {
    group: 'Mobile',
    name: 'List / Feed Screen',
    description: `Screen: List / Feed Screen
Platform: Mobile (Flutter) | Android
Purpose: Browsable, searchable, filterable list of records — the primary data-browsing screen.
Style: follows the same header/card conventions as "Home Dashboard".

- Header: title + filter icon (badge when filters active) + add action
- Search bar with live filtering and a clear action
- Filter chips row ("All" + category/status chips), tap to toggle
- Sort control (e.g. by date, amount, name)
- List grouped by date/category; each row shows an icon, title, subtitle, value/date, and status
- Swipe actions on a row (delete, archive)
- Long-press to enter multi-select mode with bulk actions
- Floating action button to add a new record
- Infinite scroll to load more results
- Pull-to-refresh
- Tapping a row navigates to its Detail screen
Errors: network error loading the list — show retry
States: initial load, loading more, no results (search/filter), empty (no data yet)`,
  },
  {
    group: 'Mobile',
    name: 'Detail / Item View',
    description: `Screen: Detail / Item View
Platform: Mobile (Flutter) | Android
Purpose: Complete information about a single record — hero summary, tabbed sections, contextual actions, related items.
Style: follows the same header/card conventions as "Home Dashboard".

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
    group: 'Mobile',
    name: 'Settings / Profile',
    description: `Screen: Settings / Profile Page
Platform: Mobile (Flutter) | Android
Purpose: User account management, app preferences, subscription status, and sign-out.

- Profile header: avatar, name, email, edit profile action
- Stats summary row (optional)
- Grouped settings rows, stacked vertically: Account (profile, security, notifications), Preferences (dark mode, language, currency), Subscription (plan + upgrade), Support (help, feedback, legal)
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
  {
    group: 'Mobile',
    name: 'Multi-Step Form / Wizard',
    description: `Screen: Multi-Step Form / Wizard
Platform: Mobile (Flutter) | Android
Purpose: Guides users through a multi-part data-entry task, one step at a time, with a review step before submission.

- Step indicator (dots or "Step X of N") showing progress and current step
- Each step: a focused group of related fields with validation, full-screen
- Back/Next navigation; Next validates the current step before advancing
- Users can jump back to any completed step to edit
- Final step: read-only review of all entered data with per-section edit links, plus a confirm/terms checkbox
- Submit: validates terms accepted, shows a loading state, then success or error
- On success: confirmation with a summary and a link to the created record
Errors: field validation errors shown inline; submission failure shows a retry option`,
  },
  {
    group: 'Mobile',
    name: 'Add / Edit Record Form',
    description: `Screen: Add / Edit Record (Single Page Form)
Platform: Mobile (Flutter) | Android
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
    group: 'Mobile',
    name: 'Empty State',
    description: `Screen: Empty State
Platform: Mobile (Flutter) | Android
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
];

// Built-ins that existed in a previous version of this file and have since
// been removed/merged. Passed to window.db.screenTemplates.seed() alongside
// SCREEN_TEMPLATES so the seed handler can retire the corresponding DB rows
// instead of leaving them behind as orphaned entries in the template picker.
export const DEPRECATED_TEMPLATE_NAMES = [
  'Home Dashboard (Material)', // merged into Mobile "Home Dashboard"
  'Modal / Dialog Workflow',   // overlay/component pattern, not a full screen
];
