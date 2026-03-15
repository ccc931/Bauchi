import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
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
    useState<number>(5);
  const [manualCopperInputDisplay, setManualCopperInputDisplay] = useState<string>('9000');
  const [manualSilverInputDisplay, setManualSilverInputDisplay] = useState<string>('5');
  const [hasUserEditedManualPrices, setHasUserEditedManualPrices] = useState(false);
  const [tableRows, setTableRows] = useState<Array<{
    id: string;
    source: 'auto' | 'manual';
    copperPrice: number;
    silverPricePerGram: number;
    profitPerTon: number;
    annualProfit: number;
    costPerTon: number;
    copperGrade: number;
    silverGrade: number;
    recovery: number;
    annualTonnage10k: number;
  }>>([]);

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
    // 仅当用户从未改过手动价格时，用自动模式价格填充；改过后再切回手动保留用户设置
    if (!hasUserEditedManualPrices && snapshot) {
      const cu = snapshot.metals.find((m) => m.symbol === 'CU');
      const ag = snapshot.metals.find((m) => m.symbol === 'AG');
      if (cu?.pricePerTon) {
        setManualCopperPrice(cu.pricePerTon);
        setManualCopperInputDisplay(String(cu.pricePerTon));
      }
      if (ag?.pricePerTon) {
        const agGram = ag.pricePerTon / 1_000_000;
        setManualSilverPricePerGram(agGram);
        setManualSilverInputDisplay(String(agGram));
      }
    } else {
      setManualCopperInputDisplay(String(manualCopperPrice));
      setManualSilverInputDisplay(String(manualSilverPricePerGram));
    }
    setPriceMode('manual');
  };

  const addCurrentToTable = (source: 'auto' | 'manual') => {
    const cu = source === 'auto' ? (copperPrice?.pricePerTon ?? 9000) : manualCopperPrice;
    const agPerGram = source === 'auto'
      ? (effectiveSilverPricePerTon / 1_000_000)
      : manualSilverPricePerGram;
    const cuGrade = safeParseNumber(inputs.copperGradePercent, 2.5) / 100;
    const agGrade = safeParseNumber(inputs.silverGradePercent, 0.008) / 100;
    const recovery = safeParseNumber(inputs.recoveryPercent, 85) / 100;
    const costPerTon = safeParseNumber(inputs.totalCostPerTonOre, 1485);
    const annual10k = safeParseNumber(inputs.annualTonnage10k, 0);
    const revenue = (cuGrade * recovery * cu) + (agGrade * recovery * agPerGram * 1_000_000);
    const profitPerTon = revenue - costPerTon;
    const annualProfit = profitPerTon * annual10k * 10_000;
    setTableRows((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        source,
        copperPrice: cu,
        silverPricePerGram: agPerGram,
        profitPerTon,
        annualProfit,
        costPerTon,
        copperGrade: safeParseNumber(inputs.copperGradePercent, 2.5),
        silverGrade: safeParseNumber(inputs.silverGradePercent, 0.008),
        recovery: safeParseNumber(inputs.recoveryPercent, 85),
        annualTonnage10k: annual10k
      }
    ]);
  };

  const exportTableToExcel = () => {
    const headers = [
      '序号', '铜价 (元/吨)', '银价 (元/克)', '每吨利润 (元/吨)', '年利润 (元/年)',
      '综合成本 (元/吨)', '铜品位 (%)', '银品位 (%)', '回收率 (%)', '年开采量 (万吨)', '数据来源'
    ];
    const data = tableRows.map((row, index) => [
      index + 1,
      row.copperPrice,
      row.silverPricePerGram,
      row.profitPerTon,
      row.annualProfit,
      row.costPerTon,
      row.copperGrade,
      row.silverGrade,
      row.recovery,
      row.annualTonnage10k,
      row.source === 'auto' ? '自动' : '手动'
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '利润测算表');
    XLSX.writeFile(wb, `利润测算表_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <>
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
          自动 / 手动切换价格来源；点击「将当前数据加入表格」可把当前数据加入下方表格并导出。
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

        <div className="add-to-table-row">
            <button
              type="button"
              className="primary-button primary-button-small"
              onClick={() => addCurrentToTable(priceMode)}
            >
              将当前数据加入表格
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
                  type="text"
                  inputMode="numeric"
                  value={manualCopperInputDisplay}
                  onChange={(e) => {
                    setHasUserEditedManualPrices(true);
                    const v = e.target.value;
                    setManualCopperInputDisplay(v);
                    const n = Number(v.replace(/,/g, ''));
                    if (v === '' || v === '-') return;
                    if (Number.isFinite(n) && n >= 0) setManualCopperPrice(n);
                  }}
                  onBlur={() => {
                    const v = manualCopperInputDisplay.trim();
                    if (v === '') {
                      setManualCopperPrice(0);
                      setManualCopperInputDisplay('');
                    } else {
                      const n = Number(v.replace(/,/g, ''));
                      if (Number.isFinite(n) && n >= 0) {
                        setManualCopperPrice(n);
                        setManualCopperInputDisplay(String(n));
                      }
                    }
                  }}
                />
                <input
                  type="range"
                  min={50000}
                  max={200000}
                  step={100}
                  value={manualCopperPrice}
                  onChange={(e) => {
                    setHasUserEditedManualPrices(true);
                    const n = safeParseNumber(e.target.value, manualCopperPrice);
                    setManualCopperPrice(n);
                    setManualCopperInputDisplay(String(n));
                  }}
                />
              </div>
            </div>

            <div className="manual-field">
              <div className="manual-label-row">
                <span>银价 (元/克)</span>
              </div>
              <div className="manual-input-row">
                <input
                  type="text"
                  inputMode="decimal"
                  value={manualSilverInputDisplay}
                  onChange={(e) => {
                    setHasUserEditedManualPrices(true);
                    const v = e.target.value;
                    setManualSilverInputDisplay(v);
                    if (v === '' || v === '-') return;
                    const n = parseFloat(v);
                    if (Number.isFinite(n) && n >= 0) setManualSilverPricePerGram(n);
                  }}
                  onBlur={() => {
                    const v = manualSilverInputDisplay.trim();
                    if (v === '') {
                      setManualSilverPricePerGram(0);
                      setManualSilverInputDisplay('');
                    } else {
                      const n = parseFloat(v);
                      if (Number.isFinite(n) && n >= 0) {
                        setManualSilverPricePerGram(n);
                        setManualSilverInputDisplay(String(n));
                      }
                    }
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={50}
                  step={0.1}
                  value={manualSilverPricePerGram}
                  onChange={(e) => {
                    setHasUserEditedManualPrices(true);
                    const n = safeParseNumber(e.target.value, manualSilverPricePerGram);
                    setManualSilverPricePerGram(n);
                    setManualSilverInputDisplay(String(n));
                  }}
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
              元/吨，成本 {result.costPerTonOreRmb.toLocaleString('en-US', {
                maximumFractionDigits: 0
              })}{' '}
              元/吨
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
        {priceMode === 'auto' && (
          <div className="card-disclaimer">
            自动模式目前尚在完善中，价格可能不准，仅供参考
          </div>
        )}
      </section>
    </div>

    <div className="table-strip">
      <div className="table-strip-header">
        <span className="table-strip-title">数据表格</span>
        <button
          type="button"
          className="primary-button primary-button-small secondary"
          onClick={exportTableToExcel}
          disabled={tableRows.length === 0}
        >
          导出 Excel
        </button>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>序号</th>
              <th>铜价 (元/吨)</th>
              <th>银价 (元/克)</th>
              <th>每吨利润 (元/吨)</th>
              <th>年利润 (元/年)</th>
              <th>综合成本 (元/吨)</th>
              <th>铜品位 (%)</th>
              <th>银品位 (%)</th>
              <th>回收率 (%)</th>
              <th>年开采量 (万吨)</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="data-table-empty">
                  点击「将当前数据加入表格」可把当前参数与利润加入下表
                </td>
              </tr>
            ) : (
              tableRows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td>{row.copperPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td>{row.silverPricePerGram.toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
                  <td className={row.profitPerTon >= 0 ? 'positive' : 'negative'}>
                    {row.profitPerTon.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td className={row.annualProfit >= 0 ? 'positive' : 'negative'}>
                    {row.annualProfit.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </td>
                  <td>{row.costPerTon.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                  <td>{row.copperGrade}</td>
                  <td>{row.silverGrade}</td>
                  <td>{row.recovery}</td>
                  <td>{row.annualTonnage10k.toLocaleString('en-US', { maximumFractionDigits: 1 })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
};


