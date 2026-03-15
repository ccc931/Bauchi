/**
 * 腾讯云 SCF 云函数：从长江有色金属网抓取 1#铜、1#白银 均价。
 * 用于国内部署时提供 /api/ccmn-prices 接口。
 *
 * 部署：将本目录打成 zip，在 SCF 控制台创建函数（Node 16 或 18），上传 zip，
 * 入口填 index.main_handler，再绑定 API 网关触发器，路径设为 /api/ccmn-prices。
 */

const https = require('https');

const CCMN_INDEX_URL = 'https://www.ccmn.cn/index_table/';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BauchiProfit/1.0)' } },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('请求超时'));
    });
  });
}

function parsePricesFromHtml(html) {
  let copperPerTonRmb = null;
  let silverPerKgRmb = null;
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

function jsonResponse(statusCode, data) {
  return {
    isBase64Encoded: false,
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify(data),
  };
}

exports.main_handler = async () => {
  try {
    const html = await fetchUrl(CCMN_INDEX_URL);
    const { copperPerTonRmb, silverPerKgRmb } = parsePricesFromHtml(html);

    if (copperPerTonRmb == null && silverPerKgRmb == null) {
      throw new Error('未能从页面解析出铜或白银价格');
    }

    return jsonResponse(200, {
      timestamp: new Date().toISOString(),
      baseCurrency: 'CNY',
      copperPerTonRmb: copperPerTonRmb ?? 0,
      silverPerKgRmb: silverPerKgRmb ?? 0,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '获取长江有色价格失败';
    return jsonResponse(500, { error: message });
  }
};
