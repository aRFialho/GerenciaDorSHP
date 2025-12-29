const prisma = require("../config/db");
const ShopeeProductWriteService = require("../services/ShopeeProductWriteService");
const ShopeeMediaService = require("../services/ShopeeMediaService");
const ShopeeAmsService = require("../services/ShopeeAmsService");
const ShopeeProductService = require("../services/ShopeeProductService");

function onlyDigits(v) {
  return /^\d+$/.test(String(v ?? "").trim());
}

function dedupPreserveOrder(arr) {
  const s = new Set();
  const out = [];
  for (const x of arr) {
    if (x && !s.has(x)) {
      s.add(x);
      out.push(x);
    }
  }
  return out;
}

function getActiveShopDbId(req) {
  return req.auth?.activeShopId || null;
}

async function getActiveShopOrFail(req, res) {
  if (!req.auth) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }

  const shopDbId = getActiveShopDbId(req);
  if (!shopDbId) {
    res.status(409).json({
      error: "select_shop_required",
      message: "Selecione uma loja para continuar.",
    });
    return null;
  }

  const shop = await prisma.shop.findFirst({
    where: {
      id: shopDbId,
      accountId: req.auth.accountId,
    },
  });

  if (!shop) {
    res.status(404).json({ error: "shop_not_found" });
    return null;
  }

  return shop;
}

async function persistImagesFromUpdateItemResponse(productId, updated) {
  const images = updated?.response?.images || updated?.images || null;
  const idList = Array.isArray(images?.image_id_list)
    ? images.image_id_list
    : [];
  const urlList = Array.isArray(images?.image_url_list)
    ? images.image_url_list
    : [];

  if (!idList.length && !urlList.length) return;

  await prisma.productImage.deleteMany({ where: { productId } });

  const rows = [];
  const n = Math.max(idList.length, urlList.length);

  for (let i = 0; i < n; i += 1) {
    const imageId = idList[i] ? String(idList[i]) : null;
    const url = urlList[i] ? String(urlList[i]) : null;
    if (!url && !imageId) continue;
    rows.push({ productId, url: url || "", imageId });
  }

  if (rows.length) {
    await prisma.productImage.createMany({ data: rows, skipDuplicates: true });
  }
}

/* ---------------- Products (DB) ---------------- */
async function list(req, res) {
  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;

  // paginação
  const pageRaw = Number(req.query.page || 1);
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const pageSizeRaw =
    req.query.pageSize != null ? Number(req.query.pageSize) : null;

  // compat: se não vier page/pageSize, aceita limit (cap 200) como pageSize e page=1
  const usingLegacyLimit =
    req.query.page == null &&
    req.query.pageSize == null &&
    req.query.limit != null;

  const legacyLimitRaw = usingLegacyLimit ? Number(req.query.limit) : null;

  let pageSize;
  if (usingLegacyLimit) {
    pageSize = Math.min(200, Math.max(1, Math.floor(legacyLimitRaw || 60)));
  } else if ([25, 50, 100].includes(pageSizeRaw)) {
    pageSize = pageSizeRaw;
  } else {
    pageSize = 50;
  }

  const skip = (page - 1) * pageSize;
  const take = pageSize;

  // busca + ordenação (TEM que vir antes do findMany)
  const q = String(req.query.q || "").trim();
  const qDigitsOnly = /^\d+$/.test(q);

  const sortBy = String(req.query.sortBy || "updatedAt");
  const sortDir =
    String(req.query.sortDir || "desc") === "asc" ? "asc" : "desc";

  const allowedSort = new Set([
    "updatedAt",
    "createdAt",
    "shopeeCreateTime",
    "sold",
  ]);

  const orderBy = allowedSort.has(sortBy)
    ? { [sortBy]: sortDir }
    : { updatedAt: "desc" };

  const where = {
    shopId: shop.id,
    ...(q
      ? {
          OR: [
            ...(qDigitsOnly ? [{ itemId: BigInt(q) }] : []),
            { title: { contains: q, mode: "insensitive" } },
            { models: { some: { sku: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        itemId: true,
        status: true,
        title: true,
        sold: true,
        ratingStar: true,
        ratingCount: true,
        priceMin: true,
        priceMax: true,
        currency: true,
        hasModel: true,
        stock: true,
        images: { take: 1, select: { url: true } },
        models: { select: { stock: true } }, // só para somar
        createdAt: true,
        updatedAt: true,
        shopeeCreateTime: true,
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const items = rows.map((p) => {
    const totalStock = p.hasModel
      ? (p.models || []).reduce((acc, m) => acc + (Number(m.stock) || 0), 0)
      : p.stock ?? null;

    const { models, ...rest } = p;
    return { ...rest, totalStock };
  });

  res.json({
    items,
    meta: { page, pageSize, total, totalPages },
  });
}

async function detail(req, res) {
  const { itemId } = req.params;

  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;

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

/* ---------------- CRUD (Shopee write) ---------------- */
async function updateItem(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!onlyDigits(itemId))
      return res.status(400).json({ error: "itemId_invalid" });

    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const shopeeShopId = String(shop.shopId);
    const body = { ...req.body, item_id: Number(itemId) };

    const result = await ShopeeProductWriteService.updateItem({
      shopId: shopeeShopId,
      body,
    });

    // Opcional: atualizar imagens no DB a partir do retorno
    const product = await prisma.product.findUnique({
      where: {
        shopId_itemId: { shopId: shop.id, itemId: BigInt(String(itemId)) },
      },
      select: { id: true },
    });

    if (product) {
      await persistImagesFromUpdateItemResponse(product.id, result);
    }

    return res.json({ status: "ok", result });
  } catch (err) {
    return next(err);
  }
}

async function updatePrice(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!onlyDigits(itemId))
      return res.status(400).json({ error: "itemId_invalid" });

    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const shopeeShopId = String(shop.shopId);
    const body = { ...req.body, item_id: Number(itemId) };

    const result = await ShopeeProductWriteService.updatePrice({
      shopId: shopeeShopId,
      body,
    });

    return res.json({ status: "ok", result });
  } catch (err) {
    return next(err);
  }
}

async function updateStock(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!onlyDigits(itemId))
      return res.status(400).json({ error: "itemId_invalid" });

    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const shopeeShopId = String(shop.shopId);
    const body = { ...req.body, item_id: Number(itemId) };

    const result = await ShopeeProductWriteService.updateStock({
      shopId: shopeeShopId,
      body,
    });

    return res.json({ status: "ok", result });
  } catch (err) {
    return next(err);
  }
}

/* ---------------- Images ---------------- */
/**
 * Replace total:
 * - faz upload
 * - faz update_item com image_id_list somente das novas
 */
async function uploadAndApplyImages(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!onlyDigits(itemId))
      return res.status(400).json({ error: "itemId_invalid" });

    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const files = req.files || [];
    if (files.length < 1)
      return res.status(400).json({ error: "no_images_uploaded" });
    if (files.length > 3)
      return res.status(400).json({ error: "max_3_images" });

    const business = Number(req.body.business);
    const scene = Number(req.body.scene);
    if (!Number.isFinite(business) || !Number.isFinite(scene)) {
      return res.status(400).json({ error: "business_scene_required" });
    }

    const imageList = await ShopeeMediaService.uploadImage({
      files,
      business,
      scene,
    });
    const imageIds = imageList.map((x) => x.image_id).filter(Boolean);

    if (!imageIds.length) {
      return res.status(502).json({ error: "upload_failed_no_image_ids" });
    }

    const updateBody = {
      item_id: Number(itemId),
      image: { image_id_list: imageIds },
    };

    const shopeeShopId = String(shop.shopId);
    const updated = await ShopeeProductWriteService.updateItem({
      shopId: shopeeShopId,
      body: updateBody,
    });

    const product = await prisma.product.findUnique({
      where: {
        shopId_itemId: { shopId: shop.id, itemId: BigInt(String(itemId)) },
      },
      select: { id: true },
    });

    if (product) {
      await persistImagesFromUpdateItemResponse(product.id, updated);
    }

    return res.json({ status: "ok", uploaded: imageList, updated });
  } catch (err) {
    return next(err);
  }
}

/**
 * Add (mantém as atuais + novas):
 * - só funciona 100% se você tiver imageId salvo no DB
 */
async function addImages(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!onlyDigits(itemId))
      return res.status(400).json({ error: "itemId_invalid" });

    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const files = req.files || [];
    if (files.length < 1)
      return res.status(400).json({ error: "no_images_uploaded" });
    if (files.length > 3)
      return res.status(400).json({ error: "max_3_images" });

    const business = Number(req.body.business);
    const scene = Number(req.body.scene);
    if (!Number.isFinite(business) || !Number.isFinite(scene)) {
      return res.status(400).json({ error: "business_scene_required" });
    }

    const product = await prisma.product.findUnique({
      where: {
        shopId_itemId: { shopId: shop.id, itemId: BigInt(String(itemId)) },
      },
      include: { images: true },
    });
    if (!product) return res.status(404).json({ error: "product_not_found" });

    const existingIds = product.images.map((im) => im.imageId).filter(Boolean);

    if (!existingIds.length) {
      return res.status(409).json({
        error: "no_existing_image_ids",
        message:
          "Este produto não tem imageId salvo no banco (só URLs do sync). Faça um update de imagens (rota /images) ao menos uma vez para o sistema passar a armazenar image_id_list e então habilitar add/remove sem perder as imagens atuais.",
      });
    }

    const uploaded = await ShopeeMediaService.uploadImage({
      files,
      business,
      scene,
    });
    const newIds = uploaded.map((x) => x.image_id).filter(Boolean);

    const finalIds = dedupPreserveOrder([...existingIds, ...newIds]);
    if (!finalIds.length)
      return res.status(502).json({ error: "final_image_ids_empty" });

    const updateBody = {
      item_id: Number(itemId),
      image: { image_id_list: finalIds },
    };

    const shopeeShopId = String(shop.shopId);
    const updated = await ShopeeProductWriteService.updateItem({
      shopId: shopeeShopId,
      body: updateBody,
    });

    await persistImagesFromUpdateItemResponse(product.id, updated);

    return res.json({ status: "ok", uploaded, updated });
  } catch (err) {
    return next(err);
  }
}

async function removeImages(req, res, next) {
  try {
    const { itemId } = req.params;
    if (!onlyDigits(itemId))
      return res.status(400).json({ error: "itemId_invalid" });

    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const removeImageIds = Array.isArray(req.body?.removeImageIds)
      ? req.body.removeImageIds
      : [];
    const removeSet = new Set(removeImageIds.map((x) => String(x)));

    if (!removeSet.size)
      return res.status(400).json({ error: "removeImageIds_required" });

    const product = await prisma.product.findUnique({
      where: {
        shopId_itemId: { shopId: shop.id, itemId: BigInt(String(itemId)) },
      },
      include: { images: true },
    });
    if (!product) return res.status(404).json({ error: "product_not_found" });

    const existingIds = product.images.map((im) => im.imageId).filter(Boolean);
    if (!existingIds.length) {
      return res.status(409).json({
        error: "no_existing_image_ids",
        message:
          "Este produto não tem imageId salvo no banco. Faça um update de imagens (rota /images) ao menos uma vez para salvar image_id_list.",
      });
    }

    const finalIds = existingIds.filter((id) => !removeSet.has(String(id)));
    if (finalIds.length < 1)
      return res.status(400).json({ error: "cannot_remove_all_images" });

    const updateBody = {
      item_id: Number(itemId),
      image: { image_id_list: finalIds },
    };

    const shopeeShopId = String(shop.shopId);
    const updated = await ShopeeProductWriteService.updateItem({
      shopId: shopeeShopId,
      body: updateBody,
    });

    await persistImagesFromUpdateItemResponse(product.id, updated);

    return res.json({ status: "ok", updated });
  } catch (err) {
    return next(err);
  }
}

function isYyyyMmDd(v) {
  return /^\d{8}$/.test(String(v ?? "").trim());
}

async function performance(req, res, next) {
  try {
    const shop = await getActiveShopOrFail(req, res);
    if (!shop) return;

    const periodType = String(req.query.periodType || "").trim();
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();

    if (!periodType)
      return res.status(400).json({ error: "periodType_required" });
    if (!isYyyyMmDd(startDate))
      return res.status(400).json({ error: "startDate_invalid" });
    if (!isYyyyMmDd(endDate))
      return res.status(400).json({ error: "endDate_invalid" });

    const pageNo = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(
      20,
      Math.max(1, Number(req.query.pageSize || 20))
    );

    const orderType = String(req.query.orderType || "ConfirmedOrder");
    const channel = String(req.query.channel || "AllChannel");
    const itemId = req.query.itemId ? String(req.query.itemId) : null;

    const shopeeShopId = String(shop.shopId);
    const result = await ShopeeAmsService.getProductPerformance({
      shopId: shopeeShopId,
      periodType,
      startDate,
      endDate,
      pageNo,
      pageSize,
      orderType,
      channel,
      itemId,
    });

    return res.json({ status: "ok", result });
  } catch (err) {
    return next(err);
  }
}

async function fullDetail(req, res) {
  const { itemId } = req.params;

  const shop = await getActiveShopOrFail(req, res);
  if (!shop) return;

  const product = await prisma.product.findUnique({
    where: {
      shopId_itemId: { shopId: shop.id, itemId: BigInt(String(itemId)) },
    },
    include: { images: true, models: { orderBy: { modelId: "asc" } } },
  });
  if (!product) return res.status(404).json({ error: "product_not_found" });

  const totalStock = product.hasModel
    ? (product.models || []).reduce((acc, m) => acc + (Number(m.stock) || 0), 0)
    : product.stock ?? null;

  let description = product.description || null;
  try {
    const shopeeShopId = String(shop.shopId);
    const extra = await ShopeeProductService.getItemExtraInfo({
      shopId: shopeeShopId,
      itemId,
    });
    description = extra?.response?.description || description;
  } catch (_) {}

  return res.json({
    product: { ...product, totalStock },
    extra: {
      description: product.description || null,
      attributes: product.attributes || null,
      logistics: product.logistics || null,
      dimension: product.dimension || null,
      weight: product.weight ?? null,
      daysToShip: product.daysToShip ?? null,
      itemUrl: null,
    },
  });
}

module.exports = {
  list,
  detail,
  fullDetail,
  updateItem,
  updatePrice,
  updateStock,
  uploadAndApplyImages,
  addImages,
  removeImages,
  performance,
};
