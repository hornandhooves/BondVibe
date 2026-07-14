# 💳 Stripe Connect Setup Guide

Complete guide for setting up Stripe Connect integration in Kinlo.

## 📋 Prerequisites

- Stripe account (https://stripe.com)
- Firebase project with Blaze plan
- Firebase CLI installed
- Kinlo app deployed

---

## 🔧 Step 1: Stripe Dashboard Setup

### 1.1 Create Stripe Account

1. Go to https://stripe.com
2. Sign up for a new account
3. Complete business verification (if required)
4. Activate your account

### 1.2 Get API Keys

1. In Stripe Dashboard, go to **Developers → API keys**
2. Copy your **Publishable key** (starts with `pk_test_...`)
3. Copy your **Secret key** (starts with `sk_test_...`)
4. **Never commit these keys to Git!**

### 1.3 Enable Stripe Connect

1. Go to **Connect → Settings**
2. Enable **Express** account type
3. Set **Platform name**: Kinlo
4. Set **Brand color**: Your brand color
5. Upload **Brand icon** (optional)

---

## 🔐 Step 2: Configure Firebase Secrets

```bash
cd ~/bondvibe/functions

# Set Stripe Secret Key
firebase functions:secrets:set STRIPE_SECRET_KEY
# When prompted, paste: sk_test_...

# Verify secret was set
firebase functions:secrets:access STRIPE_SECRET_KEY
```

---

## 🚀 Step 3: Deploy Cloud Functions

```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific Stripe functions
firebase deploy --only functions:createConnectAccount,functions:createAccountLink,functions:getAccountStatus,functions:createEventPaymentIntent
```

**Expected output**:
```
✔  functions[createConnectAccount(us-central1)] Successful create operation.
✔  functions[createAccountLink(us-central1)] Successful create operation.
✔  functions[getAccountStatus(us-central1)] Successful create operation.
✔  functions[createEventPaymentIntent(us-central1)] Successful create operation.
✔  Deploy complete!
```

---

## 🔗 Step 4: Configure Webhook

### 4.1 Create Webhook Endpoint

1. In Stripe Dashboard, go to **Developers → Webhooks**
2. Click **Add endpoint**
3. Set endpoint URL:
   ```
   https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/stripeConnectWebhook
   ```
4. Select **Description**: Kinlo Connect Updates
5. Select **Events to send**: Choose `account.updated`
6. Click **Add endpoint**

### 4.2 Get Webhook Signing Secret

1. Click on your newly created webhook
2. Find **Signing secret** (starts with `whsec_...`)
3. Click **Reveal** and copy the secret

### 4.3 Set Webhook Secret in Firebase

```bash
cd ~/bondvibe/functions

firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
# When prompted, paste: whsec_...
```

### 4.4 Redeploy Webhook Function

```bash
firebase deploy --only functions:stripeConnectWebhook
```

---

## 📱 Step 5: Configure React Native App

### 5.1 Add Stripe Publishable Key to .env

```env
# .env
STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 5.2 Initialize Stripe in App

File: `src/services/stripeService.js` (already configured)

```javascript
import { StripeProvider } from '@stripe/stripe-react-native';

export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;
```

File: `App.js`

```javascript
import { StripeProvider } from '@stripe/stripe-react-native';

export default function App() {
  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      {/* Your app */}
    </StripeProvider>
  );
}
```

---

## 🧪 Step 6: Test the Integration

### 6.1 Test Connect Account Creation

1. Open app
2. Go to Profile → Become a Host
3. Select "Paid Host"
4. Tap "Connect Stripe Account"
5. Complete Stripe onboarding
6. Verify in Firestore:
   ```
   users/{userId}/stripeConnect/accountId: "acct_..."
   ```

### 6.2 Test Payment Flow

Use Stripe test cards:

**Success Card**:
```
Card Number: 4242 4242 4242 4242
Expiry: Any future date (e.g., 12/25)
CVC: Any 3 digits (e.g., 123)
ZIP: Any 5 digits (e.g., 12345)
```

**Mexican Card**:
```
Card Number: 4000 0056 6555 5556
Expiry: Any future date
CVC: Any 3 digits
```

**Decline Card** (for testing errors):
```
Card Number: 4000 0000 0000 0002
```

### 6.3 Test Payment Creation

1. Create a paid event as verified host
2. Join event as different user
3. Enter test card details
4. Complete payment
5. Verify in Stripe Dashboard:
   - Payment appears in **Payments** tab
   - Platform fee (5%) was taken
   - Transfer to host account was created

### 6.4 Verify Webhook

1. In Stripe Dashboard → Webhooks → Your webhook
2. Check **Event deliveries**
3. Should see `account.updated` events
4. Status should be **Succeeded**

---

## 💰 Step 7: Understand Money Flow

### Payment Flow
```
User pays $200 MXN
    ↓
Stripe processes payment
    ↓
Platform fee: $10 (5%)
    ↓
Transfer to host: $190
    ↓
Host's Stripe account receives $190
```

### Actual Platform Revenue
```
Payment: $200 MXN
Platform fee: $10 (5%)
Stripe fee: $12.88 (6.44%)
Net to platform: -$2.88

You lose money on each transaction!
This is normal for marketplaces.
Revenue comes from volume.
```

### Better Model (Optional)
Pass Stripe fee to user:
```
Ticket price: $200
Stripe fee: $12.88 (added to total)
Total charge: $212.88
Platform fee: $10
Host receives: $200
Net to platform: $10 ✅
```

---

## 🔍 Step 8: Monitor & Debug

### View Cloud Function Logs
```bash
# All logs
firebase functions:log

# Specific function
firebase functions:log --only createEventPaymentIntent

# Real-time logs
firebase functions:log --follow
```

### Stripe Dashboard Monitoring

**Payments**:
- https://dashboard.stripe.com/test/payments
- Filter by amount, status, date

**Connect Accounts**:
- https://dashboard.stripe.com/test/connect/accounts
- View all connected hosts

**Webhooks**:
- https://dashboard.stripe.com/test/webhooks
- Check delivery status
- Retry failed webhooks

### Common Issues

**1. "Host has not connected their Stripe account"**
- Solution: Host needs to complete Stripe onboarding
- Check: `users/{userId}/stripeConnect/accountId` exists

**2. "Host cannot accept payments yet"**
- Solution: Wait for Stripe account verification
- Check: `users/{userId}/hostConfig/canCreatePaidEvents === true`

**3. Webhook signature verification fails**
- Solution: Verify `STRIPE_WEBHOOK_SECRET` is correct
- Check: Copy exact secret from Stripe Dashboard

**4. Payment succeeds but doesn't reach host**
- Solution: Check Stripe Connect settings
- Verify: `stripeConnect.accountId` is correct
- Check: Host account is activated in Stripe Dashboard

---

## 🚀 Step 9: Going to Production

### 9.1 Activate Live Mode in Stripe

1. Complete Stripe business verification
2. Activate your account
3. Switch to **Live mode** (toggle in top-right)

### 9.2 Get Live API Keys

1. Go to **Developers → API keys** (in Live mode)
2. Copy **Live Publishable key** (`pk_live_...`)
3. Copy **Live Secret key** (`sk_live_...`)

### 9.3 Update Firebase Secrets (Production)

```bash
# Switch to production Firebase project
firebase use production

# Set live Stripe secret
firebase functions:secrets:set STRIPE_SECRET_KEY
# Enter: sk_live_...

# Deploy functions
firebase deploy --only functions
```

### 9.4 Update App Environment

```env
# .env.production
STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### 9.5 Create Live Webhook

1. In Stripe Dashboard (Live mode) → Webhooks
2. Add endpoint with production URL
3. Select `account.updated` event
4. Copy signing secret
5. Set in Firebase:
   ```bash
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   # Enter: whsec_... (live secret)
   ```

### 9.6 Update Platform Settings

In Stripe Connect → Settings (Live mode):
- Platform name
- Brand icon
- Return URLs
- Refresh URLs

---

## 💡 Best Practices

### Security

1. **Never commit API keys** to Git
2. **Use environment variables** for all secrets
3. **Validate webhook signatures** (already implemented)
4. **Use Firebase secrets** for Cloud Functions
5. **Enable 2FA** on Stripe account

### Error Handling

1. **Always catch errors** in payment flows
2. **Log errors** to Cloud Functions logs
3. **Show user-friendly messages** (not raw error codes)
4. **Retry failed operations** with exponential backoff

### Testing

1. **Test all payment scenarios** before going live
2. **Use test mode extensively**
3. **Test webhook deliveries**
4. **Test refund flows**
5. **Test with different card types**

### Monitoring

1. **Set up Stripe alerts** for failed payments
2. **Monitor Cloud Function errors**
3. **Track webhook delivery success rate**
4. **Monitor payout schedules**

---

## 📊 Pricing Reference

### Stripe Pricing (Mexico)
- Per transaction: 2.9% + $3 MXN
- No monthly fees
- No setup fees
- No hidden fees

### Stripe Connect Fees
- No additional fees for Express accounts
- Standard pricing applies
- Platform fee is configurable (we use 5%)

### Firebase Costs
- Cloud Functions: Free tier (2M invocations/month)
- After free tier: $0.40 per million invocations
- Estimated cost for 1000 payments: $0.002

---

## 🆘 Support & Resources

### Stripe Documentation
- Connect: https://stripe.com/docs/connect
- Express Accounts: https://stripe.com/docs/connect/express-accounts
- Webhooks: https://stripe.com/docs/webhooks
- Testing: https://stripe.com/docs/testing

### Firebase Documentation
- Cloud Functions: https://firebase.google.com/docs/functions
- Secrets: https://firebase.google.com/docs/functions/config-env

### Kinlo Support
- GitHub Issues: https://github.com/DuarTchock/Kinlo/issues
- Email: your-email@example.com

---

Built with ❤️ for Kinlo
