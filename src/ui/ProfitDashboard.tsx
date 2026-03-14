import React, { useEffect, useMemo, useState } from 'react';
import { fetchMetalPrices } from '../api/metalPrices';
import type { MetalPriceSnapshot } from '../types';

interface MineInput {
  totalCostPerTonOre: string;
  copperGradePercent: string;
  silverGradePercent: string;
  recoveryPercent: string;
  annualTonnage10k: string; // 年开采量，单位：万吨
}

type PriceMode = 'auto' | 'manual';

const defaultInput: MineInput = {
  totalCostPerTonOre: '1485',
  copperGradePercent: '2.5',
  silverGradePercent: '0.008',
  recoveryPercent: '85',
  annualTonnage10k: '50'
};

function safeParseNumber(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const ProfitDashboard: React.FC = () => {
  const [inputs, setInputs] = useState<MineInput>(defaultInput);
  const [snapshot, setSnapshot] = useState<MetalPriceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceMode, setPriceMode] = useState<PriceMode>('auto');
  const [manualCopperPrice, setManualCopperPrice] = useState<number>(9000);
  const [manualSilverPricePerGram, setManualSilverPricePerGram] =
    useState<number>(5); // 元/克，默认约 5 元/g

  const copperPrice = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.metals.find((m) => m.symbol === 'CU') ?? null;
  }, [snapshot]);

  const silverPrice = useMemo(() => {
    if (!snapshot) return null;
    return snapshot.metals.find((m) => m.symbol === 'AG') ?? null;
  }, [snapshot]);

  const effectiveCopperPricePerTon = useMemo(() => {
    if (priceMode === 'manual') return manualCopperPrice;
    return copperPrice?.pricePerTon ?? 9000;
  }, [priceMode, manualCopperPrice, copperPrice]);

  // 银价内部依然按「元/吨金属」参与计算，但界面使用「元/克」展示与输入
  const effectiveSilverPricePerTon = useMemo(() => {
    if (priceMode === 'manual') return manualSilverPricePerGram * 1_000_000;
    return silverPrice?.pricePerTon ?? 700_000;
  }, [priceMode, manualSilverPricePerGram, silverPrice]);

  const effectiveSilverPricePerGram = useMemo(() => {
    if (priceMode === 'manual') return manualSilverPricePerGram;
    return effectiveSilverPricePerTon / 1_000_000;
  }, [priceMode, manualSilverPricePerGram, effectiveSilverPricePerTon]);

  const result = useMemo(() => {
    const copperPricePerTon = effectiveCopperPricePerTon;
    const silverPricePerTon = effectiveSilverPricePerTon;

    const cuGrade = safeParseNumber(inputs.copperGradePercent, 2.5) / 100;
    const agGrade = safeParseNumber(inputs.silverGradePercent, 0.008) / 100;
    const recovery = safeParseNumber(inputs.recoveryPercent, 85) / 100;

    // 每吨矿石中，可销售铜、银金属吨
    const payableCuTonsPerTonOre = cuGrade * recovery;
    const payableAgTonsPerTonOre = agGrade * recovery;

    // 每吨矿石收入（元/t 矿石）
    const revenuePerTonOreRmb =
      payableCuTonsPerTonOre * copperPricePerTon +
      payableAgTonsPerTonOre * silverPricePerTon;
    const costPerTonOreRmb = safeParseNumber(inputs.totalCostPerTonOre, 1485);
    const profitPerTonOreRmb = revenuePerTonOreRmb - costPerTonOreRmb;

    const annualTonnage10k = safeParseNumber(inputs.annualTonnage10k, 0);
    const annualProfitRmb =
      profitPerTonOreRmb * annualTonnage10k * 10_000;

    return {
      copperPricePerTon,
      silverPricePerTon,
      silverPricePerGram: effectiveSilverPricePerGram,
      revenuePerTonOreRmb,
      costPerTonOreRmb,
      profitPerTonOreRmb,
      annualProfitRmb,
      annualTonnage10k
    };
  }, [inputs, effectiveCopperPricePerTon, effectiveSilverPricePerTon]);

  const loadPrices = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchMetalPrices({ metals: ['CU', 'AG'] });
      setSnapshot(data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '获取金属价格时出现未知错误'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPrices();
    const id = window.setInterval(() => {
      void loadPrices();
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const handleSwitchToAuto = () => {
    setPriceMode('auto');
  };

  const handleSwitchToManual = () => {
    // 切换到手动模式时，如果已经有实时价格，则用作初始值
    if (snapshot) {
      const cu = snapshot.metals.find((m) => m.symbol === 'CU');
      const ag = snapshot.metals.find((m) => m.symbol === 'AG');
      if (cu?.pricePerTon) {
        setManualCopperPrice(cu.pricePerTon);
      }
      if (ag?.pricePerTon) {
        setManualSilverPricePerGram(ag.pricePerTon / 1_000_000);
      }
    }
    setPriceMode('manual');
  };

  return (
    <div className="dashboard-grid">
      <section className="card card-form">
        <h2>矿山参数假设（每吨矿石）</h2>

        <div className="form-grid">
          <div className="form-field">
            <label>
              综合成本 (元/吨 矿石)
              <input
                type="number"
                value={inputs.totalCostPerTonOre}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    totalCostPerTonOre: e.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="form-field">
            <label>
              铜品位 (%)
              <input
                type="number"
                step="0.01"
                value={inputs.copperGradePercent}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    copperGradePercent: e.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="form-field">
            <label>
              银品位 (%)
              <input
                type="number"
                step="0.0001"
                value={inputs.silverGradePercent}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    silverGradePercent: e.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="form-field">
            <label>
              综合回收率 (%)
              <input
                type="number"
                step="0.1"
                value={inputs.recoveryPercent}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    recoveryPercent: e.target.value
                  }))
                }
              />
            </label>
          </div>

          <div className="form-field">
            <label>
              年开采量 (万吨/年)
              <input
                type="number"
                step="0.1"
                value={inputs.annualTonnage10k}
                onChange={(e) =>
                  setInputs((prev) => ({
                    ...prev,
                    annualTonnage10k: e.target.value
                  }))
                }
              />
            </label>
          </div>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={() => void loadPrices()}
          disabled={loading}
        >
          {loading ? '刷新中…' : '立即刷新金属价格'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </section>

      <section className="card card-metrics">
        <h2>实时利润测算（每吨矿石）</h2>
        <p className="card-desc">
          可在顶部切换模式：自动使用国际实时价格，手动模式下自定义铜价和银价。
        </p>

        <div className="mode-toggle">
          <button
            type="button"
            className={
              priceMode === 'auto'
                ? 'mode-toggle-button active'
                : 'mode-toggle-button'
            }
            onClick={handleSwitchToAuto}
          >
            自动模式（实时价格）
          </button>
          <button
            type="button"
            className={
              priceMode === 'manual'
                ? 'mode-toggle-button active'
                : 'mode-toggle-button'
            }
            onClick={handleSwitchToManual}
          >
            手动模式（自定义价格）
          </button>
        </div>

        {priceMode === 'manual' && (
          <div className="manual-price-controls">
            <div className="manual-field">
              <div className="manual-label-row">
                <span>铜价 (元/吨)</span>
              </div>
              <div className="manual-input-row">
                <input
                  type="number"
                  value={manualCopperPrice}
                  onChange={(e) =>
                    setManualCopperPrice(
                      safeParseNumber(e.target.value, manualCopperPrice)
                    )
                  }
                />
                <input
                  type="range"
                  min={50000}
                  max={200000}
                  step={100}
                  value={manualCopperPrice}
                  onChange={(e) =>
                    setManualCopperPrice(
                      safeParseNumber(e.target.value, manualCopperPrice)
                    )
                  }
                />
              </div>
            </div>

            <div className="manual-field">
              <div className="manual-label-row">
                <span>银价 (元/克)</span>
              </div>
              <div className="manual-input-row">
                <input
                  type="number"
                  value={manualSilverPricePerGram}
                  onChange={(e) =>
                    setManualSilverPricePerGram(
                      safeParseNumber(e.target.value, manualSilverPricePerGram)
                    )
                  }
                />
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.1}
                  value={manualSilverPricePerGram}
                  onChange={(e) =>
                    setManualSilverPricePerGram(
                      safeParseNumber(e.target.value, manualSilverPricePerGram)
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}

        <div className="metrics-grid">
          <div className="metric">
            <div className="metric-label">铜价 (元/吨)</div>
            <div className="metric-value">
              {result.copperPricePerTon.toLocaleString('en-US', {
                maximumFractionDigits: 0
              })}
            </div>
            <div className="metric-hint">
              {priceMode === 'auto'
                ? snapshot
                  ? snapshot.baseCurrency === 'CNY'
                    ? `自动模式：长江有色，更新时间 ${new Date(
                        snapshot.timestamp
                      ).toLocaleString('zh-CN')}`
                    : `自动模式：当前为模拟数据（长江有色未响应，请用已部署的网址打开或稍后重试），更新时间 ${new Date(
                        snapshot.timestamp
                      ).toLocaleString('zh-CN')}`
                  : '自动模式：未配置 API Key 时使用模拟价格'
                : '手动模式：由你在上方输入/拖动滑块设定'}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">银价 (元/克)</div>
            <div className="metric-value">
              {result.silverPricePerGram.toLocaleString('en-US', {
                maximumFractionDigits: 2
              })}
            </div>
          </div>

          <div className="metric metric-highlight">
            <div className="metric-label">每吨矿石利润 (元/吨)</div>
            <div
              className={
                result.profitPerTonOreRmb >= 0
                  ? 'metric-value positive'
                  : 'metric-value negative'
              }
            >
              {result.profitPerTonOreRmb.toLocaleString('en-US', {
                maximumFractionDigits: 0
              })}
            </div>
            <div className="metric-hint">
              收入约{' '}
              {result.revenuePerTonOreRmb.toLocaleString('en-US', {
                maximumFractionDigits: 0
              })}{' '}
              元/t，成本 {result.costPerTonOreRmb.toLocaleString('en-US', {
                maximumFractionDigits: 0
              })}{' '}
              元/t
            </div>
          </div>

          <div className="metric metric-highlight">
            <div className="metric-label">年利润 (元/年)</div>
            <div
              className={
                result.annualProfitRmb >= 0
                  ? 'metric-value positive'
                  : 'metric-value negative'
              }
            >
              {result.annualProfitRmb.toLocaleString('en-US', {
                maximumFractionDigits: 0
              })}
            </div>
            <div className="metric-hint">
              按年开采量约 {result.annualTonnage10k.toLocaleString('en-US', {
                maximumFractionDigits: 1
              })}{' '}
              万吨计算
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};


