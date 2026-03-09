const express = require('express');
const router = express.Router({ mergeParams: true });
const prisma = require('../prisma');

// GET /api/launches/:id/vesting?walletAddress=ADDR
router.get('/', async (req, res) => {
  const { id } = req.params;
  const { walletAddress } = req.query;

  if (!walletAddress) {
    return res.status(400).json({ error: 'walletAddress query parameter is required' });
  }

  try {
    const launch = await prisma.launch.findUnique({
      where: { id },
      include: { vesting: true },
    });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });

    // Sum all purchases for this walletAddress on this launch
    const agg = await prisma.purchase.aggregate({
      where: { launchId: id, walletAddress },
      _sum: { amount: true },
    });
    const totalPurchased = agg._sum.amount || 0;

    // No vesting config: all tokens immediately claimable
    if (!launch.vesting) {
      return res.status(200).json({
        totalPurchased,
        tgeAmount: totalPurchased,
        cliffEndsAt: null,
        vestedAmount: 0,
        lockedAmount: 0,
        claimableAmount: totalPurchased,
      });
    }

    const { cliffDays, vestingDays, tgePercent } = launch.vesting;
    const tgeAmount = Math.floor(totalPurchased * tgePercent / 100);
    const remainingAfterTge = totalPurchased - tgeAmount;

    const cliffEndsAt = new Date(new Date(launch.endsAt).getTime() + cliffDays * 86400000);
    const vestingEndsAt = new Date(cliffEndsAt.getTime() + vestingDays * 86400000);
    const now = new Date();

    let vestedAmount = 0;
    if (now >= vestingEndsAt) {
      vestedAmount = remainingAfterTge;
    } else if (now > cliffEndsAt) {
      const elapsed = now.getTime() - cliffEndsAt.getTime();
      const totalVestingMs = vestingDays * 86400000;
      vestedAmount = Math.floor(remainingAfterTge * (elapsed / totalVestingMs));
    }

    const claimableAmount = tgeAmount + vestedAmount;
    const lockedAmount = totalPurchased - claimableAmount;

    return res.status(200).json({
      totalPurchased,
      tgeAmount,
      cliffEndsAt,
      vestedAmount,
      lockedAmount,
      claimableAmount,
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
