const googleTrends = require("google-trends-api");

function safeJsonParse(name, raw) {
  const t = String(raw || "").trim();
  if (!t) throw new Error(`${name}_empty_response`);
  if (t.startsWith("<")) throw new Error(`${name}_returned_html_blocked`);
  return JSON.parse(t);
}

function clamp(n, a, b) {
  const x = Number(n);
  if (!Number.isFinite(x)) return a;
  return Math.max(a, Math.min(b, x));
}

function timeframeFromPeriod(period) {
  // seus presets
  if (period === "7d") return "now 7-d";
  if (period === "30d") return "today 1-m";
  if (period === "90d") return "today 3-m";
  return "today 1-m";
}

// cache in-memory simples (MVP)
const CACHE = new Map(); // key -> { exp, data }
function cacheGet(key) {
  const it = CACHE.get(key);
  if (!it) return null;
  if (Date.now() > it.exp) {
    CACHE.delete(key);
    return null;
  }
  return it.data;
}
function cacheSet(key, data, ttlMs) {
  CACHE.set(key, { exp: Date.now() + ttlMs, data });
}

// UF map (Trends pode devolver nomes por extenso dependendo do retorno)
const UF_MAP = new Map([
  ["acre", "AC"],
  ["alagoas", "AL"],
  ["amapa", "AP"],
  ["amazonas", "AM"],
  ["bahia", "BA"],
  ["ceara", "CE"],
  ["distrito federal", "DF"],
  ["espirito santo", "ES"],
  ["goias", "GO"],
  ["maranhao", "MA"],
  ["mato grosso", "MT"],
  ["mato grosso do sul", "MS"],
  ["minas gerais", "MG"],
  ["para", "PA"],
  ["paraiba", "PB"],
  ["parana", "PR"],
  ["pernambuco", "PE"],
  ["piaui", "PI"],
  ["rio de janeiro", "RJ"],
  ["rio grande do norte", "RN"],
  ["rio grande do sul", "RS"],
  ["rondonia", "RO"],
  ["roraima", "RR"],
  ["santa catarina", "SC"],
  ["sao paulo", "SP"],
  ["sergipe", "SE"],
  ["tocantins", "TO"],
]);

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

async function suggest(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.status(400).json({ error: "q_required" });

    const key = `suggest:v1:${q.toLowerCase()}`;
    const cached = cacheGet(key);
    if (cached) return res.json(cached);

    const url =
      "https://suggestqueries.google.com/complete/search" +
      `?client=firefox&hl=pt-BR&gl=BR&q=${encodeURIComponent(q)}`;

    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`suggest_http_${r.status}`);

    const data = await r.json(); // formato: [query, [sugestoes...], ...]
    const items = Array.isArray(data?.[1]) ? data[1].slice(0, 20) : [];

    const out = { query: q, items };
    cacheSet(key, out, 60 * 60 * 1000); // 1h

    res.set("Cache-Control", "no-store");
    res.json(out);
  } catch (e) {
    res
      .status(500)
      .json({ error: "seo_suggest_failed", message: String(e?.message || e) });
  }
}

async function keywords(req, res) {
  try {
    const q = String(req.query.q || "").trim();
    const period = String(req.query.period || "30d");
    if (!q) return res.status(400).json({ error: "q_required" });

    const timeframe = timeframeFromPeriod(period);
    const geo = "BR";

    const key = `kw:v1:${q.toLowerCase()}:${period}`;
    const cached = cacheGet(key);
    if (cached) return res.json(cached);

    // 3) Sugestões (Autocomplete) — sempre tenta garantir algo útil
    const sugKey = `suggest:v1:${q.toLowerCase()}`;
    let sug = cacheGet(sugKey);
    if (!sug) {
      const url =
        "https://suggestqueries.google.com/complete/search" +
        `?client=firefox&hl=pt-BR&gl=BR&q=${encodeURIComponent(q)}`;

      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const data = r.ok ? await r.json() : null;
      const items = Array.isArray(data?.[1]) ? data[1].slice(0, 20) : [];
      sug = { query: q, items };
      cacheSet(sugKey, sug, 60 * 60 * 1000); // 1h
    }

    // Trends: best-effort (pode falhar por bloqueio/consent/captcha)
    let trendsOk = true;
    let trendsError = null;

    let related = null;
    try {
      const relatedRaw = await googleTrends.relatedQueries({
        keyword: q,
        geo,
        timeframe,
        hl: "pt-BR",
        timezone: 180, // Brasil (minutos). Se preferir, pode remover.
      });
      related = safeJsonParse("relatedQueries", relatedRaw);
    } catch (e) {
      trendsOk = false;
      trendsError = String(e?.message || e);
    }

    let byRegion = null;
    try {
      const byRegionRaw = await googleTrends.interestByRegion({
        keyword: q,
        geo,
        timeframe,
        resolution: "REGION",
        hl: "pt-BR",
        timezone: 180,
      });
      byRegion = safeJsonParse("interestByRegion", byRegionRaw);
    } catch (e) {
      trendsOk = false;
      trendsError = trendsError || String(e?.message || e);
    }

    const top =
      related?.default?.rankedList?.[0]?.rankedKeyword?.map((x) => ({
        term: x?.query || "",
        score: Number(x?.value || 0),
      })) || [];

    const rising =
      related?.default?.rankedList?.[1]?.rankedKeyword?.map((x) => ({
        term: x?.query || "",
        growthPct:
          x?.value == null
            ? null
            : String(x.value).toLowerCase().includes("breakout")
              ? 9999
              : Number(x.value || 0),
      })) || [];

    const ufItems =
      byRegion?.default?.geoMapData
        ?.map((x) => {
          const name = String(x?.geoName || "").trim();
          const code = String(x?.geoCode || "").trim();
          let uf = null;

          const m = code.match(/BR-([A-Z]{2})$/);
          if (m) uf = m[1];
          if (!uf) uf = UF_MAP.get(norm(name)) || null;

          const val = Array.isArray(x?.value)
            ? Number(x.value[0] || 0)
            : Number(x?.value || 0);

          if (!uf) return null;
          return { uf, interest: clamp(val, 0, 100) };
        })
        .filter(Boolean) || [];

    ufItems.sort((a, b) => b.interest - a.interest);

    const out = {
      query: q,
      period,
      timeframe,
      trends: {
        ok: trendsOk,
        error: trendsOk ? null : trendsError,
      },
      related: {
        top: top.slice(0, 20),
        rising: rising.slice(0, 20),
      },
      suggestions: sug.items,
      byUf: ufItems,
    };

    cacheSet(key, out, 15 * 60 * 1000); // 15min
    res.set("Cache-Control", "no-store");
    res.json(out);
  } catch (e) {
    res
      .status(500)
      .json({ error: "seo_keywords_failed", message: String(e?.message || e) });
  }
}

module.exports = { suggest, keywords };
