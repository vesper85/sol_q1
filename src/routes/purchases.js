const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/auth');
const prisma = require('../prisma');
const { computeStatus } = require('../utils/status');
const { computeTotalCost } = require('../utils/pricing');

// POST /api/launches/:id/purchase
router.post('/', auth, async (req, res) => {
  const { id } = req.params;
  const { walletAddress, amount, txSignature, referralCode } = req.body;

  if (!walletAddress || amount == null || !txSignature) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const launch = await prisma.launch.findUnique({
      where: { id },
      include: { tiers: true, whitelist: true },
    });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });

    // Compute current status
    const purchasedAgg = await prisma.purchase.aggregate({
      where: { launchId: id },
      _sum: { amount: true },
    });
    const totalPurchased = purchasedAgg._sum.amount || 0;
    const status = computeStatus(launch, totalPurchased);

    if (status !== 'ACTIVE') {
      return res.status(400).json({ error: `Launch is ${status}, not ACTIVE` });
    }

    // Whitelist check: if whitelist is non-empty, walletAddress must be in it
    if (launch.whitelist.length > 0) {
      const inWhitelist = launch.whitelist.some((w) => w.address === walletAddress);
      if (!inWhitelist) {
        return res.status(400).json({ error: 'Wallet address not whitelisted' });
      }
    }

    // Sybil protection: per user across all wallets
    const userPurchasesAgg = await prisma.purchase.aggregate({
      where: { launchId: id, userId: req.user.id },
      _sum: { amount: true },
    });
    const userTotal = userPurchasesAgg._sum.amount || 0;
    if (userTotal + amount > launch.maxPerWallet) {
      return res.status(400).json({ error: 'Exceeds maxPerWallet limit' });
    }

    // Total supply check
    if (totalPurchased + amount > launch.totalSupply) {
      return res.status(400).json({ error: 'Exceeds total supply' });
    }

    // Validate referral code if provided
    let referralCodeRecord = null;
    if (referralCode) {
      referralCodeRecord = await prisma.referralCode.findUnique({
        where: { launchId_code: { launchId: id, code: referralCode } },
      });
      if (!referralCodeRecord) {
        return res.status(400).json({ error: 'Invalid referral code' });
      }
      if (referralCodeRecord.usedCount >= referralCodeRecord.maxUses) {
        return res.status(400).json({ error: 'Referral code exhausted' });
      }
    }

    // Calculate total cost
    let totalCost = computeTotalCost(amount, launch.pricePerToken, launch.tiers);

    // Apply referral discount
    if (referralCodeRecord) {
      totalCost = totalCost * (1 - referralCodeRecord.discountPercent / 100);
    }

    // Create purchase (txSignature uniqueness enforced by DB)
    const purchase = await prisma.purchase.create({
      data: {
        launchId: id,
        userId: req.user.id,
        walletAddress,
        amount,
        totalCost,
        txSignature,
        referralCodeId: referralCodeRecord ? referralCodeRecord.id : null,
      },
    });

    // Increment referral usedCount
    if (referralCodeRecord) {
      await prisma.referralCode.update({
        where: { id: referralCodeRecord.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    return res.status(201).json(purchase);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'Duplicate transaction signature' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id/purchases
router.get('/', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });

    const where =
      launch.creatorId === req.user.id
        ? { launchId: id }
        : { launchId: id, userId: req.user.id };

    const purchases = await prisma.purchase.findMany({ where });
    return res.status(200).json({ purchases, total: purchases.length });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
