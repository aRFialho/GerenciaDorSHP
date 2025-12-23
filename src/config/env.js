const { z } = require("zod");
const dotenv = require("dotenv");

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  API_BASE_URL: z.string().url(),
  SHOPEE_API_BASE: z.string().url(),

  SHOPEE_PARTNER_ID: z.string().optional(),
  SHOPEE_PARTNER_KEY: z.string().optional(),
  SHOPEE_REDIRECT_URL: z.string().url().optional(),

  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional()
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Variáveis de ambiente inválidas: ${issues}`);
}

module.exports = parsed.data;