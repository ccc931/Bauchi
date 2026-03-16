import type { MetalPriceSnapshot, MetalSymbol } from '../types';

const DEFAULT_METALS: { symbol: MetalSymbol; name: string }[] = [
  { symbol: 'CU', name: 'Copper' },
  { symbol: 'AG', name: 'Silver' },
  { symbol: 'AL', name: 'Aluminum' },
  { symbol: 'ZN', name: 'Zinc' },
  { symbol: 'PB', name: 'Lead' },
  { symbol: 'NI', name: 'Nickel' }
];

export interface FetchMetalPricesOptions {
  metals?: MetalSymbol[];
}

/** 长江有色 API 返回：铜 元/吨，银 元/千克 */
const CCMN_API_PATH = '/api/ccmn-prices';

async function fetchCcmnPrices(): Promise<MetalPriceSnapshot> {
  const fullUrl =
    typeof import.meta.env.VITE_CCMN_API_URL === 'string' &&
    import.meta.env.VITE_CCMN_API_URL.length > 0
      ? import.meta.env.VITE_CCMN_API_URL
      : (() => {
          const base =
            typeof import.meta.env.VITE_CCMN_API_BASE === 'string'
              ? import.meta.env.VITE_CCMN_API_BASE
              : '';
          return `${base}${CCMN_API_PATH}`;
        })();

  // #region agent log
  fetch('http://127.0.0.1:7807/ingest/e62c4c76-cd41-4c95-873a-5b8fdc1fcaa1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'ff78e6'
    },
    body: JSON.stringify({
      sessionId: 'ff78e6',
      runId: 'pre-fix',
      hypothesisId: 'A',
      location: 'src/api/metalPrices.ts:fetchCcmnPrices:url',
      message: 'fetchCcmnPrices request URL',
      data: { fullUrl },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion

  const res = await fetch(fullUrl);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `长江有色接口错误: ${res.status}`
    );
  }
  const data = (await res.json()) as {
    timestamp: string;
    baseCurrency: string;
    copperPerTonRmb: number;
    silverPerKgRmb: number;
  };

  // #region agent log
  fetch('http://127.0.0.1:7807/ingest/e62c4c76-cd41-4c95-873a-5b8fdc1fcaa1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': 'ff78e6'
    },
    body: JSON.stringify({
      sessionId: 'ff78e6',
      runId: 'pre-fix',
      hypothesisId: 'B',
      location: 'src/api/metalPrices.ts:fetchCcmnPrices:response',
      message: 'fetchCcmnPrices raw response',
      data: {
        timestamp: data.timestamp,
        baseCurrency: data.baseCurrency,
        copperPerTonRmb: data.copperPerTonRmb,
        silverPerKgRmb: data.silverPerKgRmb
      },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion

  const metals: { symbol: MetalSymbol; name: string; currency: string; pricePerTon: number }[] = [];
  if (data.copperPerTonRmb != null) {
    metals.push({
      symbol: 'CU',
      name: 'Copper',
      currency: data.baseCurrency ?? 'CNY',
      pricePerTon: data.copperPerTonRmb
    });
  }
  if (data.silverPerKgRmb != null) {
    metals.push({
      symbol: 'AG',
      name: 'Silver',
      currency: data.baseCurrency ?? 'CNY',
      pricePerTon: data.silverPerKgRmb * 1000
    });
  }
  return {
    timestamp: data.timestamp ?? new Date().toISOString(),
    baseCurrency: data.baseCurrency ?? 'CNY',
    metals
  };
}

/**
 * 封装金属价格：
 * - 默认：长江有色金属网（VITE_PRICE_SOURCE=ccmn 或未设置）
 * - MetalpriceAPI：VITE_PRICE_SOURCE=metalpriceapi（需配置 VITE_METALPRICE_API_KEY 等）
 * - 兼容旧的 metals-api：VITE_PRICE_SOURCE=metals-api（需配置 VITE_METALS_API_KEY）
 */
export async function fetchMetalPrices(
  options?: FetchMetalPricesOptions
): Promise<MetalPriceSnapshot> {
  // 默认改为 MetalpriceAPI，只有显式配置为 ccmn 时才走长江有色
  const source = import.meta.env.VITE_PRICE_SOURCE ?? 'metalpriceapi';

  if (source === 'ccmn') {
    try {
      const snapshot = await fetchCcmnPrices();
      const want = options?.metals ?? ['CU', 'AG'];
      const filtered = snapshot.metals.filter((m) => want.includes(m.symbol));
      return { ...snapshot, metals: filtered };
    } catch (e) {
      console.warn('长江有色价格获取失败，使用模拟数据', e);
      return getMockSnapshot();
    }
  }

  if (source === 'metalpriceapi') {
    const apiUrl =
      import.meta.env.VITE_METALPRICE_API_URL ??
      'https://api.metalpriceapi.com/v1/latest';
    const apiKey = import.meta.env.VITE_METALPRICE_API_KEY;
    const cuKey =
      import.meta.env.VITE_METALPRICE_SYMBOL_CU ?? 'XCU';
    const agKey =
      import.meta.env.VITE_METALPRICE_SYMBOL_AG ?? 'XAG';

    if (!apiKey) {
      return getMockSnapshot();
    }

    const url = new URL(apiUrl);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('base', 'CNY');
    url.searchParams.set('currencies', [cuKey, agKey].join(','));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`MetalpriceAPI 获取价格失败: ${res.status} ${res.statusText}`);
    }

    const data: {
      time?: number;
      base?: string;
      rates: Record<string, number>;
    } = await res.json();

    const metals: MetalPriceSnapshot['metals'] = [];
    const baseCurrency = data.base ?? 'CNY';

    if (Number.isFinite(data.rates[cuKey])) {
      metals.push({
        symbol: 'CU',
        name: 'Copper',
        currency: baseCurrency,
        // 假设 API 直接返回每吨价格（单位如不同，可在这里做换算）
        pricePerTon: data.rates[cuKey]
      });
    }
    if (Number.isFinite(data.rates[agKey])) {
      metals.push({
        symbol: 'AG',
        name: 'Silver',
        currency: baseCurrency,
        pricePerTon: data.rates[agKey]
      });
    }

    return {
      timestamp:
        typeof data.time === 'number'
          ? new Date(data.time * 1000).toISOString()
          : new Date().toISOString(),
      baseCurrency,
      metals
    };
  }

  const apiUrl =
    import.meta.env.VITE_METALS_API_URL ?? 'https://metals-api.com/api/latest';
  const apiKey = import.meta.env.VITE_METALS_API_KEY;
  const symbols =
    options?.metals?.join(',') ?? DEFAULT_METALS.map((m) => m.symbol).join(',');

  if (!apiKey) {
    return getMockSnapshot();
  }

  const url = new URL(apiUrl);
  url.searchParams.set('access_key', apiKey);
  url.searchParams.set('base', 'USD');
  url.searchParams.set('symbols', symbols);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`获取金属价格失败: ${res.status} ${res.statusText}`);
  }

  const data: {
    timestamp: number;
    base: string;
    rates: Record<string, number>;
  } = await res.json();

  const metals = DEFAULT_METALS.filter((m) =>
    (options?.metals ?? DEFAULT_METALS.map((d) => d.symbol)).includes(m.symbol)
  ).map((m) => ({
    symbol: m.symbol,
    name: m.name,
    currency: data.base ?? 'USD',
    pricePerTon: data.rates[m.symbol]
  }));

  return {
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    baseCurrency: data.base ?? 'USD',
    metals
  };
}

function getMockSnapshot(): MetalPriceSnapshot {
  const now = new Date().toISOString();
  const base: Record<MetalSymbol, number> = {
    CU: 9000,
    AG: 700_000,
    AL: 2400,
    ZN: 2600,
    PB: 2200,
    NI: 18000
  };
  return {
    timestamp: now,
    baseCurrency: 'USD',
    metals: DEFAULT_METALS.map((m) => ({
      symbol: m.symbol,
      name: m.name,
      currency: 'USD',
      pricePerTon: base[m.symbol]
    }))
  };
}

