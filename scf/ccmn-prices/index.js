/**
 * 腾讯云 SCF 云函数：从长江有色金属网抓取 1#铜、1#白银 均价。
 * 用于国内部署时提供 /api/ccmn-prices 接口。
 *
 * 部署：将本目录打成 zip，在 SCF 控制台创建函数（Node 16 或 18），上传 zip，
 * 入口填 index.main_handler，再绑定 API 网关触发器，路径设为 /api/ccmn-prices。
 */

const https = require('https');
const fs = require('fs');

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

  // 优先锁定「长江综合」这一块，避免抓到其它表格的数据
  const cjzhBlockMatch = html.match(/长江综合[\s\S]*?(?=长江现货|历史价格|$)/i);
  const block = cjzhBlockMatch && cjzhBlockMatch[0] ? cjzhBlockMatch[0] : html;

  // 1#铜：匹配所有出现的行，取最后一条（通常是当天均价）
  const copperMatches = Array.from(
    block.matchAll(
      /1#铜[\s\S]*?\d{5,6}-\d{5,6}[\s\S]*?(\d{5,6})[\s\S]*?元\/吨/g
    )
  );
  if (copperMatches.length > 0) {
    copperPerTonRmb = Number(copperMatches[copperMatches.length - 1][1]);
  }
  if (copperPerTonRmb == null || !Number.isFinite(copperPerTonRmb)) {
    const fallbackCopperMatches = Array.from(
      html.matchAll(
        /1#铜[\s\S]*?\d{5,6}-\d{5,6}[\s\S]*?(\d{5,6})[\s\S]*?元\/吨/g
      )
    );
    if (fallbackCopperMatches.length > 0) {
      copperPerTonRmb = Number(
        fallbackCopperMatches[fallbackCopperMatches.length - 1][1]
      );
    }
  }
  if (copperPerTonRmb == null || !Number.isFinite(copperPerTonRmb)) {
    const simpleCopperMatches = Array.from(
      html.matchAll(
        /<td[^>]*>1#铜<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>(\d+)/g
      )
    );
    if (simpleCopperMatches.length > 0) {
      copperPerTonRmb = Number(
        simpleCopperMatches[simpleCopperMatches.length - 1][1]
      );
    }
  }

  // 1#白银：同样逻辑，取「长江综合」块中的最后一条
  const silverMatches = Array.from(
    block.matchAll(
      /1#白银[\s\S]*?\d{4,5}-\d{4,5}[\s\S]*?(\d{4,5})[\s\S]*?元\/千克/g
    )
  );
  if (silverMatches.length > 0) {
    silverPerKgRmb = Number(silverMatches[silverMatches.length - 1][1]);
  }
  if (silverPerKgRmb == null || !Number.isFinite(silverPerKgRmb)) {
    const fallbackSilverMatches = Array.from(
      html.matchAll(
        /1#白银[\s\S]*?\d{4,5}-\d{4,5}[\s\S]*?(\d{4,5})[\s\S]*?元\/千克/g
      )
    );
    if (fallbackSilverMatches.length > 0) {
      silverPerKgRmb = Number(
        fallbackSilverMatches[fallbackSilverMatches.length - 1][1]
      );
    }
  }
  if (silverPerKgRmb == null || !Number.isFinite(silverPerKgRmb)) {
    const simpleSilverMatches = Array.from(
      html.matchAll(
        /<td[^>]*>1#白银<\/td>\s*<td[^>]*>[^<]*<\/td>\s*<td[^>]*>(\d+)/g
      )
    );
    if (simpleSilverMatches.length > 0) {
      silverPerKgRmb = Number(
        simpleSilverMatches[simpleSilverMatches.length - 1][1]
      );
    }
  }

  const result = {
    copperPerTonRmb: Number.isFinite(copperPerTonRmb) ? copperPerTonRmb : null,
    silverPerKgRmb: Number.isFinite(silverPerKgRmb) ? silverPerKgRmb : null,
  };

  // #region agent log
  try {
    const logLine = JSON.stringify({
      sessionId: 'ff78e6',
      runId: 'pre-fix',
      hypothesisId: 'SCF-parse',
      location: 'scf/ccmn-prices/index.js:parsePricesFromHtml',
      message: 'Parsed prices from CCMN HTML',
      data: result,
      timestamp: Date.now(),
    });
    fs.appendFileSync(
      '/Users/liudingcheng/Desktop/实时计算利润平台/.cursor/debug-ff78e6.log',
      `${logLine}\n`,
      { encoding: 'utf8' }
    );
  } catch (_) {
    // ignore logging errors locally / in SCF
  }
  // #endregion

  return result;
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

    // #region agent log
    try {
      const logLine = JSON.stringify({
        sessionId: 'ff78e6',
        runId: 'pre-fix',
        hypothesisId: 'SCF-error',
        location: 'scf/ccmn-prices/index.js:main_handler',
        message: 'Error in main_handler',
        data: { errorMessage: message },
        timestamp: Date.now(),
      });
      fs.appendFileSync(
        '/Users/liudingcheng/Desktop/实时计算利润平台/.cursor/debug-ff78e6.log',
        `${logLine}\n`,
        { encoding: 'utf8' }
      );
    } catch (_) {
      // ignore logging errors
    }
    // #endregion

    return jsonResponse(500, { error: message });
  }
};

// Allow running locally for debugging
if (require.main === module) {
  exports
    .main_handler()
    .then((res) => {
      // #region agent log
      try {
        const logLine = JSON.stringify({
          sessionId: 'ff78e6',
          runId: 'pre-fix',
          hypothesisId: 'SCF-main',
          location: 'scf/ccmn-prices/index.js:cli',
          message: 'main_handler local run result',
          data: { statusCode: res.statusCode, body: res.body },
          timestamp: Date.now(),
        });
        fs.appendFileSync(
          '/Users/liudingcheng/Desktop/实时计算利润平台/.cursor/debug-ff78e6.log',
          `${logLine}\n`,
          { encoding: 'utf8' }
        );
      } catch (_) {
        // ignore logging errors
      }
      // #endregion
      process.stdout.write(`${res.statusCode}\n${res.body}\n`);
    })
    .catch((err) => {
      // #region agent log
      try {
        const logLine = JSON.stringify({
          sessionId: 'ff78e6',
          runId: 'pre-fix',
          hypothesisId: 'SCF-main-error',
          location: 'scf/ccmn-prices/index.js:cli-catch',
          message: 'Error running main_handler locally',
          data: { errorMessage: String(err && err.message ? err.message : err) },
          timestamp: Date.now(),
        });
        fs.appendFileSync(
          '/Users/liudingcheng/Desktop/实时计算利润平台/.cursor/debug-ff78e6.log',
          `${logLine}\n`,
          { encoding: 'utf8' }
        );
      } catch (_) {
        // ignore logging errors
      }
      // #endregion
      process.stderr.write(String(err));
      process.exit(1);
    });
}
