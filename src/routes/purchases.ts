import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import auth from '../middleware/auth.js';
import prisma from '../prisma.js';
import { computeStatus } from '../utils/status.js';
import { computeTotalCost } from '../utils/pricing.js';

const router = Router({ mergeParams: true });

// POST /api/launches/:id/purchase
router.post('/', auth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { walletAddress, amount, txSignature, referralCode } = req.body as {
    walletAddress?: string;
    amount?: number;
    txSignature?: string;
    referralCode?: string;
  };

  if (!walletAddress || amount == null || !txSignature) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const launch = await prisma.launch.findUnique({
      where: { id },
      include: { tiers: true, whitelist: true },
    });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }

    const purchasedAgg = await prisma.purchase.aggregate({
      where: { launchId: id },
      _sum: { amount: true },
    });
    const totalPurchased = purchasedAgg._sum.amount ?? 0;
    const status = computeStatus(launch, totalPurchased);

    if (status !== 'ACTIVE') {
      res.status(400).json({ error: `Launch is ${status}, not ACTIVE` });
      return;
    }

    if (launch.whitelist.length > 0 && !launch.whitelist.some((w) => w.address === walletAddress)) {
      res.status(400).json({ error: 'Wallet address not whitelisted' });
      return;
    }

    const userAgg = await prisma.purchase.aggregate({
      where: { launchId: id, userId: req.user!.id },
      _sum: { amount: true },
    });
    const userTotal = userAgg._sum.amount ?? 0;
    if (userTotal + amount > launch.maxPerWallet) {
      res.status(400).json({ error: 'Exceeds maxPerWallet limit' });
      return;
    }

    if (totalPurchased + amount > launch.totalSupply) {
      res.status(400).json({ error: 'Exceeds total supply' });
      return;
    }

    let referralCodeRecord: { id: string; discountPercent: number; maxUses: number; usedCount: number } | null = null;
    if (referralCode) {
      referralCodeRecord = await prisma.referralCode.findUnique({
        where: { launchId_code: { launchId: id, code: referralCode } },
      });
      if (!referralCodeRecord) {
        res.status(400).json({ error: 'Invalid referral code' });
        return;
      }
      if (referralCodeRecord.usedCount >= referralCodeRecord.maxUses) {
        res.status(400).json({ error: 'Referral code exhausted' });
        return;
      }
    }

    let totalCost = computeTotalCost(amount, launch.pricePerToken, launch.tiers);
    if (referralCodeRecord) {
      totalCost *= 1 - referralCodeRecord.discountPercent / 100;
    }

    const purchase = await prisma.purchase.create({
      data: {
        launchId: id,
        userId: req.user!.id,
        walletAddress,
        amount,
        totalCost,
        txSignature,
        referralCodeId: referralCodeRecord?.id ?? null,
      },
    });

    if (referralCodeRecord) {
      await prisma.referralCode.update({
        where: { id: referralCodeRecord.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    res.status(201).json(purchase);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ error: 'Duplicate transaction signature' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id/purchases
router.get('/', auth, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }

    const where =
      launch.creatorId === req.user!.id
        ? { launchId: id }
        : { launchId: id, userId: req.user!.id };

    const purchases = await prisma.purchase.findMany({ where });
    res.status(200).json({ purchases, total: purchases.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
