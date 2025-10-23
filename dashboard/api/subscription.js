// /dashboard/api/subscription.js
import Subscription from '../../models/Subscription.js';
import { stripe } from '../../utils/stripeClient.js';

export default function (app) {
  app.post('/api/subscription/create-checkout', async (req, res) => {
    if (!req.session?.discordUser) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { plan, guildId } = req.body;
    const user = req.session.discordUser;

    const PLANS = {
      basic_monthly: { name: 'Strive Basic', price: 500, interval: 'month' },
      basic_yearly: { name: 'Strive Basic (Yearly)', price: 6000, interval: 'year' },
      premium_monthly: { name: 'Strive Professional', price: 1200, interval: 'month' },
      premium_yearly: { name: 'Strive Professional (Yearly)', price: 14400, interval: 'year' },
      ultra_monthly: { name: 'Strive Business', price: 2900, interval: 'month' },
      ultra_yearly: { name: 'Strive Business (Yearly)', price: 34800, interval: 'year' }
    };

    const planConfig = PLANS[plan];
    if (!planConfig) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    try {
      // Create product & price
      const product = await stripe.products.create({ name: planConfig.name });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: planConfig.price,
        currency: 'gbp',
        recurring: { interval: planConfig.interval }
      });

      const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/premium`,
        client_reference_id: user.id,
        metadata: {
          discordUserId: user.id,
          discordUsername: user.username,
          plan,
          guildId
        }
      });

      // Save pending subscription
      await Subscription.create({
        discordUserId: user.id,
        discordUsername: user.username,
        plan,
        stripeSessionId: session.id,
        guildId
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error('Stripe checkout error:', err.message);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });
}
