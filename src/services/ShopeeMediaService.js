const axios = require("axios");
const FormData = require("form-data");
const crypto = require("crypto");
const shopee = require("../config/shopee");

function sign(path, timestamp) {
  return crypto
    .createHmac("sha256", shopee.PARTNER_KEY)
    .update(`${shopee.PARTNER_ID}${path}${timestamp}`)
    .digest("hex");
}
function isShopeeError(data) {
  return typeof data?.error === "string" && data.error.trim() !== "";
}
async function uploadImage({ files, business, scene }) {
  const path = "/api/v2/media/upload_image";
  const timestamp = Math.floor(Date.now() / 1000);
  const form = new FormData();
  form.append("business", String(business));
  form.append("scene", String(scene));
  files.forEach((f) =>
    form.append("images", f.buffer, {
      filename: f.originalname,
      contentType: f.mimetype,
    })
  );
  try {
    const { data } = await axios.post(
      `${shopee.SHOPEE_API_BASE}${path}`,
      form,
      {
        params: {
          partner_id: Number(shopee.PARTNER_ID),
          timestamp,
          sign: sign(path, timestamp),
        },
        headers: form.getHeaders(),
        maxBodyLength: Infinity,
        timeout: 30000,
      }
    );
    if (isShopeeError(data)) {
      const e = new Error("Shopee API error");
      e.statusCode = 400;
      e.shopee = data;
      throw e;
    }
    return data?.response?.image_list || [];
  } catch (err) {
    const e = new Error("Shopee API error");
    e.statusCode = err.response?.status || 502;
    e.shopee = err.response?.data || { message: err.message };
    throw e;
  }
}

module.exports = { uploadImage };
