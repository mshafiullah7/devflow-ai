import { escHtml, injectCss, removeCss, timeAgo, renderMarkdown } from '../../shared/helpers.js';
import { applyStoredTheme } from '../../shared/theme-manager.js';
import { ModelPicker }       from '../../components/model-picker/model-picker.js';

const TECH = 'Plain HTML / CSS';

// ── Screen Design Templates ────────────────────────────────────────────────
const SCREEN_TEMPLATES = [
  // ── Authentication ──────────────────────────────────────────────────────
  {
    group: 'Authentication',
    name: 'Login / Sign In',
    description: `Screen: Authentication Flow — Login, OTP, Register, Forgot Password
Platform: Mobile (Flutter) | Web
Purpose: Complete auth flow — sign in with email/password or phone OTP, register a new account, or reset a forgotten password.

─── Screen 1 — Login / Sign In ───────────────────────
1. Brand block: app logo (64px, rounded), app name (extrabold 28px), tagline (muted 14px)
2. Hero gradient top half (dark-to-mid green), white/card below with masked fade
3. Social buttons (full-width, stacked): "Continue with Google", "Continue with Apple", "Continue with Phone"
4. Divider: "or sign in with email"
5. Email input: mail icon prefix, placeholder "you@example.com"
6. Password input: lock icon prefix, show/hide toggle (eye icon right)
7. Forgot password link (right-aligned, accent color, 12px)
8. "Sign In" button: full-width pill, gradient accent
9. "Don't have an account? Sign Up" link centered below
Error states: red banner "Incorrect email or password" below password field | "Account locked. Try again in 10 minutes." after 5 attempts

─── Screen 2 — OTP / Phone Verification ─────────────
Step progress dots at top (pill shape, active dot wider)

Step 1 — Phone Entry:
1. "Enter your mobile number" heading + subtitle
2. Country prefix block (+91 🇮🇳) + phone number input (10-digit, numeric keyboard)
3. Hint text "Indian mobile numbers only"
4. "Send OTP" CTA button (disabled until 10 digits entered)

Step 2 — OTP Entry:
1. "Verify OTP" heading + "Code sent to +91 XXXXX XXXXX" subtitle
2. 6 individual digit input cells (48×48px, auto-advance on input, backspace goes back, paste fills all)
3. Resend timer "Resend in 30s" + "Resend OTP" link (disabled during countdown)
4. "Verify & Login" CTA button (disabled until all 6 cells filled)
5. "← Change Number" outlined secondary button

Step 3 — Success:
1. Large checkmark icon in green circle (animated pop-in)
2. "You're logged in!" heading + redirect message
3. "Go to Dashboard →" button

OTP cell states: empty = default border | focused = accent border + shadow | filled = accent border + green tint bg | error = red border + shake animation

─── Screen 3 — Register / Sign Up ───────────────────
1. Back arrow + "Create Account" title
2. Fields: First Name, Last Name, Email, Password, Confirm Password
3. Password strength bar: Weak (red) / Fair (orange) / Strong (green) — updates live
4. Requirements checklist: ✓ 8+ characters  ✓ Uppercase  ✓ Number
5. Terms checkbox: "I agree to Terms of Service and Privacy Policy" (required)
6. "Create Account" button: disabled until all fields valid + terms checked
7. "Already have an account? Sign In" link
Error: "An account with this email already exists. Sign in?" banner

─── Screen 4 — Forgot / Reset Password ──────────────
Step 1 — Email Entry:
1. Back arrow + "Reset Password" title
2. Email input: "Enter your registered email"
3. "Send Reset Link" button (disabled until valid email)

Step 2 — Confirmation:
1. Envelope icon + "Check your email" heading
2. "We sent a reset link to [email]" subtitle
3. "Resend email" link (30s cooldown) + "← Back to sign in" link

Step 3 — Set New Password (via email link):
1. "Set New Password" title
2. New Password input (show/hide toggle) + Confirm Password input
3. Password strength bar + requirements checklist (same as Register)
4. "Update Password" button: enabled when both match + strength ≥ Fair
5. "Passwords do not match" inline error on Confirm field if mismatched

Style Notes:
- Hero gradient: linear-gradient(160deg, #1b6b40, #236e47, #2d8a57) top 55%
- Inputs: rounded-xl (12px), border, focus ring accent/50
- Primary button: pill (border-radius 9999px), gradient #4f9f74 → #61be8b, shadow
- OTP cells: 48×48px, border-radius 10px; shake keyframe on error
- Font: Manrope, extrabold (800) headings, semibold (600) labels`,
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
];


function buildScreenPrompt(description, projectDescription, outputFile, designTemplate) {
  const ctx    = projectDescription ? `\nProject context: ${projectDescription}` : '';
  const save   = outputFile
    ? `\nWhen done, save the complete output to: ${outputFile}`
    : `\nDo NOT use any tools, write any files, or save anything — print the raw HTML directly to stdout.`;
  const design = designTemplate
    ? `\n\nDESIGN SYSTEM — you MUST follow this for every element (colours, fonts, spacing, components):\n${designTemplate}`
    : '';

  return `You are an expert UI/UX developer. Generate a complete, self-contained HTML file for the screen described below using ${TECH}.
Rules:
- Output ONLY valid HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag; CDN links (e.g. Tailwind CDN) are allowed
- Visually polished, modern design with realistic placeholder content
- Fully responsive
- No explanation, no markdown — raw HTML only
- REQUIRED: Include a light/dark theme toggle button fixed in the top-right corner (position:fixed; top:1rem; right:1rem; z-index:9999). The button must toggle a "dark" class on <html> or <body> and switch all colours accordingly using CSS variables or a [data-theme] attribute. Default to light theme. The toggle must work standalone with no external dependencies.${ctx}${design}${save}

Screen to design:
${description}`;
}

function buildExtractPrompt(screenTitle, htmlFilePath, outputFile) {
  const save = outputFile ? `\nWhen done, write the complete JSON array to: ${outputFile}` : '';
  return `You are an expert product manager and UI developer. Analyze the ${TECH} UI screen design provided below and extract user stories.

Screen: ${screenTitle}
Tech stack: ${TECH}

Screen content at: ${htmlFilePath}
${save}
Extract every distinct user action, form, state, or interaction visible in this screen as a separate user story.

IMPORTANT: Output ONLY a raw JSON array — no markdown fences, no explanation, no extra text. Start with [ and end with ].

Each object MUST use EXACTLY these five field names — no other field names are accepted:
- title: short action-oriented title (string)
- description: As a user, I want to [action] so that [benefit]. (string)
- acceptance_criteria: all criteria as ONE string, each criterion on its own line starting with -  (string, NOT an array)
- prompt: detailed implementation prompt referencing exact design details from the UI — colours, typography, spacing, layout, component styles. Do NOT include E2E test generation here. (string)
- e2e_tests: ONE string containing the prompt to generate the Playwright/Cypress E2E test file for this user story interaction. All test names must be prefixed with US-{{US_ID}}. Empty string "" for non-UI stories. (string)`;
}

function buildEditPromptInline(instruction, existingHtml, projectDescription) {
  const ctx = projectDescription ? `\nProject context: ${projectDescription}` : '';
  return `You are an expert UI/UX developer. Modify the existing HTML screen below based on the instruction provided.
Rules:
- Output ONLY the complete modified HTML starting with <!DOCTYPE html>
- All CSS goes inside a <style> tag
- Preserve the overall design language; only apply the requested changes
- No explanation, no markdown — raw HTML only
- Do NOT use any tools, write any files, or save anything — print the raw HTML directly to stdout${ctx}

Modification instruction:
${instruction}

Existing HTML:
${existingHtml}`;
}

function buildExtractPsCommand(instruction, model) {
  const exe       = model.executable || 'claude';
  const flags     = model.flags ? ` ${model.flags}` : '';
  const modelFlag = model.model_name ? ` --model ${model.model_name}` : '';
  const safeInst  = instruction.replace(/'/g, "''");
  return `$p = @'\n${safeInst}\n'@\n${exe}${flags}${modelFlag} $p`;
}

function buildPsCommand(prompt, model) {
  const exe       = model.executable || 'claude';
  const flags     = model.flags ? ` ${model.flags}` : '';
  const modelFlag = model.model_name ? ` --model ${model.model_name}` : '';
  const safe      = prompt.replace(/'/g, "''");
  return `$p = @'\n${safe}\n'@\n${exe}${flags}${modelFlag} $p`;
}

// ----------------------------------------------------------------
// MockupsPage — full-page version of ScreensModal
// ----------------------------------------------------------------
export class MockupsPage {
  constructor(container, params, router) {
    this.container        = container;
    this.router           = router;
    this._projectId       = params.projectId;
    this._screenTitle     = params.screenTitle || null;
    this._project         = null;
    this._screens         = [];
    this._activeId        = null;
    this._activeTab       = 'preview';
    this._modelConfigs    = [];
    this._selectedModelId = null;
    this._designTemplate  = '';
    this._editingId       = null;
    this._screenTemplates = [];
  }

  async mount() {
    injectCss('styles/screens.css');
    injectCss('pages/mockups/mockups-page.css');
    applyStoredTheme();

    let _mapping;
    [this._project, this._screens, this._modelConfigs, _mapping] = await Promise.all([
      window.db.projects.get(this._projectId),
      window.db.screenDesigns.list(this._projectId),
      window.db.modelConfigs.list(),
      window.db.modelMapping.get('mockups'),
    ]);

    // Load templates from DB, seeding from hardcoded array on first run
    let dbTemplates = await window.db.screenTemplates.list();
    if (dbTemplates.length === 0) {
      dbTemplates = await window.db.screenTemplates.seed(SCREEN_TEMPLATES);
    }
    this._screenTemplates = dbTemplates;
    const _mappedId = _mapping?.model_config_id ?? null;

    this._designTemplate = this._project?.design_template || '';
    this._activeTab      = 'preview';



    if (this._screenTitle) {
      const needle = this._screenTitle.toLowerCase();
      const match  = this._screens.find(s => s.title.toLowerCase() === needle)
                  || this._screens.find(s => s.title.toLowerCase().includes(needle))
                  || this._screens.find(s => needle.includes(s.title.toLowerCase()));
      this._activeId = match?.id ?? null;
    } else {
      this._activeId = this._screens[0]?.id ?? null;
    }

    const defCli = this._modelConfigs.find(c => c.is_default && c.type !== 'anthropic')
                || this._modelConfigs.find(c => c.type !== 'anthropic')
                || this._modelConfigs[0];
    this._selectedModelId = _mappedId ?? defCli?.id ?? null;

    this.container.innerHTML = this._pageTemplate();
    this._picker = new ModelPicker({
      anchor:   this.container.querySelector('#mockupsModelPicker'),
      onSelect: model => {
        this._selectedModelId = model?.id ?? null;
        const nameEl = this.container.querySelector('#scrModelName');
        if (nameEl) nameEl.textContent = model?.label || 'No model selected';
        this._updateMockupBtns?.();
      },
      initialId: _mappedId,
    });
    this._bindShellEvents();
    await this._picker.reload();

    if (this._activeId) this._selectScreen(this._activeId);
    else                this._showEmptyState();
  }

  unmount() {
    removeCss('pages/mockups/mockups-page.css');
    removeCss('styles/screens.css');
    this._picker?.unmount();
    window.app.chat.offAll();
    window.app.chat.cancel();
    window.app.validate.offAll();
    window.app.validate.cancel();
    if (this._ctrlSHandler) {
      document.removeEventListener('keydown', this._ctrlSHandler);
      this._ctrlSHandler = null;
    }
  }

  _getProject()      { return this._project; }

  _getTemplateParts() {
    try {
      const p = JSON.parse(this._designTemplate);
      if (p && typeof p === 'object') return { light: p.light || '', dark: p.dark || '' };
    } catch {}
    return { light: '', dark: this._designTemplate || '' };
  }

  _hasAnyTemplate() {
    const p = this._getTemplateParts();
    return !!(p.light || p.dark);
  }

  _getDesignTemplateForPrompt() {
    const p = this._getTemplateParts();
    if (p.light && p.dark) return `Light theme:\n${p.light}\n\nDark theme:\n${p.dark}`;
    return p.dark || p.light || '';
  }

  _getSelectedModel() {
    if (this._picker) return this._picker.selectedModel;
    const m = this._modelConfigs?.find(c => c.id === this._selectedModelId);
    return m || this._modelConfigs?.find(c => c.is_default) || this._modelConfigs?.[0] || null;
  }

  // ----------------------------------------------------------------
  // Page shell
  // ----------------------------------------------------------------
  _pageTemplate() {
    const name = this._project?.name ?? 'Project';
    return `
      <div class="mockups-page">
        <header class="mockups-page__header">
          <button class="mockups-page__back" id="btnBack" aria-label="Back">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
          </button>
          <div class="mockups-page__title-group">
            <div class="mockups-page__title">${escHtml(name)}</div>
            <div class="mockups-page__subtitle">Project Mockups</div>
          </div>
          <button class="project-page__git-btn" id="mockupsQueueBtn" title="Generation queue" style="-webkit-app-region:no-drag;">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M2 8h9M2 12h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="project-page__git-badge" id="mockupsQueueBadge" hidden></span>
          </button>
          <div class="project-page__model-group" style="-webkit-app-region:no-drag;">
            <div id="mockupsModelPicker"></div>
          </div>
          <button class="mockups-page__style-btn scr-btn scr-btn--sm${this._hasAnyTemplate() ? ' scr-btn--ds-active' : ''}" id="scrStyleGuideBtn" title="Open Project Style Guide page">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Styles
            <span class="scr-style-dot${this._hasAnyTemplate() ? ' scr-style-dot--active' : ''}"></span>
          </button>
        </header>

        <div class="mockups-page__body">
          <aside class="scr-sidebar">
            <div class="scr-sidebar__toolbar">
              <button class="scr-sidebar__add" id="scrNewBtn">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                New Screen
              </button>
            </div>
            <div class="scr-sidebar__list" id="scrList">${this._renderList()}</div>
          </aside>
          <div class="scr-main" id="scrMain"></div>
        </div>
      </div>
    `;
  }

  _renderList() {
    if (this._screens.length === 0) return '<p class="scr-sidebar__empty">No screens yet</p>';
    return this._screens.map(s => {
      const canQueue = !!s.description;
      const isQueued = !!s.queued;
      return `
        <div class="scr-sidebar__item${s.id === this._activeId ? ' scr-sidebar__item--active' : ''}" data-id="${s.id}">
          <svg class="scr-sidebar__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
          </svg>
          <div class="scr-sidebar__item-info">
            <div class="scr-sidebar__item-row">
              <span class="scr-sidebar__item-id">#${s.id}</span>
              <span class="scr-sidebar__item-title">${escHtml(s.title)}</span>
              ${s.style_valid === 1 ? '<span class="scr-val-dot scr-val-dot--ok" title="Style valid"></span>' : ''}
              ${s.style_valid === 0 ? `<span class="scr-val-dot scr-val-dot--warn" title="Style issues found"></span>` : ''}
            </div>
          </div>
          ${canQueue ? `
            <button class="scr-sidebar__queue-btn${isQueued ? ' scr-sidebar__queue-btn--active' : ''}"
              data-queue-id="${s.id}" data-queued="${isQueued ? '1' : '0'}"
              title="${isQueued ? 'Remove from queue' : 'Add to queue'}">
              ${isQueued ? 'Queued' : 'Queue'}
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  _refreshSidebar() {
    const list = this.container.querySelector('#scrList');
    if (list) list.innerHTML = this._renderList();
    this._bindSidebarItems();
  }

  _bindSidebarItems() {
    this.container.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.addEventListener('click', () => this._selectScreen(Number(el.dataset.id)));
    });

    this.container.querySelectorAll('.scr-sidebar__queue-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id       = Number(btn.dataset.queueId);
        const queued   = btn.dataset.queued === '1' ? 0 : 1;
        await window.db.screenDesigns.update({ id, queued });
        const screen = this._screens.find(s => s.id === id);
        if (screen) screen.queued = queued;
        btn.dataset.queued = queued;
        btn.title = queued ? 'Remove from queue' : 'Add to queue';
        btn.textContent = queued ? 'Queued' : 'Queue';
        btn.classList.toggle('scr-sidebar__queue-btn--active', !!queued);
        this._refreshHeaderQueueBadge();
      });
    });
  }

  async _reloadModelDropdown() {
    if (this._picker) await this._picker.reload();
  }

  _bindShellEvents() {
    this.container.querySelector('#btnBack')
      .addEventListener('click', () => this._goBack());

    this.container.querySelector('#scrNewBtn')
      .addEventListener('click', () => this._showNewScreenModal());

    this.container.querySelector('#scrStyleGuideBtn')
      .addEventListener('click', () => {
        this.router.navigate('style-guide', { projectId: this._projectId, from: 'mockups' });
      });



    this.container.querySelector('#mockupsQueueBtn')
      .addEventListener('click', () => window.app.openQueueWindow(this._projectId));

    this._refreshHeaderQueueBadge();
    this._bindSidebarItems();
  }

  async _refreshHeaderQueueBadge() {
    const badge = this.container.querySelector('#mockupsQueueBadge');
    if (!badge) return;
    const all = await window.db.screenDesigns.list(this._projectId);
    const count = all.filter(s => s.queued && s.is_active !== 0).length;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  _updateMockupBtns() {
    const model = this._getSelectedModel();
    const isCli = model?.type === 'cli';
    const runBtn  = this.container.querySelector('#scrRunBtn');
    const editBtn = this.container.querySelector('#scrEditBtn');
    if (runBtn)  runBtn.hidden = !isCli;
    if (editBtn) editBtn.hidden = !isCli;
  }

  _updateStyleGuideBtn() {
    const btn = this.container.querySelector('#scrStyleGuideBtn');
    if (!btn) return;
    const has = this._hasAnyTemplate();
    btn.classList.toggle('scr-btn--ds-active', has);
    const dot = btn.querySelector('.scr-style-dot');
    if (dot) dot.classList.toggle('scr-style-dot--active', has);
  }

  _goBack() {
    if (this._activeId === null && this._newFormHasData()) {
      this._showUnsavedDialog();
    } else {
      this.router.navigate('project-home', { projectId: this._projectId });
    }
  }

  _newFormHasData() {
    const main = this.container.querySelector('#scrMain');
    if (!main) return false;
    const title = main.querySelector('#scrTitle')?.value.trim() || '';
    const desc  = main.querySelector('#scrDescription')?.value.trim() || '';
    return title.length > 0 || desc.length > 0;
  }

  _showUnsavedDialog() {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">Unsaved Screen Design</h3>
        <p class="scr-unsaved-dialog__body">You have unsaved changes. What would you like to do?</p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--primary" id="unsavedDraft">Save as Draft</button>
          <button class="scr-btn scr-btn--danger"   id="unsavedDiscard">Discard</button>
          <button class="scr-btn scr-btn--secondary" id="unsavedCancel">Cancel</button>
        </div>
      </div>
    `;

    this.container.querySelector('.mockups-page').appendChild(dlg);

    dlg.querySelector('#unsavedCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#unsavedDiscard').addEventListener('click', () => {
      dlg.remove();
      this.router.navigate('project-home', { projectId: this._projectId });
    });
    dlg.querySelector('#unsavedDraft').addEventListener('click', () => this._saveAsDraft(dlg));
  }

  _showDeleteConfirmDialog(screen, onConfirm) {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#ef4444">
          <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">Delete Screen</h3>
        <p class="scr-unsaved-dialog__body">Delete <strong>${escHtml(screen.title)}</strong>? This cannot be undone.</p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--danger"    id="dlgDeleteConfirm">Delete</button>
          <button class="scr-btn scr-btn--secondary" id="dlgDeleteCancel">Cancel</button>
        </div>
      </div>
    `;

    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#dlgDeleteCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#dlgDeleteConfirm').addEventListener('click', () => {
      dlg.remove();
      onConfirm();
    });
  }

  _showOverwriteConfirmDialog(fileName, onConfirm) {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#f59e0b">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">File Already Exists</h3>
        <p class="scr-unsaved-dialog__body">
          <code style="display:inline-block;margin-bottom:6px;padding:4px 10px;background:var(--bg-secondary,rgba(0,0,0,.08));border-radius:4px;font-size:12px;word-break:break-all">${escHtml(fileName)}</code><br>
          already exists in the selected folder. Overwrite it?
        </p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--danger"    id="overwriteConfirm">Overwrite</button>
          <button class="scr-btn scr-btn--secondary" id="overwriteCancel">Cancel</button>
        </div>
      </div>
    `;
    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#overwriteCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#overwriteConfirm').addEventListener('click', () => {
      dlg.remove();
      onConfirm();
    });
  }

  _showConfirmDialog(title, body, confirmLabel, onConfirm) {
    const existing = this.container.querySelector('.scr-unsaved-overlay');
    if (existing) return;

    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#f59e0b">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path d="M12 9v4M12 17h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">${escHtml(title)}</h3>
        <p class="scr-unsaved-dialog__body">${escHtml(body)}</p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--danger"    id="confirmDlgOk">${escHtml(confirmLabel)}</button>
          <button class="scr-btn scr-btn--secondary" id="confirmDlgCancel">Cancel</button>
        </div>
      </div>
    `;
    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#confirmDlgCancel').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#confirmDlgOk').addEventListener('click', () => {
      dlg.remove();
      onConfirm();
    });
  }

  _showExportSuccessModal(fileName) {
    const dlg = document.createElement('div');
    dlg.className = 'scr-unsaved-overlay';
    dlg.innerHTML = `
      <div class="scr-unsaved-dialog">
        <div class="scr-unsaved-dialog__icon" style="color:#22c55e">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.6"/>
            <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="scr-unsaved-dialog__title">Export Successful</h3>
        <p class="scr-unsaved-dialog__body">
          File saved as<br>
          <code style="display:inline-block;margin-top:6px;padding:4px 10px;background:var(--bg-secondary,rgba(0,0,0,.08));border-radius:4px;font-size:12px;word-break:break-all">${escHtml(fileName)}</code>
        </p>
        <div class="scr-unsaved-dialog__actions">
          <button class="scr-btn scr-btn--primary" id="exportSuccessOk">OK</button>
        </div>
      </div>
    `;
    this.container.querySelector('.mockups-page').appendChild(dlg);
    dlg.querySelector('#exportSuccessOk').addEventListener('click', () => dlg.remove());
  }

  async _saveForm() {
    const main  = this.container.querySelector('#scrMain');
    const title = main?.querySelector('#scrTitle')?.value.trim() || '';
    const desc  = main?.querySelector('#scrDescription')?.value.trim() || '';
    const stack = 'html';

    if (!title) { main?.querySelector('#scrTitle')?.focus(); return null; }

    if (this._editingId) {
      return window.db.screenDesigns.update({
        id:          this._editingId,
        title,
        description: desc,
        tech_stack:  stack,
      });
    }

    const screen = await window.db.screenDesigns.create({
      project_id:   this._projectId,
      title,
      description:  desc,
      tech_stack:   stack,
      html_content: '',
    });
    this._editingId = screen.id;
    return screen;
  }

  async _saveAsDraft(dlg) {
    const btn = dlg.querySelector('#unsavedDraft');
    btn.disabled    = true;
    btn.textContent = 'Saving…';
    await this._saveForm();
    dlg.remove();
    this.router.navigate('project-home', { projectId: this._projectId });
  }

  // ----------------------------------------------------------------
  // Empty state (no screens yet)
  // ----------------------------------------------------------------
  _showEmptyState() {
    this._activeId  = null;
    this._editingId = null;
    this._setActiveItem(null);
    const main = this.container.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-empty-state">
        <svg width="48" height="48" viewBox="0 0 16 16" fill="none" opacity="0.25">
          <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.1"/>
          <path d="M4 6h8M4 9h5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>
        </svg>
        <p class="scr-empty-state__title">No screens yet</p>
        <p class="scr-empty-state__sub">Click <strong>New Screen</strong> in the sidebar to create your first mockup.</p>
      </div>
    `;
  }

  // ----------------------------------------------------------------
  // New Screen modal
  // ----------------------------------------------------------------
  _showNewScreenModal() {
    // Build grouped <option> elements from DB templates
    const groups = {};
    this._screenTemplates.forEach(t => {
      const g = t.group_name || t.group || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push(t);
    });
    const templateOptions = Object.entries(groups).map(([g, templates]) => `
      <optgroup label="${escHtml(g)}">
        ${templates.map(t => `<option value="${escHtml(String(t.id))}">${escHtml(t.name)}</option>`).join('')}
      </optgroup>
    `).join('');

    const dlg = document.createElement('div');
    dlg.className = 'scr-overlay';
    dlg.innerHTML = `
      <div class="scr-ns-dialog" style="width:80vw;max-width:80vw;height:80vh;display:flex;flex-direction:column;">
        <div class="scr-ns-dialog__header">
          <span class="scr-ns-dialog__title">New Screen</span>
          <button class="scr-dialog__close" id="scrNsClose">&times;</button>
        </div>
        <div class="scr-ns-dialog__body" style="display:flex;flex-direction:column;gap:14px;flex:1;overflow-y:auto;">
          <div class="scr-form__row">
            <label class="scr-form__label">Title *</label>
            <input class="scr-form__input" id="scrNsTitle" type="text"
              placeholder="e.g. Login Screen, Dashboard, Product List…" autocomplete="off"/>
          </div>
          <div class="scr-form__row">
            <label class="scr-form__label">Template <span style="font-weight:400;opacity:.6">(optional — auto-fills description)</span></label>
            <select class="scr-form__select" id="scrNsTemplate">
              <option value="">— No template —</option>
              ${templateOptions}
            </select>
          </div>
          <div class="scr-form__row scr-form__row--grow">
            <label class="scr-form__label">Description <span style="font-weight:400;opacity:.6">(used as AI prompt)</span></label>
            <textarea class="scr-form__textarea" id="scrNsDesc" rows="10"
              placeholder="Describe the screen sections, layout, components, and style…" style="resize:vertical;min-height:160px;"></textarea>
          </div>
        </div>
        <div class="scr-ns-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="scrNsCancel">Cancel</button>
          <button class="scr-btn scr-btn--primary" id="scrNsSave" title="Save (Ctrl+Enter)">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.querySelector('#scrNsTitle').focus();

    // Template selector → auto-fill title + description
    dlg.querySelector('#scrNsTemplate').addEventListener('change', (e) => {
      const tpl = this._screenTemplates.find(t => String(t.id) === e.target.value);
      if (!tpl) return;
      const titleEl = dlg.querySelector('#scrNsTitle');
      if (!titleEl.value.trim()) titleEl.value = tpl.name;
      dlg.querySelector('#scrNsDesc').value = tpl.description;
    });

    const close = () => dlg.remove();
    dlg.querySelector('#scrNsClose').addEventListener('click', close);
    dlg.querySelector('#scrNsCancel').addEventListener('click', close);

    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        dlg.querySelector('#scrNsSave')?.click();
      }
      if (e.key === 'Escape') close();
    });

    dlg.querySelector('#scrNsSave').addEventListener('click', async () => {
      const title = dlg.querySelector('#scrNsTitle').value.trim();
      if (!title) { dlg.querySelector('#scrNsTitle').focus(); return; }
      const description = dlg.querySelector('#scrNsDesc').value.trim();

      const screen = await window.db.screenDesigns.create({
        project_id:   this._projectId,
        title,
        description,
        tech_stack:   'html',
        html_content: '',
      });

      close();
      this._screens  = await window.db.screenDesigns.list(this._projectId);
      this._activeId = screen.id;
      this._refreshSidebar();
      this._showScreenViewer(screen);
    });
  }

  _runChatGeneration(screen, chatInput, main) {
    const desc = chatInput.value.trim();
    if (!desc) { chatInput.focus(); return; }

    const model = this._getSelectedModel();
    if (!model) { alert('No model selected.'); return; }

    chatInput.value = '';
    chatInput.style.height = 'auto';

    const project = this._getProject();
    const hasHtml = !!screen.html_content;

    // For edit: pass structured payload so main process can write HTML to temp file (CLI)
    // or embed inline (API/Ollama). For create: full prompt string as before.
    let generateArg;
    let previewText;

    if (hasHtml) {
      const isCli = !model.type || model.type === 'cli';
      generateArg = {
        editPayload: {
          instruction:        desc,
          htmlContent:        screen.html_content,
          projectDescription: project?.description || '',
        },
        model,
      };
      if (isCli) {
        previewText = `[Edit via temp file — HTML will be written to a temp file on disk]\n\nInstruction:\n${desc}\n\nExisting HTML: ${screen.html_content.length} chars (passed via temp file)`;
      } else {
        // For API/Ollama show the inline prompt for transparency
        previewText = buildEditPromptInline(desc, screen.html_content, project?.description || '');
      }
    } else {
      const prompt = buildScreenPrompt(desc, project?.description || '', '', this._getDesignTemplateForPrompt());
      generateArg  = { prompt, model };
      previewText  = prompt;
    }

    const messagesEl = main.querySelector('#scrChatMessages');
    messagesEl.querySelector('.scr-chat-empty')?.remove();
    messagesEl.querySelector('.scr-chat-history-group--initial')?.remove();

    // User bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'scr-chat-msg scr-chat-msg--user';
    userBubble.innerHTML = `<div class="scr-chat-msg__text">${escHtml(desc)}</div>`;
    messagesEl.appendChild(userBubble);

    // Prompt preview bubble
    const previewBubble = document.createElement('div');
    previewBubble.className = 'scr-chat-msg scr-chat-msg--assistant';
    previewBubble.innerHTML = `
      <div class="scr-chat-prompt-bubble">
        <div class="scr-chat-prompt-bubble__header">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
            <path d="M4 6h5M4 9h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          </svg>
          <span>${hasHtml ? 'Edit Prompt' : 'Create Prompt'}</span>
        </div>
        <pre class="scr-chat-prompt-bubble__pre">${escHtml(previewText)}</pre>
        <div class="scr-chat-prompt-bubble__actions">
          <button class="scr-chat-approve-btn">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Run
          </button>
          <button class="scr-chat-dismiss-btn">Dismiss</button>
        </div>
      </div>
    `;
    messagesEl.appendChild(previewBubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    previewBubble.querySelector('.scr-chat-dismiss-btn').addEventListener('click', () => previewBubble.remove());

    previewBubble.querySelector('.scr-chat-approve-btn').addEventListener('click', () => {
      this._saveToHistory(desc);
      previewBubble.innerHTML = `
        <div class="scr-chat-msg__generating">
          <span class="scr-chat-stream-dot"></span>
          <div class="scr-chat-msg__gen-info">
            <span class="scr-chat-msg__gen-label">Generating… 0s</span>
          </div>
          <button class="scr-chat-cancel-btn">Cancel</button>
        </div>
        <pre class="scr-chat-stream-preview"></pre>
      `;
      messagesEl.scrollTop = messagesEl.scrollHeight;

      const genStart = Date.now();
      const genTimer = setInterval(() => {
        const labelEl = previewBubble.querySelector('.scr-chat-msg__gen-label');
        if (!labelEl) { clearInterval(genTimer); return; }
        const elapsed = Math.floor((Date.now() - genStart) / 1000);
        const display = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
        labelEl.textContent = `Generating… ${display}`;
      }, 1000);

      window.app.chat.offAll();

      window.app.chat.onToken(({ text }) => {
        const preview = previewBubble.querySelector('.scr-chat-stream-preview');
        if (preview) {
          preview.textContent += text;
          messagesEl.scrollTop = messagesEl.scrollHeight;
        }
      });

      window.app.chat.onDone(async ({ html, raw, error }) => {
        clearInterval(genTimer);
        window.app.chat.offAll();
        const rawText    = raw || '';
        const previousHtml = screen.html_content;  // capture before overwrite

        if (html && !error) {
          await window.db.screenDesigns.update({ id: screen.id, html_content: html, executed: 1 });
          screen.html_content = html;
          screen.executed = 1;
          this._loadPreview(html);
          previewBubble.innerHTML = `
            <div class="scr-chat-response-bubble scr-chat-response-bubble--ok">
              <div class="scr-chat-response-bubble__header">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Preview updated
                ${previousHtml ? `<button class="scr-chat-rollback-btn" title="Rollback to previous version">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M2 6h7a5 5 0 0 1 0 10H4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M5 3L2 6l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Rollback
                </button>` : ''}
              </div>
              <pre class="scr-chat-response-bubble__pre">${escHtml(rawText)}</pre>
            </div>
          `;
          if (previousHtml) {
            previewBubble.querySelector('.scr-chat-rollback-btn')?.addEventListener('click', () => {
              this._showConfirmDialog(
                'Rollback changes?',
                'This will restore the previous version. Current changes will be lost.',
                'Rollback',
                async () => {
                  await window.db.screenDesigns.update({ id: screen.id, html_content: previousHtml });
                  screen.html_content = previousHtml;
                  this._loadPreview(previousHtml);
                  previewBubble.querySelector('.scr-chat-rollback-btn')?.remove();
                }
              );
            });
          }
        } else {
          previewBubble.innerHTML = `
            <div class="scr-chat-response-bubble scr-chat-response-bubble--err">
              <div class="scr-chat-response-bubble__header">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 13H2L8 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  <path d="M8 7v3M8 11.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                </svg>
                ${escHtml(error || 'No HTML in response')}
              </div>
              <pre class="scr-chat-response-bubble__pre">${escHtml(rawText || '(no output received)')}</pre>
            </div>
          `;
        }
        messagesEl.scrollTop = messagesEl.scrollHeight;
      });

      previewBubble.querySelector('.scr-chat-cancel-btn').addEventListener('click', () => {
        clearInterval(genTimer);
        window.app.chat.cancel();
        window.app.chat.offAll();
        previewBubble.innerHTML = `<div class="scr-chat-msg__cancelled">Cancelled</div>`;
      });

      window.app.chat.generate(generateArg);
    });
  }

  async _loadInitialHistory(screenId, main) {
    const items = await window.db.screenPromptHistory.list({
      project_id:       this._projectId,
      screen_design_id: screenId,
    });

    const recent     = items.slice(0, 3);
    const messagesEl = main.querySelector('#scrChatMessages');
    const chatInput  = main.querySelector('#scrDescription');
    const resize     = () => { chatInput.style.height = 'auto'; chatInput.style.height = chatInput.scrollHeight + 'px'; };

    const group = document.createElement('div');
    group.className = 'scr-chat-history-group scr-chat-history-group--initial';

    const listHtml = recent.length
      ? `<div class="scr-chat-history-list">
          ${recent.map((h, i) => `
            <div class="scr-chat-history-item" data-idx="${i}">
              <span class="scr-chat-history-item__text">${escHtml(h.prompt.length > 100 ? h.prompt.slice(0, 100) + '…' : h.prompt)}</span>
              <span class="scr-chat-history-item__time">${timeAgo(h.executed_at)}</span>
            </div>
          `).join('')}
        </div>`
      : `<p class="scr-chat-history-empty">No prompts run for this screen yet.</p>`;

    group.innerHTML = `
      <div class="scr-chat-history-label">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${recent.length ? `Last ${recent.length} prompt${recent.length > 1 ? 's' : ''}` : 'Recent prompts'}
        <button class="scr-chat-history-dismiss" title="Hide">&times;</button>
      </div>
      ${listHtml}
    `;

    if (recent.length) {
      group.querySelectorAll('.scr-chat-history-item').forEach(el => {
        el.addEventListener('click', () => {
          chatInput.value = recent[Number(el.dataset.idx)].prompt;
          resize();
          chatInput.focus();
        });
      });
    }

    group.querySelector('.scr-chat-history-dismiss').addEventListener('click', () => group.remove());

    messagesEl.querySelector('.scr-chat-empty')?.remove();
    messagesEl.appendChild(group);
  }

  async _showHistoryInChat(main) {
    if (!this._activeId) return;
    const messagesEl = main.querySelector('#scrChatMessages');
    const chatInput  = main.querySelector('#scrDescription');
    const resize     = () => { chatInput.style.height = 'auto'; chatInput.style.height = chatInput.scrollHeight + 'px'; };

    const existing = messagesEl.querySelector('.scr-chat-history-group');

    // Expanded (full) group is showing → collapse back to 3
    if (existing && !existing.classList.contains('scr-chat-history-group--initial')) {
      existing.remove();
      await this._loadInitialHistory(this._activeId, main);
      return;
    }

    // Initial (3-item) group is showing → expand to full list
    if (existing) existing.remove();

    const items = await window.db.screenPromptHistory.list({
      project_id:       this._projectId,
      screen_design_id: this._activeId,
    });

    const group = document.createElement('div');
    group.className = 'scr-chat-history-group';

    if (!items.length) {
      group.innerHTML = `
        <div class="scr-chat-history-label">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Recent prompts
        </div>
        <p class="scr-chat-history-empty">No prompts run for this screen yet.</p>
      `;
    } else {
      group.innerHTML = `
        <div class="scr-chat-history-label">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
            <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All ${items.length} prompt${items.length > 1 ? 's' : ''}
        </div>
        <div class="scr-chat-history-list">
          ${items.map((h, i) => `
            <div class="scr-chat-history-item" data-idx="${i}">
              <span class="scr-chat-history-item__text">${escHtml(h.prompt.length > 100 ? h.prompt.slice(0, 100) + '…' : h.prompt)}</span>
              <span class="scr-chat-history-item__time">${timeAgo(h.executed_at)}</span>
            </div>
          `).join('')}
        </div>
      `;
      group.querySelectorAll('.scr-chat-history-item').forEach(el => {
        el.addEventListener('click', () => {
          chatInput.value = items[Number(el.dataset.idx)].prompt;
          resize();
          chatInput.focus();
          group.remove();
        });
      });
    }

    messagesEl.querySelector('.scr-chat-empty')?.remove();
    messagesEl.appendChild(group);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  _showEditScreenModal(screen) {
    const dlg = document.createElement('div');
    dlg.className = 'scr-overlay';
    dlg.innerHTML = `
      <div class="scr-ns-dialog" style="width:80vw;max-width:80vw;height:80vh;display:flex;flex-direction:column;">
        <div class="scr-ns-dialog__header">
          <span class="scr-ns-dialog__title">Edit Screen</span>
          <button class="scr-dialog__close" id="scrEditClose">&times;</button>
        </div>
        <div class="scr-ns-dialog__body" style="display:flex;flex-direction:column;gap:14px;flex:1;overflow-y:auto;">
          <div class="scr-form__row">
            <label class="scr-form__label">Title *</label>
            <input class="scr-form__input" id="scrEditTitle" type="text"
              value="${escHtml(screen.title)}" autocomplete="off"/>
          </div>
          <div class="scr-form__row scr-form__row--grow">
            <label class="scr-form__label">Description <span style="font-weight:400;opacity:.6">(used as AI prompt)</span></label>
            <textarea class="scr-form__textarea" id="scrEditDesc" rows="10"
              placeholder="Describe the screen sections, layout, components, and style…" style="resize:vertical;min-height:160px;">${escHtml(screen.description || '')}</textarea>
          </div>
        </div>
        <div class="scr-ns-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="scrEditCancel">Cancel</button>
          <button class="scr-btn scr-btn--primary" id="scrEditSave" title="Save (Ctrl+Enter)">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.querySelector('#scrEditTitle').focus();

    const close = () => dlg.remove();
    dlg.querySelector('#scrEditClose').addEventListener('click', close);
    dlg.querySelector('#scrEditCancel').addEventListener('click', close);

    const doSave = async () => {
      const title = dlg.querySelector('#scrEditTitle').value.trim();
      if (!title) { dlg.querySelector('#scrEditTitle').focus(); return false; }
      const description = dlg.querySelector('#scrEditDesc').value.trim();

      await window.db.screenDesigns.update({ id: screen.id, title, description });
      screen.title       = title;
      screen.description = description;

      const titleEl = this.container.querySelector('.scr-viewer__title');
      if (titleEl) titleEl.textContent = title;

      this._screens = await window.db.screenDesigns.list(this._projectId);
      this._refreshSidebar();
      return true;
    };

    dlg.querySelector('#scrEditSave').addEventListener('click', async () => {
      if (await doSave()) close();
    });

    dlg.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        if (await doSave()) close();
      }
      if (e.key === 'Escape') close();
    });
  }

  async _saveToHistory(prompt) {
    if (!prompt || !this._activeId) return;
    const existing = await window.db.screenPromptHistory.list({ project_id: this._projectId, screen_design_id: this._activeId });
    if (existing.some(e => e.prompt === prompt)) return;
    await window.db.screenPromptHistory.create({ project_id: this._projectId, screen_design_id: this._activeId, prompt });
    this._loadPromptHistory();
  }

  async _loadPromptHistory() {
    const container = this.container.querySelector('#scrPromptHistory');
    if (!container) return;
    const items = await window.db.screenPromptHistory.list({ project_id: this._projectId, screen_design_id: this._activeId });
    if (items.length === 0) { container.innerHTML = ''; return; }

    const descEl = () => this.container.querySelector('#scrDescription');

    container.innerHTML = `
      <div class="scr-ph-header">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.4"/>
          <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Recent prompts
        <button class="scr-ph-delete-all" title="Clear all recent prompts" aria-label="Clear all">
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8M5.5 6v4M8.5 6v4"
              stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="scr-ph-list">
        ${items.map(h => `
          <div class="scr-ph-item" data-id="${h.id}" title="${escHtml(h.prompt)}">
            <svg class="scr-ph-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M4 3l9 5-9 5V3z" fill="currentColor" opacity="0.6"/>
            </svg>
            <span class="scr-ph-item__text">${escHtml(h.prompt.length > 80 ? h.prompt.slice(0, 80) + '…' : h.prompt)}</span>
            <span class="scr-ph-item__time">${timeAgo(h.executed_at)}</span>
            <button class="scr-ph-item__delete" data-id="${h.id}" title="Remove" aria-label="Remove">
              <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8"
                  stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        `).join('')}
      </div>
    `;

    container.querySelectorAll('.scr-ph-item').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.scr-ph-item__delete')) return;
        const ta = descEl();
        if (ta) { ta.value = items[i].prompt; ta.focus(); }
      });
    });

    container.querySelectorAll('.scr-ph-item__delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.db.screenPromptHistory.delete(Number(btn.dataset.id));
        this._loadPromptHistory();
      });
    });

    container.querySelector('.scr-ph-delete-all').addEventListener('click', async () => {
      await window.db.screenPromptHistory.deleteAll({ project_id: this._projectId, screen_design_id: this._activeId });
      this._loadPromptHistory();
    });
  }

  async _runInTerminal() {
    const main  = this.container.querySelector('#scrMain');
    const title = main.querySelector('#scrTitle').value.trim();
    const desc  = main.querySelector('#scrDescription').value.trim();
    if (!title) { main.querySelector('#scrTitle').focus(); return; }
    if (!desc)  { main.querySelector('#scrDescription').focus(); return; }

    const model = this._getSelectedModel();
    if (!model || model.type === 'anthropic' || !model.executable) {
      alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
      return;
    }

    await this._saveForm();
    this._screens = await window.db.screenDesigns.list(this._projectId);
    this._refreshSidebar();

    const project    = this._getProject();
    const screensDir = await window.app.screensDir(project?.name);
    const safeTitle  = title.replace(/[^a-z0-9_\-]/gi, '_');
    const outputFile = `${screensDir}\\${safeTitle}.html`;
    const prompt     = buildScreenPrompt(desc, project?.description || '', outputFile, this._getDesignTemplateForPrompt());
    const cmd        = buildPsCommand(prompt, model);

    this._showPromptPreviewModal(prompt, async () => {
      await window.db.terminal.openExternal({ command: cmd, cwd: screensDir });
      await this._saveToHistory(desc);
    });
  }

  async _chooseFile() {
    if (!this._editingId) {
      const saved = await this._saveForm();
      if (!saved) return;
    }

    const result = await window.db.dialog.openFile({
      title:      'Choose Generated Screen File',
      extensions: ['html', 'htm', 'dart', 'js', 'jsx', 'tsx', '*'],
    });
    if (!result) return;

    const screen = await window.db.screenDesigns.update({
      id:           this._editingId,
      html_content: result.content,
    });
    this._editingId = null;

    this._screens  = await window.db.screenDesigns.list(this._projectId);
    this._activeId = screen.id;
    this._refreshSidebar();
    this._showScreenViewer(screen);
  }

  // ----------------------------------------------------------------
  // Queue panel
  // ----------------------------------------------------------------
  async _renderQueuePanel(panel) {
    const allScreens = await window.db.screenDesigns.list(this._projectId);
    const queued     = allScreens.filter(s => s.queued && s.is_active !== 0);

    panel.innerHTML = `
      <div class="scr-queue-panel">
        <div class="scr-queue-panel__header">
          <span class="scr-queue-panel__title">Queue</span>
          <span class="scr-queue-panel__count">${queued.length} screen${queued.length !== 1 ? 's' : ''}</span>
          <div style="flex:1"></div>
          <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrQueueStopBtn" hidden>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/>
            </svg>
            Stop
          </button>
          <button class="scr-btn scr-btn--sm scr-btn--secondary" id="scrQueueClearBtn" hidden>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M4 8h8M8 4l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Clear completed
          </button>
          <button class="scr-btn scr-btn--primary scr-btn--sm" id="scrQueueRunBtn" ${queued.length === 0 ? 'disabled' : ''}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
              <path d="M4 3l9 5-9 5V3z" fill="currentColor"/>
            </svg>
            Run All
          </button>
        </div>
        <div class="scr-queue-panel__list" id="scrQueueList">
          ${queued.length === 0
            ? '<p class="scr-queue-panel__empty">No screens are queued. Set <strong>queued = 1</strong> on screens to add them here.</p>'
            : queued.map(s => `
              <div class="scr-queue-item" data-id="${s.id}">
                <div class="scr-queue-item__row">
                  <svg class="scr-queue-item__icon" width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                  </svg>
                  <span class="scr-queue-item__title">${escHtml(s.title)}</span>
                  ${s.description ? '' : '<span class="scr-queue-item__no-desc" title="No description — will be skipped">No description</span>'}
                  ${s.description ? `<button class="scr-queue-item__prompt-btn" data-prompt-id="${s.id}" title="Show prompt">
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                      <path d="M8 7v4M8 5.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    </svg>
                  </button>` : ''}
                  <span class="scr-queue-item__status scr-queue-item__status--pending" id="scrQueueStatus-${s.id}">Pending</span>
                </div>
                ${s.description ? `<pre class="scr-queue-item__prompt-pre" id="scrQueuePrompt-${s.id}" hidden></pre>` : ''}
              </div>
            `).join('')}
        </div>
      </div>
    `;

    if (queued.length === 0) return;

    const runBtn   = panel.querySelector('#scrQueueRunBtn');
    const stopBtn  = panel.querySelector('#scrQueueStopBtn');
    const clearBtn = panel.querySelector('#scrQueueClearBtn');

    const refreshBadges = () => this._refreshHeaderQueueBadge();

    runBtn.addEventListener('click', () => {
      runBtn.hidden  = true;
      stopBtn.hidden = false;
      this._runQueue(queued, panel, () => {
        runBtn.hidden  = false;
        stopBtn.hidden = true;
        clearBtn.hidden = false;
        refreshBadges();
      });
    });

    stopBtn.addEventListener('click', () => {
      this._queueStopped = true;
      window.app.chat.cancel();
      window.app.chat.offAll();
      stopBtn.hidden  = true;
      runBtn.hidden   = false;
      clearBtn.hidden = false;
    });

    clearBtn.addEventListener('click', async () => {
      // Re-render panel — done items already have queued=0 in DB so they disappear naturally
      await this._renderQueuePanel(panel);
      this._refreshSidebar();
      refreshBadges();
    });

    // Prompt preview toggles
    panel.querySelectorAll('.scr-queue-item__prompt-btn').forEach(btn => {
      const id      = Number(btn.dataset.promptId);
      const screen  = queued.find(s => s.id === id);
      const pre     = panel.querySelector(`#scrQueuePrompt-${id}`);
      if (!screen || !pre) return;
      btn.addEventListener('click', () => {
        const open = !pre.hidden;
        if (open) {
          pre.hidden = true;
          btn.classList.remove('scr-queue-item__prompt-btn--active');
        } else {
          if (!pre.dataset.built) {
            pre.textContent = buildScreenPrompt(
              screen.description,
              this._project?.description || '',
              '',
              this._getDesignTemplateForPrompt()
            );
            pre.dataset.built = '1';
          }
          pre.hidden = false;
          btn.classList.add('scr-queue-item__prompt-btn--active');
        }
      });
    });
  }

  _tgNotify(text) {
    window.app.telegram.send(text).catch(() => {});
  }

  async _runQueue(screens, panel, onFinish) {
    this._queueStopped = false;
    const model = this._getSelectedModel();
    if (!model) { alert('No model selected.'); onFinish(); return; }

    const projectName = this._project?.name || 'project';
    let doneCount  = 0;
    let errorCount = 0;

    for (const screen of screens) {
      if (this._queueStopped) break;

      const statusEl = panel.querySelector(`#scrQueueStatus-${screen.id}`);
      if (!screen.description) {
        if (statusEl) {
          statusEl.textContent = 'Skipped';
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--skipped';
        }
        continue;
      }

      if (statusEl) {
        statusEl.textContent = 'Running…';
        statusEl.className   = 'scr-queue-item__status scr-queue-item__status--running';
      }

      const prompt = buildScreenPrompt(
        screen.description,
        this._project?.description || '',
        '',
        this._getDesignTemplateForPrompt()
      );

      const result = await new Promise(resolve => {
        window.app.chat.offAll();
        window.app.chat.onDone(resolve);
        window.app.chat.generate({ prompt, model });
      });

      if (this._queueStopped) break;

      if (result.html && !result.error) {
        await window.db.screenDesigns.update({
          id:           screen.id,
          html_content: result.html,
          executed:     1,
          queued:       0,
        });
        screen.html_content = result.html;
        screen.executed     = 1;
        screen.queued       = 0;
        doneCount++;
        if (statusEl) {
          statusEl.textContent = 'Done';
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--done';
        }
        this._tgNotify(`✅ *${screen.title}* generated successfully\n_Project: ${projectName}_`);
      } else {
        errorCount++;
        const errMsg = result.error || 'Unknown error';
        if (statusEl) {
          statusEl.textContent = errMsg;
          statusEl.className   = 'scr-queue-item__status scr-queue-item__status--error';
        }
        this._tgNotify(`❌ *${screen.title}* failed\n\`${errMsg}\`\n_Project: ${projectName}_`);
      }
    }

    window.app.chat.offAll();

    if (this._queueStopped) {
      this._tgNotify(`⏹ Queue stopped — ${doneCount} done, ${errorCount} error${errorCount !== 1 ? 's' : ''}\n_Project: ${projectName}_`);
    } else {
      this._tgNotify(`🏁 Queue finished — ${doneCount} done, ${errorCount} error${errorCount !== 1 ? 's' : ''}\n_Project: ${projectName}_`);
    }

    onFinish();
  }

  // ----------------------------------------------------------------
  // Screen viewer
  // ----------------------------------------------------------------
  async _selectScreen(id) {
    this._activeId  = id;
    this._activeTab = 'preview';
    this._setActiveItem(id);
    const screen = await window.db.screenDesigns.get(id);
    if (!screen) return;
    this._showScreenViewer(screen);
  }

  _setActiveItem(id) {
    this.container.querySelectorAll('.scr-sidebar__item').forEach(el => {
      el.classList.toggle('scr-sidebar__item--active', Number(el.dataset.id) === id);
    });
  }

  _renderValidationBar(screen) {
    if (screen.style_valid === null || screen.style_valid === undefined) return '';
    if (screen.style_valid === 1) {
      return `<div class="scr-val-bar scr-val-bar--ok">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
          <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Style validation passed — all design system rules applied correctly.
      </div>`;
    }
    let issues = [];
    try { issues = JSON.parse(screen.style_issues || '[]'); } catch (_) {}
    const list = issues.map(i => `<li>${escHtml(i)}</li>`).join('');
    return `<div class="scr-val-bar scr-val-bar--warn">
      <div class="scr-val-bar__header">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M8 2L14 13H2L8 2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
          <path d="M8 7v3M8 11.5v.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
        </svg>
        ${issues.length} style issue${issues.length !== 1 ? 's' : ''} found
        <button class="scr-val-bar__fix" id="scrAutoFixBtn">Auto-fix</button>
      </div>
      ${list ? `<ul class="scr-val-bar__list">${list}</ul>` : ''}
    </div>`;
  }

  _runValidation(screen) {
    const model = this._getSelectedModel();
    if (!model) { alert('No model selected.'); return; }
    if (!screen.html_content) { alert('Generate the screen first before validating.'); return; }
    const designTemplate = this._getDesignTemplateForPrompt();
    if (!designTemplate) { alert('No design system defined. Open Styles to create one.'); return; }

    const bar = this.container.querySelector('#scrValidationBar');
    const btn = this.container.querySelector('#scrValidateBtn');
    if (bar) bar.innerHTML = `<div class="scr-val-bar scr-val-bar--running">
      <span class="scr-chat-stream-dot"></span> Validating style…
    </div>`;
    if (btn) { btn.disabled = true; btn.textContent = 'Validating…'; }

    let accumulated = '';
    window.app.validate.offAll();

    window.app.validate.onToken(({ text }) => { accumulated += text; });

    window.app.validate.onDone(async ({ raw, error }) => {
      window.app.validate.offAll();
      if (btn) { btn.disabled = false; btn.textContent = 'Validate'; }

      const fullText = raw || accumulated;
      let result = { valid: false, issues: [error || 'Could not parse validation response.'] };
      if (fullText) {
        try {
          const start = fullText.indexOf('{');
          const end   = fullText.lastIndexOf('}');
          if (start !== -1 && end > start) result = JSON.parse(fullText.slice(start, end + 1));
        } catch (_) {}
      }

      const styleValid  = result.valid ? 1 : 0;
      const styleIssues = JSON.stringify(result.issues || []);
      await window.db.screenDesigns.update({ id: screen.id, style_valid: styleValid, style_issues: styleIssues });
      screen.style_valid  = styleValid;
      screen.style_issues = styleIssues;

      if (bar) bar.innerHTML = this._renderValidationBar(screen);
      this._refreshSidebar();
      this._bindValidationBarEvents(screen);
    });

    window.app.validate.run({
      screenTitle:    screen.title,
      htmlContent:    screen.html_content,
      designTemplate,
      model,
    });
  }

  _bindValidationBarEvents(screen) {
    const fixBtn = this.container.querySelector('#scrAutoFixBtn');
    if (!fixBtn) return;
    fixBtn.addEventListener('click', () => {
      let issues = [];
      try { issues = JSON.parse(screen.style_issues || '[]'); } catch (_) {}
      if (!issues.length) return;

      const fixPrompt = `Fix the following style violations so the screen matches the design system exactly:\n${issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}`;
      const chatInput = this.container.querySelector('#scrDescription');
      if (chatInput) {
        chatInput.value = fixPrompt;
        chatInput.style.height = 'auto';
        chatInput.style.height = chatInput.scrollHeight + 'px';
        chatInput.focus();
      }
    });
  }

  _showScreenViewer(screen) {
    const main   = this.container.querySelector('#scrMain');

    main.innerHTML = `
      <div class="scr-viewer">
        <div class="scr-viewer__toolbar">
          <div class="scr-viewer__meta">
            <span class="scr-viewer__title">${escHtml(screen.title)}</span>
            <span class="scr-viewer__tech-badge">${TECH}</span>
            <button class="scr-btn scr-btn--sm" id="scrEditDetailsBtn" title="Rename title (E)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
              </svg>
              Edit
            </button>
          </div>
          <div class="scr-viewer__actions">
            ${screen.html_content && this._hasAnyTemplate() ? `
            <button class="scr-btn scr-btn--sm scr-btn--secondary" id="scrValidateBtn" title="Validate style against design system">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Validate
            </button>
            ` : ''}
            <div class="scr-actions-menu" id="scrActionsMenu">
              <button class="scr-btn scr-btn--sm scr-btn--secondary" id="scrActionsMenuTrigger" title="Actions">
                Actions
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <div class="scr-actions-dropdown" id="scrActionsDropdown" hidden>
                <button class="scr-actions-dropdown__item" id="scrExportHtmlBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 10v3a1 1 0 001 1h10a1 1 0 001-1v-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                    <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Export HTML
                </button>
                <button class="scr-actions-dropdown__item" id="scrRunBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                    <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
                    <path d="M10 7h3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  </svg>
                  Run in Terminal
                </button>
                <button class="scr-actions-dropdown__item" id="scrEditBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  </svg>
                  Edit Mockup in Terminal
                </button>
                <button class="scr-actions-dropdown__item" id="scrChooseFileBtn">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M2 4a1 1 0 011-1h3l1.5 2H13a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
                  </svg>
                  Choose File
                </button>
              </div>
            </div>

            <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrDeleteBtn" title="Delete screen">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="scr-viewer__edit-panel" id="scrEditPanel" hidden>
          <textarea class="scr-desc-editor__textarea" id="scrViewerDescTextarea" placeholder="Describe this screen… (supports Markdown)"></textarea>
          <div class="scr-viewer__edit-footer">
            <button class="scr-btn scr-btn--sm scr-btn--danger" id="scrEditPanelDeleteBtn">
              <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                <path d="M2 3.5h10M5.5 3.5V2.5h3v1M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Delete
            </button>
            <button class="scr-btn scr-btn--sm scr-btn--primary" id="scrViewerSaveBtn">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/>
                <polyline points="7 3 7 8 15 8"/>
              </svg>
              Save
            </button>
          </div>
        </div>
        <div class="scr-validation-bar" id="scrValidationBar">${this._renderValidationBar(screen)}</div>

        <div class="scr-viewer__split" id="scrSplit">
          <div class="scr-viewer__preview-pane" id="scrPreviewPane">
            <div class="scr-viewer__preview-bar">
              <span class="scr-viewer__preview-label">Preview <span id="scrPreviewPct" class="scr-split-pct"></span></span>
              <button class="scr-btn scr-btn--sm" id="scrViewportToggle"></button>
              <button class="scr-btn scr-btn--sm" id="scrRefreshBtn" title="Refresh preview (R)">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                  <path d="M13.5 2.5v2.7H10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span><u>R</u>efresh</span>
              </button>
            </div>
            <div class="scr-viewer__content" id="scrViewerContent">
              <iframe class="scr-viewer__iframe" id="scrPreviewFrame"></iframe>
            </div>
          </div>

          <div class="scr-viewer__divider" id="scrDivider"></div>

          <div class="scr-viewer__edit-pane" id="scrEditPane">
            <div class="scr-chat-pane">
              <div class="scr-chat-header">
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                  <path d="M5.5 8.5l1.5 1.5L10.5 6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="scr-chat-header-label">Chat <span id="scrEditPct" class="scr-split-pct"></span></span>
                <span class="scr-viewer__model-name" id="scrModelName">${escHtml(this._getSelectedModel()?.label || 'No model selected')}</span>
                <button class="scr-chat-load-desc" id="scrChatHistoryBtn" title="Recent prompts" style="margin-left:auto">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="1.3"/>
                    <path d="M8 5v3.5l2 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button class="scr-chat-load-desc" id="scrLoadDescBtn" title="Load saved description">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
                    <path d="M5 6h6M5 9h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div class="scr-chat-messages" id="scrChatMessages">
                <div class="scr-chat-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" opacity="0.25">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                  </svg>
                  <p>Describe what you'd like to build and click <strong>Create Mockup</strong>.</p>
                </div>
              </div>
              <div class="scr-chat-composer">
                <textarea class="scr-chat-input" id="scrDescription"
                  placeholder="Describe the screen… (Alt+Enter for new line)"></textarea>
                <button class="scr-chat-send" id="scrSendBtn" title="Run (Enter)">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2l11 6-11 6V9.5l8-1.5-8-1.5V2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this._loadPreview(screen.html_content);
    this._bindViewerEvents(screen);
  }

  _loadPreview(html) {
    const frame = this.container.querySelector('#scrPreviewFrame');
    if (!frame) return;
    // Inject a guard that prevents any anchor from navigating outside the iframe.
    // onclick handlers on the elements still fire normally — only the default
    // link-navigation action is cancelled.
    const guard = `<script>
(function(){
  document.addEventListener('click', function(e){
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    var href = (a.getAttribute('href') || '').trim();
    if (href.startsWith('#') && href.length > 1) {
      var el = document.getElementById(href.slice(1)) || document.querySelector('[name="' + href.slice(1) + '"]');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, true);
})();
<\/script>`;
    const guarded = html.includes('</head>')
      ? html.replace('</head>', guard + '</head>')
      : guard + html;
    frame.srcdoc = guarded;
  }

  _bindViewerEvents(screen) {
    const main = this.container.querySelector('#scrMain');

    // Auto-resize chat composer
    const chatInput = main.querySelector('#scrDescription');
    const resizeChatInput = () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = chatInput.scrollHeight + 'px';
    };
    chatInput.addEventListener('input', resizeChatInput);
    resizeChatInput();

    // Enter to run; Alt+Enter inserts newline
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.altKey) {
        e.preventDefault();
        const pos = chatInput.selectionStart;
        chatInput.value = chatInput.value.slice(0, pos) + '\n' + chatInput.value.slice(chatInput.selectionEnd);
        chatInput.selectionStart = chatInput.selectionEnd = pos + 1;
        resizeChatInput();
      } else if (e.key === 'Enter' && !e.altKey) {
        e.preventDefault();
        this._runChatGeneration(screen, chatInput, main);
      }
    });

    main.querySelector('#scrSendBtn').addEventListener('click', () => {
      this._runChatGeneration(screen, chatInput, main);
    });

    // Recent prompts history
    main.querySelector('#scrChatHistoryBtn').addEventListener('click', () => this._showHistoryInChat(main));

    // Load saved description into composer
    main.querySelector('#scrLoadDescBtn').addEventListener('click', () => {
      const saved = screen.description || '';
      if (!saved) return;
      chatInput.value = saved;
      resizeChatInput();
      chatInput.focus();
    });

    // Draggable divider
    const divider      = main.querySelector('#scrDivider');
    const splitEl      = main.querySelector('#scrSplit');
    const editPane     = main.querySelector('#scrEditPane');
    const previewPctEl = main.querySelector('#scrPreviewPct');
    const editPctEl    = main.querySelector('#scrEditPct');

    const updatePct = () => {
      const total = splitEl.getBoundingClientRect().width;
      if (!total) return;
      const editW   = editPane.getBoundingClientRect().width;
      const editPct = Math.round((editW / total) * 100);
      if (editPctEl)    editPctEl.textContent    = editPct + '%';
      if (previewPctEl) previewPctEl.textContent = (100 - editPct) + '%';
    };
    requestAnimationFrame(updatePct);

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX            = e.clientX;
      const startEditWidth    = editPane.getBoundingClientRect().width;
      const startPreviewWidth = previewPane.getBoundingClientRect().width;
      const totalWidth        = splitEl.getBoundingClientRect().width;

      // Iframe captures mousemove once the cursor enters it — block it during drag
      const iframe = main.querySelector('#scrPreviewFrame');
      if (iframe) iframe.style.pointerEvents = 'none';
      document.body.style.cursor    = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (mv) => {
        const delta = mv.clientX - startX;
        const isMobile = (localStorage.getItem(VIEWPORT_KEY) || 'desktop') === 'mobile';
        if (isMobile) {
          // In mobile mode, preview is fixed and edit is flexible — resize the preview pane
          const newPreviewWidth = Math.min(Math.max(startPreviewWidth + delta, 200), totalWidth - 200);
          previewPane.style.flex = `0 0 ${newPreviewWidth}px`;
          const previewPct = Math.round((newPreviewWidth / totalWidth) * 100);
          if (previewPctEl) previewPctEl.textContent = previewPct + '%';
          if (editPctEl)    editPctEl.textContent    = (100 - previewPct) + '%';
        } else {
          // In desktop mode, edit is fixed and preview is flexible — resize the edit pane
          const newEditWidth = Math.min(Math.max(startEditWidth - delta, 200), totalWidth - 200);
          editPane.style.flex = `0 0 ${newEditWidth}px`;
          const editPct = Math.round((newEditWidth / totalWidth) * 100);
          if (editPctEl)    editPctEl.textContent    = editPct + '%';
          if (previewPctEl) previewPctEl.textContent = (100 - editPct) + '%';
        }
      };

      const onUp = () => {
        if (iframe) iframe.style.pointerEvents = '';
        document.body.style.cursor    = '';
        document.body.style.userSelect = '';
        divider.classList.remove('scr-viewer__divider--dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',  onUp);
      };

      divider.classList.add('scr-viewer__divider--dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',  onUp);
    });

    const VIEWPORT_KEY  = 'mockups_preview_mode';
    const mobileIcon   = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="4.5" y="1" width="7" height="14" rx="1.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="12.5" r=".7" fill="currentColor"/></svg> Desktop`;
    const desktopIcon  = `<svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="1" y="2" width="14" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 14h6M8 12v2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg> <span><u>M</u>obile</span>`;
    const viewportBtn  = main.querySelector('#scrViewportToggle');
    const previewPane  = main.querySelector('#scrPreviewPane');

    const applyViewport = (mode) => {
      localStorage.setItem(VIEWPORT_KEY, mode);
      if (mode === 'mobile') {
        previewPane.style.flex = '0 0 500px';
        editPane.style.flex    = '1 1 0';
        viewportBtn.innerHTML  = mobileIcon;
        viewportBtn.title      = 'Switch to desktop preview (M)';
      } else {
        previewPane.style.flex = '';
        editPane.style.flex    = '0 0 25%';
        viewportBtn.innerHTML  = desktopIcon;
        viewportBtn.title      = 'Switch to mobile preview (M)';
      }
      requestAnimationFrame(updatePct);
    };

    applyViewport(localStorage.getItem(VIEWPORT_KEY) || 'desktop');
    viewportBtn.addEventListener('click', () => {
      applyViewport((localStorage.getItem(VIEWPORT_KEY) || 'desktop') === 'mobile' ? 'desktop' : 'mobile');
    });

    main.querySelector('#scrEditDetailsBtn').addEventListener('click', () => this._showEditScreenModal(screen));

    main.querySelector('#scrValidateBtn')?.addEventListener('click', () => this._runValidation(screen));
    this._bindValidationBarEvents(screen);

    const split          = main.querySelector('#scrSplit');
    const editPanel      = main.querySelector('#scrEditPanel');

    // Always show preview/chat split; hide legacy edit panel
    split.hidden     = false;
    editPanel.hidden = true;

    this._refreshHeaderQueueBadge();

    // Edit panel — description textarea + save
    const viewerDescTextarea = main.querySelector('#scrViewerDescTextarea');
    viewerDescTextarea.value = screen.description || '';
    const viewerSaveBtn = main.querySelector('#scrViewerSaveBtn');

    const VIEWER_SAVE_DEFAULT = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
        <polyline points="17 21 17 13 7 13 7 21"/>
        <polyline points="7 3 7 8 15 8"/>
      </svg>
      Save`;

    const doViewerDescSave = async () => {
      if (viewerSaveBtn.disabled) return;
      viewerSaveBtn.disabled = true;
      viewerSaveBtn.innerHTML = `<span class="scr-save-spinner"></span> Saving…`;
      try {
        const desc = viewerDescTextarea.value.trim();
        await window.db.screenDesigns.update({ id: screen.id, description: desc });
        screen.description = desc;
        this._refreshSidebar();
        viewerSaveBtn.textContent = '✓ Saved';
        setTimeout(() => {
          viewerSaveBtn.innerHTML = VIEWER_SAVE_DEFAULT;
          viewerSaveBtn.disabled = false;
        }, 1000);
      } catch {
        viewerSaveBtn.innerHTML = VIEWER_SAVE_DEFAULT;
        viewerSaveBtn.disabled = false;
      }
    };

    viewerSaveBtn.addEventListener('click', doViewerDescSave);

    main.querySelector('#scrEditPanelDeleteBtn').addEventListener('click', () => {
      this._showDeleteConfirmDialog(screen, async () => {
        await window.db.screenDesigns.delete(screen.id);
        this._screens  = await window.db.screenDesigns.list(this._projectId);
        this._activeId = this._screens[0]?.id ?? null;
        this._refreshSidebar();
        if (this._activeId) this._selectScreen(this._activeId);
        else                this._showEmptyState();
      });
    });

    if (this._ctrlSHandler) document.removeEventListener('keydown', this._ctrlSHandler);
    this._ctrlSHandler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        const ep = main.querySelector('#scrEditPanel');
        if (ep && !ep.hidden) { e.preventDefault(); doViewerDescSave(); }
      }
    };
    document.addEventListener('keydown', this._ctrlSHandler);

    main.querySelector('#scrRefreshBtn').addEventListener('click', async () => {
      const title       = screen.title;
      const safeTitle   = title.replace(/[^a-z0-9_\-]/gi, '_');
      const projectName = this._project?.name;
      const safeProject = (projectName || '').replace(/[^a-z0-9_\-]/gi, '_');
      const rootDir     = await window.app.screensDir();
      const screensDir  = safeProject ? `${rootDir}\\${safeProject}` : rootDir;
      const filePath    = `${screensDir}\\${safeTitle}.html`;

      const [fileContent, fileStat, fresh] = await Promise.all([
        window.shell.readFile(filePath),
        window.shell.statFile(filePath),
        window.db.screenDesigns.get(screen.id),
      ]);

      if (!fileContent) {
        if (fresh) {
          screen.html_content = fresh.html_content;
          this._loadPreview(fresh.html_content);
        }
        return;
      }

      // SQLite datetime('now') is UTC but lacks 'Z' — append it so Date parses correctly
      const dbUpdatedAt = fresh?.updated_at ? new Date(fresh.updated_at.replace(' ', 'T') + 'Z').getTime() : 0;
      const fileIsOlder = fileStat && fileStat.mtimeMs < dbUpdatedAt;

      const doRefresh = () => {
        window.db.screenDesigns.update({ id: screen.id, html_content: fileContent });
        screen.html_content = fileContent;
        this._loadPreview(fileContent);
      };

      if (fileIsOlder) {
        this._showConfirmDialog(
          'File is older than current version',
          'The file on disk was last modified before the latest database change. Overwriting will lose unsaved edits.',
          'Overwrite anyway',
          doRefresh
        );
      } else {
        doRefresh();
      }
    });

    // Actions dropdown toggle
    const actionsMenuEl = main.querySelector('#scrActionsMenu');
    const dropdownEl    = main.querySelector('#scrActionsDropdown');
    main.querySelector('#scrActionsMenuTrigger').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownEl.hidden = !dropdownEl.hidden;
    });
    dropdownEl.addEventListener('click', () => { dropdownEl.hidden = true; });
    document.addEventListener('click', (e) => {
      if (!actionsMenuEl.contains(e.target)) dropdownEl.hidden = true;
    }, { capture: false });

    main.querySelector('#scrExportHtmlBtn').addEventListener('click', async () => {
      const fresh = await window.db.screenDesigns.get(screen.id);
      const html  = fresh?.html_content || screen.html_content || '';
      if (!html) {
        alert('No HTML content to export. Generate a mockup first.');
        return;
      }

      const folderPath = await window.db.dialog.openFolder();
      if (!folderPath) return;

      const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
      const fileName   = `${safeTitle}.html`;
      const filePath   = `${folderPath}\\${fileName}`;
      const existing = await window.shell.readFile(filePath);
      if (existing) {
        this._showOverwriteConfirmDialog(fileName, async () => {
          await window.shell.writeFile(filePath, html);
        });
      } else {
        await window.shell.writeFile(filePath, html);
        this._showExportSuccessModal(fileName);
      }
    });

    main.querySelector('#scrRunBtn').addEventListener('click', async () => {
      const model = this._getSelectedModel();
      if (!model || model.type === 'anthropic' || !model.executable) {
        alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
        return;
      }

      const desc = screen.description || '';
      if (!desc) {
        alert('No description saved for this screen. Edit the screen details and add a description first.');
        return;
      }

      const project    = this._getProject();
      const screensDir = await window.app.screensDir(project?.name);
      const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
      const outputFile = `${screensDir}\\${safeTitle}.html`;
      const prompt     = buildScreenPrompt(desc, project?.description || '', outputFile, this._getDesignTemplateForPrompt());
      const cmd        = buildPsCommand(prompt, model);
      this._showPromptPreviewModal(cmd, async () => {
        await window.db.terminal.openExternal({ command: cmd, cwd: screensDir });
        await this._saveToHistory(desc);
      });
    });

    main.querySelector('#scrEditBtn').addEventListener('click', () => this._openEdits(screen.title, screen.id));

    main.querySelector('#scrChooseFileBtn').addEventListener('click', async () => {
      const result = await window.db.dialog.openFile({
        title:      'Choose Generated Screen File',
        extensions: ['html', 'htm', 'dart', 'js', 'jsx', 'tsx', '*'],
      });
      if (!result) return;

      await window.db.screenDesigns.update({ id: screen.id, html_content: result.content });
      screen.html_content = result.content;
      this._loadPreview(result.content);
    });

    main.querySelector('#scrExtractBtn')?.addEventListener('click', () => this._showExtractDialog(screen));

    main.querySelector('#scrDeleteBtn').addEventListener('click', () => {
      this._showDeleteConfirmDialog(screen, async () => {
        await window.db.screenDesigns.delete(screen.id);
        this._screens  = await window.db.screenDesigns.list(this._projectId);
        this._activeId = this._screens[0]?.id ?? null;
        this._refreshSidebar();
        if (this._activeId) this._selectScreen(this._activeId);
        else                this._showEmptyState();
      });
    });

    // Viewer keyboard shortcuts — skip when focus is in an input/textarea
    const viewerKeyHandler = (e) => {
      if (e.target.matches('input, textarea, select, [contenteditable]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        main.querySelector('#scrEditDetailsBtn')?.click();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        main.querySelector('#scrViewportToggle')?.click();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        main.querySelector('#scrRefreshBtn')?.click();
      }
    };
    document.addEventListener('keydown', viewerKeyHandler);
    // Clean up when this viewer is replaced
    const observer = new MutationObserver(() => {
      if (!document.contains(main)) {
        document.removeEventListener('keydown', viewerKeyHandler);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    this._loadInitialHistory(screen.id, main);
    this._updateMockupBtns();
  }

  // ----------------------------------------------------------------
  // Design template parser + preview builder
  // ----------------------------------------------------------------
  _parseDesignTemplate(text) {
    const lines  = text.split('\n');
    const hexRe  = /#[0-9a-fA-F]{6,8}\b|#[0-9a-fA-F]{3,4}\b/;
    const r = {
      primary: null, background: null, surface: null,
      textPrimary: null, textSecondary: null,
      border: null, danger: null, fontFamily: null, borderRadius: null,
    };

    for (const line of lines) {
      const low = line.toLowerCase().replace(/[_\-]/g, ' ');
      const hex = line.match(hexRe)?.[0];

      if (!r.primary && hex && /\bprimary\b/.test(low) && !/text|on |background|container/.test(low))
        r.primary = hex;
      if (!r.background && hex && /background|\bbg\b/.test(low) && !/surface|card|container/.test(low))
        r.background = hex;
      if (!r.surface && hex && /\bsurface\b|\bcard\b/.test(low) && !/variant|hover|secondary/.test(low))
        r.surface = hex;
      if (!r.textPrimary && hex && /text primary|on background|onbackground|on surface(?! variant)/.test(low))
        r.textPrimary = hex;
      if (!r.textSecondary && hex && /text secondary|text muted|onsurface|on surface/.test(low))
        r.textSecondary = hex;
      if (!r.border && hex && /\bborder\b|\boutline\b/.test(low) && !/radius/.test(low))
        r.border = hex;
      if (!r.danger && hex && /\bdanger\b|\berror\b/.test(low))
        r.danger = hex;
      if (!r.fontFamily) {
        const m = line.match(/font[- ]family\s*[: ]+(.+)/i);
        if (m) r.fontFamily = m[1].split(',')[0].trim().replace(/^['"]|['"]$/g, '') + ', system-ui, sans-serif';
      }
      if (!r.borderRadius && /button|card|input|border.?radius|borderradius/i.test(low)) {
        const rx = line.match(/(\d+)\s*(?:px|dp)\b/);
        if (rx) r.borderRadius = `${rx[1]}px`;
      }
    }

    return {
      primary:       r.primary       || '#6366f1',
      background:    r.background    || '#0f1117',
      surface:       r.surface       || '#1a1d27',
      textPrimary:   r.textPrimary   || '#f1f5f9',
      textSecondary: r.textSecondary || '#94a3b8',
      border:        r.border        || '#2a2d3e',
      danger:        r.danger        || '#ef4444',
      fontFamily:    r.fontFamily    || "'Segoe UI', system-ui, sans-serif",
      borderRadius:  r.borderRadius  || '8px',
    };
  }

  _buildPreviewHtml(v, contextTheme = 'dark') {
    const toRgb = hex => {
      const h = hex.replace('#', '');
      const full = h.length <= 4 ? h.split('').map(c => c + c).join('') : h;
      return [0,2,4].map(i => parseInt(full.slice(i, i+2), 16)).join(',');
    };
    const primaryRgb = toRgb(v.primary);

    const ctxBg = { dark: '#0f1117', light: '#f0ece6', midnight: '#08080f' }[contextTheme] || '#0f1117';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: ${ctxBg};
    color: ${v.textPrimary};
    font-family: ${v.fontFamily};
    font-size: 13px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 100vh;
  }
  .card {
    background: ${v.surface};
    border: 1px solid ${v.border};
    border-radius: ${v.borderRadius};
    padding: 14px;
  }
  h3 { font-size: 14px; font-weight: 600; margin-bottom: 5px; }
  p  { color: ${v.textSecondary}; font-size: 12px; line-height: 1.6; margin-bottom: 10px; }
  .btn-row { display: flex; gap: 7px; flex-wrap: wrap; }
  button {
    display: inline-flex; align-items: center;
    padding: 6px 13px; font-size: 12px; font-weight: 500;
    border-radius: ${v.borderRadius}; border: none; cursor: pointer;
    font-family: inherit;
  }
  .btn-primary { background: ${v.primary}; color: #fff; }
  .btn-outline { background: transparent; color: ${v.primary}; border: 1px solid ${v.primary}; }
  .btn-muted   { background: transparent; color: ${v.textSecondary}; border: 1px solid ${v.border}; }
  .btn-danger  { background: ${v.danger}; color: #fff; }
  input {
    display: block; width: 100%;
    padding: 6px 9px; margin-bottom: 9px;
    background: ${v.background}; border: 1px solid ${v.border};
    border-radius: ${v.borderRadius}; color: ${v.textPrimary};
    font-size: 12px; font-family: inherit; outline: none;
  }
  .badge {
    display: inline-flex; align-items: center;
    font-size: 11px; padding: 2px 8px; border-radius: 999px;
    background: rgba(${primaryRgb},.12); color: ${v.primary};
    border: 1px solid rgba(${primaryRgb},.3);
    margin-bottom: 10px;
  }
  .swatches { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
  .sw { display:flex; flex-direction:column; align-items:center; gap:3px; }
  .sw-dot { width:28px; height:28px; border-radius:6px; border:1px solid ${v.border}; }
  .sw-lbl { font-size:9px; color:${v.textSecondary}; }
</style>
</head>
<body>
  <div class="card">
    <h3>Color Palette</h3>
    <p>Extracted from your style guide.</p>
    <div class="swatches">
      <div class="sw"><div class="sw-dot" style="background:${v.primary}"></div><div class="sw-lbl">Primary</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.background}"></div><div class="sw-lbl">BG</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.surface}"></div><div class="sw-lbl">Surface</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.textPrimary}"></div><div class="sw-lbl">Text</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.textSecondary}"></div><div class="sw-lbl">Muted</div></div>
      <div class="sw"><div class="sw-dot" style="background:${v.danger}"></div><div class="sw-lbl">Danger</div></div>
    </div>
  </div>

  <div class="card">
    <h3>Typography</h3>
    <p>Font: ${v.fontFamily.split(',')[0]} · Border radius: ${v.borderRadius}</p>
    <span class="badge">Active</span>
  </div>

  <div class="card">
    <h3>Form Elements</h3>
    <input type="text" placeholder="Sample input field…" />
    <div class="btn-row">
      <button class="btn-primary">Primary</button>
      <button class="btn-outline">Outline</button>
      <button class="btn-muted">Muted</button>
      <button class="btn-danger">Danger</button>
    </div>
  </div>
</body>
</html>`;
  }

  // ----------------------------------------------------------------
  // Design System panel
  // ----------------------------------------------------------------
  _showDesignSystemPanel(onBack) {
    const EXAMPLES = [
      {
        label: 'DevFlow Default',
        light:
`Color Palette:
- Primary: #1e3a5f
- Background: #fdf8f0
- Surface: #fffdf7
- Text primary: #0a0804
- Text secondary: #2a2218
- Border: #4a3f2f
- Danger: #ef4444

Typography:
- Font family: 'Segoe UI', system-ui, sans-serif
- Heading: font-weight 600, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: border-radius 8px, padding 8px 18px, font-weight 500
- Cards: border-radius 12px, border 1px solid #4a3f2f, background #fffdf7
- Inputs: border-radius 8px, background #fdf8f0, border 1px solid #4a3f2f`,
        dark:
`Color Palette:
- Primary: #6366f1
- Background: #0f1117
- Surface: #1a1d27
- Text primary: #f1f5f9
- Text secondary: #94a3b8
- Border: #2a2d3e
- Danger: #ef4444

Typography:
- Font family: 'Segoe UI', system-ui, sans-serif
- Heading: font-weight 600, font-size 24px
- Body: font-weight 400, font-size 14px, line-height 1.5

Components:
- Buttons: border-radius 8px, padding 8px 18px, font-weight 500
- Cards: border-radius 12px, border 1px solid #2a2d3e, background #1a1d27
- Inputs: border-radius 8px, background #1a1d27, border 1px solid #2a2d3e`,
      },
      {
        label: 'Ocean Blue',
        light:
`Color Palette:
- Primary: #0284c7
- Background: #f0f9ff
- Surface: #e0f2fe
- Text primary: #0c4a6e
- Text secondary: #0369a1
- Border: #7dd3fc
- Danger: #ef4444

Typography:
- Font family: 'Inter', system-ui, sans-serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.6

Components:
- Buttons: border-radius 6px, padding 8px 16px, font-weight 600
- Cards: border-radius 10px, border 1px solid #7dd3fc, background #e0f2fe
- Inputs: border-radius 6px, background #f0f9ff, border 1px solid #7dd3fc`,
        dark:
`Color Palette:
- Primary: #38bdf8
- Background: #0c1a2e
- Surface: #0f2a47
- Text primary: #e0f2fe
- Text secondary: #7dd3fc
- Border: #1e3a5f
- Danger: #f87171

Typography:
- Font family: 'Inter', system-ui, sans-serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.6

Components:
- Buttons: border-radius 6px, padding 8px 16px, font-weight 600
- Cards: border-radius 10px, border 1px solid #1e3a5f, background #0f2a47
- Inputs: border-radius 6px, background #0c1a2e, border 1px solid #1e3a5f`,
      },
      {
        label: 'Forest Green',
        light:
`Color Palette:
- Primary: #16a34a
- Background: #f0fdf4
- Surface: #dcfce7
- Text primary: #14532d
- Text secondary: #15803d
- Border: #86efac
- Danger: #ef4444

Typography:
- Font family: 'Georgia', serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.7

Components:
- Buttons: border-radius 4px, padding 8px 18px, font-weight 600
- Cards: border-radius 8px, border 1px solid #86efac, background #dcfce7
- Inputs: border-radius 4px, background #f0fdf4, border 1px solid #86efac`,
        dark:
`Color Palette:
- Primary: #4ade80
- Background: #0a1a0f
- Surface: #0f2a1a
- Text primary: #dcfce7
- Text secondary: #86efac
- Border: #166534
- Danger: #f87171

Typography:
- Font family: 'Georgia', serif
- Heading: font-weight 700, font-size 22px
- Body: font-weight 400, font-size 14px, line-height 1.7

Components:
- Buttons: border-radius 4px, padding 8px 18px, font-weight 600
- Cards: border-radius 8px, border 1px solid #166534, background #0f2a1a
- Inputs: border-radius 4px, background #0a1a0f, border 1px solid #166534`,
      },
      {
        label: 'Minimal Mono',
        light:
`Color Palette:
- Primary: #18181b
- Background: #ffffff
- Surface: #f4f4f5
- Text primary: #09090b
- Text secondary: #71717a
- Border: #d4d4d8
- Danger: #ef4444

Typography:
- Font family: 'DM Mono', 'Courier New', monospace
- Heading: font-weight 600, font-size 20px
- Body: font-weight 400, font-size 13px, line-height 1.6

Components:
- Buttons: border-radius 2px, padding 7px 16px, font-weight 500
- Cards: border-radius 4px, border 1px solid #d4d4d8, background #f4f4f5
- Inputs: border-radius 2px, background #ffffff, border 1px solid #d4d4d8`,
        dark:
`Color Palette:
- Primary: #e4e4e7
- Background: #09090b
- Surface: #18181b
- Text primary: #fafafa
- Text secondary: #a1a1aa
- Border: #27272a
- Danger: #f87171

Typography:
- Font family: 'DM Mono', 'Courier New', monospace
- Heading: font-weight 600, font-size 20px
- Body: font-weight 400, font-size 13px, line-height 1.6

Components:
- Buttons: border-radius 2px, padding 7px 16px, font-weight 500
- Cards: border-radius 4px, border 1px solid #27272a, background #18181b
- Inputs: border-radius 2px, background #09090b, border 1px solid #27272a`,
      },
      {
        label: 'Flutter — Material 3',
        light:
`Framework: Flutter — Material Design 3

Color Scheme:
- Primary: #6750A4
- Background: #FFFBFE
- Surface: #FFFBFE
- Surface Variant: #E7E0EC
- Text primary (OnBackground): #1C1B1F
- Text secondary (OnSurface): #49454F
- Border (Outline): #79747E
- Error (Danger): #B3261E
- PrimaryContainer: #EADDFF

Typography (TextTheme):
- Font family: 'Roboto', sans-serif
- displayLarge: size 57dp, weight 400
- headlineMedium: size 28dp, weight 400
- titleLarge: size 22dp, weight 400
- bodyLarge: size 16dp, weight 400
- labelLarge: size 14dp, weight 500

Components:
- Cards: border-radius 12dp, elevation 1, background SurfaceVariant
- FilledButton: border-radius 100dp, height 40dp, background Primary
- OutlinedButton: border-radius 100dp, height 40dp, border Outline
- TextField: border-radius 4dp, filled style, fillColor SurfaceVariant
- NavigationBar: height 80dp, background Surface
- Chip: border-radius 8dp, height 32dp

Spacing:
- Base unit: 4dp
- Common gaps: 8dp, 16dp, 24dp, 32dp
- Screen padding: 16dp`,
        dark:
`Framework: Flutter — Material Design 3

Color Scheme:
- Primary: #D0BCFF
- Background: #1C1B1F
- Surface: #1C1B1F
- Surface Variant: #49454F
- Text primary (OnBackground): #E6E1E5
- Text secondary (OnSurface): #CAC4D0
- Border (Outline): #938F99
- Error (Danger): #F2B8B5
- PrimaryContainer: #4F378B

Typography (TextTheme):
- Font family: 'Roboto', sans-serif
- displayLarge: size 57dp, weight 400
- headlineMedium: size 28dp, weight 400
- titleLarge: size 22dp, weight 400
- bodyLarge: size 16dp, weight 400
- labelLarge: size 14dp, weight 500

Components:
- Cards: border-radius 12dp, elevation 2 tonal, background SurfaceVariant
- FilledButton: border-radius 100dp, height 40dp, background Primary
- OutlinedButton: border-radius 100dp, height 40dp, border Outline
- TextField: border-radius 4dp, filled style, fillColor SurfaceVariant
- NavigationBar: height 80dp, background Surface
- Chip: border-radius 8dp, height 32dp

Spacing:
- Base unit: 4dp
- Common gaps: 8dp, 16dp, 24dp, 32dp
- Screen padding: 16dp`,
      },
      {
        label: 'Flutter — Cupertino (iOS)',
        light:
`Framework: Flutter — Cupertino iOS Style

Color Palette:
- Primary: #007AFF
- Background: #F2F2F7
- Surface: #FFFFFF
- Text primary: #000000
- Text secondary: #3C3C43
- Border: #C6C6C8
- Danger: #FF3B30

Typography:
- Font family: '.SF Pro Text', 'Helvetica Neue', sans-serif
- Large Title: size 34dp, weight 700, letterSpacing 0.37
- Title 1: size 28dp, weight 700
- Body: size 17dp, weight 400, letterSpacing -0.41
- Footnote: size 13dp, weight 400
- Caption: size 12dp, weight 400

Components:
- Cards: border-radius 10dp, background white, shadow 0 1dp 3dp rgba(0,0,0,0.12)
- Buttons: border-radius 10dp, height 44dp, font-weight 400
- Inputs: border-radius 10dp, background white, border 1dp solid #C6C6C8
- NavigationBar: height 44dp, background blur, border-bottom 1dp #C6C6C8
- TabBar: height 49dp, background blur

Spacing:
- Base unit: 4dp
- Standard padding: 16dp
- List row height: 44dp
- Section header height: 28dp`,
        dark:
`Framework: Flutter — Cupertino iOS Style

Color Palette:
- Primary: #0A84FF
- Background: #000000
- Surface: #1C1C1E
- Text primary: #FFFFFF
- Text secondary: #EBEBF5
- Border: #38383A
- Danger: #FF453A

Typography:
- Font family: '.SF Pro Text', 'Helvetica Neue', sans-serif
- Large Title: size 34dp, weight 700, letterSpacing 0.37
- Title 1: size 28dp, weight 700
- Body: size 17dp, weight 400, letterSpacing -0.41
- Footnote: size 13dp, weight 400
- Caption: size 12dp, weight 400

Components:
- Cards: border-radius 10dp, background #1C1C1E, shadow none
- Buttons: border-radius 10dp, height 44dp, font-weight 400
- Inputs: border-radius 10dp, background #2C2C2E, border 1dp solid #38383A
- NavigationBar: height 44dp, background blur dark, border-bottom 1dp #38383A
- TabBar: height 49dp, background blur dark

Spacing:
- Base unit: 4dp
- Standard padding: 16dp
- List row height: 44dp
- Section header height: 28dp`,
      },
    ];

    const parts = this._getTemplateParts();
    const hasAny = this._hasAnyTemplate();

    const main = this.container.querySelector('#scrMain');
    main.innerHTML = `
      <div class="scr-form">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <h2 class="scr-form__heading">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right:6px;vertical-align:-2px">
              <circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            Project style guide
          </h2>
          <span class="scr-ds-badge${hasAny ? ' scr-ds-badge--set' : ''}">
            ${hasAny ? 'Active — applied to all screens' : 'Not set'}
          </span>
        </div>
        <p class="scr-form__hint" style="margin-top:-8px">
          Define colours, typography, spacing and component styles for light and dark themes. Both are injected into every screen generation prompt.
        </p>
        <div class="scr-form__row scr-form__row--grow">
          <div class="scr-ds-editor" id="scrDsEditor">

            <div class="scr-ds-templates">
              <div class="scr-ds-tpl-col" id="scrDsTplColLight">
                <div class="scr-ds-tpl-label scr-ds-tpl-label--light">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <circle cx="12" cy="12" r="5"/>
                    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                  </svg>
                  Light Theme
                </div>
                <textarea class="scr-form__textarea" id="scrDsTplLight" placeholder="Paste light theme design here…">${escHtml(parts.light)}</textarea>
              </div>
              <div class="scr-ds-tpl-col" id="scrDsTplColDark">
                <div class="scr-ds-tpl-label scr-ds-tpl-label--dark">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                  Dark Theme
                </div>
                <textarea class="scr-form__textarea" id="scrDsTplDark" placeholder="Paste dark theme design here…">${escHtml(parts.dark)}</textarea>
              </div>
            </div>

            <div class="scr-ds-preview-panel">
              <div class="scr-ds-preview-bar">
                <span class="scr-ds-preview-label">Preview</span>
                <div class="scr-ds-theme-btns">
                  <button class="scr-ds-theme-btn" data-theme="light">Light</button>
                  <button class="scr-ds-theme-btn scr-ds-theme-btn--active" data-theme="dark">Dark</button>
                </div>
                <button class="scr-btn scr-btn--sm" id="scrDsRefreshBtn" title="Refresh preview">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 8A5.5 5.5 0 1 1 8 2.5c1.8 0 3.4.87 4.4 2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    <path d="M13.5 2.5v2.7H10.8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Refresh
                </button>
              </div>
              <iframe class="scr-ds-preview-frame" id="scrDsPreviewFrame" sandbox="allow-scripts"></iframe>
            </div>

          </div>
        </div>
        <div class="scr-form__actions">
          <button class="scr-btn scr-btn--sm" id="scrDsDefault">Example: ${EXAMPLES[0].label} ↻</button>
          <div class="scr-form__btns">
            <button class="scr-btn scr-btn--secondary" id="scrDsCancel">Cancel</button>
            <button class="scr-btn scr-btn--primary" id="scrDsSave">Save Style Guide</button>
          </div>
        </div>
      </div>
    `;

    let exampleIdx  = -1;
    let activeTheme = 'dark';

    const blankHtml = theme => {
      const bg = { dark: '#0f1117', light: '#f0ece6' }[theme] || '#0f1117';
      return `<html><body style="margin:0;height:100vh;background:${bg};display:flex;align-items:center;justify-content:center;font-family:system-ui"><p style="color:#6b7280;font-size:12px;text-align:center">No ${theme} template yet.<br>Add one on the left to see the preview.</p></body></html>`;
    };

    const getActiveTpl = () => (activeTheme === 'light'
      ? main.querySelector('#scrDsTplLight')
      : main.querySelector('#scrDsTplDark')
    ).value.trim();

    const setActiveCol = () => {
      main.querySelector('#scrDsTplColLight').classList.toggle('scr-ds-tpl-col--active', activeTheme === 'light');
      main.querySelector('#scrDsTplColDark').classList.toggle('scr-ds-tpl-col--active',  activeTheme === 'dark');
    };

    const renderPreview = () => {
      const tpl   = getActiveTpl();
      const frame = main.querySelector('#scrDsPreviewFrame');
      frame.srcdoc = tpl
        ? this._buildPreviewHtml(this._parseDesignTemplate(tpl), activeTheme)
        : blankHtml(activeTheme);
    };

    const cycleBtn = main.querySelector('#scrDsDefault');
    cycleBtn.addEventListener('click', () => {
      exampleIdx = (exampleIdx + 1) % EXAMPLES.length;
      const ex   = EXAMPLES[exampleIdx];
      const next = EXAMPLES[(exampleIdx + 1) % EXAMPLES.length];
      main.querySelector('#scrDsTplLight').value = ex.light;
      main.querySelector('#scrDsTplDark').value  = ex.dark;
      cycleBtn.textContent = `Example: ${ex.label} — Next: ${next.label} ↻`;
      renderPreview();
    });

    main.querySelector('#scrDsTplLight').addEventListener('input', () => { if (activeTheme === 'light') renderPreview(); });
    main.querySelector('#scrDsTplDark').addEventListener('input',  () => { if (activeTheme === 'dark')  renderPreview(); });

    main.querySelector('#scrDsRefreshBtn').addEventListener('click', renderPreview);

    main.querySelectorAll('.scr-ds-theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        main.querySelectorAll('.scr-ds-theme-btn').forEach(b => b.classList.remove('scr-ds-theme-btn--active'));
        btn.classList.add('scr-ds-theme-btn--active');
        activeTheme = btn.dataset.theme;
        setActiveCol();
        renderPreview();
      });
    });

    setActiveCol();
    renderPreview();

    main.querySelector('#scrDsCancel').addEventListener('click', () => onBack());

    main.querySelector('#scrDsSave').addEventListener('click', async () => {
      const tplLight = main.querySelector('#scrDsTplLight').value.trim();
      const tplDark  = main.querySelector('#scrDsTplDark').value.trim();
      const tpl      = JSON.stringify({ light: tplLight, dark: tplDark });
      const project  = this._getProject();
      await window.db.projects.update({ id: project.id, design_template: tpl });
      this._designTemplate = tpl;
      if (project) project.design_template = tpl;
      onBack();
    });
  }

  // ----------------------------------------------------------------
  // Edits — open the selected CLI with the screen file as context
  // ----------------------------------------------------------------
  async _openEdits(titleOverride, screenId) {
    const main  = this.container.querySelector('#scrMain');
    const title = titleOverride || main?.querySelector('#scrTitle')?.value.trim() || '';

    if (!title) {
      alert('Save the screen first so a file exists to edit.');
      return;
    }

    const model = this._getSelectedModel();
    if (!model || model.type === 'anthropic' || !model.executable) {
      alert('Please select a CLI model (Claude CLI or Gemini CLI) from the model dropdown.');
      return;
    }

    const safeTitle   = title.replace(/[^a-z0-9_\-]/gi, '_');
    const projectName = this._project?.name;
    const safeProject = (projectName || '').replace(/[^a-z0-9_\-]/gi, '_');
    const rootDir     = await window.app.screensDir();
    const screensDir  = safeProject ? `${rootDir}\\${safeProject}` : rootDir;
    const filePath    = `${screensDir}\\${safeTitle}.html`;

    const existing = await window.shell.readFile(filePath);
    if (!existing && screenId) {
      const screen = await window.db.screenDesigns.get(screenId);
      if (screen?.html_content) {
        await window.shell.writeFile(filePath, screen.html_content);
      }
    }

    const flags     = model.flags ? ` ${model.flags}` : '';
    const modelFlag = model.model_name ? ` --model ${model.model_name}` : '';
    const cmd = `${model.executable}${flags}${modelFlag} "${filePath}"`;
    this._showPromptPreviewModal(cmd, async () => {
      await window.db.terminal.openExternal({ command: cmd, cwd: screensDir });
    });
  }

  // ----------------------------------------------------------------
  // Prompt Preview modal
  // ----------------------------------------------------------------
  _showPromptPreviewModal(prompt, onRun) {
    const dlg = document.createElement('div');
    dlg.className = 'scr-extract-overlay';
    dlg.innerHTML = `
      <div class="scr-prompt-preview-dialog">
        <div class="scr-extract-dialog__header">
          <span>Prompt Preview</span>
          <button class="scr-extract-dialog__close">&times;</button>
        </div>
        <div class="scr-prompt-preview-dialog__body">
          <pre class="scr-prompt-preview-dialog__pre">${escHtml(prompt)}</pre>
        </div>
        <div class="scr-extract-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="promptPreviewClose">Close</button>
          <button class="scr-btn scr-btn--primary"   id="promptPreviewRun">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
              <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
            </svg>
            Run
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(dlg);
    const close = () => dlg.remove();
    dlg.querySelector('.scr-extract-dialog__close').addEventListener('click', close);
    dlg.querySelector('#promptPreviewClose').addEventListener('click', close);
    dlg.querySelector('#promptPreviewRun').addEventListener('click', () => { close(); onRun(); });
  }

  // ----------------------------------------------------------------
  // Extract Stories dialog
  // ----------------------------------------------------------------
  async _showExtractDialog(screen) {
    let m = this._getSelectedModel();
    if (!m || m.type === 'anthropic' || !m.executable) {
      m = (this._picker?.models || this._modelConfigs || []).find(c => c.type !== 'anthropic' && c.executable);
    }
    if (!m) {
      alert('No CLI model configured. Add a CLI model in Model Settings first.');
      return;
    }

    const project    = this._getProject();
    const screensDir = await window.app.screensDir(project?.name);
    const safeTitle  = screen.title.replace(/[^a-z0-9_\-]/gi, '_');
    const outputFile = `${screensDir}\\${safeTitle}_stories.json`;

    const htmlFilePath = await window.app.prepareScreenRef({
      screensDir,
      safeTitle,
      htmlContent: screen.html_content,
    });

    const instruction = buildExtractPrompt(screen.title, htmlFilePath, outputFile);
    const cmd         = buildExtractPsCommand(instruction, m);

    const dlg = document.createElement('div');
    dlg.className = 'scr-extract-overlay';
    dlg.innerHTML = `
      <div class="scr-extract-dialog">
        <div class="scr-extract-dialog__header">
          <span>Extract User Stories — ${escHtml(screen.title)}</span>
          <button class="scr-extract-dialog__close">&times;</button>
        </div>
        <div class="scr-extract-dialog__body">
          <div class="scr-cmd-preview">
            <div class="scr-cmd-preview__label">Command:</div>
            <pre class="scr-cmd-preview__code">${escHtml(cmd)}</pre>
          </div>
          <div class="scr-form__row" style="margin-top:12px">
            <button class="scr-btn scr-btn--primary" id="extRunBtn">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="14" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/>
                <path d="M5 6l3 2-3 2V6z" fill="currentColor"/>
              </svg>
              Run in Terminal
            </button>
            <span class="scr-form__hint">Opens a terminal window. The AI will write the stories JSON to the output path shown above.</span>
          </div>
        </div>
        <div class="scr-extract-dialog__footer">
          <button class="scr-btn scr-btn--secondary" id="extCancelBtn">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(dlg);
    dlg.querySelector('.scr-extract-dialog__close').addEventListener('click', () => dlg.remove());
    dlg.querySelector('#extCancelBtn').addEventListener('click',            () => dlg.remove());

    dlg.querySelector('#extRunBtn').addEventListener('click', async () => {
      await window.db.terminal.openExternal({ command: cmd, cwd: project?.project_path || undefined });
    });
  }
}
