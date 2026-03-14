# 尼日利亚 Bauchi 铜矿实时利润平台

一个用于评估尼日利亚 Bauchi 州铜矿项目盈利能力的网页应用：实时获取国际金属价格（以铜为主），结合矿山品位、回收率、成本等参数，计算税前现金利润。

## 功能概览

- **实时金属价格**：支持铜、铝、锌等金属价格展示，默认货币 USD。
- **矿山参数输入**：
  - 日处理矿量 (t/d)
  - 铜品位 (%)
  - 选冶综合回收率 (%)
  - 可支付率 (%)
  - 运营成本 (USD/吨矿石)
  - 其他成本 (USD/吨铜金属)——可包含选冶费、运费、管理费等
  - 汇率 (NGN / USD)
- **利润测算**：
  - 日铜金属产量 (t/d)
  - 日营业收入 (USD/天)
  - 日总现金成本 (USD/天)
  - 日税前现金利润 (USD/天、NGN/天)
  - 利润率（利润 / 收入）

> 说明：该工具用于项目内部经济性评估，不作为外部报价或投资建议。

## 技术栈

- 前端：React + TypeScript + Vite
- 样式：手写现代化暗色 UI，适配桌面和移动端

## 安装与运行

在项目根目录执行（需要本机安装 Node.js 18+ 和 npm 或 pnpm）：

```bash
pnpm install    # 或 npm install / yarn
pnpm dev        # 启动本地开发服务
```

开发服务默认端口为 `5173`，浏览器访问 `http://localhost:5173` 即可看到页面。

## 配置金属价格数据源

项目预留了金属价格数据源的配置，默认对接 `metals-api.com` 的接口结构；如果你有其他数据源（例如 LME、Fastmarkets 或自建报价接口），可以按照相同结构进行替换。

### 1. 环境变量

在根目录创建 `.env.local` 文件（不会提交到代码仓库），示例：

```bash
VITE_METALS_API_URL=https://metals-api.com/api/latest
VITE_METALS_API_KEY=YOUR_API_KEY_HERE
```

前端通过 `src/api/metalPrices.ts` 中的 `fetchMetalPrices` 函数读取上述配置：

- `VITE_METALS_API_URL`：金属价格接口地址
- `VITE_METALS_API_KEY`：访问该接口所需的 Key

> 安全提醒：生产环境请将真实 API Key 配置在服务器或 CI/CD 的环境变量中，不要直接写进代码仓库。

### 2. 没有 API Key 时的行为

如果没有配置 `VITE_METALS_API_KEY`，系统会自动回退到**模拟数据模式**，方便前端联调：

- 铜价：约 `9,000 USD/t`
- 镍、铝、锌、铅：按简单比例推算

你依然可以调整矿山参数，看到利润随参数变化的趋势，但价格并非真实市场价格。

### 3. 替换为你自己的数据源（可选）

如果你有内部金属价格接口，只需要修改 `src/api/metalPrices.ts` 中的 `fetchMetalPrices` 函数，将当前对 `metals-api.com` 返回结构的解析替换为你的接口结构即可，保持返回类型 `MetalPriceSnapshot` 不变。

## 利润计算逻辑（简要）

以铜为主金属，假设：

- 日处理矿量：\( Q_{ore} \) (t/d)
- 铜品位：\( G_{Cu} \) (%)
- 选冶综合回收率：\( R \) (%)
- 可支付率：\( P \) (%)
- 铜价：\( Price_{Cu} \) (USD/t)
- 运营成本：\( C_{opex}^{ore} \) (USD/吨矿石)
- 其他成本：\( C_{other}^{Cu} \) (USD/吨铜金属)

则：

\[
Q_{Cu}^{payable} = Q_{ore} \times \frac{G_{Cu}}{100} \times \frac{R}{100} \times \frac{P}{100}
\]

\[
Revenue = Q_{Cu}^{payable} \times Price_{Cu}
\]

\[
Cost\_total = Q_{ore} \times C_{opex}^{ore} + Q_{Cu}^{payable} \times C_{other}^{Cu}
\]

\[
Profit\_{USD} = Revenue - Cost\_total
\]

再根据汇率折算为 NGN。

## 部署建议

- **轻量使用 / 内部评估**：可以直接将构建后的静态文件部署到任意静态网站托管（如 Nginx、静态对象存储）。
- **需要隐藏 API Key 时**：
  - 将金属价格数据源放在后端（例如简单的 Node/Express、Python/FastAPI 或云函数），前端只调用你自建的 `/api/metal-prices` 接口；
  - 在后端读取真实 API Key，前端无需接触。

## 后续可扩展方向

- 增加多金属协同（Au/Ag/Co 等副产品）对经济性的影响；
- 加入税费、特许权使用费 (royalty)、折旧等，形成更完整的现金流模型；
- 支持按月度或年度汇总，并导出 Excel 报表；
- 引入图表展示铜价历史走势与项目利润敏感性分析。

