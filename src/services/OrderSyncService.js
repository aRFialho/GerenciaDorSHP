const crypto = require("crypto");
const prisma = require("../config/db");
const { requestShopeeAuthed } = require("./ShopeeAuthedHttp");

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function parseRangeDays(v) {
  const n = Number(v);
  if ([7, 15, 30, 60].includes(n)) return n;
  return 7;
}

function addressKeyFromShopee(addr) {
  return [
    normalizeZipcode(addr?.zipcode),
    normalizeStr(addr?.state),
    normalizeStr(addr?.city),
    normalizeStr(addr?.full_address),
  ].join("|");
}

function addressKeyFromSnapshot(snap) {
  return [
    normalizeZipcode(snap?.zipcode),
    normalizeStr(snap?.state),
    normalizeStr(snap?.city),
    normalizeStr(snap?.fullAddress),
  ].join("|");
}

function normalizeStr(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, " ") // remove pontuação/símbolos
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeZipcode(v) {
  const digits = String(v || "").replace(/\D+/g, "");
  return digits;
}

function looksMasked(v) {
  const s = String(v || "").trim();
  if (!s) return true;
  return s.includes("*") || s.toLowerCase().includes("xxx");
}

async function persistOrderGeoAddressOnce({ shopInternalId, order, addr }) {
  // Precisamos no mínimo de cidade/estado para o mapa
  const stateRaw = String(addr?.state || "").trim();
  const cityRaw = String(addr?.city || "").trim();

  if (!stateRaw || !cityRaw) return;
  if (looksMasked(stateRaw) || looksMasked(cityRaw)) return;

  // "salvar 1x": se já existe, não atualiza
  const exists = await prisma.orderGeoAddress.findUnique({
    where: { orderId: order.id },
    select: { id: true },
  });
  if (exists) return;

  try {
    await prisma.orderGeoAddress.create({
      data: {
        shopId: shopInternalId,
        orderId: order.id,
        orderSn: order.orderSn,

        state: stateRaw,
        stateNorm: normalizeStr(stateRaw),
        city: cityRaw,
        cityNorm: normalizeStr(cityRaw),

        zipcode: addr?.zipcode ? String(addr.zipcode) : null,
        fullAddress: addr?.full_address ? String(addr.full_address) : null,

        shopeeCreateTime: order.shopeeCreateTime || null,
        shopeeUpdateTime: order.shopeeUpdateTime || null,
      },
    });
  } catch (e) {
    // Se dois workers tentarem criar ao mesmo tempo, o @unique(orderId) pode disparar.
    // Como a regra é "não atualizar", a gente só ignora conflito de duplicidade.
    // (Se quiser, eu deixo esse catch mais específico por código de erro do Prisma.)
    return;
  }
}

function addressHash(addr) {
  const key = addressKeyFromShopee(addr);
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

function calcLateAndRisk(orderStatus, shipByDate) {
  if (!shipByDate) return { late: false, atRisk: false };

  const now = Date.now();
  const msLeft = shipByDate.getTime() - now;
  const active = orderStatus === "READY_TO_SHIP";

  return {
    late: active && msLeft < 0,
    atRisk: active && msLeft >= 0 && msLeft <= 24 * 60 * 60 * 1000,
  };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isOrderClosed(orderStatus) {
  const s = String(orderStatus || "").toUpperCase();
  return ["COMPLETED", "CANCELLED", "RETURNED"].includes(s);
}

async function upsertOrderAndSnapshot(shopInternalId, detail) {
  const orderSn = String(detail.order_sn);

  const shipByDate = detail.ship_by_date
    ? new Date(Number(detail.ship_by_date) * 1000)
    : null;

  const order = await prisma.order.upsert({
    where: { shopId_orderSn: { shopId: shopInternalId, orderSn } },
    create: {
      shopId: shopInternalId,
      orderSn,
      orderStatus: detail.order_status || null,
      region: detail.region || null,
      currency: detail.currency || null,
      daysToShip: detail.days_to_ship ?? null,
      shipByDate,
      shopeeCreateTime: detail.create_time
        ? new Date(Number(detail.create_time) * 1000)
        : null,
      shopeeUpdateTime: detail.update_time
        ? new Date(Number(detail.update_time) * 1000)
        : null,
      bookingSn: detail.booking_sn || null,
      cod: detail.cod ?? null,
      advancePackage: detail.advance_package ?? null,
      hotListingOrder: detail.hot_listing_order ?? null,
      isBuyerShopCollection: detail.is_buyer_shop_collection ?? null,
      messageToSeller: detail.message_to_seller || null,
      reverseShippingFee: detail.reverse_shipping_fee ?? null,
    },
    update: {
      orderStatus: detail.order_status || null,
      region: detail.region || null,
      currency: detail.currency || null,
      daysToShip: detail.days_to_ship ?? null,
      shipByDate,
      shopeeCreateTime: detail.create_time
        ? new Date(Number(detail.create_time) * 1000)
        : null,
      shopeeUpdateTime: detail.update_time
        ? new Date(Number(detail.update_time) * 1000)
        : null,
      bookingSn: detail.booking_sn || null,
      cod: detail.cod ?? null,
      advancePackage: detail.advance_package ?? null,
      hotListingOrder: detail.hot_listing_order ?? null,
      isBuyerShopCollection: detail.is_buyer_shop_collection ?? null,
      messageToSeller: detail.message_to_seller || null,
      reverseShippingFee: detail.reverse_shipping_fee ?? null,
    },
  });

  const addr = detail.recipient_address || null;
  if (addr) {
    await persistOrderGeoAddressOnce({ shopInternalId, order, addr });
  }
  let addressChanged = false; // "mudou de verdade" (comparado com snapshot anterior)
  let snapshotCreated = false;

  // Se o pedido fechou, resolve alertas abertos e não cria novos
  if (isOrderClosed(order.orderStatus)) {
    await prisma.orderAddressChangeAlert.updateMany({
      where: { orderId: order.id, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    // Ainda podemos criar snapshot? (opcional). Por segurança, aqui eu não crio.
  } else if (addr) {
    const currentKey = addressKeyFromShopee(addr);
    const currentHash = addressHash(addr);

    const last = await prisma.orderAddressSnapshot.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        addressHash: true,
        zipcode: true,
        state: true,
        city: true,
        fullAddress: true,
      },
    });

    const lastKey = last ? addressKeyFromSnapshot(last) : null;

    // ✅ changedNow depende SOMENTE do endereço do cliente (não do hash)
    const changedNow = !last ? true : currentKey !== lastKey;

    // se o endereço é igual mas o hash antigo difere (mudança de algoritmo/normalização),
    // só corrige o hash do último snapshot (não cria snapshot/alerta)
    if (last && !changedNow && last.addressHash !== currentHash) {
      await prisma.orderAddressSnapshot.update({
        where: { id: last.id },
        data: { addressHash: currentHash },
      });
    }

    if (changedNow) {
      const newSnap = await prisma.orderAddressSnapshot.create({
        data: {
          orderId: order.id,
          name: addr.name || null,
          phone: addr.phone || null,
          town: addr.town || null,
          district: addr.district || null,
          city: addr.city || null,
          state: addr.state || null,
          region: addr.region || null,
          zipcode: addr.zipcode || null,
          fullAddress: addr.full_address || null,
          addressHash: currentHash,
        },
        select: { id: true },
      });

      snapshotCreated = true;

      if (last) {
        addressChanged = true;

        await prisma.orderAddressChangeAlert.upsert({
          where: {
            orderId_newHash: { orderId: order.id, newHash: currentHash },
          },
          update: {
            resolvedAt: null,
            detectedAt: new Date(),
            oldSnapshotId: last.id,
            newSnapshotId: newSnap.id,
            oldHash: last.addressHash,
          },
          create: {
            orderId: order.id,
            oldSnapshotId: last.id,
            newSnapshotId: newSnap.id,
            oldHash: last.addressHash,
            newHash: currentHash,
          },
        });
      }
    }
  }

  const { late, atRisk } = calcLateAndRisk(order.orderStatus, order.shipByDate);

  return { addressChanged, late, atRisk };
}

async function syncOrdersForShop({ shopeeShopId, rangeDays, pageSize = 50 }) {
  // precisa do Shop interno para gravar Order.shopId (FK int)
  const shopRow = await prisma.shop.findUnique({
    where: { shopId: BigInt(String(shopeeShopId)) },
  });

  if (!shopRow) {
    const err = new Error("Shop não cadastrado no banco");
    err.statusCode = 400;
    throw err;
  }

  const timeTo = nowTs();
  const timeFrom = timeTo - rangeDays * 24 * 60 * 60;

  let cursor = "";
  let more = true;

  let processed = 0;
  let addressChangedCount = 0;
  let lateCount = 0;
  let atRiskCount = 0;

  while (more) {
    const list = await requestShopeeAuthed({
      method: "get",
      path: "/api/v2/order/get_order_list",
      shopId: String(shopeeShopId),
      query: {
        time_range_field: "update_time",
        time_from: timeFrom,
        time_to: timeTo,
        page_size: pageSize,
        cursor,
      },
    });

    const orderSns = (list?.response?.order_list || [])
      .map((o) => o.order_sn)
      .filter(Boolean);

    const batches = chunk(orderSns, 20);

    for (const batch of batches) {
      if (batch.length === 0) continue;

      const details = await requestShopeeAuthed({
        method: "get",
        path: "/api/v2/order/get_order_detail",
        shopId: String(shopeeShopId),
        query: {
          order_sn_list: batch,
          response_optional_fields: [
            "recipient_address",
            "order_status",
            "create_time",
            "update_time",
            "days_to_ship",
            "ship_by_date",
            "currency",
            "region",
            "booking_sn",
            "cod",
            "advance_package",
            "hot_listing_order",
            "is_buyer_shop_collection",
            "message_to_seller",
            "reverse_shipping_fee",
          ],
        },
      });

      const orderList = details?.response?.order_list || [];
      for (const d of orderList) {
        processed += 1;
        const { addressChanged, late, atRisk } = await upsertOrderAndSnapshot(
          shopRow.id,
          d
        );
        if (addressChanged) addressChangedCount += 1;
        if (late) lateCount += 1;
        if (atRisk) atRiskCount += 1;
      }
    }

    more = Boolean(list?.response?.more);
    cursor = String(list?.response?.next_cursor || "");
    if (!more) break;
  }

  return {
    status: "ok",
    shop_id: String(shopeeShopId),
    rangeDays,
    summary: {
      processed,
      addressChanged: addressChangedCount,
      late: lateCount,
      atRisk: atRiskCount,
    },
  };
}

module.exports = { parseRangeDays, syncOrdersForShop, isOrderClosed };
