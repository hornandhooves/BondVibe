# 02 · Feature Inventory — the "nothing is excluded" checklist

Every domain and screen of the app, mapped to its home in the new 5-tab IA + its tier. If a screen exists today (or is a new AI feature), it appears here. Claude Code must not drop any row.

Legend — Tier: `free` · `plus` (Kinlo Plus, attendee) · `pro` (Kinlo Pro, host) · `role` (host/admin gate).

## Auth & Onboarding
| Screen | New home | Notes |
|---|---|---|
| Welcome, Login, Signup, Legal, EmailVerification, ProfileSetup | Auth gate (pre-tab) | Order unchanged; host path deferred out of first run |
| "Turn on Kinlo AI" opt-in | Auth gate (end) | one-time; gates all AI |
| RequestHost, HostTypeSelection (Free/Paid + Stripe/Mercado Pago) | Profile → Switch to Hosting | progressive disclosure, not first run |

## Discovery & Events — attendee
| Screen | New home | Tier |
|---|---|---|
| Home (greeting, featured, browse, digest banner) | **Home tab** | free |
| SearchEvents (filters: language/type/date/price) | Home → Browse Events (+ Filters sheet) | free |
| EventDetail (info, host, attendees, checkout, chat, Connect, matching opt-in, carpool) | pushed from Home/Wall/Search | free |
| HowToAttend | EventDetail | free |
| MyEvents (upcoming/past) | **Events tab (Attending)** | free |
| EventCheckIn (QR) | Events → event | free |
| EventChat (text/polls/carpool) | Events → event · Inbox | free |

## Events — host (Host Mode → Manage)
| Screen | New home | Tier |
|---|---|---|
| CreateEvent (details, category, Google Places, date/recurrence, price, images, Pro features) | Manage → Create ("Draft with AI") | role (host) |
| EditEvent, EventRoster, CheckInScanner, PromoteEvent | Manage | role / promote = paid |

## Profile & Personality
| Screen | New home | Tier |
|---|---|---|
| ProfileScreen (own hub) | **Profile tab** (split: You / Settings / Switch to Hosting) | free |
| UserProfile (public) | pushed (tap a person) | free |
| PersonalityQuiz / Results / Test | Profile → Personality | free |

## Social
| Screen | New home | Tier |
|---|---|---|
| Feed | **Wall tab** (fused with Smart Wall) | free (Smart Wall = plus taste) |
| CreatePost, PostDetail | Wall | free |
| FollowList | UserProfile / Profile | free |
| DMList / DMChat, Conversations | **Inbox** (header ✉) | free |
| Connect (people at an event) | EventDetail → rolls into Matching post-event | free |

## Community Matching (event-scoped; privacy-first)
| Screen | New home | Tier |
|---|---|---|
| MatchOptIn (A1), MatchConsent (A2, cannot skip), MatchProfile (A3/A4) | Matching flow (from EventDetail / notification) | free to join |
| MatchingLocked (B2), MatchGrid (C1), MatchPerson (C2), MatchChat | Matching flow | free; likes cap → plus |
| **Match Intelligence** (why-you-click + icebreakers) | MatchPerson | plus (taste: rationale free) |
| PeopleYouMet (D1) | Events → past event | free |
| HostMatchingControls (D2), HostMatchAnalytics (D3, aggregate), MatchVisibility (D4) | Manage / Matching settings | pro (host) |
| PlusPaywall (C4) → PlusCheckout (E3) → PlusActivated (E4) | gated entry | plus |
| ProUpsell (E1) → ProCheckout (E2) | gated entry | pro |

## Host business tools (Host Mode → Manage)
| Screen | New home | Tier |
|---|---|---|
| StripeConnect | Manage / onboarding | role |
| HostAnalytics → AnalyticsDetail, Finance | Manage → Analytics | role; **AI Analytics = pro** |
| HostCRM (at-risk / regulars) | Manage → Members | role; **Member Intelligence = pro** |
| RatingsOverview → RatingDetail (AI coaching) | Manage → Ratings | AI coaching = pro |
| HostGroups → GroupChat / GroupManage / PollVotes | Manage → Groups | role |

## Memberships
| Screen | New home | Tier |
|---|---|---|
| MembershipPlans (host CRUD) | Manage → Memberships | role (payments-enabled) |
| HostMemberships (public), MembershipSale / MembershipCheckout | EventDetail / host public page | free to buy |
| MyMemberships | Profile → My Memberships | free |

## Rentals (pillar — own tab)
| Screen | New home | Tier |
|---|---|---|
| RentalHub (browse by city/type) | **Rentals tab** | free |
| VehicleDetail, RentalCheckout (reserve + deposit), ActiveRental (timer/return), MyRentals | Rentals (renter flow) | free to rent |
| MyFleet, PublishVehicle, VehicleBookings | Rentals → **Your Fleet** (Host Mode) | role; "Draft listing with AI" = pro |
| Earnings & payout (rental income, Stripe) | Rentals → Your Fleet | role |

## Subscriptions / paywalls
| Screen | New home | Tier |
|---|---|---|
| Kinlo Pro benefits, ProUpsell, ProCheckout | Profile → Subscriptions + gated entries | pro |
| PlusPaywall, PlusCheckout, PlusActivated | gated entries | plus |

## Safety, moderation & admin
| Screen | New home | Tier |
|---|---|---|
| SafetyCenter (SOS 911, report, contact, tips) | Profile → Safety Center | free |
| Report (reason + details) | from any profile/content | free |
| Notifications | **Header 🔔** (persistent) | free |
| AdminDashboard (approve hosts, moderation, pricing) | Admin area | role (admin) |

## New AI features (7) — placement recap
| Feature | Home | Tier (taste) | Spec |
|---|---|---|---|
| Smart Wall | Wall tab | plus (ranked feed free; "why" 3/day) | ai_features/10 |
| Ask Kinlo | Inbox pinned + Wall header | plus (3 Q/week) | ai_features/11 |
| Host Copilot | Manage → Create | pro (1 draft) | ai_features/12 |
| Member Intelligence | Manage → Members | pro | ai_features/13 |
| Weekly Digest | Home card + push | plus (monthly taste) | ai_features/14 |
| Match Intelligence | MatchPerson | plus (rationale free) | ai_features/15 |
| AI Analytics | Manage → Analytics | pro (headline free) | ai_features/16 |

## Cross-cutting (build once, used everywhere)
Header ✉ Messages + 🔔 Notifications · Host Mode toggle · `entitlements.js` gating + `<ProGate>`/`<ProBadge>`/PaywallSheet · empty/loading/error + AI-fallback states · design tokens (WARMTH default, AURORA dark) · central `<Icon>`.

> If any real screen from the codebase is missing from this list, treat it as a gap and raise it before building — the goal is 100% coverage in the new IA.
