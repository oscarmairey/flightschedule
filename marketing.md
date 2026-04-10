# FlightSchedule — Brand & Marketing North Star

**Version 1.0 — April 2026**
**Classification: Internal — all marketing, copy, and communications should derive from this document.**

---

## 1. Brand Essence

FlightSchedule exists because flying clubs still run on duct tape. Shared aircraft — worth hundreds of thousands of euros — are managed through WhatsApp threads, Google Sheets, paper logbooks, and Excel files passed around on USB sticks. Pilots don't know who has the plane next Saturday. Admins can't tell who owes what. Flight hours live in four different places. Nobody trusts the numbers.

This isn't a technology problem. It's an *absence* of technology. The general aviation world has been ignored by modern software. Enterprise aviation management systems cost tens of thousands and are built for airlines, not for ten pilots splitting time on a Cessna. The free tools are toys. So clubs default to the tools they already know — messaging apps and spreadsheets — and accept the friction.

FlightSchedule is the answer that should have existed ten years ago: a single, modern web app that replaces the entire fragmented workflow. Book the aircraft, log the flight, track your hours, buy hour packages. One app. One truth.

**The brand is built on one foundational claim: your flying club deserves real software, not workarounds.**

---

## 2. Positioning Statement

**For** flying clubs, co-ownership groups, and aeroclubs that share aircraft,
**FlightSchedule is** the open-source flight management system
**that** replaces the patchwork of spreadsheets, messaging apps, and paper logbooks with a single app for scheduling, flight logging, hour tracking, and payments.
**Unlike** enterprise aviation management platforms or DIY spreadsheet setups,
**FlightSchedule** is purpose-built for general aviation, runs on a phone at the airfield, and is free to self-host.

---

## 3. Target Audience

### 3.1 Primary decision-maker: The Club Organizer

This is the person who actually *runs* the flying club. They may hold the title of president, treasurer, secretary, or just "the one who handles everything." They are not looking for software — they are looking for relief. They spend hours every month reconciling flight hours, chasing pilots for logbook entries, and answering the question "is the plane free on Saturday?"

**What they care about:**
- Reducing their personal admin burden (this is volunteer work, not their job)
- Having one place to point pilots to instead of answering the same questions
- Accurate, trustworthy hour and financial tracking
- Something their least tech-savvy member can actually use
- Not paying enterprise prices for a 6-pilot club

**What they fear:**
- Migration pain ("what we have works... mostly")
- Pilots refusing to adopt it
- Paying for something that gets abandoned
- Lock-in with a proprietary vendor

### 3.2 Daily user: The Pilot

Pilots interact with FlightSchedule at the airfield — on their phone, often in sunlight, sometimes with one hand. They want to book, log, and check their balance. They do not want to learn a system.

**What they care about:**
- "Is the plane free this weekend?"
- "How many hours do I have left?"
- Speed — the app should be faster than texting the group chat
- It works on their phone, right now, without installing anything

### 3.3 Technical evaluator (open-source channel)

Developers and technically-minded club members who will discover FlightSchedule on GitHub, Hacker News, or aviation forums. They'll evaluate the codebase, the stack, the documentation. They're the ones who will self-host it, contribute to it, and recommend it to their clubs.

**What they care about:**
- Clean architecture, modern stack, good documentation
- Easy self-hosting (Docker Compose, clear env vars)
- Active maintenance and responsive maintainer
- No dark patterns, no vendor lock-in, no telemetry traps

---

## 4. Messaging Hierarchy

All marketing materials — landing page, README, social posts, forum threads, emails — should follow this priority order. Lead with the highest-impact message the format allows.

### Level 1 — The Hook (use everywhere)

**Your flying club runs on WhatsApp and spreadsheets. FlightSchedule replaces all of it.**

This is the single most important sentence in all of FlightSchedule's marketing. It works because:
- It names the *specific* pain without abstraction
- Every club organizer and pilot will recognize their own situation immediately
- "Replaces all of it" is a bold, concrete promise — not a vague improvement

Variations for different contexts:
- "One app instead of WhatsApp + Sheets + paper logbooks."
- "Stop managing your aircraft on spreadsheets."
- "Your plane is worth €200K. Why is the schedule on WhatsApp?"

### Level 2 — What It Does (landing page, README, forum posts)

**Book the aircraft. Log the flight. Track your hours. Buy hour packages. One app.**

Each verb corresponds to a core workflow. The staccato rhythm communicates simplicity and completeness. This line answers the immediate follow-up: "OK, so what does it actually do?"

### Level 3 — Why It's Different (landing page, comparison contexts)

Three differentiators, in order of impact:

1. **Built for flying clubs, not airlines.** Enterprise aviation software is designed for fleet operations, MRO workflows, and regulatory compliance at scale. FlightSchedule is designed for 5–30 pilots sharing one or two aircraft. Every screen, every flow, every decision reflects that reality.

2. **Open source. Self-host for free.** The full codebase is on GitHub. Docker Compose up and you're running. No trial that expires, no feature gates, no "contact sales." If you want someone else to run it, that's the hosted plan.

3. **Works at the airfield.** Mobile-first, designed for sunlight and one-handed use. Large tap targets. Numeric keyboards for engine times. PWA — add it to your home screen and it behaves like a native app.

### Level 4 — Proof (landing page, deeper content)

- **Already in production.** FlightSchedule was built for a real French aeroclub and has been managing real flights, real bookings, and real payments from day one. This is not a side project or a concept.
- **Atomic transactions, not spreadsheet formulas.** Every booking checks for conflicts in a serializable Postgres transaction. Every flight debit is atomic. No double bookings. No balance discrepancies. No "let me check the other spreadsheet."
- **Full audit trail.** Every hour mutation — purchase, flight debit, refund, admin adjustment — is a ledger entry with timestamps, amounts, and running balances. Clubs that need to account for shared funds get real accountability.

---

## 5. Tone of Voice

### 5.1 The Principle

FlightSchedule's voice is **a competent pilot briefing other pilots.** It's direct, precise, and confident without being loud. It respects the reader's intelligence and time. It never oversells. It states what the product does, how it works, and why it matters — then stops.

Aviation culture values clarity, brevity, and competence. The people we're talking to are trained to distrust vagueness. They deal in checklists, not narratives. They want to know what something *does*, not what it *empowers them to achieve*.

### 5.2 Voice Attributes

| Attribute | What it means | Example |
|-----------|--------------|---------|
| **Direct** | State the fact. No hedging, no "helps you," no "enables." | "Pilots book the aircraft from their phone." — not "FlightSchedule empowers pilots to seamlessly manage their booking experience." |
| **Precise** | Use specific, concrete language. Numbers over adjectives. | "Balances are tracked in minutes, displayed in HH:MM." — not "Accurate hour tracking." |
| **Confident** | The product works. Say so plainly. | "No double bookings, ever." — not "Significantly reduces scheduling conflicts." |
| **Understated** | Let the product speak. Don't narrate your own greatness. | "Open source. Self-host for free." — not "We believe in the power of open-source community-driven innovation." |
| **Respectful** | Assume the reader is intelligent, busy, and skeptical. | "Here's how it works." — not "Imagine a world where..." |

### 5.3 Words We Use

- works, runs, handles, replaces, tracks, logs, books
- pilots, clubs, aircraft, flights, hours, balance
- one app, one place, one truth
- open source, self-host, your data, your server
- built for, designed for, made for

### 5.4 Words We Never Use

- seamless, seamlessly
- revolutionize, transform, disrupt
- empower, enable, unlock
- cutting-edge, state-of-the-art, next-generation
- leverage, utilize, facilitate
- game-changer, best-in-class
- solution (as a noun for the product — "FlightSchedule is a solution...")
- journey, experience (when we mean "using the app")
- at scale (a 12-pilot club is not "at scale")

### 5.5 Tone by Context

| Context | Tone | Example |
|---------|------|---------|
| **Landing page hero** | Confident, punchy, problem-first | "Your flying club runs on WhatsApp and spreadsheets. FlightSchedule replaces all of it." |
| **Feature descriptions** | Factual, specific, how-it-works | "The calendar shows a week view. Tap a time block, confirm. The booking is checked for conflicts in a single database transaction." |
| **GitHub README** | Technical, thorough, honest | Current README tone is already excellent — maintain it. |
| **Forum/community posts** | Casual-professional, pilot-to-pilot | "I built this for our aeroclub because we were sick of the WhatsApp + Sheets mess. Figured other clubs might have the same problem." |
| **Error messages / UI copy** | Clear, helpful, no blame | "This time slot is already booked." — not "Oops! Looks like someone beat you to it! 😅" |
| **Pricing page** | Transparent, no tricks, justify the value | "Self-host for free. Hosted plans start at €X/month per aircraft — we handle updates, backups, and uptime." |

---

## 6. Narrative Angles

These are the stories we tell in different marketing contexts. Each one is true. Use the one that fits the audience and format.

### Angle 1: "The Spreadsheet Graveyard" (primary — use on landing page, ads, cold outreach)

Every flying club has the same setup: a Google Sheet for the schedule (last updated... maybe), a WhatsApp group where booking "requests" disappear into scroll, a paper logbook that sometimes matches the digital one, and a treasurer with an Excel file nobody else can open. FlightSchedule replaces all of it with one app. This angle works because it's instantly, viscerally recognizable. The reader sees their own club. Name the pain with absolute specificity.

### Angle 2: "Built by a Pilot, for Pilots" (community, forums, social)

FlightSchedule wasn't designed in a conference room by people who've never flown. It was built for a real aeroclub managing a real aircraft, by someone who was personally frustrated by the existing workflow. Every design decision — big tap targets for use in sunlight, HH:MM display for engine times, one-handed flight logging — comes from actually standing on the tarmac trying to use a phone. This angle builds trust and authenticity. It signals that the product understands the user's world because it comes from inside that world.

### Angle 3: "Open Source Means You Own It" (technical audiences, GitHub, HN)

FlightSchedule is fully open source. Clone the repo, run Docker Compose, and you're live. Your data stays on your server. No vendor lock-in, no price hikes, no "we're pivoting — sorry." If you want to modify it, the codebase is clean TypeScript with a documented architecture. If you want someone else to handle hosting, that's the paid plan. This angle resonates with the technical evaluator persona and the broader open-source community. It also preempts the #1 objection from clubs burned by discontinued SaaS tools.

### Angle 4: "Your Plane Costs More Than Your Car" (premium positioning)

A shared aircraft costs €100K–500K to buy and €10K+/year to operate. The aircraft itself is managed with professional maintenance schedules, certified mechanics, and rigorous inspections. But the *operations around it* — who flies when, how many hours are left, who owes what — run on consumer messaging apps and free spreadsheets. There's a disconnect. FlightSchedule closes it. This angle justifies the product's existence and, for the paid plan, its price. It reframes the ask: this isn't an expense, it's catching up with the standards you already apply to the aircraft itself.

---

## 7. Competitive Positioning

### What we are NOT:
- **Not an EFB (Electronic Flight Bag).** We don't do flight planning, navigation, weather, or NOTAMs. ForeFlight and SkyDemon own that space and we have no interest in competing.
- **Not an airline ops platform.** We don't do crew scheduling, MRO tracking, fleet management for 50+ aircraft, or regulatory compliance reporting.
- **Not a flying school management system.** We don't handle student progress tracking, lesson scheduling with instructors, or syllabus management (though instructor-adjacent features may come later).

### What we ARE:
- **The operational backbone for shared GA aircraft.** Scheduling + flight logging + hour accounting + payments. That's the scope. We do it completely and we do it well.

### Against specific alternatives:

| Alternative | Our advantage |
|-------------|---------------|
| Google Sheets + WhatsApp | FlightSchedule is purpose-built. Atomic bookings (no double-booking possible), automated hour tracking, integrated payments. One source of truth instead of four. |
| OpenFlights / other open-source | These are flight *logging* tools, not club management systems. They don't handle scheduling, hour balances, payments, or multi-user administration. |
| Enterprise aviation software (e.g., FBO Manager, FlightBridge) | Massively overbuilt and overpriced for a 10-pilot club. Often requires contracts, training, and dedicated admin. FlightSchedule is designed for clubs where "admin" is a volunteer role. |
| Custom-built club websites | Every club that builds their own system rebuilds the same 80% of features badly, then the developer leaves and nobody can maintain it. FlightSchedule is that 80% done properly, maintained, and open source. |

---

## 8. Visual & Design Direction

This section provides guidance for the landing page, marketing materials, and any visual identity work. It is directional, not prescriptive.

### 8.1 Mood

- **Clean, functional, unhurried.** Think instrument panel, not Instagram. Think Dieter Rams, not Dribbble.
- **Light and open.** Aviation is about sky, visibility, and clarity. The design should feel spacious.
- **Technically credible.** The site should look like it was made by someone who builds real things, not someone who bought a Framer template.

### 8.2 Typography

- Favor clean sans-serif fonts with strong legibility. Monospace for data displays (hours, times, balances).
- Avoid script fonts, overly decorative typefaces, or anything that reads as "playful startup."
- Hierarchy should be extremely clear — aviation culture is checklist culture.

### 8.3 Color Direction

- Primary palette should evoke sky and precision: deep navy, clear blue, white, with warm amber or green for status indicators (echoing the HDV balance color coding: green/amber/red).
- Avoid: neon tech colors, heavy gradients, dark mode as the default marketing aesthetic.
- The color language should feel more like an *instrument* than a *brand* — functional first, aesthetic second.

### 8.4 Imagery

- If using photos: GA aircraft on the ground or in flight, real airfields, real cockpits. Not stock photos of 737 cockpits or airline operations.
- Screenshots of the actual app are the strongest visual asset. Show the calendar, the flight form, the dashboard balance. Real UI > lifestyle photography.
- Avoid: generic "sky with clouds" hero images, silhouettes of planes against sunsets, stock photos of smiling pilots in headsets. These signal "we don't have a real product."

### 8.5 Logo Direction

- The name "FlightSchedule" is descriptive and functional. The logo should match: clean wordmark, possibly with a minimal icon element.
- Aviation iconography to consider: simplified aircraft silhouette, calendar/grid motif, or stylized clock — but only if it doesn't look like a generic app icon.
- It should work at small sizes (favicon, mobile home screen icon) and in monochrome.

---

## 9. Open-Source & Pricing Narrative

### The philosophy (for public communications):

"FlightSchedule is free to use, forever. The source code is open, the documentation is complete, and if you want to run it on your own server, nothing stops you. We offer a hosted version because most flying clubs don't have a sysadmin — and shouldn't need one. The hosted plan means we handle deployment, updates, backups, and uptime. You handle flying."

### Pricing framing:

- Price **per aircraft**, not per pilot. The decision-maker is the club, not the individual. Per-pilot pricing creates friction ("why should I pay when I only fly twice a month?"). Per-aircraft pricing maps to how clubs already think about shared costs.
- Lead with free self-hosting. The paid plan is positioned as convenience, not as the "real" product.
- Be explicit about what the hosted plan includes: automatic updates, daily backups, SSL, uptime monitoring, email support. These are things self-hosters have to do themselves.
- No feature gating between self-hosted and hosted. The code is the same. You're paying for ops, not for features.
- Avoid annual-only pricing. Monthly with an annual discount is the honest play for a product earning trust.

---

## 10. Channel Strategy Notes

### GitHub / Hacker News / Dev communities
Lead with Angle 3 (open source). Show the architecture. Let the code speak. The README is a marketing asset — keep it excellent.

### Aviation forums (PPRuNe, pilot forums, French aeroclub networks)
Lead with Angle 1 (spreadsheet graveyard) and Angle 2 (built by a pilot). Speak as a fellow pilot who built something useful, not as a vendor pitching a product. Ask for feedback. Invite beta clubs.

### French aeroclub network (DGAC, FFA affiliates)
This is the near-term growth channel. France has ~600 aeroclubs and a strong culture of shared aircraft ownership. French-first language support is a real advantage. Approach through federation contacts, regional aeroclub meetups, and word-of-mouth from the originating club.

### LinkedIn / professional
Angle 4 (your plane costs more than your car). Position it as operational modernization, not a tech product. Target club presidents and treasurers — they're the ones with the pain and the authority.

### Product Hunt / tech press
Lead with the open-source angle and the "built for a real club" story. Emphasize the full-stack nature: this isn't a UI mockup, it's a production system with Stripe integration, atomic transactions, and photo storage.

---

## 11. Key Metrics to Validate Positioning

As the product goes public, these signals will tell us if the positioning is working:

- **GitHub stars and forks** — are developers finding and trusting the project?
- **Self-hosted installs** (if we add anonymous telemetry with opt-in) — are clubs actually deploying?
- **Hosted plan signups** — conversion from awareness to paid
- **Source of discovery** — which channels drive the most qualified leads?
- **Activation** — does a club that signs up actually create pilots, book flights, and process a payment?
- **Retention** — do clubs come back weekly? The product only works if it becomes the default behavior.
- **Word-of-mouth signal** — "I heard about this from another club" is the ultimate validation of product-market fit.

---

## 12. The One Rule

Every piece of FlightSchedule marketing — every landing page, tweet, forum post, email, and README update — should pass this test:

**Would a busy aeroclub president, reading this on their phone between flights, immediately understand what FlightSchedule does and why they should care?**

If the answer is no, rewrite it. If the answer is "they'd need to read three more paragraphs to get it," rewrite it. The people we're building for don't have time for preamble. Respect that.

---

*This document is a living reference. As FlightSchedule grows, the positioning may sharpen, the audience may expand, and the narrative angles may evolve. The tone of voice and core principle — direct, precise, built by pilots for pilots — should not change.*
