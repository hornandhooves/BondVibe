/**
 * Stripe Service - Frontend
 * NEW MODEL: User pays fees on top of event price
 */

const FUNCTIONS_BASE_URL = 'https://us-central1-kinlo-app-dev.cloudfunctions.net';

// Fee configuration (mirror of backend)
const FEES = {
  platformPercent: 0.05,    // 5%
  stripePercent: 0.029,     // 2.9%
  stripeFixed: 300,         // $3.00 MXN in centavos
};

/**
 * Calculate checkout breakdown (for UI display)
 * @param {number} eventPriceCentavos - Event price set by host
 * @returns {object} Breakdown of all fees
 */
export const calculateCheckoutBreakdown = (eventPriceCentavos) => {
  const eventPrice = eventPriceCentavos;
  
  // Platform fee (5% of event price)
  const platformFee = Math.ceil(eventPrice * FEES.platformPercent);
  
  // Stripe fee on subtotal
  const subtotal = eventPrice + platformFee;
  const stripeFee = Math.ceil(subtotal * FEES.stripePercent) + FEES.stripeFixed;
  
  // Total
  const totalAmount = eventPrice + platformFee + stripeFee;
  
  return {
    eventPrice,
    platformFee,
    stripeFee,
    totalAmount,
    hostReceives: eventPrice,
    refundableAmount: eventPrice,
    nonRefundableFees: platformFee + stripeFee,
  };
};

/**
 * Create payment intent for event ticket
 * @param {string} eventId 
 * @param {string} userId 
 * @param {number} eventPriceCentavos - Event price (NOT total, backend calculates fees)
 */
import { auth } from "./firebase";

export const createEventPaymentIntent = async (eventId, userId, eventPriceCentavos) => {
  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/createEventPaymentIntent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Identity from this token; price read from the event doc server-side.
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body: JSON.stringify({ eventId }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create payment intent');
    }

    return data;
  } catch (error) {
    console.error('Error creating event payment intent:', error);
    throw error;
  }
};

/**
 * Create payment intent for tip
 */
export const createTipPaymentIntent = async (hostId, userId, amount, eventId = '', message = '') => {
  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/createTipPaymentIntent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Identity from this token; the server ignores any body userId.
        Authorization: `Bearer ${await auth.currentUser.getIdToken()}`,
      },
      body: JSON.stringify({
        hostId,
        amount,
        eventId,
        message,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create tip payment intent');
    }

    return data;
  } catch (error) {
    console.error('Error creating tip payment intent:', error);
    throw error;
  }
};

/**
 * Get pricing information from backend
 */
export const getPricingInfo = async (amount) => {
  try {
    const response = await fetch(`${FUNCTIONS_BASE_URL}/getPricingInfo?amount=${amount}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get pricing info');
    }

    return data;
  } catch (error) {
    console.error('Error getting pricing info:', error);
    throw error;
  }
};

/**
 * Format amount in centavos to MXN string
 */
export const formatMXN = (centavos) => {
  const pesos = centavos / 100;
  return `$${pesos.toFixed(2)} MXN`;
};

/**
 * Convert pesos to centavos
 */
export const pesosTocentavos = (pesos) => {
  return Math.round(pesos * 100);
};

/**
 * Get Stripe publishable key
 */
export const getStripePublishableKey = () => {
  return process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
};
