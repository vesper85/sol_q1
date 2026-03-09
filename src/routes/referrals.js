const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/auth');
const prisma = require('../prisma');

// POST /api/launches/:id/referrals
router.post('/', auth, async (req, res) => {
  const { id } = req.params;
  const { code, discountPercent, maxUses } = req.body;

  if (!code || discountPercent == null || maxUses == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });
    if (launch.creatorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const referral = await prisma.referralCode.create({
      data: { launchId: id, code, discountPercent, maxUses },
    });

    return res.status(201).json({
      id: referral.id,
      code: referral.code,
      discountPercent: referral.discountPercent,
      maxUses: referral.maxUses,
      usedCount: 0,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Referral code already exists for this launch' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id/referrals
router.get('/', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });
    if (launch.creatorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const referrals = await prisma.referralCode.findMany({ where: { launchId: id } });
    return res.status(200).json(referrals);
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
