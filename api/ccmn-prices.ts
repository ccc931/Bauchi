/**
 * Vercel Serverless：从长江有色金属网 index_table 页抓取 1#铜、1#白银 均价，
 * 供前端自动模式使用。铜：元/吨；银：元/千克（前端会换算为元/吨、元/克）。
 */

const CCMN_INDEX_URL = 'https://www.ccmn.cn/index_table/';

// 表格列：品名 | 价格区间 | 均价 | 涨跌 | 单位。优先取「长江现货」表格中的数据
function parsePricesFromHtml(html: string): {
  copperPerTonRmb: number | null;
  silverPerKgRmb: number | null;
} {
  let copperPerTonRmb: number | null = null;
  let silverPerKgRmb: number | null = null;
  const xianhuoBlock = html.match(/长江现货[\s\S]*?(?=长江综合|历史价格|$)/i);
  const block = (xianhuoBlock && xianhuoBlock[0]) ? xianhuoBlock[0] : html;

  let copperMatch = block.match(/1#铜[\s\S]*?\d{5,6}-\d{5,6}[\s\S]*?(\d{5,6})[\s\S]*?元\/吨/);
  if (copperMatch) copperPerTonRmb = Number(copperMatch[1]);
  if (copperPerTonRmb == null || !Number.isFinite(copperPerTonRmb)) {
    copperMatch = html.match(/1#铜[\s\S]*?\d{5,6}-\d{5,6}[\s\S]*?(\d{5,6})[\s\S]*?元\/吨/);
    if (copperMatch) copperPerTonRmb = Number(copperMatch[1]);
  }
  if (copperPerTonRmb == null || !Number.isFinite(copperPerTonRmb)) {
    copperMatch = html.match(/<td[^>]*>1#铜<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>(\d+)/);
    if (copperMatch) copperPerTonRmb = Number(copperMatch[1]);
  }

  let silverMatch = block.match(/1#白银[\s\S]*?\d{4,5}-\d{4,5}[\s\S]*?(\d{4,5})[\s\S]*?元\/千克/);
  if (silverMatch) silverPerKgRmb = Number(silverMatch[1]);
  if (silverPerKgRmb == null || !Number.isFinite(silverPerKgRmb)) {
    silverMatch = html.match(/1#白银[\s\S]*?\d{4,5}-\d{4,5}[\s\S]*?(\d{4,5})[\s\S]*?元\/千克/);
    if (silverMatch) silverPerKgRmb = Number(silverMatch[1]);
  }
  if (silverPerKgRmb == null || !Number.isFinite(silverPerKgRmb)) {
    silverMatch = html.match(/<td[^>]*>1#白银<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>(\d+)/);
    if (silverMatch) silverPerKgRmb = Number(silverMatch[1]);
  }

  return {
    copperPerTonRmb: Number.isFinite(copperPerTonRmb) ? copperPerTonRmb : null,
    silverPerKgRmb: Number.isFinite(silverPerKgRmb) ? silverPerKgRmb : null,
  };
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
