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

  const metals: {
    symbol: MetalSymbol;
    name: string;
    currency: string;
    pricePerTon: number;
  }[] = [];

  if (data.copperPerTonRmb != null) {
    metals.push({
      symbol: 'CU',
      name: 'Copper',
      currency: data.baseCurrency ?? 'CNY',
      pricePerTon: data.copperPerTonRmb,
    });
  }
  if (data.silverPerKgRmb != null) {
    metals.push({
      symbol: 'AG',
      name: 'Silver',
      currency: data.baseCurrency ?? 'CNY',
      pricePerTon: data.silverPerKgRmb * 1000,
    });
  }

  return {
    timestamp: data.timestamp ?? new Date().toISOString(),
    baseCurrency: data.baseCurrency ?? 'CNY',
    metals,
  };
}

/**
 * 封装金属价格：统一改回使用长江有色金属网。
 * 如果接口失败，则退回到内置模拟价格。
 */
export async function fetchMetalPrices(
  options?: FetchMetalPricesOptions
): Promise<MetalPriceSnapshot> {
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

