const prisma = require("../config/db");

async function list(req, res) {
  const { shopId } = req.params;
  const limit = Math.min(Number(req.query.limit || 60), 200);

  const shop = await prisma.shop.findUnique({
    where: { shopId: BigInt(String(shopId)) },
  });
  if (!shop) return res.status(404).json({ error: "shop_not_found" });

  const items = await prisma.product.findMany({
    where: { shopId: shop.id },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      itemId: true,
      status: true,
      title: true,
      stock: true,
      sold: true,
      priceMin: true,
      priceMax: true,
      currency: true,
      images: { take: 1, select: { url: true } },
    },
  });

  res.json({ items });
}

async function detail(req, res) {
  const { shopId, itemId } = req.params;

  const shop = await prisma.shop.findUnique({
    where: { shopId: BigInt(String(shopId)) },
  });
  if (!shop) return res.status(404).json({ error: "shop_not_found" });

  const product = await prisma.product.findUnique({
    where: {
      shopId_itemId: { shopId: shop.id, itemId: BigInt(String(itemId)) },
    },
    include: {
      images: true,
      models: { orderBy: { modelId: "asc" } },
    },
  });

  if (!product) return res.status(404).json({ error: "product_not_found" });

  res.json({ product });
}

module.exports = { list, detail };
