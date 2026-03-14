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
 * 封装金属价格 API 调用。
 *
 * 默认对接 metals-api.com 的 latest 接口，你可以在 .env 中配置：
 * - VITE_METALS_API_URL
 * - VITE_METALS_API_KEY
 *
 * 也可以根据自己采购的数据源调整解析逻辑。
 */
export async function fetchMetalPrices(
  options?: FetchMetalPricesOptions
): Promise<MetalPriceSnapshot> {
  const apiUrl =
    import.meta.env.VITE_METALS_API_URL ?? 'https://metals-api.com/api/latest';
  const apiKey = import.meta.env.VITE_METALS_API_KEY;

  const symbols =
    options?.metals?.join(',') ?? DEFAULT_METALS.map((m) => m.symbol).join(',');

  if (!apiKey) {
    // 没有配置真实 API Key 时，返回模拟数据，方便本地开发和前端调试
    const now = new Date().toISOString();
    return {
      timestamp: now,
      baseCurrency: 'USD',
      metals: DEFAULT_METALS.map((m) => {
        const base: Record<MetalSymbol, number> = {
          CU: 9000,
          AG: 700000, // 约 22 USD/oz 对应吨位价格，仅作量级示意
          AL: 2400,
          ZN: 2600,
          PB: 2200,
          NI: 18000
        };
        return {
          symbol: m.symbol,
          name: m.name,
          currency: 'USD',
          pricePerTon: base[m.symbol]
        };
      })
    };
  }

  const url = new URL(apiUrl);
  url.searchParams.set('access_key', apiKey);
  url.searchParams.set('base', 'USD');
  url.searchParams.set('symbols', symbols);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`获取金属价格失败: ${res.status} ${res.statusText}`);
  }

  // metals-api.com 返回结构示例：
  // { timestamp: 1700000000, base: "USD", rates: { CU: 9000, AL: 2400, ... } }
  const data: {
    timestamp: number;
    base: string;
    rates: Record<string, number>;
  } = await res.json();

  const metals = DEFAULT_METALS.filter((m) =>
    (options?.metals ?? DEFAULT_METALS.map((d) => d.symbol)).includes(
      m.symbol
    )
  ).map((m) => {
    const key = m.symbol;
    const price = data.rates[key];
    return {
      symbol: m.symbol,
      name: m.name,
      currency: data.base ?? 'USD',
      pricePerTon: price
    };
  });

  return {
    timestamp: new Date(data.timestamp * 1000).toISOString(),
    baseCurrency: data.base ?? 'USD',
    metals
  };
}

