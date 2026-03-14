export type MetalSymbol = 'CU' | 'AG' | 'AL' | 'ZN' | 'PB' | 'NI';

export interface MetalPrice {
  symbol: MetalSymbol;
  name: string;
  currency: string;
  pricePerTon: number; // USD / metric ton
}

export interface MetalPriceSnapshot {
  timestamp: string;
  baseCurrency: string;
  metals: MetalPrice[];
}

