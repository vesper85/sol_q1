import { Router, Request, Response } from 'express';
import auth from '../middleware/auth.js';
import prisma from '../prisma.js';

const router = Router({ mergeParams: true });

// POST /api/launches/:id/whitelist
router.post('/', auth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { addresses } = req.body as { addresses?: string[] };

  if (!addresses || !Array.isArray(addresses)) {
    res.status(400).json({ error: 'addresses must be an array' });
    return;
  }

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }
    if (launch.creatorId !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const existing = await prisma.whitelist.findMany({ where: { launchId: id } });
    const existingSet = new Set(existing.map((w) => w.address));
    const uniqueInput = [...new Set(addresses)];
    const newAddresses = uniqueInput.filter((a) => !existingSet.has(a));

    if (newAddresses.length > 0) {
      await prisma.whitelist.createMany({
        data: newAddresses.map((address) => ({ launchId: id, address })),
        skipDuplicates: true,
      });
    }

    const total = await prisma.whitelist.count({ where: { launchId: id } });
    res.status(200).json({ added: newAddresses.length, total });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id/whitelist
router.get('/', auth, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }
    if (launch.creatorId !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const entries = await prisma.whitelist.findMany({ where: { launchId: id } });
    res.status(200).json({ addresses: entries.map((e) => e.address), total: entries.length });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/launches/:id/whitelist/:address
router.delete('/:address', auth, async (req: Request, res: Response) => {
  const { id, address } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) { res.status(404).json({ error: 'Launch not found' }); return; }
    if (launch.creatorId !== req.user!.id) { res.status(403).json({ error: 'Forbidden' }); return; }

    const entry = await prisma.whitelist.findUnique({
      where: { launchId_address: { launchId: id, address } },
    });
    if (!entry) { res.status(404).json({ error: 'Address not found in whitelist' }); return; }

    await prisma.whitelist.delete({ where: { launchId_address: { launchId: id, address } } });
    res.status(200).json({ removed: true });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
