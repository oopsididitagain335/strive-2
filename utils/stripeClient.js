// /utils/stripeClient.js
import Stripe from 'stripe';

if (!process.env.STRIPE_SK) {
  throw new Error('❌ STRIPE_SK is required');
}

export const stripe = new Stripe(process.env.STRIPE_SK, {
  apiVersion: '2024-06-20'
});
