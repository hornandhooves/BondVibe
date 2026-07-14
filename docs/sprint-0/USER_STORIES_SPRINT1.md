# Kinlo - User Stories (Sprint 1)

**Epic**: BV-0 - MVP1 Foundation  
**Sprint**: Sprint 1 (Weeks 1-2)

---

## USER STORY #1: User Registration & Authentication

**Story ID**: BV-001  
**Priority**: MUST HAVE (P0)  
**Story Points**: 5

### User Story
**As a** new user  
**I want** to create an account using email or social login  
**So that** I can access Kinlo features

### Acceptance Criteria
1. ✅ User can register with email + password (8+ chars, ≥1 number)
2. ✅ User can register with Google Sign-In
3. ✅ User can register with Apple Sign-In (iOS)
4. ✅ Email verification sent within 1 minute
5. ✅ User cannot access app until email verified
6. ✅ "Forgot Password" flow works
7. ✅ Sessions persist (30 days)
8. ✅ Error handling: Duplicate email, invalid format, weak password
9. ✅ Registration completes in <2 minutes
10. ✅ GDPR-compliant consent checkboxes

### Technical Notes
- Stack: Firebase Authentication
- Database: Firestore `users` collection
- Security: Rate limiting (5 attempts/hour per IP)

---

## USER STORY #2: User Profile Creation

**Story ID**: BV-002  
**Priority**: MUST HAVE (P0)  
**Story Points**: 3

### User Story
**As a** registered user  
**I want** to complete my profile with personal details and photo  
**So that** others can see who I am

### Acceptance Criteria
1. ✅ Required fields: Name, age, location, language, photo
2. ✅ Optional fields: Bio (150 chars), interests (≥3)
3. ✅ Photo upload: Max 5MB, JPG/PNG, auto-resize to 800x800px
4. ✅ Age gate: Users <18 cannot proceed
5. ✅ Profile completion progress bar
6. ✅ Profile visible to others (last name initial only)

### Technical Notes
- Stack: React Native form (Formik + Yup), Firebase Storage
- Validation: Client-side + Firestore security rules

---

## USER STORY #3: Personality Test

**Story ID**: BV-003  
**Priority**: MUST HAVE (P0)  
**Story Points**: 8

### User Story
**As a** new user  
**I want** to take a quick personality test  
**So that** Kinlo can match me with compatible people

### Acceptance Criteria
1. ✅ 10 questions in 4 languages (EN, ES, DE, FR)
2. ✅ 5-point Likert scale per question
3. ✅ Assesses Big Five traits (2 questions each)
4. ✅ Test completion time <3 minutes
5. ✅ Generates 1 of 16 archetypes
6. ✅ Results screen: Archetype name, description, badge, bar chart
7. ✅ Cannot retake for 90 days
8. ✅ 95% completion rate once started

### Technical Notes
- Questions: Validated against IPIP-NEO (Big Five)
- Scoring: `(sum / max_possible) × 100`
- Database: Store raw scores + archetype

---

## USER STORY #4: Event Feed & Browsing

**Story ID**: BV-004  
**Priority**: MUST HAVE (P0)  
**Story Points**: 5

### User Story
**As a** user  
**I want** to browse upcoming events  
**So that** I can discover experiences

### Acceptance Criteria
1. ✅ Event cards show: Title, host, date/time, location, price, spots available, compatibility score
2. ✅ Filters: Category, date, price, language
3. ✅ Sort: Soonest, Most Compatible, Most Popular
4. ✅ Search by keyword
5. ✅ Pull to refresh
6. ✅ Infinite scroll (20 events at a time)
7. ✅ Load time <2 seconds
8. ✅ Minimum 10 active events displayed

---

## USER STORY #5: Event Detail Page

**Story ID**: BV-005  
**Priority**: MUST HAVE (P0)  
**Story Points**: 5

### User Story
**As a** user  
**I want** to view full event details  
**So that** I can decide if I want to attend

### Acceptance Criteria
1. ✅ Displays: Cover photo, title, host profile, description, date/time, location, price, spots, attendees
2. ✅ Attendee list: First names + photos (blurred until booking)
3. ✅ Compatibility score with each attendee
4. ✅ "Book Now" button (sticky)
5. ✅ Social share button
6. ✅ FAQ section (cancellation, refund policy)

---

## USER STORY #6: Event Booking & Payment

**Story ID**: BV-006  
**Priority**: MUST HAVE (P0)  
**Story Points**: 8

### User Story
**As a** user  
**I want** to book and pay for an event  
**So that** I can secure my spot

### Acceptance Criteria
1. ✅ Booking confirmation modal with terms acceptance
2. ✅ Stripe integration (card, Apple Pay, Google Pay)
3. ✅ Confirmation email within 1 minute
4. ✅ Calendar invite attached
5. ✅ Event added to "My Events" tab
6. ✅ Error handling for payment failures
7. ✅ Prevent double-booking
8. ✅ Booking flow <30 seconds
9. ✅ Payment success rate >98%

---

## USER STORY #7: Host Event Creation

**Story ID**: BV-007  
**Priority**: MUST HAVE (P0)  
**Story Points**: 8

### User Story
**As a** verified host  
**I want** to create and publish events  
**So that** I can share my expertise

### Acceptance Criteria
1. ✅ Multi-step form: Basic info, logistics, details, media, review
2. ✅ Event creation time <5 minutes
3. ✅ Management dashboard: View bookings, edit, cancel, message attendees
4. ✅ Payout setup via Stripe Connect
5. ✅ 20+ verified hosts at launch

---

## USER STORY #8: Notifications

**Story ID**: BV-008  
**Priority**: MUST HAVE (P1)  
**Story Points**: 5

### User Story
**As a** user  
**I want** to receive reminders  
**So that** I don't forget events

### Acceptance Criteria
1. ✅ Push + email notifications
2. ✅ Types: Booking confirmation, 24hr reminder, 2hr reminder, cancellation
3. ✅ User can customize preferences
4. ✅ Opt-in rate >80%
5. ✅ Click-through rate >40%

---

## USER STORY #9: Safety Features

**Story ID**: BV-009  
**Priority**: MUST HAVE (P0)  
**Story Points**: 5

### User Story
**As a** user  
**I want** to feel safe  
**So that** I trust the platform

### Acceptance Criteria
1. ✅ Profile photo required (no generic avatars)
2. ✅ Email verification mandatory
3. ✅ Age verification (18+)
4. ✅ Host verification badge
5. ✅ Reporting system (categories: inappropriate behavior, spam, safety concern)
6. ✅ Block user functionality
7. ✅ Safety tips modal before first booking
8. ✅ Response time <24 hours for reports
9. ✅ Zero safety incidents in pilot

---

## USER STORY #10: Legal Documentation

**Story ID**: BV-010  
**Priority**: MUST HAVE (P0)  
**Story Points**: 3

### User Story
**As a** user  
**I want** to understand terms and privacy  
**So that** I can make informed decisions

### Acceptance Criteria
1. ✅ Terms of Service published
2. ✅ Privacy Policy (GDPR-lite, Mexico compliant)
3. ✅ Accessible in-app (registration, settings, footer)
4. ✅ Checkbox: "I agree to T&C and Privacy Policy" (required)
5. ✅ Version tracking
6. ✅ Legal review by lawyer

---

## Sprint 1 Summary

**Total Story Points**: 57 points  
**Sprint 1 Commitment**: 21 points (5 stories)

**Committed Stories**:
- BV-001: User Auth (5 pts)
- BV-002: Profile (3 pts)
- BV-004: Event Feed (5 pts)
- BV-009: Safety (5 pts)
- BV-010: Legal (3 pts)

**Stretch Goal**: BV-003 (Personality Test, 8 pts)

---

*Ready for Sprint 1! 🚀*
