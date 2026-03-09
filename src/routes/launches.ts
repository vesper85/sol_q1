import { Router, Request, Response } from 'express';
import { Launch, Tier, Vesting } from '@prisma/client';
import auth from '../middleware/auth.js';
import prisma from '../prisma.js';
import { computeStatus } from '../utils/status.js';
import whitelistRouter from './whitelist.js';
import referralsRouter from './referrals.js';
import purchasesRouter from './purchases.js';
import vestingRouter from './vesting.js';

const router = Router();

router.use('/:id/whitelist', whitelistRouter);
router.use('/:id/referrals', referralsRouter);
router.use('/:id/purchase', purchasesRouter);
router.use('/:id/purchases', purchasesRouter);
router.use('/:id/vesting', vestingRouter);

type LaunchWithRelations = Launch & { tiers: Tier[]; vesting: Vesting | null };

async function getTotalPurchased(launchId: string): Promise<number> {
  const result = await prisma.purchase.aggregate({
    where: { launchId },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
}

async function formatLaunch(launch: LaunchWithRelations) {
  const totalPurchased = await getTotalPurchased(launch.id);
  return { ...launch, status: computeStatus(launch, totalPurchased) };
}

// POST /api/launches
router.post('/', auth, async (req: Request, res: Response) => {
  const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } =
    req.body;

  if (!name || !symbol || totalSupply == null || pricePerToken == null || !startsAt || !endsAt || maxPerWallet == null) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  try {
    const launch = await prisma.launch.create({
      data: {
        name,
        symbol,
        totalSupply,
        pricePerToken,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        maxPerWallet,
        description,
        creatorId: req.user!.id,
        tiers: tiers
          ? { create: tiers.map((t: { minAmount: number; maxAmount: number; pricePerToken: number }) => t) }
          : undefined,
        vesting: vesting
          ? { create: { cliffDays: vesting.cliffDays, vestingDays: vesting.vestingDays, tgePercent: vesting.tgePercent } }
          : undefined,
      },
      include: { tiers: true, vesting: true },
    });

    res.status(201).json({ ...launch, status: computeStatus(launch, 0) });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches
router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const statusFilter = req.query.status as string | undefined;

  try {
    const allLaunches = await prisma.launch.findMany({
      include: { tiers: true, vesting: true },
      orderBy: { createdAt: 'desc' },
    });

    const launchesWithStatus = await Promise.all(allLaunches.map(formatLaunch));
    const filtered = statusFilter ? launchesWithStatus.filter((l) => l.status === statusFilter) : launchesWithStatus;

    res.status(200).json({
      launches: filtered.slice((page - 1) * limit, page * limit),
      total: filtered.length,
      page,
      limit,
    });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
      include: { tiers: true, vesting: true },
    });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }
    res.status(200).json(await formatLaunch(launch));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/launches/:id
router.put('/:id', auth, async (req: Request, res: Response) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }
    if (launch.creatorId !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description } = req.body;

    const updated = await prisma.launch.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(symbol !== undefined && { symbol }),
        ...(totalSupply != null && { totalSupply }),
        ...(pricePerToken != null && { pricePerToken }),
        ...(startsAt !== undefined && { startsAt: new Date(startsAt) }),
        ...(endsAt !== undefined && { endsAt: new Date(endsAt) }),
        ...(maxPerWallet != null && { maxPerWallet }),
        ...(description !== undefined && { description }),
      },
      include: { tiers: true, vesting: true },
    });

    res.status(200).json(await formatLaunch(updated));
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
