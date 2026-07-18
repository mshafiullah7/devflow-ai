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
Purpose: First-run experience (shown once after install or signup) to highlight 3–4 key features before the user reaches the main app.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Full-screen layout, no header bar:
1. Skip button: top-right corner, text-only ("Skip"), muted color — visible on all slides except last
2. Slide area (full height minus bottom nav):
   - Illustration zone: large SVG or Lottie animation (centered, 40–50% of screen height)
   - Slide headline: bold 24–28px, tight leading, centered, 1–2 lines
   - Slide body text: 15–16px, muted color, centered, 2–3 lines max
3. Dot indicator row: centered, horizontal, below body text
   - Each dot: 8px circle; active dot: 22px wide pill (accent color); inactive: muted border
4. Bottom navigation row:
   - Left: "← Back" text button (hidden on Slide 1, visible on Slides 2+)
   - Right: "Next →" primary pill button (accent color)
   - On last slide only: "Next" becomes "Get Started" (full-width or expanded right button)

Example slides (adapt to app purpose):
- Slide 1 — illustration: dashboard icon; "Track Everything in One Place"; "All your data, organized and accessible."
- Slide 2 — illustration: bell/calendar icon; "Never Miss a Deadline"; "Smart reminders keep you on schedule."
- Slide 3 — illustration: chart/rocket icon; "Achieve Your Goals Faster"; "AI-powered insights guide every decision."
- Slide 4 (optional) — illustration: shield/lock icon; "Your Data is Safe"; "End-to-end encryption and biometric lock."

━━ INTERACTIONS & FLOWS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Slide navigation:
- Tap "Next →": animate slide transition (horizontal slide-left or cross-fade, 300ms); advance dot; show Back button if on Slide 2+
- Tap "← Back": animate slide-right; retreat dot; hide Back button on Slide 1
- Swipe left (mobile gesture): same as "Next" — advance one slide
- Swipe right (mobile gesture): same as "Back" — retreat one slide
- Tap dot directly: jump to that slide immediately (instant or with transition)
- Tap "Skip" (any slide): mark onboarding as complete in local storage; navigate directly to Home Dashboard (or Login if not yet authenticated)
- Tap "Get Started" (last slide): same as Skip — mark complete + navigate

Auto-advance (optional):
- If enabled: slides auto-advance every 4 seconds unless user interacts
- Interaction (tap/swipe) pauses auto-advance until inactivity > 3s
- Pause auto-advance when screen is not in focus

Returning user guard:
- On app launch, check localStorage/AsyncStorage flag: "onboarding_complete"
- If true: skip onboarding, go directly to Login or Dashboard
- If false: show onboarding (always show for first run)

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Slide 1: Skip visible, Back hidden, Next visible
Slide 2–(N-1): Skip visible, Back visible, Next visible
Last slide: Skip hidden, Back visible, Next → "Get Started"
Transition: sliding/fading animation; dot updates synchronously

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Full-bleed background: white, gradient, or per-slide accent tint
- Illustrations: SVG preferred (scalable, themeable); use app's accent color as primary fill
- Slide body font: 15–16px, line-height 1.6, max-width 280px centered
- Bottom safe-area inset padding on mobile (env(safe-area-inset-bottom))
- Dot active state transitions: width animation 200ms ease
- "Get Started" button: same pill style as primary auth buttons, accent gradient`,
  },

  // ── Dashboard & Navigation ───────────────────────────────────────────────
  {
    group: 'Dashboard & Navigation',
    name: 'Home Dashboard',
    description: `Screen: Home Dashboard
Platform: Mobile (Flutter) | Web
Purpose: The central hub of the app — shows the primary summary stat, trend, quick actions, scrollable content cards, and upcoming items. First screen seen after login.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Hero Header (gradient background, extends to status bar):
   - Row: [Hamburger menu] — [App Name centered] — [Notification bell + unread badge]
   - Primary KPI stat: 48–56px extrabold (e.g. ₹1,42,500 or 24 Tasks)
   - Stat label above: 10px small-caps muted (e.g. "TOTAL DEBT REMAINING")
   - Trend pill below stat: accent bg, icon + "3% decrease vs last month"
   - Progress indicator: small donut SVG (right) + "28% Paid" label
2. Breakdown card (frosted glass / white/10 inside header):
   - Horizontal bar: two colored segments (primary + warning)
   - Three columns: [Label + value + %] | divider | [Label + value + %] | [Net/Total value]
3. Horizontal scroll card section ("Your [Items]"):
   - Section header row: title (left) + "View All" link (right, accent color)
   - Snap-scroll row of cards (220px each, gap 12px, no scrollbar):
     - Each card: icon in colored circle, title, subtitle (type + rate), balance, progress bar + % paid, edit ✎ button
4. Quick Actions grid (3 columns):
   - Section header: "Quick Actions"
   - 5–6 buttons: each = icon circle (colored bg) + short label below; hover fills circle
5. Curated offers / promotions (horizontal scroll):
   - Section header + "View All" link
   - Cards 260px wide, gradient background (per-brand color): bank logo, offer type, rate headline, highlights chips, "Know More →" CTA
6. Upcoming/recent list:
   - Section header + item count subtitle + "View All" link
   - 3 list rows in a rounded card: icon, title, status badge, due date, amount, "Pay Now" / action link
   - Dividers between rows
7. Bottom Navigation Bar: 4–5 tabs, active tab has accent icon + label

━━ FLOW: HAMBURGER MENU (NAV DRAWER) ━━━━━━━━━━━━━━━
Tap hamburger:
→ Backdrop fades in (rgba dark, blur); Drawer slides in from left (80% width, max 320px)
→ Drawer: glassmorphism (dark bg + blur + saturate); green border right; deep shadow
→ Drawer contents top to bottom:
  - Close (×) button top-right
  - User avatar (circular, 48px), name (extrabold), email (accent color), online dot
  - Mini stats row: 2 tiles (Total Debt, Active Loans) in dark rounded cards
  - Nav groups with labels (MAIN, FREE TOOLS, PREMIUM, ACCOUNT):
    - Each item: icon + label + optional badge (count in green / overdue in red / PRO in amber)
    - Active item: highlighted background + accent color
  - Bottom: app version number
Tap nav item:
→ Close drawer + backdrop; navigate to corresponding screen
→ Active item stays highlighted until navigation
Tap backdrop:
→ Drawer slides back out left; backdrop fades out

━━ FLOW: NOTIFICATION PANEL ━━━━━━━━━━━━━━━━━━━━━━━━
Tap notification bell:
→ Backdrop fades in; notification panel slides in from right (88% width, max 375px)
→ Panel header: "Notifications" title + unread count badge + "Mark all read" link + close button
→ Scrollable list grouped by time period (Today, Yesterday, This Week):
  - Each notification: colored icon (per type), title, description, timestamp, unread dot (top-right)
  - Unread styling: colored bg (red/orange/violet tint) + border; Read: neutral white/card bg
  - Notification types: Overdue alert (red), Due soon (orange), AI Insight (violet), Progress (green), Added (blue)
Tap a notification:
→ Mark it as read (remove unread dot, reset bg to neutral)
→ Navigate to the relevant screen (e.g. overdue → Payments; insight → AI Advisor)
→ Unread badge count on bell decrements
Tap "Mark all read":
→ All notifications marked read; badge count → 0; badge hidden
Tap backdrop or close button:
→ Panel slides out right; backdrop fades

━━ FLOW: CARD ACTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap a scroll card (loan/item card):
→ Navigate to that item's Detail screen
Tap edit ✎ icon on card:
→ event.stopPropagation(); open Add/Edit form pre-filled with that item's data
Tap "View All" (cards section):
→ Navigate to full List screen for that category
Tap Quick Action button:
→ Navigate to corresponding screen (EMI Calculator, Net Worth, Payoff Planner, AI Advisor, Premium)
Tap offer card / "Know More →":
→ Navigate to Bank Offers detail screen with that offer pre-selected
Tap "View All" (offers):
→ Navigate to Bank Offers list screen
Tap "Pay Now" on upcoming list row:
→ Open payment flow screen or payment bottom sheet for that item
Tap "View All" (upcoming):
→ Navigate to Payments screen OR open a bottom sheet with full payment list

━━ FLOW: PAYMENTS BOTTOM SHEET ━━━━━━━━━━━━━━━━━━━━━
Tap "View All" (upcoming payments):
→ Backdrop fades in (black/50 + blur); sheet slides up from bottom
→ Sheet: rounded top corners (24px); drag handle pill at top; max-height 85dvh
→ Header: title "All Payments" + count/total + close button
→ Scrollable grouped list: Overdue (red), Due Soon (orange), Upcoming (green)
  - Each row: colored icon, title, date description, amount, "Pay Now" colored button
  - "Overdue" rows show days-late count
  - "+ N more" load-more button at end
→ Sticky footer: "Pay All Overdue (₹XX,XXX)" accent button
Drag handle downward (or tap backdrop):
→ Sheet slides back down; backdrop fades

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Initial load: skeleton loaders in all card and list sections while data fetches
Pull-to-refresh (mobile): spinner at top; reload all data; update stats
Empty state (no items): show empty state card with "Add your first [item]" CTA
Notification bell: red dot pulses when unread count > 0; badge shows count
Error loading: "Failed to load. Tap to retry" in each section

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Header gradient: #1b6b40 → #236e47 → #2d8a57 (diagonal)
- Glow blobs: absolute div, white/15, blur-3xl, pointer-events-none (top-right + bottom-left)
- Card dark: #1a2e22 | Card light: #f8faf8 | Primary: #13EC5B
- Bottom nav: fixed, backdrop-blur, border-top, active tab accent icon + label
- Scroll cards: overflow-x auto, no-scrollbar class (WebKit + Firefox), snap-x mandatory`,
  },
  {
    group: 'Dashboard & Navigation',
    name: 'Analytics Dashboard',
    description: `Screen: Analytics / Reports Dashboard
Platform: Web (Desktop) | Mobile (Flutter)
Purpose: Data-heavy screen for viewing trends, KPI metrics, charts, and a filterable data table with export capability.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(Desktop: sidebar left + main content right; Mobile: single-column scroll)
1. Page header row:
   - Title "Analytics" (bold, 20px) + subtitle "Track your key metrics"
   - Right: Date range picker button ("Last 30 days ▾") + "Export ▾" dropdown button
2. KPI metric cards row (4 equal-width cards):
   - Each card: icon (in colored circle, 36px), metric label (12px muted), primary value (24px extrabold), trend row: ↑/↓ icon + % change + "vs last period" (green if positive, red if negative)
3. Charts section (2-column grid on desktop, stacked on mobile):
   - Left chart: Line chart with area fill — time series (x: dates, y: value); grid lines; hover tooltip showing exact value + date; legend below
   - Right chart: Bar chart OR Donut chart — category breakdown; legend with color squares + labels + values; hover highlight on segment/bar
   - Each chart has: card container, title row, period subtitle, chart canvas area
4. Filter bar (above table):
   - Search input (left): live-filters table rows as user types; clear × button
   - Category dropdown: "All Categories ▾" → filter table
   - Date chips: All | Today | This Week | This Month | Custom Range (active chip = filled accent)
5. Data table:
   - Column headers: checkbox (select all) | Name | Category | Date | Amount | Status | Actions; click header → sort toggle (↑↓ icon)
   - Rows (8–10 visible): checkbox | icon/avatar + name | category chip | date | amount (bold) | status badge | ⋯ action icon
   - Row hover: subtle background highlight
   - Row checkbox: select individual row (highlights row in accent tint)
   - Bulk action bar (appears when rows selected): "X selected" + Delete, Export, Archive buttons
6. Pagination footer: "Showing 1–10 of 84" | Rows per page: [10 ▾] | ← Prev | Page 1 of 9 | Next →

━━ FLOW: DATE RANGE PICKER ━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Last 30 days ▾":
→ Dropdown popover (below button): preset options list:
  Today | Yesterday | Last 7 Days | Last 30 Days ✓ | This Month | Last 3 Months | Custom Range
→ Tap preset: close popover; refresh all KPI cards + charts + table with new date range; show loading spinner in each section
→ Tap "Custom Range": open calendar date range picker (dual-month calendar); user picks start and end date; "Apply" button closes and refreshes; "Cancel" closes without change
→ Button label updates to reflect selected range: "Oct 1 – Oct 30"

━━ FLOW: EXPORT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Export ▾":
→ Dropdown: Export as CSV | Export as PDF | Export as Excel (.xlsx)
→ Tap option: loading state on button; generate/download file
→ Success: browser download starts + toast "Report downloaded as analytics_oct.csv"
→ Failure: toast "Export failed. Try again."

━━ FLOW: CHARTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Hover on line chart:
→ Vertical crosshair line appears at cursor position
→ Tooltip appears: date, value, optional comparison period value
→ Data point dot enlarges (8px → 12px) with white border

Hover on bar chart bar:
→ Hovered bar lightens or gains border; others dim slightly
→ Tooltip: category name + value + percentage of total

Hover on donut segment:
→ Segment pulls outward 4px (explode effect)
→ Center label updates to show hovered segment value

Click legend item:
→ Toggle that data series on/off (strikethrough in legend, hide from chart)

━━ FLOW: TABLE INTERACTIONS ━━━━━━━━━━━━━━━━━━━━━━━━
Search (live filter):
- oninput (debounced 250ms): filter rows by name/category/description
- No matches: show empty row "No results for '[query]'" with Clear button

Column sort:
- Click column header: sort ascending (↑); click again: descending (↓); click again: reset
- Only one column sorted at a time; sorted column header has accent color

Row checkbox:
- Select row: check + row gets accent tint background
- Select all: check all rows on current page
- Bulk actions bar slides in from top of table (fixed inside table container)

Row action icon (⋯):
- Click → dropdown: View Details | Edit | Download Receipt | Delete
- "Delete": confirmation tooltip or mini confirm dialog inline (not full modal)

Row click (anywhere except checkbox/action):
→ Navigate to that record's Detail screen

Pagination:
- Rows per page: change → reload table with new page size, reset to page 1
- Prev/Next: load adjacent page; button disabled at first/last page

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Loading: skeleton cards (KPIs), pulsing chart placeholders (grey rectangles), skeleton table rows
Error: "Failed to load analytics. Retry" with retry button in each section
Empty (no data): empty chart (axes with "No data" label), empty table state
Filtered empty: "No results match your filters" + Clear Filters button

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- KPI cards: rounded-xl, border, subtle shadow; trend up = green, trend down = red
- Chart library suggestion: Chart.js, Recharts (React), or fl_chart (Flutter)
- Table: border-collapse, 1px dividers, hover row bg rgba(accent, 0.04)
- Status badges: pill-shaped, color-coded: green (completed/active), orange (pending), red (overdue), grey (cancelled)
- Filter chips: border + muted bg inactive; accent bg + white text active`,
  },
  {
    group: 'Dashboard & Navigation',
    name: 'List / Feed Screen',
    description: `Screen: List / Feed Screen
Platform: Mobile (Flutter) | Web
Purpose: Browsable, searchable, filterable list of records — the primary data-browsing screen. Supports search, multi-filter, grouping, swipe actions, and infinite scroll.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Header (sticky):
   - Left: back chevron or hamburger menu icon
   - Center: screen title (e.g. "My Loans", "Transactions", "Tasks")
   - Right: filter icon (with badge if active filters > 0) + optional "+" add button
2. Search bar (sticky, below header):
   - Full-width input, search icon prefix (left), clear × button (right, visible when typing)
   - Placeholder: "Search [items]…"
3. Filter chips row (horizontal scroll, sticky, below search):
   - All (default active) | Category A | Category B | Status: Active | Status: Archived
   - Active chip: filled accent bg + white text; inactive: outlined border + muted text
   - Long-press or filter icon → advanced filter bottom sheet
4. Sort bar (optional, collapsible):
   - "Sort by: Date ▾" | "Sort by: Amount ▾" | "Sort by: Name ▾" toggle
5. List content (scrollable):
   - Group headers: date label or category name (small-caps, accent color, sticky on scroll)
   - Each row inside a rounded card or in a divider-separated list:
     - Left: colored icon (40px circle) based on category
     - Center: title (bold 14px), subtitle/meta (muted 12px, 1 line)
     - Right: value or date (bold), status badge (pill), chevron ›
6. Empty state (when 0 results): centered icon + headline + body + CTA (see Empty State template)
7. FAB: bottom-right fixed, 56px circle, accent color, + icon, shadow-xl
8. Bottom Navigation Bar: same as dashboard (Home | [this screen] active | Profile)

━━ FLOW: SEARCH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap search bar:
→ Keyboard opens; search bar expands full width; "Cancel" text button appears right
Type query (debounced 250ms):
→ List filters in real time — rows that don't match fade out / are removed
→ Matching text in results gets highlighted (bold or accent color)
→ Group headers collapse if all rows in group are filtered out
Clear query (tap ×):
→ Clear input; restore full list; hide × button
Tap Cancel:
→ Clear input, dismiss keyboard, restore full list, hide Cancel button
No results:
→ Show: search icon (large, muted), "No results for '[query]'" headline, "Try different keywords" subtitle, "Clear Search" outlined button

━━ FLOW: FILTER CHIPS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap an inactive chip:
→ Chip fills with accent color; list filters to show only matching items; active filter count badge on filter icon (header right) increments
Tap an active chip:
→ Chip deselects (returns to outlined); filter removed; list updates
Tap "All":
→ Deselect all other chips; show full list; active filter badge removed
Multiple chips active simultaneously:
→ AND logic (show items matching all active filters) OR OR logic (show items matching any) — specify in requirements

Advanced filter (filter icon or long-press chip):
→ Bottom sheet slides up: grouped filter options (checkboxes per group), date range row, amount range slider, "Apply Filters" button (accent), "Reset" text link
→ Apply: close sheet; update chip row to reflect active filters; reload list
→ Reset: clear all; show full list

━━ FLOW: SORT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap sort label "Sort by: Date ▾":
→ Inline dropdown or bottom sheet: list of sort options with current selected (checkmark)
  Newest first ✓ | Oldest first | Amount: High to Low | Amount: Low to High | Name: A–Z
→ Tap option: close; resort list with animation; sort label updates

━━ FLOW: LIST ROW INTERACTIONS ━━━━━━━━━━━━━━━━━━━━━
Tap row:
→ Navigate to Detail screen for that item (slide transition left)
Long-press row (mobile):
→ Row enters selection mode: checkbox appears; tap other rows to multi-select
→ Bottom bar appears: selected count + bulk actions (Delete, Archive, Export)
Swipe left on row (mobile):
→ Reveal red "Delete" action (with trash icon, 80px wide)
→ Tap Delete: confirmation mini-dialog inline; confirm → row slides out with animation → list updates
Swipe right on row (mobile):
→ Reveal blue "Archive" action (with archive icon, 80px wide)
→ Tap Archive: row slides out; moved to archived section; undo toast "Archived [item]. Undo" (5s)
Edit icon on row:
→ Navigate to Add/Edit form pre-filled with that item's data
FAB tap:
→ Navigate to Add Record form (new/empty) or open Add Record bottom sheet

━━ FLOW: INFINITE SCROLL / PAGINATION ━━━━━━━━━━━━━━
Scroll to bottom of list:
→ Show loading spinner row at bottom
→ Load next page of results; append rows to list
→ All loaded: hide spinner; show "— End of list —" muted divider
Pull to refresh (drag down from top on mobile):
→ Refresh indicator appears; reload first page; merge/replace list; success: brief "Updated" toast

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Initial load: skeleton rows (animated shimmer, 8 rows)
Loading more: spinner at bottom of list
No data (first time): Empty State Variant A (with add CTA)
No search results: Empty State Variant B
Network error: toast + "Retry" option inline in list area
Multi-select mode: checkboxes visible; bulk action bar at bottom; normal FAB hidden

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- List variant A: rows inside a single rounded card container with 1px dividers
- List variant B: individual card per row with gap-2 spacing (card list)
- Group header: 10px, small-caps, accent/muted color, bg-surface, sticky top-[header+search+filter height]
- Status badge colors: green = active/paid, orange = pending/due, red = overdue/failed, grey = archived
- FAB: position:fixed; bottom: 80px (above nav bar); right: 16px; z-index: 30`,
  },
  {
    group: 'Dashboard & Navigation',
    name: 'Settings / Profile',
    description: `Screen: Settings / Profile Page
Platform: Mobile (Flutter) | Web
Purpose: Central screen for user account management, app preferences, subscription status, and sign-out.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Profile header (gradient or colored top section):
   - Avatar: 72px circle, ring border (accent color 2px), online/active status dot (green, bottom-right)
   - User name: 20px extrabold
   - Username/email: 13px, accent color
   - "Edit Profile" button (outlined small pill, right of or below name) OR pencil icon (top-right)
2. Stats mini-row (2–4 rounded tile cards, horizontal):
   - E.g. "5 Active Loans", "₹1,42,500 Debt", "28 Days Streak", "Member since Jan 2024"
3. Grouped settings rows (each group in a rounded card, groups separated by gap):
   Group — Account: Profile & Info | Security & Password | Connected Accounts | Notifications
   Group — Preferences: Dark Mode (toggle) | Language | Currency | Date Format
   Group — Subscription: Current Plan (badge: FREE/PRO) + "Upgrade →" | Billing & Receipts | Refer a Friend
   Group — Support: Help Center | Send Feedback | Rate the App | Privacy Policy | Terms of Service
4. Danger zone (separate card, below all groups):
   - "Sign Out" row: red icon, red label
   - "Delete Account" row: red icon, red label, "Permanent" muted sub-label
5. Footer: "App Name v1.2.0" centered, muted, 11px

━━ FLOW: EDIT PROFILE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Edit Profile" button or pencil icon:
→ Navigate to Edit Profile screen OR open Edit Profile bottom sheet:
  - Avatar row: current avatar + "Change Photo" text button
    - Tap "Change Photo" → action sheet: "Take Photo" | "Choose from Gallery" | "Remove Photo"
    - Camera: open camera; capture; crop to circle; preview; confirm
    - Gallery: open image picker; select image; crop to circle; preview; confirm
    - Remove: replace avatar with initials (first + last name initials in colored circle)
  - Name fields: First Name, Last Name (pre-filled)
  - Email: pre-filled, with "Verified ✓" or "Verify" badge
  - Phone: pre-filled, editable, with "Verified ✓" badge
  - Bio / short description textarea (optional, 140 char limit with counter)
  - "Save Changes" button (accent, enabled when any field changed)
  - On save: loading → success toast "Profile updated" → dismiss/navigate back

━━ FLOW: SECURITY & PASSWORD ━━━━━━━━━━━━━━━━━━━━━━━
Tap "Security & Password":
→ Navigate to Security screen:
  - Change Password row → Change Password screen:
    - Current Password, New Password (strength indicator), Confirm Password
    - "Update Password" button; success → toast + re-login prompt if needed
  - Two-Factor Authentication row → toggle or setup flow
  - Active Sessions row → list of logged-in devices with "Revoke" per session
  - Login History row → chronological list of recent sign-ins (device, location, time)

━━ FLOW: NOTIFICATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Notifications":
→ Navigate to Notification Preferences screen:
  - Master toggle "Enable Notifications" (if off, all below greyed)
  - Per-category toggles: Payment Reminders | Overdue Alerts | AI Insights | Weekly Summary | Promotional
  - Per-channel toggles (where applicable): Push | Email | SMS
  - "Quiet Hours": time range picker (from/to) — no notifications during this window
  - Save: auto-save on toggle change; toast "Settings saved"

━━ FLOW: DARK MODE TOGGLE ━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap Dark Mode row toggle:
→ Immediate theme switch (no page reload); CSS custom properties update on <html data-theme>
→ Persist to localStorage: key "theme", value "dark" | "light"
→ Toggle state saved; on next app open, apply saved theme before first render (prevent flash)

━━ FLOW: LANGUAGE / CURRENCY ━━━━━━━━━━━━━━━━━━━━━━━
Tap Language → Bottom sheet / modal picker:
- Search bar, scrollable list of languages (flag + language name + native name)
- Current language has checkmark; tap another → select + apply immediately (UI re-renders in new language)
Tap Currency → Similar picker: currency code + symbol + country; affects all monetary display

━━ FLOW: SUBSCRIPTION / UPGRADE ━━━━━━━━━━━━━━━━━━━━
Current Plan row shows: plan name + badge (FREE: grey pill | PRO: amber gradient pill)
Tap row or "Upgrade →":
→ Navigate to Premium / Paywall screen (see landing page template for paywall design)
PRO users: row shows "Pro Plan — Active ✓" + expiry date; tap → Billing screen

━━ FLOW: SIGN OUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Sign Out":
→ Confirmation dialog (not full modal — simple centered overlay):
  - "Sign out of [App Name]?" heading
  - "[User Name] — [email]" sub-label (confirms which account)
  - "Sign Out" red button + "Cancel" secondary button
→ Confirm:
  - Clear auth tokens from secure storage
  - Clear any cached user data
  - Navigate to Login screen (replace navigation stack so back press doesn't return to app)
  - Show toast on Login screen: "You've been signed out"

━━ FLOW: DELETE ACCOUNT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Delete Account":
→ Warning dialog:
  - Red warning icon + "Delete your account?" heading
  - "This will permanently delete all your data. This cannot be undone."
  - Text field: type "DELETE" to confirm (button remains disabled until exact text entered)
  - "Permanently Delete" danger button + "Cancel"
→ Confirm:
  - Loading state "Deleting account…"
  - API call to delete all user data
  - Success: navigate to Login; toast "Account deleted. Sorry to see you go."
  - Failure: "Deletion failed. Contact support." with support email link

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Avatar loading: placeholder initials circle while image loads
Settings rows: right side shows current value (e.g. "English", "INR ₹") in muted text before chevron
Toggle saved: immediate visual change; subtle "Saved" micro-feedback (checkmark flash)
Network error: toast "Failed to save settings. Check connection." + retry

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Row height: 52px minimum (comfortable touch target)
- Each group card: rounded-xl, border, bg-card, gap between groups (not dividers)
- Chevron icon: right side of every navigable row; no chevron on toggle rows
- Toggle: custom pill switch, accent color when on, border-muted when off
- Stats tiles: dark rounded cards (bg black/25 on dark mode) with extrabold value + muted label`,
  },

  // ── Detail & Forms ───────────────────────────────────────────────────────
  {
    group: 'Detail & Forms',
    name: 'Detail / Item View',
    description: `Screen: Detail / Item View
Platform: Mobile (Flutter) | Web
Purpose: Displays complete information about a single record (loan, product, task, transaction). Includes a hero summary, tabbed detail sections, contextual actions, and related items.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Hero Header (gradient, same palette as home dashboard):
   - Top bar: [← Back] — [Item Title centered] — [⋯ More menu]
   - Primary value (48px extrabold): e.g. ₹24,000 remaining balance
   - Supporting label (10px muted small-caps): e.g. "OUTSTANDING BALANCE"
   - Status badge: e.g. "Active", "Overdue", "Completed" (color-coded pill)
   - Mini progress bar: thin, accent fill, rounded (shows % paid/complete)
   - Stat chips row (4 chips, horizontal scroll): e.g. Rate 4.5% | Tenure 36mo | Next Due Oct 5 | Type: Car
2. Tab Bar (sticky, below header, white/surface bg):
   - Tabs: Overview | History | Documents | Notes
   - Active tab: accent bottom border (2px) + accent text; inactive: muted text
3. Tab Panel — Overview (default):
   - Detail rows card: full-width rows, label left (muted 12px) + value right (bold 14px)
   - Group 1 "Loan Details": Lender, Principal, Interest Rate, Tenure, EMI Amount
   - Group 2 "Progress": Paid so far, Remaining, Total Interest Payable, Savings if paid early
   - Each group in its own rounded card with title header
4. Tab Panel — History:
   - Chronological payment/activity list, grouped by month (sticky month header)
   - Each entry: status icon (circle), description, date, amount delta (green + / red -)
   - "Load older history" link at bottom
5. Tab Panel — Documents:
   - Attachment cards: file type icon, filename, size, date added, download icon
   - "Upload Document" outlined button at top
6. Tab Panel — Notes:
   - Free-text note area (editable inline or via edit button)
   - Auto-save indicator: "Saved" or "Saving…" micro-text top-right
7. Sticky Bottom Action Bar (above device bottom):
   - Primary: full-width accent button ("Make Payment" / "Mark Complete" / etc.)
   - Secondary icon buttons row below (or inline right of primary on wide screens): Share | Download | Edit | Delete
8. Related / Suggested items:
   - Below main content (inside scroll): 2–3 horizontal cards or vertical list rows of related records

━━ FLOW: MORE MENU (⋯) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap ⋯ (top-right):
→ Dropdown menu (below button, 180px wide, rounded card, shadow):
  - Edit — navigate to Add/Edit form pre-filled
  - Share — open native share sheet (link or summary text)
  - Duplicate — create copy of record; navigate to new item's detail
  - Archive / Unarchive — toggle; toast confirmation
  - Delete — opens confirmation dialog (see below)
  - Close — dismiss menu

━━ FLOW: TABS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap inactive tab:
→ Tab underline/fill transitions to new tab (200ms); content panel fades in (150ms)
→ URL hash updates (#overview, #history, etc.) if web — enables direct linking
→ Scroll position resets to top of new tab content
Swipe left/right on content area (mobile):
→ Same as tapping next/previous tab (gesture navigation between tabs)

━━ FLOW: MAKE PAYMENT (PRIMARY ACTION) ━━━━━━━━━━━━━
Tap "Make Payment":
→ Open payment bottom sheet or navigate to Payment screen:
  - Pre-filled amount (next EMI amount)
  - User can edit amount (partial or extra payment)
  - Payment method selector: bank account (last 4 digits) | UPI | Card
  - "Pay ₹X,XXX" confirm button
  - On success: bottom sheet closes; hero balance updates; progress bar animates; payment appears in History tab; success toast "Payment of ₹X,XXX recorded"
  - On failure: error state in sheet; "Try Again" button

━━ FLOW: SHARE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap Share icon:
→ Generate shareable summary (text format): item name, current status, key stats
→ Open native OS share sheet (WhatsApp, Email, Copy Link, etc.)
→ "Copy Link" option copies deep-link URL to clipboard; toast "Link copied"

━━ FLOW: DOWNLOAD ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap Download icon:
→ Dropdown or action sheet: "Export as PDF" | "Export as CSV"
→ Generate file in background; loading indicator on button
→ Success: trigger file download (browser) or save to Files (mobile); toast "Statement saved"

━━ FLOW: DELETE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Via ⋯ menu → Delete:
→ Confirmation dialog:
  - Warning icon + "Delete [Item Name]?" heading
  - "This will permanently remove this record and all associated history."
  - "Delete Permanently" danger button + "Cancel"
→ Confirm: loading; API delete; navigate back to list; toast "Deleted. Undo" (5s undo window)
→ Tap Undo: restore record; navigate back to detail; toast "Restored"

━━ FLOW: UPLOAD DOCUMENT (Documents tab) ━━━━━━━━━━
Tap "Upload Document":
→ File picker (or action sheet: Camera | Gallery | Files)
→ Selected file preview: icon + filename + size
→ "Upload" button → progress indicator → success: file appears in Documents list
→ Tap existing file's download icon: download/open the file

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Initial load: hero skeleton (bar, chips), tab skeleton (detail rows)
Data loaded: animate values in (count-up animation on large numbers optional)
Payment processing: primary button loading; stat values freeze
Overdue state: status badge red; primary button "Pay Overdue Amount"; stat chips show overdue styling
Completed/closed: status badge green; primary button "View Summary" or "Archive"; progress bar 100%

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Hero same gradient as Home Dashboard header (visual continuity)
- Tab bar: white bg, border-bottom, position:sticky, top = [safe area + header height]
- Detail rows: alternating very subtle bg (even rows: transparent, odd: surface-alt/3%) OR simple 1px dividers
- Stat chips: small pill shapes, border + bg-white/10, muted text, horizontal scroll (no wrap)
- Bottom action bar: fixed, backdrop-blur, border-top, padding = safe-area-inset-bottom`,
  },
  {
    group: 'Detail & Forms',
    name: 'Multi-Step Form / Wizard',
    description: `Screen: Multi-Step Form / Wizard
Platform: Mobile (Flutter) | Web
Purpose: Guides users through a multi-part data-entry task, one focused step at a time, with validation before advancing and a review step before final submission.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step Indicator (sticky top, always visible):
- Numbered step circles connected by progress lines
- Completed step: filled green circle + checkmark icon
- Current step: filled accent circle + number; step label below circle (bold)
- Future step: outlined muted circle + number; step label muted
- Progress line between circles: grey, fills accent color as steps complete
- Subtitle below indicator: "Step 2 of 4 — Details"

Step Panel (single visible at a time):
Step 1 — Basic Info:
- Section title (20px bold) + helper text (muted 13px)
- Name / Title input field (required)
- Type selector: segmented control (2–3 options) or dropdown
- Category chip row: tap to select (single-select); chips scroll horizontally if many

Step 2 — Financial / Numeric Details:
- Amount input: large (28px), centered or left-aligned; currency prefix (₹/$)
- Interest Rate input: number + "%" suffix; keyboard type=decimal
- Tenure input: number + unit (months/years) selector inline
- Calculated field (read-only): "Estimated EMI: ₹X,XXX" — updates live as user types above fields
- Start Date picker: text input opens calendar popover on tap
- End / Due Date picker: same pattern, validates end > start

Step 3 — Additional Info (Optional):
- Notes textarea (3–4 rows, resize handle on desktop): placeholder "Add any relevant notes…"
- Tags input: type a tag + press Enter or comma to add; each tag = removable chip
- Toggle group: optional feature flags (e.g. "Auto-reminders", "Track Interest")
- File upload zone: dashed rounded border, upload icon, "Drop files here or tap to upload"
  - Accepted: PDF, JPG, PNG; max 5MB per file; max 3 files
  - Uploaded file: thumbnail/icon + filename + size + × remove button

Step 4 — Review:
- Read-only summary card for each previous step:
  - Group header with step name + "Edit" accent link (right)
  - Key-value rows: label muted (left), value bold (right)
- Terms & Conditions checkbox: "I confirm the above information is accurate" (required)
- "Submit" button (disabled until checkbox checked)

Footer Navigation (persistent, above device bottom):
- Left: "← Back" secondary button (hidden on Step 1; shown Step 2+)
- Right: "Next →" primary pill button (Step 1–3) OR "Submit" primary pill (Step 4)
- Both buttons disabled with loading spinner during validation/submission

━━ FLOW: STEP NAVIGATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Next →":
1. Validate all required fields on current step:
   - Empty required fields: red border + "This field is required" below each
   - Invalid format: specific message (e.g. "Rate must be between 0 and 100")
   - End date before start date: "End date must be after start date"
2. If validation fails: scroll to first error field; show field errors; do NOT advance
3. If validation passes:
   - Animate step panel: current slides out left, next slides in from right (300ms ease)
   - Step indicator updates: current step dot fills/checks, next step activates
   - Scroll to top of new step
   - Auto-focus first input field of new step

Tap "← Back":
- No validation; animate: current slides out right, previous slides in from left
- Previous step data preserved (form state maintained throughout session)

Click a completed step circle in indicator:
- Jump back to that step; current step data is saved (not discarded)
- User can review/edit previous steps freely
- Future steps: clicking future (incomplete) steps is disabled / no-op

━━ FLOW: LIVE CALCULATED FIELDS (Step 2) ━━━━━━━━━━
As user types Principal Amount, Rate, Tenure:
→ EMI = P × r(1+r)^n / ((1+r)^n - 1) calculated in JS
→ "Estimated EMI: ₹X,XXX" field updates within 100ms
→ Also show: Total Interest = (EMI × n) - P and Total Payable = P + Total Interest (optional rows)
If any required field is empty: show "— —" placeholder in calculated field

━━ FLOW: FILE UPLOAD (Step 3) ━━━━━━━━━━━━━━━━━━━━━━
Tap upload zone or drop file:
→ File picker opens; user selects file
→ Client-side validation: check type (PDF/JPG/PNG) and size (≤5MB)
  - Invalid type: "Only PDF, JPG, PNG files are allowed"
  - Too large: "File exceeds 5MB limit"
→ Valid: show upload progress bar in file preview card
→ Uploaded: replace progress bar with filename + size + × button; thumbnail for images
→ Tap × on uploaded file: remove file; restore upload zone if below max files
→ Max 3 files: hide/disable upload zone when 3 files added

━━ FLOW: REVIEW & SUBMIT (Step 4) ━━━━━━━━━━━━━━━━━━
Tap "Edit" next to a section:
→ Navigate back to that specific step (same left-slide animation)
→ After editing, user must click Next through subsequent steps OR "Return to Review" shortcut button appears in footer

Tap Submit:
→ Terms checkbox must be checked (Submit disabled if unchecked)
→ Button: loading spinner + "Submitting…" + disabled
→ API: POST /items (all step data in one payload)
→ Success:
  - Animate to Success state: step indicator fills all steps (green)
  - Large success icon (animated pop-in) + "Created successfully!" heading
  - Summary of key values in muted text
  - "View [Item]" primary button → navigate to Detail screen
  - "Add Another" secondary button → reset form to Step 1
→ Failure:
  - Error banner below Submit: "Failed to save. [specific reason if available]."
  - "Try Again" button; form data preserved

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step pristine: no errors shown; Next enabled only after required fields filled
Step touched + invalid: errors shown; Next disabled
Step valid: Next button active (accent, not greyed)
Submitting: all inputs locked; footer buttons loading
Success: full-screen success state (replaces form)
Network error during submit: error banner; retry button; form data intact

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Step transition: CSS transform translate + opacity, 300ms ease
- Calculated field: italic, muted bg, border-dashed, no focus ring (not editable)
- File upload zone: border-2 border-dashed border-border, bg-surface, rounded-xl, min-h-24
- Upload progress: thin accent-colored bar below filename in preview card
- Terms checkbox: custom styled checkbox with accent color; required = submit stays greyed`,
  },
  {
    group: 'Detail & Forms',
    name: 'Add / Edit Record Form',
    description: `Screen: Add / Edit Record (Single Page Form)
Platform: Mobile (Flutter) | Web
Purpose: Full single-page form for creating a new record or editing an existing one. All fields on one scrollable page — simpler than a multi-step wizard, better for records with a small/medium field count.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Header (sticky):
   - Left: "Cancel" text button (discards changes) or ← Back chevron
   - Center: "Add [Item]" or "Edit [Item]" title
   - Right: "Save" text button (accent color, bold; disabled until form dirty)
2. Primary Value block (top of scrollable content):
   - Large amount/value input centered: currency symbol (₹) + number field (28–32px font)
   - Numeric keyboard hint (inputmode="decimal")
   - Optional: "Calculated from fields below ↓" hint text if auto-computed
3. Form field groups (labeled sections in rounded cards or with group title + dividers):

   Group — Basic Details (always visible):
   - Item name: text input, required, placeholder "e.g. Home Loan, iPhone EMI"
   - Type: segmented control (2–3 options) OR dropdown for more options
   - Category: horizontal chip row (scrollable), single-select; tap to toggle

   Group — Amounts & Rates:
   - Principal / Total amount (if not set at top)
   - Interest Rate (%): number input + "% per annum" suffix label
   - Tenure: number + unit segmented toggle [Months | Years]
   - Live calculated row: "Monthly EMI: ₹X,XXX" (updates in real time, read-only)

   Group — Dates:
   - Start Date: calendar picker input; opens date picker popover/modal on tap
   - End Date / Due Date: same; validates end > start
   - Frequency: dropdown (Monthly / Quarterly / Annually / Custom)

   Group — Additional Info (collapsible if too many fields):
   - Notes textarea: 3 rows, auto-grows, 500 char limit with counter "0/500"
   - Tags: chip input (type + Enter to add; × to remove each tag)
   - Linked account: searchable dropdown of existing accounts (select or "Add new")
   - Attachment button: "📎 Add Attachment" inline row; tap → file picker

4. Danger zone (edit mode only, at bottom of scroll):
   - "Delete [Item]" text in red, with trash icon; separated by gap from form groups

5. Sticky footer action bar:
   - Edit mode: [Delete] danger text left | [Save Changes] primary pill right
   - Add mode: [Cancel] secondary left | [Save] primary pill right

━━ FLOW: FORM INITIALIZATION ━━━━━━━━━━━━━━━━━━━━━━━
Add mode:
→ All fields empty/default; Save button disabled; cursor auto-focuses Item Name input

Edit mode:
→ All fields pre-populated with existing record data; form state = "pristine"
→ Save button disabled (no changes yet)
→ User modifies any field → form state = "dirty" → Save button enables

━━ FLOW: LIVE CALCULATIONS ━━━━━━━━━━━━━━━━━━━━━━━━━
As user edits Principal, Rate, or Tenure:
→ Real-time EMI calculation (standard formula); result updates ≤100ms
→ If any required input is missing/invalid: show "—" in calculated row
→ Calculated row visually distinct: italic text, lighter bg, no focus ring

━━ FLOW: DATE PICKER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap date input:
→ Calendar popover appears (below input on desktop; bottom sheet on mobile)
→ Calendar: month/year header with ← → navigation; selectable dates; today highlighted; past/future restrictions if applicable
→ Tap date: field fills (formatted: "15 Oct 2025"); calendar closes
→ Clear button inside input: clears date, re-shows placeholder

━━ FLOW: CATEGORY CHIP SELECTOR ━━━━━━━━━━━━━━━━━━━
All chips shown unselected (outlined) by default
Tap a chip:
→ Chip fills with accent bg + white text; previously selected chip deselects
→ "None selected" validation: shows error on Save attempt if required

━━ FLOW: TAGS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap tags input field → keyboard opens
Type tag text → press Enter or comma → tag added as chip with × button
Tap × on tag chip → remove tag
Maximum 10 tags; after 10: hide input, show "Max tags reached" hint

━━ FLOW: ATTACHMENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Add Attachment":
→ Action sheet: "Camera" | "Photo Library" | "Files / Documents"
→ Selected file: show preview card (icon + name + size + × remove)
→ Max 3 attachments; disable button when max reached
→ Tap × on attachment: remove immediately (no confirmation)

━━ FLOW: SAVE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Save" / "Save Changes":
1. Validate all fields:
   - Required empty → red border + "Required" below field; scroll to first error
   - Invalid format → specific error message
2. If valid:
   → Button: loading spinner + "Saving…" + disabled; all inputs locked
   → API: POST (add) or PATCH (edit)
   → Success:
     - Add mode: navigate to new record's Detail screen; toast "Created successfully"
     - Edit mode: navigate back; toast "Changes saved"
   → Failure: unlock inputs; error banner at top of form "Failed to save. [Reason]. Try again."

━━ FLOW: CANCEL / DISCARD ━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap Cancel (pristine form, no changes): dismiss immediately, no dialog
Tap Cancel (dirty form, changes made):
→ Confirmation dialog: "Discard changes?" | "Discard" danger button + "Keep Editing"
→ Discard: navigate back without saving; all changes lost

━━ FLOW: DELETE (edit mode only) ━━━━━━━━━━━━━━━━━━━
Tap "Delete [Item]":
→ Confirmation dialog: "Delete [Item Name]? This cannot be undone."
→ Confirm: loading → API delete → navigate to list → toast "Deleted. Undo" (5s)

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pristine: Save disabled (greyed); no validation shown
Dirty + valid: Save enabled (accent)
Dirty + invalid: Save disabled; errors visible on touched fields
Saving: inputs locked; Save shows spinner
Success: navigate away (form unmounted)
Network error: form re-enabled; error banner shown

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Group cards: rounded-xl, border, bg-card, padding-4, gap-3 between groups
- Field labels: 10–11px, font-weight:600, uppercase, letter-spacing:0.08em, muted color
- Error text: 11px, red-400, shown below field with a small × icon prefix
- Calculated row: bg-surface-alt, border-dashed, italic text, cursor:default
- Sticky footer: fixed bottom; padding = max(16px, env(safe-area-inset-bottom)); border-top`,
  },
  {
    group: 'Detail & Forms',
    name: 'Empty State',
    description: `Screen: Empty State Screen
Platform: Mobile (Flutter) | Web
Purpose: Shown whenever a list, search, section, or entire screen has no content to display. Guides users toward the correct next action rather than showing a blank screen.

━━ VARIANTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Variant A — First Time / No Data (default):
  Layout: vertical, centered in available space
  1. Illustration (SVG, 180–220px, colored with app accent palette)
  2. Headline: "No [items] yet" (bold, 20px)
  3. Body: 1–2 sentences explaining what this section is for and its value
  4. Primary CTA button: "+ Add [Item]" (accent pill, full-width max 280px)
  5. Secondary link (optional): "Learn how it works →" (muted, opens help content)

▸ Variant B — No Search Results:
  1. Magnify / search icon illustration (muted color)
  2. Headline: "No results for '[query]'" (show actual query in quotes)
  3. Body: "Try different keywords, check spelling, or remove filters"
  4. "Clear Search" outlined button
  5. "Try these instead:" suggestion chip row (recent searches or popular categories)
  6. Tap suggestion chip: fills search bar with that term + triggers search

▸ Variant C — No Filter Results:
  1. Filter / funnel icon illustration
  2. Headline: "No items match your filters"
  3. Body: "Try removing some filters to see more results"
  4. "Clear All Filters" accent button
  5. Show which filters are active (chips below button, each has × to remove individually)

▸ Variant D — Error / Failed to Load:
  1. Broken link or warning illustration (orange/red tint)
  2. Headline: "Couldn't load [content]"
  3. Body: brief friendly message ("Check your connection or try again")
  4. "Try Again" primary button → triggers reload with loading state
  5. "Go Home" text link → navigate to Dashboard
  6. Technical error code (small, muted, collapsible): "Error 503" or similar — for debugging

▸ Variant E — Connection Lost / Offline:
  1. No-wifi / cloud-offline illustration
  2. Headline: "You're offline"
  3. Body: "Connect to the internet to continue"
  4. "Retry Connection" primary button → check connectivity; if restored, reload data
  5. Show any cached data below with "Showing cached data" banner at top

▸ Variant F — All Done / Completed:
  1. Checkmark / trophy / celebration illustration (animated: Lottie or CSS keyframes)
  2. Headline: "All caught up!" or "All done!"
  3. Celebratory body: "Nothing left to do here." or "You've cleared everything."
  4. Optional CTA: "View Summary" or "Add More" button
  5. Optional confetti animation (brief, 2–3 seconds)

▸ Variant G — Coming Soon / Feature Locked:
  1. Lock or construction illustration
  2. Headline: "Coming Soon" or "Premium Feature"
  3. Body: "This feature is available in the Pro plan" or "We're building this — check back soon"
  4. "Upgrade to Pro" accent button (for premium lock) OR "Notify Me" (for coming soon)
  5. "Notify Me" → input email → "You'll be notified when this launches"

━━ INTERACTIONS & FLOWS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Variant A — CTA tap:
→ Navigate to Add/Create form (new item flow); same as tapping FAB on the list screen

Variant B — "Clear Search" tap:
→ Clear search input; remove query from URL param; restore full list; show list content
Variant B — Suggestion chip tap:
→ Fill search bar with chip text; trigger search immediately

Variant C — "Clear All Filters" tap:
→ Deactivate all filter chips; clear filter state; reload list with no filters
Variant C — Individual filter chip × tap:
→ Remove that filter only; reload list with remaining filters

Variant D — "Try Again" tap:
→ Replace empty state with loading skeleton; re-fetch data
→ Success: replace skeleton with real content
→ Still failing: return to Variant D with same error message (avoid infinite retry state)

Variant E — "Retry Connection" tap:
→ Check network status (navigator.onLine + real HTTP check)
→ If online: reload data (Variant A or list content)
→ If still offline: shake button briefly; "Still no connection" toast

Variant F — Celebration animation:
→ Plays automatically when Variant F renders; duration 2–3s; non-looping
→ "View Summary" → navigate to analytics or summary screen
→ "Add More" → navigate to Add Record form

Variant G — "Upgrade to Pro" tap:
→ Navigate to Premium / Paywall screen (see Landing Page template for paywall layout)
Variant G — "Notify Me" tap:
→ Inline email input appears below button (slide-down animation)
→ User enters email → "Notify Me" button → success state: "✓ We'll let you know!" (replaces input)

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Transition in: fade + translateY(12px → 0) over 300ms when empty state first renders
Loading → empty: skeleton fades out; empty state fades in (not an abrupt swap)
CTA loading: button shows spinner if navigating to a slow screen
Retry loading: "Try Again" button → spinner; empty state remains visible during reload

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Layout: flex-col, align-center, justify-center, min-height = available viewport - header - nav
- Illustration: 160–220px, consistent accent color palette; no stock photos or clip art
- Max content width: 300px centered (prevents over-stretching on tablet/desktop)
- Headline: 20px, font-weight:700, color: text-primary
- Body: 14px, line-height:1.6, color: text-secondary, text-align:center
- CTA button: same style as app primary buttons; max-width:260px; margin-top:20px
- All variants should feel friendly and on-brand, not like system error pages`,
  },

  // ── Web / Desktop Specific ───────────────────────────────────────────────
  {
    group: 'Web / Desktop',
    name: 'Admin Sidebar Layout',
    description: `Screen: Admin / App with Sidebar Navigation
Platform: Web (Desktop) | Electron
Purpose: The structural shell for a full desktop app — fixed left sidebar, top bar, and scrollable main content area. All other desktop screens live inside this shell.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Left Sidebar — fixed, 240–260px wide, full viewport height]
  1. Logo area (top, 56–60px height): app icon + app name; collapse toggle button (right edge ‹)
  2. Nav groups (scrollable if many items):
     Group — Main: Dashboard | My [Items] (badge: count) | Payments (badge: overdue) | Analytics | Timeline
     Group — Tools: EMI Calculator | Bank Offers | Reports
     Group — Premium (label with ⭐ icon): Payoff Planner | AI Advisor | Simulator | Tax Tracker
     Group — Account: Profile | Settings
  3. Bottom strip (non-scrolling): User avatar (32px) + name + role badge + Logout icon button
  4. Version number: "v1.0.0" muted, 10px, at very bottom

[Top Bar — fixed, inside main area, full width minus sidebar]
  5. Breadcrumb (left): Home › Section › Current Page (each segment clickable)
  6. Global search bar (center): "Search everything…" with Cmd+K hint
  7. Notification bell with badge (right)
  8. User avatar dropdown trigger (right): avatar circle + name text + ▾ chevron

[Main Content Area — flex-1, scrollable]
  9. Page title row: H1 title (24px bold) + subtitle (muted 14px) + action buttons (right-aligned): "Add New" primary + optional "Export" secondary
  10. Content body: varies per page — KPI cards, chart, table, card grid, etc. (see other templates)

━━ FLOW: SIDEBAR NAVIGATION ━━━━━━━━━━━━━━━━━━━━━━━━
Tap a nav item:
→ That item gets active state: accent left border (3px) + accent bg tint + accent text/icon
→ Previously active item loses active state
→ Main content area transitions to new screen (fade or slide)
→ Breadcrumb updates to reflect new location
→ If on mobile viewport (< 768px): sidebar becomes a slide-in drawer (same behavior as mobile hamburger)

Hover on nav item (not active):
→ Subtle bg highlight (rgba(accent, 0.06)); icon stays muted color

Nav group labels:
→ Not clickable; just visual separators; 10px, uppercase, letter-spacing

Badge on nav items:
→ Count badge (green pill): shows unread count (e.g. 5 loans); tapping navigates to that screen
→ Overdue badge (red pill): shows count of overdue items; urgent visual cue
→ PRO badge (amber gradient): indicates premium feature; tapping navigates to paywall if not subscribed

━━ FLOW: SIDEBAR COLLAPSE ━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap collapse button (‹):
→ Sidebar animates from 240px → 60px (200ms ease)
→ All text labels fade out; only icons remain (centered in 60px)
→ Nav group labels disappear completely
→ Hover on collapsed icon: tooltip appears right of icon (floating label, 200ms delay)
→ Expand button (›) appears at top of collapsed rail
→ Persist state: localStorage "sidebar_collapsed" = "true"

On window resize (< 1024px):
→ Auto-collapse to icon rail
→ Main content takes full remaining width

━━ FLOW: GLOBAL SEARCH ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap search bar or press Cmd+K / Ctrl+K:
→ Search modal / command palette opens (centered, 560px wide):
  - Search input (focused immediately)
  - Recent searches (shown when input empty): last 5 queries as chips
  - Quick links: Frequently visited pages as rows
  - Type query: results grouped by type (Loans, Payments, Reports…)
  - Each result: icon + title + breadcrumb path
  - Arrow keys navigate results; Enter opens selected; Esc closes
→ Tap result or press Enter: close palette; navigate to that record/page
→ Press Esc or click outside: close palette with no navigation

━━ FLOW: NOTIFICATION BELL ━━━━━━━━━━━━━━━━━━━━━━━━━
Tap bell icon:
→ Notification dropdown panel opens (below bell, 360px wide, max-height 480px, shadow):
  - Header: "Notifications" + "Mark all read" link
  - Scrollable list grouped by time (Today, Yesterday, This Week)
  - Each notification: icon (type color), title, description snippet, time ago, unread dot
→ Tap notification: mark read; navigate to relevant screen; close panel
→ "Mark all read": all dots clear; badge disappears
→ Click outside panel: close without action

━━ FLOW: USER AVATAR DROPDOWN ━━━━━━━━━━━━━━━━━━━━━
Tap avatar/name:
→ Dropdown menu (below, 200px wide): avatar + name + email header; then:
  - My Profile → navigate to Settings/Profile page
  - Billing & Plan → navigate to subscription page
  - Keyboard Shortcuts → opens shortcuts reference modal
  - divider
  - Sign Out → confirmation dialog → clear session → navigate to Login

━━ FLOW: BREADCRUMB ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Each segment is a clickable link:
- "Home" → Dashboard
- "Loans" → Loans list
- "Tesla Model 3" → current page (not clickable, current page = last segment)
On narrow screens: breadcrumb truncates to "… › Current Page"

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Initial page load: sidebar renders immediately; main content shows skeleton
Active nav item: persist across page refreshes (read from URL path)
Notification badge: real-time update (websocket or polling every 60s)
PRO items when user is free: navigate to paywall; item shows lock icon overlay
Sidebar drag-to-resize (optional): user can drag sidebar right edge to custom width; persist to localStorage

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Sidebar: bg var(--bg-dark) or #102216; border-right: 1px solid rgba(accent, 0.15)
- Nav item active: border-left 3px accent; bg rgba(accent, 0.10); color accent
- Nav item hover: bg rgba(accent, 0.05); transition 150ms
- Main content: bg var(--bg) or #f8faf8; padding 24px
- Top bar: bg var(--bg); border-bottom 1px solid var(--border); height 56px; position:sticky top:0
- Content max-width: 1200px (prevents over-stretching on 4K monitors)
- Sidebar collapse animation: CSS transition width 200ms ease; overflow:hidden on labels`,
  },
  {
    group: 'Web / Desktop',
    name: 'Landing / Marketing Page',
    description: `Screen: Landing / Marketing Page
Platform: Web (Desktop + Mobile responsive)
Purpose: Public-facing marketing page that introduces the product, communicates value, builds trust, and drives sign-up conversions. First page visitors see before logging in.

━━ UI LAYOUT (top to bottom) ━━━━━━━━━━━━━━━━━━━━━━━━
1. Navigation bar (sticky on scroll, transparent → frosted glass + shadow on scroll):
   - Logo left (icon + app name)
   - Nav links center: Features | Pricing | Blog | Docs
   - Right: "Sign In" ghost/text button + "Get Started" accent pill button
   - Mobile (< 768px): nav links hidden; hamburger menu icon right of logo

2. Hero Section:
   - Accent badge pill: "✦ Now in Beta" or "🎉 Free for Early Adopters" (subtle border)
   - Headline: 52–64px, font-weight:800, tight letter-spacing (-0.5px), 2–3 lines, centered (or left-aligned)
   - Subheadline: 18–20px, muted color, 2–3 sentences describing core value, max-width 600px, centered
   - CTA row: [Start Free →] accent pill + [Watch Demo ▶] outlined pill (side by side)
   - Hero visual: app screenshot in device frame (laptop + phone mockup) OR abstract gradient illustration (below CTA or right-side on desktop)
   - Social proof strip: "Loved by 10,000+ users" | company/user logos row (greyscale)

3. Features / Benefits Section:
   - Section label: "WHY [APP NAME]" (small-caps, accent, centered)
   - Section headline: "Everything you need to [benefit]" (32px bold, centered)
   - 3-column feature grid (2 rows = 6 features):
     - Each feature: icon in 48px colored circle, feature title (16px bold), 2-line description (14px muted)
   - Mobile: 1-column stacked

4. How It Works Section (numbered steps):
   - Section headline: "Get started in 3 simple steps" (32px bold)
   - 3 step cards side-by-side on desktop (stacked on mobile):
     - Step number badge (accent circle, 32px)
     - Step title (18px bold)
     - Description (14px muted, 2–3 lines)
     - Step illustration or screenshot (above or below text)
   - Connector arrows between steps (desktop only)

5. Stats / Social Proof Bar:
   - Full-width band (accent-tinted bg): 4 stats side by side with dividers
   - Each stat: large number (32px extrabold), label below (muted 13px)
   - Examples: "10,000+ Users" | "₹2Cr+ Debt Tracked" | "4.8★ Rating" | "99.9% Uptime"

6. Testimonials Section:
   - Headline: "What our users say" centered
   - 3 testimonial cards (or auto-rotating carousel on mobile):
     - Avatar (40px circle), name (bold), role + company (muted 12px)
     - Star rating row (5 yellow stars or colored)
     - Quote text (14–15px, italic, max 3 lines)

7. Pricing Section:
   - Headline: "Simple, transparent pricing"
   - Monthly/Annual billing toggle (switch): "Monthly | Annual (Save 20%)"
   - 2–3 pricing card columns:
     - Plan name + description
     - Price (36px extrabold) + billing period + "per user" if applicable
     - Feature list: checkmark rows (included) + × rows (not included, muted)
     - CTA button: "Start Free" (free plan) or "Get Started" or "Contact Sales"
   - Recommended plan: accent border + "Most Popular" badge (top center)
   - Annual toggle: prices update with animated number transition

8. FAQ Section (optional):
   - Accordion: question rows, click to expand/collapse answer
   - Arrow icon rotates 180° when expanded

9. Final CTA Banner:
   - Full-width, gradient background (same as hero)
   - Headline: "Ready to take control?" or "Start your journey today"
   - Sub-text: "Free to start. No credit card required."
   - "Get Started for Free →" large pill button (white text on accent, or white button on gradient)

10. Footer:
    - Logo + tagline left
    - Link columns: Product (Features, Pricing, Changelog) | Company (About, Blog, Careers) | Legal (Privacy, Terms)
    - Social icons right: Twitter/X, LinkedIn, GitHub, YouTube
    - Bottom bar: "© 2026 [App Name]. All rights reserved." | "Made with ♥ in India"

━━ FLOW: NAVIGATION BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Scroll past hero:
→ Navbar bg transitions from transparent to white/dark (with backdrop blur + shadow); transition 200ms
Tap nav link:
→ Smooth scroll to that section (behavior: smooth); URL hash updates (#features, #pricing)
→ Active link: accent underline
Tap "Sign In":
→ Navigate to Login screen
Tap "Get Started":
→ Navigate to Sign Up screen (same as Sign Up flow in Login template)
Mobile hamburger:
→ Open full-screen nav overlay (slides in from top or right):
  - Close (×) top-right
  - Stack of nav links (large, 18px); tap → close overlay + scroll to section
  - "Sign In" + "Get Started" buttons at bottom

━━ FLOW: HERO CTA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap "Start Free →": → same as "Get Started" → Sign Up screen
Tap "Watch Demo ▶":
→ Video lightbox modal opens: centered on page, dark backdrop
→ Embedded video (YouTube/Vimeo iframe) auto-plays
→ Click backdrop or ESC to close; video pauses on close

━━ FLOW: PRICING BILLING TOGGLE ━━━━━━━━━━━━━━━━━━━━
Tap Monthly/Annual toggle:
→ Toggle switches state; all price values update with short count-up/count-down animation (300ms)
→ "Save 20%" badge appears next to Annual; disappears when Monthly selected
→ CTA buttons remain the same; billing period label below price updates

━━ FLOW: FAQ ACCORDION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tap question row:
→ Answer slides down (max-height animation, 250ms ease); arrow rotates 180°
→ Only one open at a time OR allow multiple (choose one behavior)
Tap open question:
→ Answer slides back up; arrow rotates to 0°

━━ FLOW: TESTIMONIAL CAROUSEL (mobile) ━━━━━━━━━━━━
Auto-rotates every 4s: cross-fade or slide between cards
User swipes left/right: manual advance; resets auto-timer
Dot indicators below: shows current slide; tap to jump to slide

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
On scroll: navbar state changes; back-to-top button appears at 300px scroll
Entrance animations: sections fade-up on scroll-into-view (IntersectionObserver, threshold:0.1)
Pricing toggle: transition animation on price numbers (not jarring instant swap)
CTA hover: transform:translateY(-1px) + stronger shadow

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Alternating section backgrounds: white → light-grey (#f8faf8) → white → accent-tinted → white
- Max content width: 1120–1200px, centered, padding-x:24px
- Hero gradient: same as app header (dark green diagonal)
- Responsive breakpoints: mobile <640px | tablet 640–1024px | desktop >1024px
- Feature icons: 48px colored circles (each feature gets a different accent tint color)
- Testimonial cards: white, rounded-2xl, border, shadow-sm; avatar ring in accent color
- Pricing recommended card: accent border-2, shadow-lg, slightly larger scale (scale:1.02)
- Footer: dark bg (same as sidebar), lighter text, link columns gap-6`,
  },
  {
    group: 'Web / Desktop',
    name: 'Modal / Dialog Workflow',
    description: `Screen: Modal / Dialog Workflow
Platform: Web (Desktop) | Mobile (Bottom Sheet)
Purpose: A focused overlay UI pattern used for confirmations, short forms, pickers, and detail previews without navigating away from the current page.

━━ LAYOUT VARIANTS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▸ Variant A — Centered Modal (Desktop / Tablet):
  1. Backdrop: position:fixed; inset:0; bg rgba(0,0,0,0.5); backdrop-filter:blur(4px)
  2. Modal card: position:fixed; centered (top:50%;left:50%;transform:translate(-50%,-50%))
     Width: 480–560px; max-width: 90vw; max-height: 85vh; border-radius:16px; box-shadow:2xl
  3. Header (non-scrolling): title (bold 16px, left) | optional subtitle below | close × button (right, 32px circle button)
  4. Body (scrollable if overflow): main content area; overflow-y:auto; padding:20–24px
  5. Footer (non-scrolling, always visible): action buttons row; border-top

▸ Variant B — Bottom Sheet (Mobile):
  1. Same backdrop as Variant A
  2. Sheet: position:fixed; bottom:0; left:0; right:0; border-radius:24px 24px 0 0; max-height:88dvh
  3. Drag handle: centered pill (40×4px, muted color, rounded) at very top; 12px padding above
  4. Header: title + close × (same as Modal)
  5. Body: scrollable, same content as Modal
  6. Footer: same action buttons, pinned to bottom (above safe area)

Opening animation:
- Modal: scale(0.95) + opacity:0 → scale(1) + opacity:1 | duration:200ms; ease-out
- Sheet: translateY(100%) → translateY(0) | duration:280ms; cubic-bezier(0.4,0,0.2,1)
Closing animation: reverse of opening

━━ CONTENT PATTERN 1 — CONFIRMATION DIALOG ━━━━━━━
Use case: Delete, Sign Out, Irreversible actions
Layout:
- Icon: 56px circle (red for danger, amber for warning, blue for info); icon centered inside
- Headline: "Delete [Item Name]?" (18px bold, centered or left)
- Description: "This action cannot be undone. All associated data will be permanently removed." (14px muted, 2–3 lines)
- Footer: [Cancel] secondary button (left/full-width-first) | [Delete / Confirm] danger/primary button

Flow:
→ Trigger: tap Delete from ⋯ menu or Delete button on form
→ Modal opens (animated in)
→ Focus auto-moves to Cancel button (safer default for destructive action)
→ Tap Cancel: modal closes (animated out); no action taken
→ Tap Confirm: button loading state "Deleting…"; API call
→ Success: modal closes; toast "[Item] deleted. Undo" (5s undo window); list/page updates
→ Failure: error message appears inside modal below description; button resets; modal stays open
→ ESC key: same as Cancel
→ Backdrop tap: same as Cancel (for non-destructive dialogs; blocked for destructive ones)

━━ CONTENT PATTERN 2 — FORM MODAL ━━━━━━━━━━━━━━━━
Use case: Quick add/edit without navigating to full form screen
Layout:
- Header: "Add [Item]" or "Edit [Item]" + close ×
- Body (scrollable): 3–5 input fields with labels + inline validation; same style as full form
- Footer: [Cancel] secondary | [Save] primary (disabled until form dirty + valid)

Flow:
→ Trigger: FAB tap, toolbar "Add" button, or row "Edit" quick action
→ Modal opens; first input auto-focused
→ User fills fields; validation runs on blur (per field) and on submit attempt
→ Required empty on submit: red border + "Required" text; scroll to first error
→ All valid: tap Save → loading → success toast → modal closes → list refreshes
→ Cancel (pristine form): close immediately
→ Cancel (dirty form): "Discard changes?" mini-dialog inside or replacing modal content
→ ESC: same as Cancel

━━ CONTENT PATTERN 3 — PICKER / SELECTOR ━━━━━━━━━
Use case: Select from a list of options (category, user, account, bank, currency)
Layout:
- Header: "Select [Category]" + close ×
- Body:
  - Search bar (sticky at top of body): "Search [options]…"; filters list as user types
  - Options list (scrollable): each row = radio button or checkbox + label + optional icon/avatar
  - Currently selected: highlighted with accent bg tint + checkmark icon
  - Empty search: "No results for '[query]'" inside list area
- Footer: [Cancel] secondary | [Select] primary (shows selected count if multi-select)

Flow (single-select):
→ Open: pre-select current value (scroll to it)
→ Tap option: immediately select + close modal (no Confirm needed) OR select + require Confirm button
→ Selection flows back to parent form field
→ Cancel: close with no change

Flow (multi-select):
→ Multiple options can be checked
→ Footer shows "3 Selected" count
→ Tap Select: pass array of selected values to parent; close modal

━━ CONTENT PATTERN 4 — DETAIL PREVIEW DRAWER ━━━━
Use case: Quick-look at a record without full navigation (side panel on desktop; bottom sheet on mobile)
Layout:
- Desktop: Slides in from right edge as a side drawer (360–400px wide, full height)
  - Not a modal — page content behind remains visible but dimmed (backdrop)
- Mobile: Bottom sheet (standard Variant B)
- Content: same as Detail / Item View template but condensed — hero stat, key details, and primary action only; "Open Full Details →" link at bottom

Flow:
→ Trigger: click row in table/list (desktop) while staying on list page
→ Drawer slides in; list remains visible but slightly dimmed
→ Close × or ESC: drawer slides out; list returns to full brightness
→ "Open Full Details →": navigate to full Detail screen

━━ ACCESSIBILITY REQUIREMENTS ━━━━━━━━━━━━━━━━━━━━━
- Focus trap: Tab/Shift+Tab cycles only within modal while open
- Auto-focus: first interactive element on open (or Cancel button for destructive dialogs)
- aria-modal="true" on dialog element
- aria-labelledby: modal ID linked to header title element
- ESC always closes the modal (register keydown listener on mount; remove on unmount)
- Role="dialog" on the card element

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Closed: modal/sheet not rendered (removed from DOM, not just hidden)
Opening: enter animation in progress; content interactive immediately after animation
Open: fully rendered; focus inside; scroll locked on body (overflow:hidden on body)
Action loading: confirm/save button shows spinner; inputs disabled
Action success: modal closes; parent page updates
Action error: error message inside modal; modal stays open; inputs re-enabled
Closing: exit animation; body scroll restored after animation completes

━━ STYLE NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Backdrop: rgba(0,0,0,0.5) + backdrop-filter:blur(4px); z-index: 40
- Modal card: z-index: 50; bg var(--bg); border: 1px solid var(--border); box-shadow: 0 20px 60px rgba(0,0,0,0.3)
- Header: border-bottom: 1px solid var(--border); padding: 16px 20px
- Footer: border-top: 1px solid var(--border); padding: 12px 20px; gap: 8px; flex-end
- Drag handle (bottom sheet): width:40px; height:4px; border-radius:999px; bg:var(--border); margin:0 auto
- Scrollbar in body: thin, styled (scrollbar-width:thin; scrollbar-color: var(--border) transparent)`,
  },

  // ── Flutter & Android ────────────────────────────────────────────────────
  {
    group: 'Flutter & Android',
    name: 'Home Dashboard (Material)',
    description: `Screen: Home Dashboard — debt/finance tracker
Platform: Flutter (Material 3) | Android (Material)
Purpose: Central hub showing total debt, a breakdown of assets vs liabilities, active loans, quick actions, partner offers, and upcoming payments. First screen after login. Reference build: DebtLogic.

━━ UI LAYOUT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. AppBar / hero (gradient, extends behind the status bar):
   - Row: [Menu icon button, circular glass chip] — [App name, centered] — [Notification icon button, circular glass chip, red unread dot + count]
   - Primary stat: "Total Debt Remaining" label (10px, uppercase, letter-spacing) + huge value (48–56px, extrabold)
   - Trend chip: down-arrow icon + "3% decrease" (pill, tonal fill) + "vs last month" muted text
   - Donut ring (small SVG) + "28% Paid" label, right-aligned on the trend row
2. Wealth Breakdown card (frosted glass tile inside the AppBar, white/10 fill, blurred):
   - Two-segment horizontal bar (assets vs liabilities, rounded ends)
   - Three columns: Assets (value + %) | divider | Liabilities (value + %) | Net Worth (value)
3. "Your Loans" section — horizontal snap-scrolling Material cards (220dp wide each):
   - Each card: icon in tonal circle, loan name, type + APR subtitle, edit icon button (top-right)
   - Balance value + "% Paid" chip, thin progress bar below
4. Quick Actions — 3-column grid of Material icon buttons (tonal circle + label), last item ("Go Premium") uses an amber tonal variant to stand out
5. Bank Offers — horizontal snap-scrolling cards (260dp), each a solid brand-gradient Card:
   - Bank initial avatar + name + offer type, status chip ("Hot Deal"/"Low Rate"/"New")
   - Large rate headline (e.g. "8.35% p.a.")
   - Highlight chips (tonal, on-gradient)
   - Filled white CTA button "Know More →" at the card bottom
6. Upcoming Payments — Material Card containing a divided list (3 rows):
   - Icon in tonal circle, title + status chip (Overdue/Due soon/neutral), due-date subtitle
   - Trailing: amount (bold) + "Pay Now" text button
7. BottomNavigationBar: 4–5 destinations, active destination shows filled icon + label in primary color

━━ FLOW: NAVIGATION DRAWER ━━━━━━━━━━━━━━━━━━━━━━━━━
Tap menu icon:
→ Scrim fades in; Drawer slides in from left (80% width, max 320dp)
→ Drawer surface: translucent dark fill + backdrop blur ("glass" look), thin primary-tinted border on the leading edge
→ Drawer contents: close icon button (top-right) → profile row (avatar with online-status dot, name, email in primary color) → 2-tile mini-stats row (Total Debt, Active Loans, on scrim-dark tiles) → grouped nav list with section labels (MAIN / FREE TOOLS / PREMIUM / ACCOUNT), each item = icon + label + optional trailing badge (count pill in primary, overdue pill in red, "PRO" pill in amber gradient); active item gets a tonal highlight → footer: app version, centered, muted
Tap a nav item: close drawer, navigate
Tap scrim: drawer slides back out, scrim fades

━━ FLOW: NOTIFICATIONS PANEL ━━━━━━━━━━━━━━━━━━━━━━━
Tap notification icon:
→ Scrim fades in; panel slides in from right (88% width, max 375dp) as an end Drawer
→ Header: "Notifications" title + unread count badge (filled, red) + "Mark all read" text button + close icon button
→ List grouped by day (Today / Yesterday / This Week), each group with a small-caps section label
→ Each notification: tonal Card (color keyed to type — red=overdue, orange=due soon, violet=AI insight, blue=loan added, primary=progress), leading icon in matching tonal circle, title, description with bold amount, relative timestamp, unread indicator dot (top-right)
Tap a notification: mark read (dot removed, card fill goes neutral), navigate to the relevant screen
Tap "Mark all read": all dots cleared, badge count → 0

━━ FLOW: CARD & QUICK ACTION TAPS ━━━━━━━━━━━━━━━━━━
Tap a loan card: navigate to that loan's Detail screen
Tap a card's edit icon: stop propagation, open Add/Edit Loan sheet pre-filled
Tap "View All" (any section): navigate to that section's full List screen
Tap a Quick Action: navigate to the matching tool screen (EMI Calculator, Net Worth, Payoff Planner, AI Advisor); "Go Premium" opens the paywall
Tap an offer card / "Know More →": navigate to Bank Offers detail for that offer

━━ FLOW: PAYMENTS BOTTOM SHEET ━━━━━━━━━━━━━━━━━━━━━
Tap "View All" on Upcoming Payments:
→ Modal bottom sheet slides up (showModalBottomSheet-style): scrim behind, rounded top corners (24dp), drag handle pill
→ Header: "All Payments" title + count/total subtitle + close icon button
→ List grouped by urgency (Overdue / Due Soon / Upcoming), each row = tonal icon, title, date/lateness subtitle, amount, "Pay Now" text button; overdue rows show a red "days late" subtitle
→ "+ N more" outlined text button at the end of the Upcoming group
→ Sticky footer: full-width filled button "Pay All Overdue (₹XX,XXX)"
Drag handle down or tap scrim: sheet dismisses

━━ FLOW: ADD EXPENSE BOTTOM SHEET ━━━━━━━━━━━━━━━━━━
Triggered from a FAB or "+" action:
→ Modal bottom sheet (taller, ~92% height), drag handle + header ("Add Expense" + subtitle + close icon button)
→ Amount field: large filled Material text field, currency symbol prefix, numeric keyboard
→ Category: horizontal wrap of choice chips (icon + label), single-select — selected chip switches to tonal-filled with primary border/text
→ Note field: filled text field, optional
→ Date field: filled text field with calendar leading icon, opens a Material date picker
→ Footer: full-width filled button "Save Expense"
On save: close sheet, show a Snackbar confirmation

━━ STATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Initial load: skeleton shimmer in hero stat, loan cards, and payments list
Notification bell: red dot pulses while unread count > 0
Empty loans: empty-state card with "Add your first loan" filled button
Error loading a section: tonal error Card, "Retry" text button
Payment action loading: button shows a circular progress indicator, disabled

━━ STYLE NOTES (structure only — colours/type/shape come from the Style Guide) ━━
- This template defines layout and behaviour only. Colours, typography, shape/radius scale, and elevation must come from the project's active Style Guide theme — pick the "DebtLogic Green" preset (or another Material preset) with Target platform set to Flutter or Android for a result matching the original reference build.
- Icons: Material Symbols Outlined, variable FILL axis — FILL 0 (outline) for default/inactive state, FILL 1 (filled) for active/selected/emphasis icons
- Drawer & notification panel: translucent surface + backdrop blur/saturation ("glass" treatment) rather than a flat Material surface — this is a structural/behavioural choice, independent of the active theme's colours
- Status colour keying (roles, not literal hex — resolve each against the active theme): danger = overdue, warning = due-soon, an informational accent = AI insight, another informational accent = loan-added, primary = positive/progress
- Touch targets: minimum 44dp; horizontal scroll sections use snap-x with no visible scrollbar`,
  },
];
