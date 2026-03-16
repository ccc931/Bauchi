/**
 * Vercel Serverless：从长江有色金属网 index_table 页抓取 1#铜、1#白银 均价，
 * 供前端自动模式使用。铜：元/吨；银：元/千克（前端会换算为元/吨、元/克）。
 */

const CCMN_INDEX_URL = 'https://www.ccmn.cn/index_table/';

// 表格列：品名 | 价格区间 | 均价 | 涨跌 | 单位。
// index_table 页面上，「长江综合」表格在前，「长江现货」表格在后，
// 所以整页 HTML 里第一个出现的 1#铜 / 1#白银 就是长江综合里的那一行。
function parsePricesFromHtml(html: string): {
  copperPerTonRmb: number | null;
  silverPerKgRmb: number | null;
} {
  let copperPerTonRmb: number | null = null;
  let silverPerKgRmb: number | null = null;
  const firstCopperMatch =
    html.match(/1#铜[\s\S]*?\d{5,6}-\d{5,6}[\s\S]*?(\d{5,6})[\s\S]*?元\/吨/) ??
    html.match(/<td[^>]*>1#铜<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>(\d+)/);
  if (firstCopperMatch) {
    const v = Number(firstCopperMatch[1]);
    if (Number.isFinite(v)) copperPerTonRmb = v;
  }

  const firstSilverMatch =
    html.match(/1#白银[\s\S]*?\d{4,5}-\d{4,5}[\s\S]*?(\d{4,5})[\s\S]*?元\/千克/) ??
    html.match(/<td[^>]*>1#白银<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>(\d+)/);
  if (firstSilverMatch) {
    const v = Number(firstSilverMatch[1]);
    if (Number.isFinite(v)) silverPerKgRmb = v;
  }

  const result = {
    copperPerTonRmb: Number.isFinite(copperPerTonRmb) ? copperPerTonRmb : null,
    silverPerKgRmb: Number.isFinite(silverPerKgRmb) ? silverPerKgRmb : null,
  };

  // #region agent log
  fetch('http://127.0.0.1:7807/ingest/e62c4c76-cd41-4c95-873a-5b8fdc1fcaa1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'ff78e6',
    },
    body: JSON.stringify({
      sessionId: 'ff78e6',
      runId: 'pre-fix',
      hypothesisId: 'Vercel-parse',
      location: 'api/ccmn-prices.ts:parsePricesFromHtml',
      message: 'Parsed prices from CCMN HTML (Vercel)',
      data: result,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return result;
}

export default async function handler(req: unknown, res: unknown) {
  const r = res as {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { json: (o: object) => void };
    json: (o: object) => void;
  };
  r.setHeader('Access-Control-Allow-Origin', '*');
  r.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

  try {
    const response = await fetch(CCMN_INDEX_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; BauchiProfit/1.0; +https://github.com/ccc931/Bauchi)',
      },
    });
    if (!response.ok) {
      throw new Error(`长江有色页面请求失败: ${response.status}`);
    }
    const html = await response.text();
    const { copperPerTonRmb, silverPerKgRmb } = parsePricesFromHtml(html);

    // #region agent log
    fetch('http://127.0.0.1:7807/ingest/e62c4c76-cd41-4c95-873a-5b8fdc1fcaa1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'ff78e6',
      },
      body: JSON.stringify({
        sessionId: 'ff78e6',
        runId: 'pre-fix',
        hypothesisId: 'Vercel-handler',
        location: 'api/ccmn-prices.ts:handler',
        message: 'Handler parsed prices result (Vercel)',
        data: { copperPerTonRmb, silverPerKgRmb },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    if (copperPerTonRmb == null && silverPerKgRmb == null) {
      throw new Error('未能从页面解析出铜或白银价格');
    }

    r.status(200).json({
      timestamp: new Date().toISOString(),
      baseCurrency: 'CNY',
      copperPerTonRmb: copperPerTonRmb ?? 0,
      silverPerKgRmb: silverPerKgRmb ?? 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '获取长江有色价格失败';
    r.status(500).json({ error: message });
  }
}
