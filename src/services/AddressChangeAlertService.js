const crypto = require("crypto");

function norm(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\W_]+/g, " ")
    .trim();
}

// Ignora name/phone no hash pra não alertar por troca de contato
function makeAddressHash(snap) {
  const s = [
    norm(snap.zipcode),
    norm(snap.state),
    norm(snap.city),
    norm(snap.district),
    norm(snap.town),
    norm(snap.region),
    norm(snap.fullAddress),
  ].join("|");
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function isOrderClosed(status) {
  const s = String(status || "").toUpperCase();
  return ["COMPLETED", "CANCELLED", "RETURNED"].includes(s);
}

async function checkAndCreateAddressAlert({
  prisma,
  orderId,
  orderStatus,
  snapshotData,
}) {
  if (isOrderClosed(orderStatus)) {
    await prisma.orderAddressChangeAlert.updateMany({
      where: { orderId, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    return { changed: false, closed: true };
  }

  const newHash = makeAddressHash(snapshotData);

  return prisma.$transaction(async (tx) => {
    const last = await tx.orderAddressSnapshot.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      select: { id: true, addressHash: true },
    });

    if (last && last.addressHash === newHash) {
      return { changed: false, closed: false };
    }

    const newSnap = await tx.orderAddressSnapshot.create({
      data: { orderId, ...snapshotData, addressHash: newHash },
      select: { id: true },
    });

    if (last) {
      await tx.orderAddressChangeAlert.upsert({
        where: { orderId_newHash: { orderId, newHash } },
        update: {
          resolvedAt: null,
          detectedAt: new Date(),
          oldSnapshotId: last.id,
          newSnapshotId: newSnap.id,
          oldHash: last.addressHash,
        },
        create: {
          orderId,
          oldSnapshotId: last.id,
          newSnapshotId: newSnap.id,
          oldHash: last.addressHash,
          newHash,
        },
      });
      return { changed: true, closed: false };
    }

    return { changed: false, closed: false };
  });
}

module.exports = { checkAndCreateAddressAlert };
