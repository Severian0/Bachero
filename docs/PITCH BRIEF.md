# Bachero — pitch brief

Prepared 3 September 2026 for the Parliament hackathon. Everything here is sourced (§13) or clearly marked as our own claim. The pitch is in §8; the Q&A banks are §9 and §10. Read §12 before you speak — it lists the things we must not say.

---

## 1. The story in one breath

England finds its potholes by waiting for someone to complain, then sends a crew with a list. Meanwhile 30,000 buses and every bin lorry in the country drive over every road, every day, and nobody is listening to the suspension. Bachero listens, turns impacts into a corroborated, severity-ranked queue, and turns the queue into tomorrow's optimised repair route — and closes the loop when the crew marks it done.

## 2. Why now — the timing hooks

Use at least two of these. They're what makes this a Parliament pitch rather than a gadget pitch.

| Date | Event | Use it as |
|---|---|---|
| **September 2026 (this month)** | Councils must publish transparency reports on pothole repair performance for the first time; DfT withholds £525m of £1.6bn from those that don't. RAG ratings per council first published Jan 2026. | The hook. "This month, for the first time…" |
| April 2026 | PAS 2161 mandatory: authorities must survey *classified* roads with DfT-approved tech; first data reported spring 2027. The standard explicitly names "in-vehicle sensors from connected vehicles" as an anticipated data source. | Our sensor category is already on DfT's list. Unclassified (residential) roads still aren't covered — that's our gap. |
| July 2026 | Ellie Chowns MP asked government in the Commons to explore AI sensors on bin lorries, citing that they pass virtually every residential street. | Parliament has literally asked for this. We built it. |
| Feb 2026 | Lords debate on cyclist safety: potholes raised as a major hazard; 22% of surveyed cyclists injured by road defects. | The Lords have been discussing this in the last six months. |
| Jan 2025 | Public Accounts Committee: local roads a "national embarrassment"; DfT admits its data is too poor to know road condition; government learns about road state from the AA and from drivers. | Government's own committee says the data doesn't exist. |
| Oct 2025 | Bus Services Act 2025: any local transport authority can now franchise buses without Secretary of State consent. | Answers "but the buses are private" — a sensor clause is a contract line. |
| Since 2020 | Bus Open Data Service publishes live GPS of every local bus in England, free, no licence. | Bus tracking is already public. We only add the accelerometer. |

## 3. The numbers

Memorise the bold ones.

| Stat | Figure | Source |
|---|---|---|
| Repair backlog, England & Wales | **£18.62bn**, record; **12 years** to clear | ALARM 2026 (AIA), March 2026 |
| Potholes filled last year | **1.9 million**, ~5,200/day, cost £149.3m → **~£79 each** | ALARM 2026 |
| Resurfacing frequency | Average road resurfaced **once every 97 years** | ALARM 2026 |
| Roads with <15 yrs structural life | 49% (~100,000 miles) | ALARM 2026 |
| Roads needing maintenance within a year | 10% (20,400 miles) | ALARM 2026 |
| Budget increase | +17% average highway maintenance budget, yet only marginal improvement | ALARM 2026 |
| Steady-state saving if backlog cleared | **£1bn/year** less needed thereafter | ALARM 2026 |
| Survey response rate | 79% of authorities | ALARM 2026 |
| AA pothole callouts | **137,000 in Jan–Feb 2026**, up 25,000 YoY | AA via ALARM coverage |
| Drivers with pothole damage | ~3 in 10 in past 12 months; **£590** average repair | ALARM/AA coverage |
| Compensation claims to councils | **53,015 in 2024** (up 91% since 2021); only 26% paid; ~£3.56m total; £390 average | RAC FOI, Jan 2026 |
| Cyclists KSI from road defects | **255 since 2017 — roughly one a week** | Cycling UK (STATS19) |
| Harry Colledge | Coroner: probably would not have died had the council acted on warnings about a known defect | Cycling UK |
| Local road network | **183,000 miles, 98% of the network**; almost all journeys start and end on it | NAO/Fleet News |
| Buses in England | **30,558** local buses (March 2025) | DfT annual bus statistics |
| DfT funding 2026/27 | £1.6bn; £525m conditional on transparency reports | DfT, April 2026 |
| DfT's own estimate of return | £7 benefit per £1 spent on maintenance funds (2020 estimate) — but NAO says data too poor to verify | NAO via Fleet News |
| Road network as asset | Often cited as ~£400bn public asset | industry (Route Reports blog citing UKRLG) |

## 4. The problem, framed as three failures

**We find potholes badly.** Safety inspections are scheduled sampling — a residential street may be walked or driven a few times a year. Public reporting (FixMyStreet, council apps) skews to the vocal and the online; Boston's Street Bump (2012) showed crowdsourced phone detection finds affluent neighbourhoods and manholes. Machine condition surveys are annual and, even under PAS 2161, cover classified roads only; unclassified roads are reported to DfT on a voluntary basis. The PAC's summary: government finds out about road condition from industry bodies and road users.

**We prioritise badly.** Crews work from an inspector's list or a complaint queue. Severity is a judgement from a single visit. There is no corroboration, no trend, no measured impact. PAC and NAO both found annual, un-ring-fenced funding pushes councils toward reactive patching over prevention.

**We can't prove anything.** Councils reject 74% of compensation claims using the s.58 "reasonable system" defence, yet they can't easily show when a defect appeared, how severe it was, or why it was fixed in the order it was. DfT can't show its £1bn+/year delivers improvement. Transparency reports this month will be built from the same patchy inputs.

Potholes are the symptom. The disease is a network resurfaced every 97 years, managed on data nobody trusts.

## 5. Landscape — who else is here

Be the ones who raise this. A judge who knows the sector will otherwise raise it for you.

| Player | What they do | Where we differ |
|---|---|---|
| **Gaist** | Camera survey vehicles; AI condition scoring; some mounting on council vehicles incl. bin lorries. DfT-backed schemes. | Survey product. Periodic, procured per survey. |
| **Vaisala RoadAI** | Smartphone video → computer-vision defect maps. **PAS 2161 approved.** Used by Staffordshire, Suffolk, Bexley, others. Processing within hours of a survey drive. | Inspector-driven survey tool. Video from every bus every day is petabytes; an impact event is a few hundred bytes. |
| **Route Reports** | Compact sensor + camera units on fleet vehicles (incl. bin lorries), RTK-GPS, near real-time. **Closest competitor.** | Hardware per vehicle. We're sensor-agnostic and would ingest their detections as a `source`. |
| **GPC Systems** | 3D cameras on council vehicles (Durham, Blaenau Gwent, GovTech Catalyst) measuring hole volume. | Measures the hole; we measure the impact and route the fix. |
| **FixMyStreet / Fill That Hole / council apps** | Public reporting. | Reporting bias; no severity; no corroboration. |
| **Street Bump (Boston, 2012)** | Citizen-phone accelerometer detection. | Equity bias and manhole noise — exactly what a fixed public fleet corrects. |
| **JCB Pothole Pro / Robotiz3d** | Repair-side machinery. | Complementary — they're the crew, we're the queue. |
| **Vehicle OEMs (JLR, Ford)** | Suspension-sensor pothole detection in cars. | Data locked in OEM clouds; no public route to a council work order. |

**Our position in one sentence:** everyone above sells a better camera or a better survey; Bachero is the layer underneath — continuous detection from vehicles already on the road, corroboration across vehicles, a transparent priority, and a closed loop into repair routing, on one open schema any authority or sensor vendor can write to. The accelerometer is the zero-cost default that gets us onto every vehicle rather than a pilot handful.

## 6. Policy and legal context (know these cold)

- **Highways Act 1980 s.41** — duty to maintain. **s.58** — the defence: the authority took such care as was reasonably required. Turns on whether there was a reasonable system of inspection and response, whether the authority knew or ought to have known, and warning signage. *Not* on ignorance. Councils win 74% of claims on this today.
- **Well-managed Highway Infrastructure (2016 Code of Practice)** — risk-based inspection regime. Bachero *informs* the statutory inspection duty; it does not replace it. Say that unprompted.
- **PAS 2161:2024** — DfT/BSI road condition data standard; approved technologies listed Sept 2025 (TRL auditor to 2030); mandatory on classified roads from April 2026; first reports spring 2027; 1–5 condition scale. Explicitly contemplates connected-vehicle sensors. Does **not** cover defects/reactive maintenance or unclassified roads — that's our lane.
- **Bus Open Data Service (BODS)** — live vehicle location (SIRI-VM, GTFS-RT), timetables, fares for every local bus in England. Open, free.
- **Bus Services Act 2025** — Royal Assent 27 Oct 2025; franchising without SoS consent; municipal bus companies allowed. Manchester (Bee Network) franchised; Liverpool, West Yorkshire, South Yorkshire, Cambridgeshire & Peterborough following. London has been franchised since the 1980s.
- **Transparency reports & RAG ratings** — DfT requirement from 2025/26; £525m of £1.6bn withheld for non-compliance in 2026/27; reports due September 2026.
- **Street Manager** — DfT's digital street-works permit service. Any real dispatch system needs to talk to it. We don't yet.
- **Bin collection** — council-run or contracted (Veolia, Biffa, Suez, FCC). Either way, the authority holds the contract.

## 7. Messaging

**Lead with the state's problem, not the driver's.** The £590 repair bill is a consumer story. The Parliament story is: government is about to grade 150+ authorities on pothole performance using data its own committee says doesn't exist.

**Lines that work**
- "A national sensor network missing one sensor."
- "The second bus over the same hole is not a duplicate — it's a confirmation."
- "We don't find what people complain about. We find what vehicles hit."
- "Cameras find what a road looks like. Suspensions find what a road does to you."
- "Explainable by design: the priority is severity × corroboration × age, and the authority can change the weights."
- "Patch-and-repair is the symptom. Weekly ride-quality on every street is the leading indicator the PAC said nobody has."

**Lines to avoid** — see §12.

## 8. The two-minute pitch

~320 words. 150–160 wpm gives two minutes with a beat for the demo. Lines in *[brackets]* are cuttable if you run long.

---

This month, for the first time, every council in England has to publish how well it fixes potholes — or lose a third of its £1.6 billion roads funding.

Here's the problem with that. Nobody knows where the potholes are. The Public Accounts Committee found that government learns the state of its own roads from the AA and from drivers, because its data is that patchy.

The scale: an £18.6 billion backlog — twelve years of work. Councils filled 1.9 million potholes last year at about £79 each, while the average road is resurfaced once every 97 years. The AA attended 137,000 pothole callouts in January and February alone. Fifty-three thousand compensation claims a year. And since 2017, roughly one cyclist a week killed or seriously injured by a road defect. *[A coroner found Harry Colledge would probably be alive if a known crack had been fixed.]*

Why do we find potholes so badly? Inspectors sample a street a few times a year. FixMyStreet finds the vocal. Condition surveys are annual and cover classified roads only. You cannot route a repair crew to a hole you haven't found.

Now — 30,000 buses in England drive fixed routes all day, every day. Every bin lorry passes every residential street every week or two. Their live positions are already public on the Bus Open Data Service. That is a national sensor network missing one sensor.

Bachero adds it. An accelerometer — a phone today, the telematics unit already in the cab tomorrow — detects the impact. Our backend clusters detections across vehicles, so the second bus over the same hole confirms it instead of duplicating it, and scores severity. That queue becomes tomorrow's route: the best twelve repairs one crew can do, optimised, dispatched, and closed when the crew marks it done.

**[DEMO — 20 seconds: second phone confirms the pin; plan route; crew marks done; pin goes green.]**

Camera survey tools exist — Gaist, Vaisala, Route Reports — and they're good at surveys. But video from every bus every day is petabytes; an impact is a few hundred bytes. So we're on every vehicle, continuously, and we'll ingest their detections too. Bachero is the layer underneath: one open schema, corroboration, an explainable priority, a closed loop.

We're asking for one authority and one fleet operator to pilot this winter. *[And one policy line: recognise connected-vehicle defect data in next year's transparency reports.]*

---

**Delivery notes.** Don't rush the stats — pause after "97 years" and after "one cyclist a week". The demo must be pre-loaded with a map already showing history; only the *confirmation* and *close* beats happen live. If the network dies, have a 20-second screen recording on the laptop.

## 9. Questions from a member of the House of Lords — and rebuttals

Assume a peer who has been a council leader, a transport minister, a lawyer, or ran TfL. They will ask about ownership, liability, money, privacy, and whether this is a gadget.

**"The buses aren't government vehicles. They're Stagecoach and Arriva."**
Correct outside London, and we should say "publicly contracted fleets", not "government vehicles". Every local bus is regulated; London and Manchester are franchised; Liverpool, West and South Yorkshire are following; and the Bus Services Act 2025 lets any transport authority franchise without Whitehall's consent. A sensor clause is one line in a franchise or enhanced-partnership agreement. Bin lorries are council-owned or run under council contracts — same lever. We'd start with bins and franchised buses because the authority already holds the pen.

**"If a council knows about every pothole in real time, doesn't that destroy its Section 58 defence and open the floodgates to claims?"**
Section 58 doesn't reward ignorance — it rewards a reasonable system of inspection and response. Councils already win 74% of 53,000 claims a year on that basis. Bachero strengthens the defence: a timestamped first detection, a measured severity, a documented priority, a repaired-at timestamp — an evidential chain most authorities can't produce today. Industry commentary on continuous monitoring says the same: it hardens s.58 defences while exposing genuine failures. Yes, it raises the bar on response time for severe defects. The Harry Colledge inquest is what the alternative looks like. No council wants to be the one that knew and didn't act — and the answer to that is to act, not to not know.

**"Councils are broke. Who pays for this?"**
Marginal sensor cost is close to zero — a phone or the telematics box already fitted for driver-behaviour monitoring. Software is a subscription an authority funds from its maintenance allocation, which is exactly the "proactive, well-planned maintenance" DfT's conditions reward. Savings come from four places: fewer kilometres per repair, fewer repeat visits, inspector time redeployed from finding to verifying, and catching defects while they're a £79 patch rather than a claim. ALARM says clearing the backlog saves £1bn a year in steady state; DfT's own estimate was £7 back per £1. We won't claim a number until a pilot measures one.

**"Boston tried this in 2012. Why didn't it work?"**
Street Bump used citizens' phones and found two things: affluent neighbourhoods and manholes. A public fleet fixes both — bin lorries visit the poorest estate as often as the richest street, and a fixed vehicle on a fixed route gives you a stable baseline to filter manholes and speed bumps. What's also changed is the policy stack: BODS made bus location open in 2020, PAS 2161 named connected-vehicle sensors in 2024, the Bus Services Act passed in 2025, and transparency reports start this month. The rails exist now.

**"You're tracking drivers."**
We track vehicles, not people. Every bus's position is already published live and free on the Bus Open Data Service; bin lorries are already telematics-tracked. Bachero adds a vertical-acceleration event with no camera required, no driver identity, no driver scoring. We'd still do a DPIA and consult unions before any deployment, and the base product has no video.

**"Rural roads. Buses don't go down country lanes."**
Coverage follows fleets. Bin lorries reach every household including rural ones; gritters cover the winter network; school transport, community transport, Royal Mail and NHS fleets are later partners. We won't claim universal coverage — we'll claim coverage proportional to public-service mileage, which is a far better sample than complaints.

**"Potholes are the symptom. You're helping councils patch faster when the PAC says they should resurface."**
Agreed, and this is where the data compounds. A pothole is a point; ride quality over time is a curve. Weekly accelerometer traces per street give you a roughness trend — the leading indicator for surface dressing before the hole forms. That's the shift from reactive to preventative that PAC and NAO asked for, and it's data that PAS 2161's annual classified-road survey cannot give you for residential streets.

**"Isn't the constraint repair capacity, not knowledge?"**
Both. Routing addresses capacity directly — more completed repairs per crew-day, which the demo shows as kilometres saved against a naive order. And knowledge is the PAC's finding, not ours: government learns road condition from the AA.

**"How does this fit with the systems councils already run — Confirm, Alloy, Symology?"**
We integrate rather than replace. Work orders export via API and CSV; the schema is open. The MVP is standalone because it's 48 hours old — be honest about that.

**"Who owns the data? Is this another vendor lock-in?"**
The authority owns its data; the schema is open; an anonymised, aggregated defect layer can flow to DfT the way BODS flows bus data. We'd rather be a standard than a monopoly — that's why we'd ingest competitors' detections.

**"Where is the data hosted?"**
UK region is available on our current provider (London); a production deployment would be UK-hosted and could be self-hosted by the authority since the stack is open-source Postgres.

**"Cyclists are your headline casualty, but buses don't drive in cycle lanes."**
True, and we say so. Bus and bin-lorry wheel paths miss cycle lanes. The road-defect deaths are disproportionately on unclassified and minor roads where a bin lorry does go, but the cycle-lane gap is real: it needs either a camera add-on or a light-fleet partner. We would rather name the gap than pretend the sensor sees it.

**"What about inspectors' jobs?"**
Statutory safety inspections continue — Bachero informs the regime, it doesn't replace it. Inspectors move from driving around looking to verifying and prioritising what the network found. There aren't enough of them to cover 183,000 miles anyway.

**"This is England. What about Wales, Scotland, Northern Ireland?"**
Devolved highway regimes, different data requirements. ALARM covers England and Wales; PAS 2161 and transparency reports are England. The schema is jurisdiction-agnostic; the policy hooks aren't.

## 10. Questions from technical judges — and rebuttals

**"An accelerometer measures a proxy. A camera measures the hole."**
It measures the thing that matters — the impact a vehicle experiences, which is what causes damage, claims, and crashes. A camera measures appearance. The trade-off is cost and coverage: continuous video from a fleet is a bandwidth and compute problem; impact events are bytes. And the schema is sensor-agnostic (`detections.source`), so a camera is a second emitter, not a second system.

**"Drivers swerve. You'll miss the biggest holes."**
Selection bias is real for cars; it's weak for a 2.5 m bus in a 3.2 m lane with standing passengers, and weaker for a bin lorry crawling the kerb. Repetition covers the rest: with per-pass hit probability p and n passes, miss probability is (1−p)ⁿ; a bus route sees dozens of passes a day. The holes that do get avoided are the ones already being reported. And a repeated lateral swerve at one location with no vertical hit is itself a signal — that's a roadmap item.

**"False positives — speed bumps, manholes, expansion joints."**
Fixed features fire on every pass, at every speed, with a symmetric two-axle signature; potholes are asymmetric with more high-frequency content and vary with lane position. Cross-reference OSM `traffic_calming` and manhole nodes. Each `false_positive` dismissal is a labelled negative for the classifier. And speed bumps are a gift: known geometry, so they're a free calibration target for severity across vehicle types.

**"Urban GPS is 10–30 m. How do you cluster?"**
12 m radius with a running centroid that converges as detections accumulate; heading stored so opposite-direction hits can be separated; speed and heading allow dead-reckoning between fixes; production snaps to the OSM way. Bus AVL solves the same problem daily. RTK is an upgrade, not a prerequisite.

**"A bus and a bin lorry have completely different suspensions."**
Severity is normalised per vehicle class, and each vehicle's own history gives a z-score baseline. Cross-vehicle calibration uses shared fixed features (those speed bumps again). Ground truth comes from the pilot: crews already record hole dimensions on repair, so we learn the mapping from impact signature to measured depth.

**"Where's the AI?"**
Be honest. Routing is combinatorial optimisation — the orienteering / prize-collecting TSP, solved with greedy insertion and 2-opt because a hackathon doesn't need OR-Tools. The machine learning is in detection: a classifier on stored `accel_window` traces, trained on crew confirmations and false-positive dismissals, and a severity regression against measured hole dimensions. We store the raw window precisely so we can retrain without re-driving.

**"30,000 buses at 1 Hz is 30,000 inserts a second."**
Which is why positions aren't our problem: BODS already publishes them. We store sparse detections — tens per vehicle per day, not hundreds per second — because detection runs on the device. The firehose never reaches the database. If we did store breadcrumbs we'd partition by time and roll up.

**"Phone sensors are noisy and mounting varies."**
Modern phones sample at 100–200 Hz; orientation is normalised against the gravity vector so mount angle doesn't matter; a high-pass filter removes grade and gravity. Production uses the telematics unit already in the cab, which is rigidly mounted.

**"Latency? Offline?"**
Buffer on-device, batch upload. Nothing here is real-time-critical — the repair happens tomorrow. Live map updates are for the operator's confidence, not the crew's.

**"Anon key writes with open RLS."**
Demo configuration. Production: device tokens validated in an edge function, row-level security scoped by authority, signed uploads. The `authority_id` is already on every table so it's a policy change, not a schema change.

**"Does routing handle traffic management, permits, materials?"**
Service time per stop is a parameter; permits, materials and traffic management are not modelled. Real dispatch needs Street Manager integration. We know.

**"Is this PAS 2161 compliant?"**
No, and it isn't trying to be. PAS 2161 is annual network-condition scoring of classified roads. Bachero is continuous defect detection, heaviest on unclassified roads. Complementary, and we export to formats an asset system can consume. If DfT extends the standard to defects, we'd apply for approval.

**"Why Supabase / Postgres / PostGIS?"**
PostGIS is the geospatial standard; Postgres triggers gave us clustering with zero application code; Realtime gave us the live map for free. It's all open-source and portable.

## 11. Aligning the demo with the pitch

| Pitch line | What's on screen |
|---|---|
| "national sensor network missing one sensor" | Map with two vehicle dots moving and km-scanned counter |
| "the second bus over the same hole confirms it" | Phone B triggers; pin count 1→2, status → confirmed |
| "scores severity" | Detail panel: passes, severity, photo |
| "best twelve repairs, optimised" | Plan route; show total km vs baseline km |
| "closed when the crew marks it done" | Crew page on phone → done → pin green |
| "false positives" (only if asked) | One-tap false_positive on a speed bump |

## 12. Do not say

- "Government vehicles." Say **publicly contracted fleets** or **vehicles the public already pays to run**.
- "AI-powered detection." The detection is a filter and a threshold today. Say **on-device impact detection**; reserve "machine learning" for the classifier roadmap.
- "Cameras cost thousands." Vaisala runs on a phone camera. Say **video at fleet scale is a data and compute problem; impact events are bytes**.
- "Replaces inspections." It **informs** a statutory regime it cannot legally replace.
- "Saves £X million." No pilot, no number. Say what ALARM and DfT say, then "a pilot will measure it".
- "Covers every road." Coverage is proportional to public-service mileage.
- "Real-time." Nothing about repair is real-time. Say **continuous** or **daily**.
- Any stat you can't source from §13. If challenged on a number, name the source and the year.

## 13. Sources

- ALARM 2026 coverage: [Highways News](https://highways-news.com/breaking-news-local-authorities-face-18-62bn-road-repairs-backlog/); [Motor Transport](https://motortransport.co.uk/industry-news/18bn-twelve-year-backlog-of-pothole-repairs-despite-extra-funding-alarm-survey-reveals/89734.article); [Highways Industry](https://www.highwaysindustry.com/alarm-survey-reveals-local-roads-in-england-and-wales-face-over-18bn-repair-backlog/)
- DfT funding conditions and transparency reports: [ITV News, 13 Apr 2026](https://www.itv.com/news/2026-04-13/councils-in-england-risk-losing-pothole-funding-if-they-do-not-meet-new-rules); [Fleet News, Jun 2026](https://www.fleetnews.co.uk/news/new-rules-to-show-how-well-council-fix-potholes)
- Compensation claims: [RAC, Jan 2026](https://www.rac.co.uk/drive/news/motoring-news/council-pothole-claims-rise-by-90percent-in-three-years/)
- Cyclist casualties and Harry Colledge: [Cycling UK](https://www.cyclinguk.org/press-release/britains-pothole-crisis-costs-lives-says-cycling-uk); [Lords Hansard, 25 Feb 2026](https://hansard.parliament.uk/lords/2026-02-25/debates/7611C73E-CA31-410F-9350-6F7F0E071B63/CyclistsSafety)
- Public Accounts Committee: [press notice](https://committees.parliament.uk/committee/127/public-accounts-committee/news/204755/); [report](https://publications.parliament.uk/pa/cm5901/cmselect/cmpubacc/349/report.html); NAO figures via [Fleet News](https://www.fleetnews.co.uk/news/dft-funding-and-understanding-of-state-of-local-roads-criticised)
- PAS 2161: [written parliamentary answer](https://www.parallelparliament.co.uk/question/121414/roads-standards); [DfT evidence to PAC](https://committees.parliament.uk/publications/45920/documents/228104/default/); [WDM explainer](https://www.wdm.co.uk/insights/pas-2161-explained-why-it-matters-for-uk-road-authorities/)
- Bus fleet: [DfT annual bus statistics, YE March 2025](https://www.gov.uk/government/statistics/annual-bus-statistics-year-ending-march-2025/annual-bus-statistics-year-ending-march-2025); [Bus Open Data Service](https://www.bus-data.dft.gov.uk/)
- Bus Services Act 2025: [Commons Library briefing](https://commonslibrary.parliament.uk/research-briefings/cbp-8734/)
- Ellie Chowns MP on bin-lorry sensors: [Highways Industry, Jul 2026](https://www.highwaysindustry.com/ai-bin-lorries-pothole-detection-england/)
- Competitors: [Route Reports](https://www.routereports.com/en-gb/blog/why-councils-are-switching-to-ai-for-road-condition-monitoring); [Vaisala RoadAI](https://www.xweather.com/products/roadai); [market structure and s.58 commentary](https://highways.today/2026/07/31/ai-monitoring-infrastructure-risk/); [GPC/Gaist/RoadAI trials](https://www.thermalroadrepairs.com/fighting-potholes-with-ai)
