const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../prisma');
const { computeStatus } = require('../utils/status');

// Mount sub-routers
router.use('/:id/whitelist', require('./whitelist'));
router.use('/:id/referrals', require('./referrals'));
router.use('/:id/purchase', require('./purchases'));
router.use('/:id/purchases', require('./purchases'));
router.use('/:id/vesting', require('./vesting'));

async function getTotalPurchased(launchId) {
  const result = await prisma.purchase.aggregate({
    where: { launchId },
    _sum: { amount: true },
  });
  return result._sum.amount || 0;
}

async function formatLaunch(launch) {
  const totalPurchased = await getTotalPurchased(launch.id);
  return { ...launch, status: computeStatus(launch, totalPurchased) };
}

// POST /api/launches
router.post('/', auth, async (req, res) => {
  const { name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers, vesting } = req.body;

  if (!name || !symbol || totalSupply == null || pricePerToken == null || !startsAt || !endsAt || maxPerWallet == null) {
    return res.status(400).json({ error: 'Missing required fields' });
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
        creatorId: req.user.id,
        tiers: tiers
          ? {
              create: tiers.map((t) => ({
                minAmount: t.minAmount,
                maxAmount: t.maxAmount,
                pricePerToken: t.pricePerToken,
              })),
            }
          : undefined,
        vesting: vesting
          ? {
              create: {
                cliffDays: vesting.cliffDays,
                vestingDays: vesting.vestingDays,
                tgePercent: vesting.tgePercent,
              },
            }
          : undefined,
      },
      include: { tiers: true, vesting: true },
    });

    return res.status(201).json({ ...launch, status: computeStatus(launch, 0) });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches
router.get('/', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const statusFilter = req.query.status;

  try {
    const allLaunches = await prisma.launch.findMany({
      include: { tiers: true, vesting: true },
      orderBy: { createdAt: 'desc' },
    });

    const launchesWithStatus = await Promise.all(allLaunches.map(formatLaunch));

    const filtered = statusFilter ? launchesWithStatus.filter((l) => l.status === statusFilter) : launchesWithStatus;

    const total = filtered.length;
    const launches = filtered.slice((page - 1) * limit, page * limit);

    return res.status(200).json({ launches, total, page, limit });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id
router.get('/:id', async (req, res) => {
  try {
    const launch = await prisma.launch.findUnique({
      where: { id: req.params.id },
      include: { tiers: true, vesting: true },
    });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });

    return res.status(200).json(await formatLaunch(launch));
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/launches/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const launch = await prisma.launch.findUnique({ where: { id: req.params.id } });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });
    if (launch.creatorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

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

    return res.status(200).json(await formatLaunch(updated));
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
