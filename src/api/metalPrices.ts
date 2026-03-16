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

/**
 * 封装金属价格（统一改为使用 MetalpriceAPI）。
 * - 通过 VITE_METALPRICE_API_KEY、VITE_METALPRICE_SYMBOL_CU、VITE_METALPRICE_SYMBOL_AG 进行配置
 * - 如请求失败或未配置 Key，则回退到内置模拟价格
 */
export async function fetchMetalPrices(
  options?: FetchMetalPricesOptions
): Promise<MetalPriceSnapshot> {
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
    console.warn('MetalpriceAPI 请求失败，使用模拟数据', res.status, res.statusText);
    return getMockSnapshot();
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
      // 这里直接按照 MetalpriceAPI 返回的数值当作「元/吨」
      // 如果你之后确认单位不同，我们只需要在这里做一次换算即可。
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

  // 如果 API 里没有返回铜 / 银，就退回模拟数据，避免前端空数据
  if (metals.length === 0) {
    return getMockSnapshot();
  }

  return {
    timestamp:
      typeof data.time === 'number'
        ? new Date(data.time * 1000).toISOString()
        : new Date().toISOString(),
    baseCurrency,
    metals: (options?.metals ?? ['CU', 'AG']).map((symbol) => {
      const found = metals.find((m) => m.symbol === symbol);
      return (
        found ?? {
          symbol,
          name: DEFAULT_METALS.find((m) => m.symbol === symbol)?.name ?? symbol,
          currency: baseCurrency,
          pricePerTon: 0
        }
      );
    })
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

