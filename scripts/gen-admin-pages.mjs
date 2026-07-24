// One-off scaffolder: creates a premium "Coming Soon" page.tsx for every admin
// route that doesn't already have a real page yet. Idempotent — never
// overwrites an existing page. Run: node scripts/gen-admin-pages.mjs
import { mkdirSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()
const APP = join(ROOT, "app", "admin")

// [route, title, description]. Routes that will get real Phase-1 pages are
// listed too, but skipped if a page.tsx already exists.
const PAGES = [
  ["overview", "Platform Overview", "A consolidated view of platform metrics and trends across every module."],
  ["users/online", "Online Users", "See who is active on Frequency in real time, with session and device detail."],
  ["users/verification", "Verification", "Review and grant verified status to trusted accounts and creators."],
  ["users/suspensions", "Suspensions", "Temporary account restrictions with full history and one-click reversal."],
  ["users/bans", "Bans", "Permanent account removals, appeals context, and restoration controls."],
  ["moderation/review", "Content Review", "Proactively review content flagged by the community or automated systems."],
  ["moderation/removed", "Removed Content", "Everything hidden or removed by moderators, with restore and permanent-delete."],
  ["moderation/appeals", "Appeals", "Members can contest moderation decisions; reviewers resolve them here."],
  ["support/contact", "Contact Requests", "Inbound contact-form submissions routed into the support workflow."],
  ["support/feedback", "Feedback", "Product feedback and feature requests gathered from the community."],
  ["content/articles", "Articles", "Curate, feature, categorize, and moderate community long-form articles."],
  ["content/livestreams", "Livestreams", "Monitor active broadcasts, feature streams, and act on livestream reports."],
  ["content/events", "Events", "Edit, feature, and moderate community events across the platform."],
  ["growth/analytics", "Analytics", "Premium dashboards for growth, engagement, retention, and content performance."],
  ["growth/engagement", "Engagement", "Understand how members interact with devotionals, articles, books, and live."],
  ["growth/retention", "Retention", "Cohort retention and lifecycle insight to grow a durable community."],
  ["growth/referrals", "Referrals", "Referral program tracking and rewards — arriving in a future release."],
  ["revenue/subscriptions", "Subscriptions", "Recurring membership revenue, plans, and subscriber management."],
  ["revenue/donations", "Donations", "One-time and recurring giving, campaigns, and donor acknowledgement."],
  ["revenue/earnings", "Creator Earnings", "Creator revenue share, statements, and earnings visibility."],
  ["revenue/advertising", "Advertising", "Sponsorships and promoted placements across Frequency surfaces."],
  ["revenue/payouts", "Payouts", "Scheduled payouts, balances, and transfer history for creators."],
  ["infrastructure/storage", "Storage", "Object storage usage, growth, and asset management insight."],
  ["infrastructure/database", "Database", "Database health, capacity, and query performance at a glance."],
  ["infrastructure/api", "API Health", "Endpoint availability, latency, and error-rate monitoring."],
  ["infrastructure/logs", "Logs", "Searchable application and system logs — arriving in a future release."],
  ["infrastructure/cache", "Cache", "Cache hit-rate and invalidation controls — arriving in a future release."],
  ["infrastructure/queues", "Queue Monitoring", "Background job and queue depth monitoring — arriving in a future release."],
  ["ai/moderation", "AI Moderation", "Automated content safety scoring and assisted moderation."],
  ["ai/insights", "AI Insights", "AI-generated insight across community health and content trends."],
  ["ai/automation", "Automation Rules", "No-code rules that automate routine administrative actions."],
  ["developer/flags", "Feature Flags", "Roll out and gate features safely with targeted flags."],
  ["developer/integrations", "Integrations", "Connect Frequency to external services and data sources."],
  ["developer/webhooks", "Webhooks", "Subscribe external systems to platform events."],
  ["settings/general", "General Settings", "Core platform configuration and administrative preferences."],
  ["settings/guidelines", "Community Guidelines", "Author and publish the community standards members agree to."],
  ["settings/privacy", "Privacy Policy", "Maintain the platform privacy policy shown to members."],
  ["settings/terms", "Terms", "Maintain the platform terms of service shown to members."],
  ["settings/maintenance", "Maintenance Mode", "Schedule and toggle maintenance windows with member messaging."],
]

const tpl = (title, description) => `import type { Metadata } from "next"
import { ComingSoon } from "@/components/admin/coming-soon"

export const metadata: Metadata = { title: ${JSON.stringify(`${title} · Frequency Admin`)} }

export default function Page() {
  return <ComingSoon title={${JSON.stringify(title)}} description={${JSON.stringify(description)}} />
}
`

let created = 0
for (const [route, title, description] of PAGES) {
  const dir = join(APP, route)
  const file = join(dir, "page.tsx")
  if (existsSync(file)) continue
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, tpl(title, description))
  created++
  console.log("created", `app/admin/${route}/page.tsx`)
}
console.log(`\nDone. ${created} placeholder page(s) created.`)
