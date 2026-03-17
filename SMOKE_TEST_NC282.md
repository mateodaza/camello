# NC-282 Manual Smoke Test Checklist

Run these checks on the deployed staging/production environment after the branch is merged.

## Redirects
- [ ] `/dashboard` → lands on conversations inbox
- [ ] `/dashboard/artifacts` → redirects to `/dashboard/agent`
- [ ] `/dashboard/analytics` → redirects to `/dashboard/agent`
- [ ] `/dashboard/settings/profile` → redirects to `/dashboard/settings`

## Core Navigation
- [ ] Sidebar shows exactly 4 items: Inbox, Agent, Knowledge, Settings

## Agent Page
- [ ] `/dashboard/agent` → single-page agent config with collapsible sections
- [ ] Edit agent greeting → save → open test chat → greeting updated
- [ ] Approve a pending module execution from Agent page

## Other Pages
- [ ] `/dashboard/knowledge` → "Add Knowledge" button opens modal
- [ ] Knowledge gaps visible and teachable
- [ ] `/dashboard/settings` → 3 collapsible sections (Profile, Channels, Billing)

## Mobile
- [ ] Sidebar collapses on mobile
- [ ] Agent page is scrollable on mobile
- [ ] Settings collapsible sections work on mobile
