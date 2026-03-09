import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import auth from '../middleware/auth.js';
import prisma from '../prisma.js';

const router = Router({ mergeParams: true });

// POST /api/launches/:id/referrals
router.post('/', auth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { code, discountPercent, maxUses } = req.body as {
    code?: string;
    discountPercent?: number;
    maxUses?: number;
  };

  if (!code || discountPercent == null || maxUses == null) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }
    if (launch.creatorId !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const referral = await prisma.referralCode.create({
      data: { launchId: id, code, discountPercent, maxUses },
    });

    res.status(201).json({
      id: referral.id,
      code: referral.code,
      discountPercent: referral.discountPercent,
      maxUses: referral.maxUses,
      usedCount: 0,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ error: 'Referral code already exists for this launch' });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id/referrals
router.get('/', auth, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }
    if (launch.creatorId !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const referrals = await prisma.referralCode.findMany({ where: { launchId: id } });
    res.status(200).json(referrals);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
