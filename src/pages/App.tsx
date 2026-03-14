import React from 'react';
import { ProfitDashboard } from '../ui/ProfitDashboard';

export const App: React.FC = () => {
  return (
    <div className="app-root">
      <header className="app-header">
        <div>
          <h1>尼日利亚 Bauchi 铜矿实时利润平台</h1>
          <p className="subtitle">实时追踪国际金属价格，评估项目盈利能力</p>
        </div>
      </header>
      <main className="app-main">
        <ProfitDashboard />
      </main>
      <footer className="app-footer">
        <span>数据来源：可配置第三方金属价格 API，仅供内部评估参考</span>
      </footer>
    </div>
  );
};

