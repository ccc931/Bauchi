/**
 * Cloudflare Pages Function：从长江有色金属网抓取 1#铜、1#白银 均价，
 * 供前端自动模式使用。铜：元/吨；银：元/千克。
 */

const CCMN_INDEX_URL = 'https://www.ccmn.cn/index_table/';

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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
};

export async function onRequestGet(): Promise<Response> {
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

    return new Response(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        baseCurrency: 'CNY',
        copperPerTonRmb: copperPerTonRmb ?? 0,
        silverPerKgRmb: silverPerKgRmb ?? 0,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : '获取长江有色价格失败';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
}
