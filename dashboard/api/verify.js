// /dashboard/api/verify.js
import VerificationToken from '../../models/VerificationToken.js';

export default function (app) {
  app.post('/api/verify', async (req, res) => {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'No token provided' });
    }

    try {
      const record = await VerificationToken.findOne({ token });
      if (!record) {
        return res.status(404).json({ success: false, error: 'Invalid or expired token' });
      }

      if (record.used) {
        return res.status(400).json({ success: false, error: 'Token already used' });
      }

      if (record.expiresAt < new Date()) {
        return res.status(400).json({ success: false, error: 'Token expired' });
      }

      // Mark as used
      record.used = true;
      record.verifiedAt = new Date();
      await record.save();

      // In real app: notify bot to assign role via internal API
      // For now: assume role assignment happens via bot polling or webhook

      res.json({ success: true });
    } catch (err) {
      console.error('Verification error:', err);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
}
