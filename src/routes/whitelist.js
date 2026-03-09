const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/auth');
const prisma = require('../prisma');

// POST /api/launches/:id/whitelist
router.post('/', auth, async (req, res) => {
  const { id } = req.params;
  const { addresses } = req.body;

  if (!addresses || !Array.isArray(addresses)) {
    return res.status(400).json({ error: 'addresses must be an array' });
  }

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });
    if (launch.creatorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

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
    return res.status(200).json({ added: newAddresses.length, total });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/launches/:id/whitelist
router.get('/', auth, async (req, res) => {
  const { id } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });
    if (launch.creatorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const entries = await prisma.whitelist.findMany({ where: { launchId: id } });
    return res.status(200).json({
      addresses: entries.map((e) => e.address),
      total: entries.length,
    });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/launches/:id/whitelist/:address
router.delete('/:address', auth, async (req, res) => {
  const { id, address } = req.params;

  try {
    const launch = await prisma.launch.findUnique({ where: { id } });
    if (!launch) return res.status(404).json({ error: 'Launch not found' });
    if (launch.creatorId !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const entry = await prisma.whitelist.findUnique({
      where: { launchId_address: { launchId: id, address } },
    });
    if (!entry) return res.status(404).json({ error: 'Address not found in whitelist' });

    await prisma.whitelist.delete({ where: { launchId_address: { launchId: id, address } } });
    return res.status(200).json({ removed: true });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
