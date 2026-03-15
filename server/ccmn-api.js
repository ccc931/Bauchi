/**
 * 本地开发用：提供 /api/ccmn-prices，从长江有色抓取铜、白银价格。
 * 运行：npm run dev:server（或直接 npm run dev 会同时启动本服务 + 前端）
 */
import http from 'node:http';

const CCMN_INDEX_URL = 'https://www.ccmn.cn/index_table/';
const PORT = 3001;

// 表格列顺序：品名 | 价格区间 | 均价 | 涨跌 | 单位。优先取「长江现货」表格中的数据（与官网「长江现货」tab 一致）
function parsePricesFromHtml(html) {
  let copperPerTonRmb = null;
  let silverPerKgRmb = null;
  // 优先：长江现货 区块内的 1#铜、1#白银 均价（与你在网页上点的「长江现货」一致）
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

async function fetchPrices() {
  const response = await fetch(CCMN_INDEX_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`长江有色页面请求失败: ${response.status}`);
  const html = await response.text();
  const { copperPerTonRmb, silverPerKgRmb } = parsePricesFromHtml(html);
  if (copperPerTonRmb == null && silverPerKgRmb == null) {
    console.error('[ccmn-api] 解析失败，页面长度:', html.length, '前500字符:', html.slice(0, 500));
    throw new Error('未能从页面解析出铜或白银价格');
  }
  return {
    timestamp: new Date().toISOString(),
    baseCurrency: 'CNY',
    copperPerTonRmb: copperPerTonRmb ?? 0,
    silverPerKgRmb: silverPerKgRmb ?? 0,
  };
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/api/ccmn-prices' && req.method === 'GET') {
    try {
      const data = await fetchPrices();
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify(data));
    } catch (e) {
      const message = e instanceof Error ? e.message : '获取长江有色价格失败';
      console.error('[ccmn-api]', message, e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`[本地价格接口] http://localhost:${PORT}/api/ccmn-prices`);
});
