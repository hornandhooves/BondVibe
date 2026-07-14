# 🔧 Kinlo Cloud Functions Documentation

This document describes all Firebase Cloud Functions used in Kinlo.

## 📋 Table of Contents

1. [Payment Functions](#payment-functions)
2. [Refund Functions](#refund-functions)
3. [Notification Functions](#notification-functions)
4. [Stripe Connect Functions](#stripe-connect-functions)

---

## 💳 Payment Functions

### `createEventPaymentIntent`

Creates a Stripe Payment Intent for event ticket purchase with Stripe Connect.

**Type**: `onRequest` (HTTPS)  
**Secrets**: `STRIPE_SECRET_KEY`

**Request Body**:
```json
{
  "eventId": "string",
  "userId": "string", 
  "amount": number  // Amount in centavos (e.g., 20000 = $200 MXN)
}
```

**Response**:
```json
{
  "clientSecret": "string",
  "paymentIntentId": "string",
  "breakdown": {
    "total": number,
    "platformFee": number,
    "hostReceives": number,
    "currency": "mxn"
  }
}
```

**Flow**:
1. Validates event exists
2. Retrieves host's Stripe Connect account
3. Calculates platform fee (5%)
4. Creates Payment Intent with `application_fee_amount` and `transfer_data`
5. Returns client secret for frontend to confirm payment

**Example**:
```javascript
const response = await fetch('https://us-central1-PROJECT.cloudfunctions.net/createEventPaymentIntent', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventId: 'abc123',
    userId: 'user456',
    amount: 20000  // $200 MXN
  })
});
```

---

### `createTipPaymentIntent`

Creates a Stripe Payment Intent for host tips (100% goes to host, no platform fee).

**Type**: `onRequest` (HTTPS)  
**Secrets**: `STRIPE_SECRET_KEY`

**Request Body**:
```json
{
  "hostId": "string",
  "eventId": "string",  // Optional
  "amount": number,
  "message": "string",  // Optional
  "userId": "string"
}
```

**Response**:
```json
{
  "clientSecret": "string",
  "paymentIntentId": "string",
  "breakdown": {
    "total": number,
    "platformFee": 0,
    "hostReceives": number,
    "currency": "mxn"
  }
}
```

---

## 💰 Refund Functions

### `cancelEventAttendance`

Processes refund when a user cancels their event attendance.

**Type**: `onCall` (Callable)  
**Secrets**: `STRIPE_SECRET_KEY`  
**Auth**: Required

**Parameters**:
```javascript
{
  eventId: "string"
}
```

**Response**:
```javascript
{
  success: boolean,
  refund: {
    id: "string",
    amount: number,
    percentage: number,
    originalAmount: number,
    stripeFeeRetained: number,
    refundableAmount: number,
    status: "string"
  },
  refundPercentage: number,
  message: "string"
}
```

**Refund Policy**:
- **7+ days before event**: 100% refund (minus fees)
- **3-7 days before event**: 50% refund (minus fees)
- **< 3 days before event**: No refund

**Non-refundable Fees**:
- Stripe fee: 2.9% + $3 MXN
- Platform fee: 5%
- Total: ~7% of original amount

**Flow**:
1. Verify user is attending event
2. Find payment record
3. Calculate refund percentage based on time until event
4. Calculate Stripe fee (non-refundable)
5. Process Stripe refund for refundable amount
6. Update payment status to 'refunded'
7. Remove user from event attendees
8. Notify host

**Example**:
```javascript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const cancelAttendance = httpsCallable(functions, 'cancelEventAttendance');

const result = await cancelAttendance({ eventId: 'abc123' });
console.log(result.data.message); // "Refund of $177.12 MXN processed..."
```

---

### `hostCancelEvent`

Processes refunds for all attendees when host cancels an event.

**Type**: `onCall` (Callable)  
**Secrets**: `STRIPE_SECRET_KEY`  
**Auth**: Required (must be host or admin)

**Parameters**:
```javascript
{
  eventId: "string",
  cancellationReason: "string"
}
```

**Response**:
```javascript
{
  success: boolean,
  refundsProcessed: number,
  refunds: [
    {
      paymentId: "string",
      userId: "string",
      amount: number,
      stripeFeeRetained: number
    }
  ],
  failedRefunds: [],
  message: "string"
}
```

**Flow**:
1. Verify host or admin permissions
2. Find all paid attendees
3. Process 100% refunds for each (minus non-refundable fees)
4. Update event status to 'cancelled'
5. Notify all attendees

---

## 🔔 Notification Functions

### `onNewMessage`

Sends push notifications when new message is posted in event chat.

**Type**: `onDocumentCreated` (Firestore Trigger)  
**Path**: `conversations/{conversationId}/messages/{messageId}`

**Flow**:
1. Detect new message in conversation
2. Extract eventId from conversationId
3. Get all event participants (creator + attendees)
4. Fetch push tokens for each participant
5. Send batch push notifications via Expo API
6. Update in-app notification counters

**Notification Format**:
```javascript
{
  title: "John in Weekend Hike",
  body: "Hey everyone! See you tomorrow...",
  data: {
    type: "event_message",
    eventId: "abc123",
    conversationId: "event_abc123",
    eventTitle: "Weekend Hike"
  }
}
```

---

### `onEventAttendeesChanged`

Sends push notifications when users join or cancel event attendance.

**Type**: `onDocumentUpdated` (Firestore Trigger)  
**Path**: `events/{eventId}`

**Flow**:
1. Detect changes in `attendees` array
2. Identify new attendees (joined)
3. Identify removed attendees (cancelled)
4. For joins: Send push to host
5. For cancellations: Send push to host
6. Create in-app notifications

**Join Notification** (Paid Event):
```javascript
{
  title: "💰 New Paid Attendee!",
  body: "John paid $200 MXN for 'Weekend Hike'",
  data: {
    type: "event_joined",
    eventId: "abc123",
    eventTitle: "Weekend Hike"
  }
}
```

**Join Notification** (Free Event):
```javascript
{
  title: "👋 New Attendee!",
  body: "John joined 'Weekend Hike'",
  data: {
    type: "event_joined",
    eventId: "abc123",
    eventTitle: "Weekend Hike"
  }
}
```

**Cancel Notification**:
```javascript
{
  title: "🚫 Attendee Cancelled",
  body: "John cancelled their attendance for 'Weekend Hike'",
  data: {
    type: "attendee_cancelled",
    eventId: "abc123",
    eventTitle: "Weekend Hike"
  }
}
```

---

## 🔗 Stripe Connect Functions

### `createConnectAccount`

Creates a Stripe Express Connect account for a host.

**Type**: `onRequest` (HTTPS)  
**Secrets**: `STRIPE_SECRET_KEY`

**Request Body**:
```json
{
  "userId": "string",
  "email": "string"
}
```

**Response**:
```json
{
  "success": true,
  "accountId": "acct_..."
}
```

**Flow**:
1. Create Stripe Express account for Mexico (MX)
2. Enable card_payments and transfers capabilities
3. Store accountId in Firestore user document
4. Set `hostConfig.type` to 'paid'

---

### `createAccountLink`

Generates Stripe onboarding link for host to complete account setup.

**Type**: `onRequest` (HTTPS)  
**Secrets**: `STRIPE_SECRET_KEY`

**Request Body**:
```json
{
  "userId": "string"
}
```

**Response**:
```json
{
  "success": true,
  "url": "https://connect.stripe.com/setup/..."
}
```

**Flow**:
1. Retrieve user's Stripe accountId
2. Create account link with return/refresh URLs
3. Return onboarding URL for host to complete setup

---

### `getAccountStatus`

Checks Stripe account status and updates Firestore.

**Type**: `onRequest` (HTTPS)  
**Secrets**: `STRIPE_SECRET_KEY`

**Request Body**:
```json
{
  "userId": "string"
}
```

**Response**:
```json
{
  "success": true,
  "status": "active" | "pending" | "restricted",
  "chargesEnabled": boolean,
  "payoutsEnabled": boolean,
  "detailsSubmitted": boolean,
  "canCreatePaidEvents": boolean
}
```

**Status Logic**:
- `active`: charges_enabled && details_submitted
- `restricted`: details_submitted && !charges_enabled
- `pending`: !details_submitted

**Auto-updates**:
- Sets `canCreatePaidEvents = true` when account is active
- Sets `canCreatePaidEvents = false` when account is pending/restricted

---

### `stripeConnectWebhook`

Handles Stripe webhooks for automatic account status updates.

**Type**: `onRequest` (HTTPS)  
**Secrets**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

**Webhook Event**: `account.updated`

**Flow**:
1. Verify webhook signature
2. Extract account data from event
3. Find user with matching Stripe accountId
4. Update Firestore with latest account status
5. Auto-update `canCreatePaidEvents` flag

**Setup**:
1. In Stripe Dashboard: Developers → Webhooks
2. Add endpoint: `https://us-central1-PROJECT.cloudfunctions.net/stripeConnectWebhook`
3. Select event: `account.updated`
4. Copy signing secret to Firebase: `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`

---

## 🔧 Helper Functions

### `calculateStripeFee(amountCentavos)`

Calculates Stripe processing fee.

**Parameters**:
- `amountCentavos`: Amount in centavos

**Returns**: 
- Fee in centavos (2.9% + $3 MXN fixed)

**Example**:
```javascript
const fee = calculateStripeFee(20000);  // $200 MXN
// Returns: 880 + 300 = 1180 centavos ($11.80)
```

---

### `calculatePlatformFee(amount)`

Calculates Kinlo platform fee (5%).

**Parameters**:
- `amount`: Amount in centavos

**Returns**:
- Platform fee in centavos

**Example**:
```javascript
const platformFee = calculatePlatformFee(20000);  // $200 MXN
// Returns: 1000 centavos ($10)
```

---

### `sendBatchPushNotifications(notifications)`

Sends push notifications to multiple users via Expo API.

**Parameters**:
```javascript
[
  {
    pushToken: "ExponentPushToken[...]",
    title: "string",
    body: "string",
    data: { /* custom data */ }
  }
]
```

**Returns**: 
- Array of push tickets from Expo

---

## 🚀 Deployment

### Deploy All Functions
```bash
cd functions
firebase deploy --only functions
```

### Deploy Specific Function
```bash
firebase deploy --only functions:createEventPaymentIntent
```

### View Logs
```bash
firebase functions:log --only functionName
```

### Set Secrets
```bash
firebase functions:secrets:set STRIPE_SECRET_KEY
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
```

---

## 📊 Cost Estimation

### Cloud Functions Pricing (After Free Tier)
- Invocations: $0.40 per million
- GB-seconds: $0.0000025
- CPU-seconds: $0.00001

### Typical Costs per 1000 Events
- Payment processing: ~1000 invocations
- Refunds: ~50 invocations (estimated 5% cancellation rate)
- Push notifications: ~3000 invocations (joins + messages)
- **Total**: ~4050 invocations = $0.00162

---

## 🐛 Debugging

### Common Issues

**1. Function not deploying**
```bash
# Check Node version
node --version  # Should be 18 or 20

# Check for syntax errors
cd functions
npm run lint
```

**2. Secret not found**
```bash
# List all secrets
firebase functions:secrets:access STRIPE_SECRET_KEY

# Re-set secret
firebase functions:secrets:set STRIPE_SECRET_KEY
```

**3. Webhook signature verification fails**
```bash
# Ensure webhook secret is correctly set
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET

# Check webhook endpoint URL matches in Stripe Dashboard
```

**4. Push notifications not sending**
```bash
# Check logs
firebase functions:log --only onEventAttendeesChanged

# Verify user has pushToken in Firestore
# Check Expo push token format: ExponentPushToken[...]
```

---

## 📈 Monitoring

### Key Metrics to Track
- Payment success rate
- Refund processing time
- Push notification delivery rate
- Cloud Function execution time
- Error rates

### Firebase Console
- Functions: https://console.firebase.google.com/project/YOUR_PROJECT/functions
- Logs: https://console.firebase.google.com/project/YOUR_PROJECT/logs

### Stripe Dashboard
- Payments: https://dashboard.stripe.com/test/payments
- Connect: https://dashboard.stripe.com/test/connect/accounts
- Webhooks: https://dashboard.stripe.com/test/webhooks

---

Built with ❤️ for Kinlo
