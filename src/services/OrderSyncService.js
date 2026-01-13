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
function addressHash(addr) {
  const raw = [
    normalizeZipcode(addr?.zipcode),
    normalizeStr(addr?.state),
    normalizeStr(addr?.city),
    normalizeStr(addr?.district),
    normalizeStr(addr?.town),
    normalizeStr(addr?.region),
    normalizeStr(addr?.full_address),
  ].join("|");

  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
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
        district: true,
        town: true,
        region: true,
        fullAddress: true,
      },
    });

    const currentNorm = {
      zipcode: normalizeZipcode(addr?.zipcode),
      state: normalizeStr(addr?.state),
      city: normalizeStr(addr?.city),
      district: normalizeStr(addr?.district),
      town: normalizeStr(addr?.town),
      region: normalizeStr(addr?.region),
      fullAddress: normalizeStr(addr?.full_address),
    };

    const lastNorm = last
      ? {
          zipcode: normalizeZipcode(last.zipcode),
          state: normalizeStr(last.state),
          city: normalizeStr(last.city),
          district: normalizeStr(last.district),
          town: normalizeStr(last.town),
          region: normalizeStr(last.region),
          fullAddress: normalizeStr(last.fullAddress),
        }
      : null;

    const sameAddress =
      !!lastNorm &&
      currentNorm.zipcode === lastNorm.zipcode &&
      currentNorm.state === lastNorm.state &&
      currentNorm.city === lastNorm.city &&
      currentNorm.district === lastNorm.district &&
      currentNorm.town === lastNorm.town &&
      currentNorm.region === lastNorm.region &&
      currentNorm.fullAddress === lastNorm.fullAddress;

    // ✅ agora sim: mudou só se os CAMPOS mudaram
    const changedNow = !last ? true : !sameAddress;

    // (opcional, mas recomendado) se o endereço é igual porém o hash era antigo/inconsistente,
    // atualiza o hash do último snapshot pra evitar alertas falsos no futuro.
    if (last && sameAddress && last.addressHash !== currentHash) {
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

      // Só vira "alerta" se já existia snapshot anterior (senão é o primeiro endereço salvo)
      if (last) {
        addressChanged = true;

        await prisma.orderAddressChangeAlert.upsert({
          where: {
            orderId_newHash: {
              orderId: order.id,
              newHash: currentHash,
            },
          },
          update: {
            resolvedAt: null, // reabre se tinha sido resolvido manualmente
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
