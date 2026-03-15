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

**自动模式默认使用「长江有色金属网」**（[www.ccmn.cn](https://www.ccmn.cn/index_table/)）的 1#铜（元/吨）、1#白银（元/千克）报价。部署到 Vercel 后，站点会通过自带的 `/api/ccmn-prices` 接口抓取该页面的最新价格，无需配置 API Key。

### 1. 长江有色（默认）

- 数据来源：长江有色金属网 `index_table` 页，1#铜 均价（元/吨）、1#白银 均价（元/千克）。
- 部署到 Vercel 后，`/api/ccmn-prices` 会自动生效；本地开发时，`vite` 已配置将 `/api` 代理到你的 Vercel 部署地址，因此本地也能用长江有色数据（需先部署一次）。
- 若抓取失败（如网站改版或网络问题），自动模式会回退到模拟价格。

### 2. 国际接口（可选）

若希望自动模式使用国际报价（如 metals-api.com），在项目根目录创建 `.env.local`：

```bash
VITE_PRICE_SOURCE=metals-api
VITE_METALS_API_URL=https://metals-api.com/api/latest
VITE_METALS_API_KEY=YOUR_API_KEY_HERE
```

- `VITE_PRICE_SOURCE=ccmn`（或未设置）：使用长江有色。
- `VITE_PRICE_SOURCE=metals-api`：使用上述国际接口，需配置 `VITE_METALS_API_KEY`。

### 3. 本地开发时指定长江有色 API 地址（可选）

若本地未配置代理或部署地址变化，可设置：

```bash
VITE_CCMN_API_BASE=https://你的Vercel部署地址
```

这样前端会请求 `https://你的Vercel部署地址/api/ccmn-prices` 获取价格。

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

## 通过网址发布（推荐：Cloudflare Pages）

希望用户通过一个网址就能打开时，推荐用 **Cloudflare Pages** 部署（免费、HTTPS、国内访问通常更稳定，价格接口会一起生效）。若 Vercel 在你或用户网络下打不开或一直加载，可改用本方式。

### 步骤一：把代码推到 GitHub

1. 在 [GitHub](https://github.com) 新建一个仓库（如 `bauchi-profit`）。
2. 在项目根目录执行：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/bauchi-profit.git
git push -u origin main
```

### 步骤二：在 Cloudflare Pages 里部署

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) 登录，左侧进入 **Workers & Pages**。
2. 点击 **Create** → **Pages** → **Connect to Git**。
3. 选择 **GitHub**，授权后选中刚推送的仓库（如 `bauchi-profit`）。
4. 配置构建（一般保持默认即可）：
   - **Production branch**：`main`
   - **Build command**：`npm run build`
   - **Build output directory**：`dist`
   - **Root directory**：留空（用仓库根目录）
5. 点击 **Save and Deploy**，等一两分钟。
6. 部署完成后会得到一个地址，例如：`https://bauchi-profit.pages.dev`。

把**这个链接**发给用户，让他们直接打开即可；自动模式会通过站内的 `/api/ccmn-prices` 拉取长江有色价格。

### 之后更新网站

改完代码后执行：

```bash
git add .
git commit -m "更新说明"
git push
```

Cloudflare 会按连接的仓库自动重新构建、发布，网址不变。

### 备选：Vercel

若你更习惯用 Vercel，可到 [vercel.com](https://vercel.com) 用 GitHub 导入同一仓库，构建命令填 `npm run build`，输出目录填 `dist` 即可。项目内也保留了 Vercel 用的 `api/ccmn-prices.ts`。

---

## 其他部署方式

- **轻量使用 / 内部评估**：也可以把 `npm run build` 生成的 `dist` 目录部署到任意静态托管（如 Nginx、对象存储）。
- **需要隐藏 API Key 时**：将金属价格接口放在自己的后端（Node/Express、云函数等），前端只请求你的 `/api/metal-prices`。

## 后续可扩展方向

- 增加多金属协同（Au/Ag/Co 等副产品）对经济性的影响；
- 加入税费、特许权使用费 (royalty)、折旧等，形成更完整的现金流模型；
- 支持按月度或年度汇总，并导出 Excel 报表；
- 引入图表展示铜价历史走势与项目利润敏感性分析。

