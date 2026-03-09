import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';

const router = Router({ mergeParams: true });

// GET /api/launches/:id/vesting?walletAddress=ADDR
router.get('/', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { walletAddress } = req.query as { walletAddress?: string };

  if (!walletAddress) {
    res.status(400).json({ error: 'walletAddress query parameter is required' });
    return;
  }

  try {
    const launch = await prisma.launch.findUnique({
      where: { id },
      include: { vesting: true },
    });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }

    const agg = await prisma.purchase.aggregate({
      where: { launchId: id, walletAddress },
      _sum: { amount: true },
    });
    const totalPurchased = agg._sum.amount ?? 0;

    if (!launch.vesting) {
      res.status(200).json({
        totalPurchased,
        tgeAmount: totalPurchased,
        cliffEndsAt: null,
        vestedAmount: 0,
        lockedAmount: 0,
        claimableAmount: totalPurchased,
      });
      return;
    }

    const { cliffDays, vestingDays, tgePercent } = launch.vesting;
    const tgeAmount = Math.floor((totalPurchased * tgePercent) / 100);
    const remainingAfterTge = totalPurchased - tgeAmount;

    const cliffEndsAt = new Date(new Date(launch.endsAt).getTime() + cliffDays * 86400000);
    const vestingEndsAt = new Date(cliffEndsAt.getTime() + vestingDays * 86400000);
    const now = new Date();

    let vestedAmount = 0;
    if (now >= vestingEndsAt) {
      vestedAmount = remainingAfterTge;
    } else if (now > cliffEndsAt) {
      const elapsed = now.getTime() - cliffEndsAt.getTime();
      vestedAmount = Math.floor(remainingAfterTge * (elapsed / (vestingDays * 86400000)));
    }

    const claimableAmount = tgeAmount + vestedAmount;
    const lockedAmount = totalPurchased - claimableAmount;

    res.status(200).json({ totalPurchased, tgeAmount, cliffEndsAt, vestedAmount, lockedAmount, claimableAmount });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
