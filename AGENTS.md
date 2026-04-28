# ClawOS

## Goal
打造一个专属于 Chris Wong 的轻量级私有云桌面 (Web GUI)，类似飞牛 OS 的操作体验。统一管理本地 OpenClaw 聊天、文件浏览、系统和应用监控，供 Tailscale 远程访问使用。

## Tech Stack
- Frontend: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Node.js + Express (Read-only System Probe + APIs for Apps)
- Apps Integrated: OpenClaw (embedded proxy), FileBrowser (embedded proxy), Aria2 (downloads), AList (netdisk proxies), Music API, Video CMS.

## Architecture
- `frontend/` - React UI (Desktop Shell)
- `backend/` - Node.js Backend API (System stats, AList proxy, Aria2 RPC proxy, Music/Video search)
- `scripts/` - Deployment and automation scripts
- `logs/` - Local log files for self-debugging and monitoring

## Decisions & Context
- **Zero-Invasion Principle**: OpenClaw gateway will not be modified. Its UI will be embedded via iframe.
- **Security-First**: The backend avoids arbitrary execution. Tools like Aria2 and AList run as user systemd services and are proxied.
- **App-Based Modularity**:
  - `Notes`: Simple local JSON storage.
  - `Downloads`: Uses Aria2 backend over RPC.
  - `Netdisk`: Uses AList to mount Baidu/Quark, pushes to Aria2.
  - `Music`: Refactored as a dedicated Netease app with QR Login and User Playlists, supports VIP cookies via UI.
  - `Video`: Built-in MacCMS sources for movies, plays via hls.js.
- **Reader / 每日简报**:
  - 资讯工作目录已统一为 `/home/chriswong/文档/RSS资讯`，并纳入服务端路径配置中心的 `readerDir`。
  - OpenClaw 后续不直接调 ClawOS 私有 API 写文章，而是按 `docs/rss-openclaw-ingest-spec.md` 规范把 JSON 文件投递到 `RSS资讯/inbox/pending/`。
  - ClawOS Reader 负责扫描 `inbox`、导入本地文章库、去重、分类、生成每日简报，并把结果落到 `feeds/` 与 `briefs/`。
- **AI 炒股 / Stock Analysis**:
  - 工作目录已统一为 `/home/chriswong/文档/AI炒股分析`，并纳入服务端路径配置中心的 `stockAnalysisDir`。
  - 后端采用 `Node/TypeScript 主业务 + Python/AKShare 受控子进程补充 A 股指数/成分股数据` 的混合方式，仍然保持主服务在 ClawOS 现有 TS 后端内。
  - 当前真实股票池以 `中证500 (000905)` 成分股为基准；Node 层负责行情拉取、市场状态检测、初筛、三流评分、Conviction Filter、持仓与交易日志。
  - `AI 炒股` 前端已从纯 mock 升级为真实 API 驱动，显示市场状态、候选信号、持仓风控、交易记录、观望日志与模型组表现。

## 关键教训（踩过的坑，避免重犯）
1. **cron 一次性生成的持久化文件不能作为"实时视图"**（v1.30.2 踩坑）：任何展示"当前价"的字段都必须有刷新机制。snapshot 用于回测/历史追溯，realtime 走独立 cron 刷新。
2. **清除缓存后必须立即重启服务**（v1.29.16 踩坑）：否则旧进程会用错误代码重新写入缓存。
3. **Ubuntu 25.10 的 OpenSSL 3.5.x 与东方财富 `push2/push2his` TLS 不兼容**（v1.7.3 / v1.25.1 踩坑）：已切腾讯主源 + Yahoo Finance 备用；kuaixun JSONP / reportapi / push2his 逐只查询等替代方案已落地。
4. **EventSource 无法附带 Basic Auth**（v1.26 通知系统踩坑）：SSE 在 BasicAuth 鉴权下失效，必须用 HTTP 轮询兜底（6 秒）+ 本地 optimistic 注入。
5. **Express5 下 `router.all('/proxy/*', ...)` 会触发 path-to-regexp 崩溃**（v1.27.0 踩坑）：必须用正则 `^/proxy/.+`。
6. **runtime 进程不重启新代码不生效**——多次踩过（v1.26 通知 404 根因就是 systemd 进程还是旧版）。任何修改代码必须 `systemctl --user restart clawos.service`。
7. **`max_tokens` 默认值过大会被 LLM provider 拒绝**（v1.20.0 踩坑）：阿里云 65536 / 智谱更低，统一改为 `provider.maxTokens ?? 50000`。
8. **AList storage 创建必须把 driver credentials 放进 `addition` JSON**（Quark 踩坑）：放 top-level 字段会被静默忽略，storage 创建成功但 cookie 为空。
9. **`<audio src>` 不会继承 fetch 的 Basic Auth 头**：需要单独下发 `clawos_media_auth` Cookie 给媒体流接口。
10. **HTTP 头不能携带非 ISO-8859-1 字符**（Notes 中文目录踩坑）：目录参数必须走 query/body，不能走自定义 header。
11. **`todayDate()` 必须用 Asia/Shanghai 时区**（v1.24.0 P0）：UTC 会在凌晨产生日期错位。
12. **交易操作必须加 `withFileLock` 互斥锁**（v1.24.0 P0）：防止并发写入竞态破坏 trades.json。
13. **清明/春节等节假日不能靠程序预估**（v1.19.0 踩坑）：按国办发文件修正 + AKShare 在线同步交易日历。

## Session Log

### 2026-04-29 v1.35.13 AI 炒股弱牛市与追高风控修复
- **背景**：复盘 2026-04-28 推荐后发现 Top 信号在 `risingRatio=0.374`、情绪偏悲观时仍按 `bull_trend` 宽松逻辑推荐，且亨通光电等高位动量股被技术/量化推成买入。
- **数据源修复**：东方财富热股/人气榜改为中性热度源，不再参与社交多空情绪；市场状态改用多源情绪，避免热度榜把行情误判为“乐观牛市”。
- **策略修复**：弱广度或悲观的 `bull_trend` 改按普通震荡体制收紧；专家流学习后最低权重提升到 32%；`consensus < 0.42` 才强制降级，避免过度否决普通低共识；新增 RSI、高位、20日大涨的追高扣分和强制 watch。
- **阈值修复**：Conviction 自动调整需要至少 20 笔已平仓样本，并按体制设置安全地板；真实配置 `/home/chriswong/文档/AI炒股分析/config/strategy.json` 已把 `bull_trend.minCompositeScore` 从 60 恢复为 70。
- **验证**：补充 social sentiment、market state、scoring upgrade 回归，覆盖热度源中性化、多源情绪降级、专家权重下限、追高降级、弱牛市门槛与自动阈值样本下限。

### 2026-04-26 v1.35.12 AI 炒股模型组胜率链路修复
- **背景**：用户要求严格修复“记忆复盘 -> 模型组表现”中 `kimi-for-coding (Kimi)`、`glm-5.1 (OpenCodeGo)` 等模型有预测次数但胜率显示 0% 的问题，不能只改前端展示。
- **根因**：旧链路把 `predictionCount` 从历史 `signals/*.json` 聚合，但 `winRate/weight` 依赖 `expert-performance.json`；同时 `extractMemoryEntriesFromSignals()` 跳过 `rule-engine` 和 `usedFallback`，且 `expert-performance.recentOutcomes` 最多 50 条，模型切换后旧模型 outcome 会被截断。
- **后端修复**：daily-memory 与 expert-performance 现在保留每票实际 `modelId/providerId/providerName/assignedModelId/usedFallback`；规则专家和 fallback 投票不再被过滤；`buildModelGroupPerformance()` 优先从完整 `daily-memories` 聚合已结算胜率，expert-performance 只作为权重来源和旧数据兜底。
- **历史回填**：新增并执行 `rebuildExpertPerformanceFromSignals()`，已备份真实 `experts/expert-performance.json` 与 `experts/model-groups.json` 后，从 `/home/chriswong/文档/AI炒股分析/signals` 回填 45 位专家、10260 条结算样本；`kimi-for-coding (Kimi)` 胜率变为 38.32%，`glm-5.1 (OpenCodeGo)` 变为 39.49%，规则引擎变为 35.73%。
- **验证**：补充 `expertPredictionDualTrack.test.ts` 与 `stockAnalysisModelGroupsReset.test.ts` 回归；后端定向测试、`npm run test:build`、`npm run build` 均通过。

### 2026-04-23 v1.35.11 AI 炒股系统说明页按真实逻辑重写
- **背景**：用户要求在我重新深入梳理 AI 炒股完整运行逻辑后，把前端“系统说明”页面整体更新到当前真实版本，避免继续展示旧时间线、旧风控语义和缺失页面。
- **前端修复**：重写 `frontend/src/apps/AIQuant/components/GuideTab.tsx`，把说明页内容统一对齐当前真实后端逻辑：补入 `09:31` 开盘自动执行、盘中 `signal.realtime` 刷新、盘中自动止损/止盈直接平仓、组合风控 `paused` 的真实触发条件，以及“自选股票”页面的最新定位。
- **关键口径**：说明页现在明确区分 `snapshot`（盘前分析基准）与 `realtime`（盘中/收盘实时视图）；明确日/周/月/回撤都会进入风险状态，但真正限制新开仓的是“月度亏损超限或最大回撤超限”；明确暂停后仍允许平仓/减仓退出风险。
- **文档同步**：`CHANGELOG.md` 已新增 `1.35.11` 条目，记录这次系统说明页更新的原因和重点。

### 2026-04-22 v1.35.10 AI 炒股新增盘中自动止盈阈值
- **用户要求**：在“全局设置 -> 盘中自动平仓”里新增一个“盈利达到 X% 自动平仓”的选项，默认值为 `10%`，行为要和现有的盘中亏损自动平仓相似，都是盯盘期间自动执行。
- **后端修复**：`StockAnalysisStrategyConfig` 新增 `intradayAutoCloseProfitPercent`，默认值 `10`。`pollIntradayOnce()` 在现有自动止损分支旁新增自动止盈分支：当 `checkTradingAvailability().canTrade === true` 且 `pnlPercent >= intradayAutoCloseProfitPercent` 时，直接复用 `closeStockAnalysisPosition()` 按实时价 `closeAll` 平仓，并写入“系统盘中自动止盈平仓”备注与审计日志。
- **前端同步**：`GlobalSettingsTab` 在“盘中自动平仓”卡片中新增“自动止盈阈值 (%)”输入框，并把说明文案改为同时描述“亏损触发自动止损平仓”和“盈利触发自动止盈平仓”。
- **线上同步**：真实运行配置 `/home/chriswong/文档/AI炒股分析/config/strategy.json` 已补入 `intradayAutoCloseProfitPercent: 10`，避免线上服务读取不到新字段时回退异常。

### 2026-04-22 v1.35.8 AI 炒股月度亏损阈值改为全局可配
- **用户反馈**：当天被“月度亏损 10.3% 超过阈值 10%”直接限制交易，且连平仓退出都被禁止，体验和风控语义都明显不合理。
- **后端修复**：`portfolioRiskLimits.maxMonthlyLossPercent` 改为真正的全局配置项，默认值从 `10` 提升到 `30`。`PUT /api/system/stock-analysis/config` 现在同时保存 `intradayAutoCloseLossPercent` 与 `portfolioRiskLimits.maxMonthlyLossPercent`，并在保存后立即基于当前 trades 重算 `riskControl`，避免旧暂停状态残留。
- **语义修正**：风控暂停现在只禁止新增风险，不再阻止 `close/reduce`。原因是暂停的正确目标应是“停止继续下注”，而不是“禁止止损离场”。`dismissPositionAction` 仍保持禁止，避免在暂停期间把高风险提醒人为消音。
- **前端同步**：`GlobalSettingsTab` 新增“月度亏损暂停阈值 (%)”输入框和说明文案，明确它是“近 22 个交易日累计已实现亏损”的组合级开仓闸门；默认展示 30%，保存后立即生效。
- **验证方向**：补了路由回归，覆盖“保存 30% 后解除因 10.3% 月亏损导致的错误暂停”；补了 service 回归，确认 paused=true 时仍允许平仓/减仓退出风险。

### 2026-04-22 v1.35.9 AI 炒股日/周/月亏损阈值统一全局可配
- **用户追加要求**：发现系统不仅月度亏损有限制，日度和周度亏损同样会触发组合风控，因此要求三者都放到“全局设置”中统一配置，并把默认值改为日 `10%`、周 `20%`、月 `30%`。
- **后端修复**：`DEFAULT_STOCK_ANALYSIS_CONFIG.portfolioRiskLimits` 默认值调整为 `10 / 20 / 30 / 15`；`PUT /api/system/stock-analysis/config` 扩展为同时保存 `maxDailyLossPercent`、`maxWeeklyLossPercent`、`maxMonthlyLossPercent`，并继续在保存后立即重算 `runtime-status.json` 里的 `riskControl`。
- **前端修复**：`GlobalSettingsTab` 改为三输入框；`RiskTab` 文案将“交易暂停”收口为“新开仓限制 / 组合风控已限制新开仓”，避免误解成“连平仓都不允许”。`AIQuantApp`、`RiskTab` 的本地默认阈值也同步更新为 `10 / 20 / 30`。
- **线上同步**：真实运行配置 `/home/chriswong/文档/AI炒股分析/config/strategy.json` 已同步更新为日 `10`、周 `20`、月 `30`，并已手动重算 `runtime-status.json`，确认当前月亏损 `-10.3%` 在新阈值下不再触发暂停。

### 2026-04-22 v1.35.7 AI 炒股新增全局设置页
- **用户要求**：在 AI 炒股里新增一个“全局设置”页面，把“盘中亏损超过 X% 自动全平仓”的逻辑改成可配置项，允许直接在 UI 中修改。
- **后端**：`StockAnalysisStrategyConfig` 新增 `intradayAutoCloseLossPercent`，默认值为 `5`；盘中轮询自动平仓逻辑不再写死 `-5%`，而是读取该配置。新增 `PUT /api/system/stock-analysis/config`，当前先开放保存该字段，并做 `0-100` 数值校验。
- **前端**：在 `AIQuantApp` 左侧导航新增“全局设置”tab，新建 `GlobalSettingsTab.tsx`。页面当前包含“盘中自动平仓亏损阈值 (%)”表单，说明文案明确限定为“交易日连续竞价时段才触发”。保存后直接刷新本地 config 状态，无需离开页面。
- **验证**：后端新增路由回归和“阈值配置生效”回归；前端新增 tab 组件测试。backend 定向测试通过，frontend 定向测试通过，frontend/backend build 全部通过。
- **线上踩坑**：首次交付后用户保存 5% 报错，根因不是逻辑错误，而是运行中的 `clawos.service` 仍是旧进程，导致新加的 `PUT /api/system/stock-analysis/config` 在线上返回 `404 Not Found`。已重新执行 frontend/backend build 并 `systemctl --user restart clawos.service`，随后用真实接口验证 `intradayAutoCloseLossPercent=5` 保存成功。

### 2026-04-22 v1.35.6 盘中亏损超 5% 自动全平仓
- **用户要求**：新增盯盘期间自动化逻辑，但必须严格限定在 A 股交易日的真实交易时间内触发；若持仓股票盘中亏损超过 5%，系统要自动平仓全部卖出。
- **实现**：在 `pollIntradayOnce()` 的盘中轮询里新增强平分支；当 `checkTradingAvailability().canTrade === true` 且 `pnlPercent <= -5` 时，直接复用 `closeStockAnalysisPosition()` 以当前实时价执行 `closeAll` 平仓，并写入“系统盘中自动止损平仓”备注与审计日志。
- **边界**：即使手动启动了盘中监控，只要当前不在交易日连续竞价时段（如 15:05、午休、周末/节假日），该自动平仓逻辑都不会触发；非交易时段仍允许生成普通止损告警，但不会真的卖出。
- **验证**：新增 `backend/tests/stockAnalysisV135Fixes.test.ts` 两条回归，覆盖“交易时段内亏损超过 5% 自动平仓”和“非交易时段同样亏损不自动平仓”；定向测试通过，backend build 通过。

### 2026-04-22 v1.35.5 daily run 满仓仍保留 LLM 分析
- **用户要求**：每日 LLM 分析无论当前持仓是否已满，都必须完整执行；持仓上限只能限制后续交易动作，不能让分析页退化成公式评分/全降级。
- **根因**：`runStockAnalysisDaily()` 曾按 `positionsFull` 把新信号的 `aiConfig` 置空，导致满仓时 `buildSignal()` 直接走 `buildExpertScoreFallback()`，最终 `expert.votes=[]`、`llmSuccessCount=0`、`isSimulated=true`。
- **修复**：移除 daily run 中“满仓跳过 LLM”的分支；现在候选信号一律把真实 `aiConfig` 传入 `buildSignal()`，满仓仅保留日志提示和后续仓位/交易约束，不再影响分析生成。
- **验证**：新增 `backend/tests/stockAnalysisService.test.ts` 回归，覆盖“满仓时 daily run 仍会调用 `runExpertVoting`”；定向 service 测试通过。

### 2026-04-22 v1.35.4 模型组表现改为当日收盘结算
- **用户要求**：模型组表现和权重学习不再等 T+5，也不再等持仓卖出；既然系统是开盘前给预测，那就应该在当天收盘后立刻结算预测成果，并据此调整模型组表现与专家权重。
- **根因**：旧链路混了三套口径：`expert-performance` 主统计靠平仓后的 `pnlPercent`，`daily-memories` 额外维护 T+1/T+5 回填，导致模型组表现与权重调整既滞后又语义不一致。
- **修复**：`runDailyMemoryUpdate` 改为盘后直接结算当日预测结果，优先使用 `signal.realtime.changePercent`（无则回退 `snapshot.changePercent` / `quote cache`），并在同一流程内同步写入 `expert-performance.json`。模型组表现和 `expertWeightsMap` 从此直接依赖这套“当日收盘结算”结果。
- **删除/停用**：移除了 T+5 回填和 `1d/5d` 双轨统计链路；卖出路径不再异步调用旧的 `updateExpertPerformance`，避免平仓 pnl 再次混入模型表现。`ExpertDailyMemoryEntry` 暂时保留旧字段名 `actualReturnNextDay/wasCorrect` 以兼容现有文件，但语义已经改成“预测日当天收盘结算结果”。
- **前端同步**：专家分析页把“次日收益”文案改为“当日结算”，避免 UI 继续误导成 T+1 口径。
- **验证**：重写 `backend/tests/expertPredictionDualTrack.test.ts` 覆盖 realtime 收盘结算、`expert-performance` 同步与幂等；加上先前的 `stockAnalysisModelGroupsReset.test.ts`，定向测试通过，backend/frontend build 均通过。

### 2026-04-22 v1.35.3 模型组表现重置语义修复
- **现象**：用户前一天重置了专家表现/模型组逻辑后，`MemoryTab` 的“模型组表现”、周报和月报仍显示旧统计，看起来像“重置无效”。
- **根因**：`getStockAnalysisOverview`、`generateWeeklyReport`、`generateMonthlyReport` 以及 daily run 持久化路径都把 `model-groups.json` 当作高优先级缓存；只要文件非空，就继续信任旧数据。与此同时，`buildModelGroupPerformance()` 又会基于全历史 signal votes 聚合，和“重置后等待新样本”的用户语义冲突。
- **修复**：在 `service.ts` 新增统一判定：只有 `expert-performance.entries.length > 0` 时，才允许读取/重建模型组表现；若专家表现已清空，则 overview / 周报 / 月报统一返回空模型组，daily run 也将 `model-groups.json` 持久化为空数组，避免旧缓存被再次刷回。
- **验证**：新增 `backend/tests/stockAnalysisModelGroupsReset.test.ts`，覆盖 overview / 周报 / 月报三条回归；定向测试 3/3 通过，backend build 通过。
- **当前语义**：模型组表现现在明确依赖“已形成的新专家表现样本”；仅清空 `expert-performance.json` 后，不会再继续展示旧 `model-groups.json`。如果后续要支持“按 reset 时间窗口重算历史组统计”，需要单独引入 reset marker 或统计起点。

### 2026-04-21 v1.35.2 紧急修复：远程 Tailnet 域名卡加载页（CORS 误拒）
- **现象**：本地 `localhost` 正常，但通过 `https://chriswong-maco.tail7d4b86.ts.net/` 访问时一直停在 ClawOS 加载页。
- **根因**：v1.35.0 第 4 批收口 CORS 时，`backend/src/server.ts` 用了 `^https?://[\w-]+\.ts\.net$`，只允许单级子域名。实际 Tailscale 域名是多级子域 `chriswong-maco.tail7d4b86.ts.net`，导致首屏 API 请求被后端 CORS 拒绝，前端静态资源能打开但初始化数据永远拿不到。
- **修复**：改为 `new URL(origin).hostname.endsWith('.ts.net')` / `=== 'ts.net'` 的 hostname 判定，避免正则只匹配单级子域。
- **测试**：更新 `backend/tests/stockAnalysisV135Batch4.test.ts`，补上多级 `*.ts.net` case；后端测试 277/277 通过，build 通过。
- **运行验证**：重启 `clawos.service` 后，带 `Origin: https://chriswong-maco.tail7d4b86.ts.net` 的本地/远程 `health` 请求都返回 `200`，且响应头已正确包含 `Access-Control-Allow-Origin`。
- **后续体检**：继续抽测了远程 `notifications/stream` SSE、`auth/verify`、`config/paths`、`proxy/openclaw`，都已正常；当前仅保留 1 个非首屏风险点：`frontend/src/apps/netdiskAccessMeta.ts` 仍硬编码 `http://127.0.0.1:5244/@manage`，这是刻意的“仅本机打开 AList 后台”入口，不会影响远程页面加载，但远程用户点击会跳本机地址。

### 2026-04-21 v1.35.2 通知激进精简（AI 炒股去重降噪）
- **目标**：解决 AI 炒股“同一事件同时出现在本页 toast / 系统通知中心 / AI 炒股关键通知历史 / 页面内联横幅”的多层重复提醒，优先精简买入/卖出相关噪音，保留高风险唯一入口。
- **决策**：
  - 用户主动操作成功只保留本页 `showToast`，不再写系统通知。
  - 用户主动操作失败默认也只保留本页 toast；仅当 `riskControl.paused=true` 或 `dataState!=ready` 时，才升级为系统高危通知。
  - 被动风险系统通知只保留高风险白名单：`risk pause`、`data state abnormal`、盘中/持仓 `stop_loss`、`daily_loss_limit`。
  - `take_profit` / 普通 `reduce` / 换仓建议不再进入系统通知，改由 `StrategiesTab`、`DashboardTab`、`RiskTab` 页面内联承载。
  - AI 炒股顶部“关键通知历史”改为白名单过滤：仅显示 `category in {risk,data,intraday}` 且 `riskPriority in {critical,high}`，不再复读 execution/analysis 成功提示。
- **实现**：
  - 新增 `frontend/src/apps/AIQuant/notificationPolicy.ts` 抽出通知白名单策略。
  - 新增 `frontend/src/apps/AIQuant/notificationPolicy.test.ts` 覆盖关键规则。
  - `AIQuantApp.tsx` 去掉手动 daily/auto-execute/stock-pool/confirm/reject/ignore/close/reduce/dismiss/post-market/intraday-start-stop 的系统成功通知。
  - 持仓动作提醒在盘中监控运行时不再和 intraday alert 双发；系统层仅保留 `stop_loss`。
  - 风控暂停 / 数据状态异常加长 dedupe window（120s）；critical intraday / position risk 使用 batch window（10-15s）。
- **验证**：前端测试 64/64 通过，frontend build 通过；确认唯一入口仍保留：`DashboardTab` 盘中告警横幅、`StrategiesTab` 待处理卖出、`RiskTab` 风控与事件时间线、周报/月报横幅均未删除。

### 2026-04-22 v1.35.2 策略修正：限制学习权重对专家流的极端压缩
- **现象**：真实运行中 `bull_trend` 基础权重 `0.35/0.35/0.30` 被学习权重调整成 `专家 0.1371 / 技术 0.3758 / 量化 0.4871`，导致专家流被压到失真区间，出现“专家仅中等但仍被技术/量化主导冲成 strong_buy”的策略语义偏移。
- **修复**：在 `getAdjustedFusionWeights` 最终归一化阶段新增专家权重钳位，限制专家流最终权重区间为 `25% ~ 45%`；超出区间时，把剩余权重按技术/量化当前相对比例重新分配，保持总和为 1。
- **原因**：之前只限制了 adjustmentFactors 的绝对值（±0.2），但没有限制最终 fusion weight；基准 0.35 被负调整后可直接跌到 0.13，用户感知上已经不是“专家参与决策”，而是“专家仅作装饰”。
- **测试**：新增两条单测，覆盖“专家权重不会低于 25%”和“不会高于 45%”；后端测试 279/279 通过，build 通过。
- **注意**：历史 signal 文件里的 `fusionWeights` 是生成当时的快照，不会因为代码修改自动回算，因此旧信号仍会显示旧权重；新权重只会在后续新生成信号中体现。

### 2026-04-21 v1.35.1 第 5 批 P0 修复（前端契约 + 日志治理 + systemd secrets）
- **完成项**：
  - A9-P0-1 前端 `DecisionSource` 契约补齐到后端 7 值枚举，`dashboardMeta` 统计把 `system_auto_buy/system_auto_ignore` 纳入 execution/ignore 口径，`ExpertAnalysisResponse` 也改为强类型对齐。
  - 前端 close/reduce 请求继续保留自动 `clientNonce`，并补测试覆盖自动决策统计，防止自动买入/自动忽略在 UI 和行为画像中漏计。
  - A10-P0-2 `sa-logger` 增加双保险清理：保留 30 天 + 总量上限 128MB，旧 `stock-analysis-debug.log` 明确纳入回收，且在长时间运行时按小时惰性触发清理，不依赖重启。
  - A10-P0-3 日志双写收口：`saLog` 业务日志改为本地业务文件单一事实源，仅将 warn/error 镜像到 Winston，避免再把 info/debug 大量灌入 `backend-out.log`。
  - A10-P0-1 `clawos.service` 不再内嵌明文凭据，改为 `EnvironmentFile=/home/chriswong/.config/clawos/clawos.env`，并将 env 文件权限收紧为 `600`。
- **验证**：前端 64/64、后端 277/277 全绿；frontend/backend build 通过；`systemctl --user daemon-reload && restart clawos.service` 成功；真实运行态触发后日志目录从 `228MB` 回收到 `1.8MB`。
- **关键结论**：日志总量上限在真实服务里已生效，`stock-analysis-debug.log` 已被清理；systemd 已确认读取新的 `EnvironmentFile`。

### 2026-04-21 v1.35.0 第 2 批 P0 修复（数据正确性）
- **完成项**：
  - A1-P0-1 Tencent GBK 正确解码（`TextDecoder('gbk')` 替代 `binary`）
  - A1-P0-2 parseTencentQtFundamentals 4 层哨兵（CJK 名称 + 正数价格 + PE/PB 合理范围）
  - A1-P0-3 跨年交易日历懒加载 + 1-3 月预加载上一年
  - A1-P0-4 successRate 口径修正：源级成功率 + errors 权重 ×10
  - A4-P0-3 T+1 时区统一北京日期（优先用 position.openDate）
  - A1-P1-4 PE=0 转 null（亏损股）
- **测试**：stockAnalysisV135Batch2.test.ts 8 个新测 + 更新 2 个旧测期望值；全套件 266/266
- **部署**：build → restart → overview API 200ms 响应 287KB（无异常）
- **commit**：`de35d71`
- **下一批**：第 3 批策略/记忆（A3-P0-3 LLM 降级前端告警 / A8 PnL 复盘统计）

### 2026-04-21 v1.35.0 第 1 批 P0 修复（资金安全 + 信号状态保护）
- **目标**：基于 v1.34.0 审计的 17 个真 P0（交叉验证后）+ 新报告 P0，按 5 批修复。本次完成第 1 批 6 个最致命的资金/race P0。
- **修复清单（6 个 P0）**：
  - A2-P0-1 dashboard race 幽灵持仓：`getStockAnalysisOverview` 关键写入包 TRADING_LOCK_KEY（service.ts:5142-5168）
  - A4-P0-1 close/reduce/dismiss 加 paused 校验（service.ts:5795, 5928, 5967）
  - A4-P0-2 平仓/减仓幂等性：`lastTradeAt` 2s 窗口 + `clientNonce` 60s LRU 缓存
  - A3-P0-1 Daily 重跑保留 user 决策：`saveStockAnalysisSignals` 合并而非覆盖（store.ts:505）
  - A3-P0-2 weight 强校验：NaN/Infinity/≤0/>1 直接 throw
  - A2-P0-3 dismissPositionAction 加 TRADING_LOCK_KEY
- **新增字段/机制**：
  - `StockAnalysisPosition.lastTradeAt`（幂等窗口标记）
  - `StockAnalysisTradeRequest.clientNonce`（前端 uuid v4 透传）
  - `reduceIdempotencyCache` Map（LRU 自清理，200 条上限）
  - `SA_BYPASS_TRADING_HOURS` env（仅 NODE_ENV=test 生效的交易时段旁路）
- **自动化测试**：`tests/stockAnalysisV135Fixes.test.ts` 14 tests 全绿
- **回归验证**：全套件 258/258 通过
- **部署**：`npm run build` → 版本号 1.35.0 → `systemctl --user restart clawos.service` 成功启动，overview API 返回正常（287KB，success=true，无 TypeError 刷屏）
- **下一批预告**：第 2 批数据正确性（quantity 字段废弃 / GBK 乱码 / 字段校验 / 跨年回溯 / 时区）

### 2026-04-20 v1.34.0 全栈深度审计（10 agent 并行只读复盘）
- **背景**：v1.34.0 紧急修复"100 股对齐导致用户当日无法平仓"bug 后，用户要求派出 10 个 agent 全栈深度复盘，找出所有影响数据准确性、分析正确性、交易可靠性、阻塞性的问题，确保架构 100% 稳定。
- **方案**：10 agent 并行只读审计（不改代码避免并发冲突），每个 agent 报告**直接 Write 到本地文件**（吸取教训：不能让长报告塞回上下文导致压缩丢失），最终汇总到一份总报告。
- **覆盖范围**：数据采集 / 存储 / 策略信号 / 风控持仓 / 调度任务 / API 路由 / 前端 / 记忆统计 / 类型契约 / 日志运维 全 10 个模块。
- **产出**：
  - 10 份子报告：`docs/audit/agent-1 ~ agent-10-*.md`（共 2531 行）
  - 1 份汇总报告：`docs/AUDIT_v1.34.md`（含 Top 15 P0 跨 agent 归并 + 修复路线图 v1.35.0~v1.37.0）
- **核心发现**：P0=39 / P1=69 / P2=76（合计 184 个问题）。Top 15 P0 集中在：
  - **资金安全（5 个）**：dashboard race 复活幽灵持仓 / close 路径无 paused 校验 / reduce 无幂等 / NaN weight 注入 / Daily 重跑覆盖 user_confirmed
  - **数据正确性（4 个）**：v1.34.0 quantity 语义切换无迁移 / PnL 缺手续费+累计收益量纲错+缺净值快照 / Tencent qt GBK 乱码 / 字段索引硬编码
  - **运维（4 个）**：systemd 明文密码 / LLM 日志无总量上限 191MB / service.ts:2493 TypeError 线上正在刷屏 / 调度器无互斥锁
  - **安全（2 个）**：CORS 通配 + Basic Auth XSS 全暴露 / 错过 cron 无补跑
- **修复路线**（建议）：
  - v1.35.0 紧急止血（5 个资金 P0）→ 1-2 天
  - v1.35.1 运维加固（3 个 P0）→ 0.5 天
  - v1.36.0 数据正确性（4 个 P0）→ 2-3 天
  - v1.37.0 安全与可观测性（2 个 P0 + 剩余 24 个 P0）→ 1-2 天
- **状态**：审计已完成，等待用户决策是否进入修复阶段、确认 Top 15 P0 排序、提供手续费率等业务参数。**未做任何代码修改。**
- **教训**：长任务派 sub-agent 时必须强制其将产出 Write 到本地文件，禁止把大段内容返回到对话——否则一旦上下文压缩就全没了。

### 2026-04-19 (session 2) v1.33.0 — LLM 专家预测系统全面根治改造（P0 + P1 六项）
- **背景**：用户怀疑 30 个 LLM 专家预测准确率长期偏低不是模型能力问题，而是系统设计问题（上下文稀缺 + 反馈闭环失效）。一次性做完 6 项根因改造。
- **P0-1 技术指标注入 prompt**：RSI14 / MACD / ATR / industryStrength 原本只存快照不进 prompt。`buildStockContext` 新增 `buildIndicatorBlock`，全专家强制可见。
- **P0-2 近 30 日 OHLC 摘要**：专家完全看不到 K 线历史。新增 `buildKlineDigest` 压缩成 ~1500 字符（统计 + 近 10 日逐日 + 早期 20 日折叠 + 形态识别）。
- **P0-3 FactPool 拆分 global + perStock**：原本所有股票共用全局事实池，导致茅台看见宁德时代公告污染判断。新增 `buildFactPoolSummaryForStock`：公告按代码过滤，行业新闻按 `snapshot.sector` 过滤。
- **P1-1 三轨胜率校准**：原本只用持仓 pnl 反馈（样本稀少），现在并行三轨：`winRatePosition` + `winRate1d`（T+1 次日收益）+ `winRate5d`（T+5 盘后 `backfill5dResults()` 回填）。neutral 阈值 |return| < 0.5%。
- **P1-2 基本面注入 prompt**：PE/PB/ROE/总市值 完全缺失。新建 `fundamentals.ts`（Tencent qt 批量抓 + 过夜失效缓存 `{dir}/cache/fundamentals/{code}.json`），`buildFundamentalsBlock` 按业务语义标注（<0 亏损 / 15-25 正常 / >40 高估）。
- **P1-3 移除 STANCE_GUIDE 预设结论**：原本告诉专家"你是看多派/看空派"导致预先给答案，改为"你的职责是诚实分析"。`buildFallbackVote` 也去 stance 化。
- **数据源抉择**：阶段 E 本来要用 AKShare `stock_individual_info_em`，shell 调用卡 90s 超时放弃；东财 push2his 偶尔返空不稳定；最终用项目已验证的 Tencent qt 接口（字段 index 39=PE / 44=总市值 / 46=PB / 74=ROE）。营收增速字段位置不可靠暂不采。
- **验证**：A-E 五阶段共 45 个新单测全通过 + memory/service 63 个回归全通过 = 108 测试全绿。`npm run build` 通过。
- **执行路径**：types.ts（新增 StockFundamentals + 扩展 outcome/performance） → llm-inference.ts（三段 prompt 块 + STANCE 重写 + fundamentals 参数贯穿 `runExpertVoting→runLLMWithFallback→callExpertLLMWithFallback→buildExpertUserMessage→buildStockContext`） → memory.ts（拆池 + 回填） → fundamentals.ts（新建） → service.ts（`buildSignal`/`evaluatePositionScores` 加参、主流程和盘后各预取 `fundamentalsMap` 批量传入、Phase 7 挂接回填）。
- **tricky 踩坑**：`trading-calendar.ts` 没导出 `todayDate`，用 `formatDateStr(new Date())` 代替。
- commit `9301ba0`，push 成功，服务 21:16 restart running。

### 2026-04-19 v1.32.2 — 模型组数据重置
与防御性检查
- 清空 expert-performance/model-groups/weights，删除 4/1-4/16 旧信号（无 providerId 导致 groupKey 不匹配）。
- 修复 `inferProvider` 多供应商时返回拼接名称问题（改为返回空）。
- `getAdjustedFusionWeights` 新增 `!learnedWeights.adjustmentFactors` 防御（weights.json 为 `{}` 时崩溃）。
- commit `d687661`。

### 2026-04-18 v1.32.1 — 修复"忽略"按钮不生效 + Kimi 胜率 0% bug
- **忽略按钮 bug**：`dismissPositionAction()` 写入 `action=hold`，但 `updatePositionRuntime()` 每次 overview 时重新计算 action 覆盖 hold。修复：新增 `dismissedAction` 字段，runtime 计算时若 action 未变则保持 hold。
- **Kimi 胜率 0% bug**：`buildModelGroupPerformance()` 中 `expertGroupMap` 改为 `expertGroupsMap` 一对多映射。
- commits: `ba09e65`, `9968118`。

### 2026-04-17 (session 3) v1.32.0 — 自选搜索覆盖 A 股全市场
- **用户反馈**：自选股票搜索搜不到京东方 000725。根因：`searchStockPool` 只查 `cache/stock-pool.json`（500 只中证500成分股），京东方是沪深300大盘股被剔除，茅台/宁德时代/招商银行等同样搜不到。
- **方案**：新增独立的 A 股全市场代码表（不污染中证500选股逻辑）。`store.ts` 新增 `cache/a-stock-all.json`（+ `.meta.json`）；`service.ts` 新增 `ALL_A_STOCK_LIST_SCRIPT`（AKShare `stock_info_a_code_name`，5506 只）+ `getAllAStockList()`（7 天 TTL，失败回退旧缓存）+ `normalizeFullwidth()`（全角Ａ→半角A 归一化）。
- **改写 `searchStockPool`**：先查全市场表，失败/空则回退中证500池。
- **验证**：后端 build 通过 + 新单测 2/2 通过（`stockAnalysisSearch.test.ts`）+ 实测搜索京东方/茅台/宁德时代/招商银行/600519 全命中。
- **API 参数名坑**：路由 `/watchlist/search` 用 `req.query.q`（不是 `query`），调试时踩过。

### 2026-04-17 (session 2) v1.31.0 — 解除仓位比例限制
- 用户反馈系统过度保守：maxSinglePosition=0.3 / maxTotalPosition=0.85 在实盘中把所有仓位都压缩到 30% 上限，失去 AI 自主分配能力。
- **默认值调整**：`store.ts` L80-81 `maxSinglePosition` 0.3 → 1.0，`maxTotalPosition` 0.85 → 1.0；`/home/chriswong/文档/AI炒股分析/config/strategy.json` 同步。
- **移除市场级仓位压制**：`service.ts:5229` 删除 `Math.min(..., marketRisk.effectiveMaxPositionRatio)`（commit `3c32c5a`）。
- **修复 effectiveMaxPositionRatio 硬编码**（commit `9ef9667`）：`evaluateMarketLevelRisk` 不再返回硬编码 0.85/0.65/0.5，改为跟随 `config.maxTotalPosition`。
- **保留的硬拦截（绝对不能动）**：极端熊市、流动性危机、持仓数量上限 3、黑名单、`runtimeStatus.paused`。
- 同步前端 `StrategiesTab.tsx:55` / `RiskTab.tsx:466` 默认值、测试断言（373/408）、types.ts 注释、package.json 1.31.0。
- 验证：后端 197/197 + 6/6 测试通过，已 push + 重启服务 + API 验证。

### 2026-04-17 v1.30.2 — signals 盘前快照全天不刷新
- **根因**：signals 由 `cron '5 8 * * 1-5'` 盘前一次性生成，落盘后整日不更新，前端展示 T-1 收盘价。用户实测华丰科技 688629 显示 131.88（-0.08%），东财实际 136.40（+3.43%）。
- **方案（快照/实时分离）**：Signal 新增 `realtime: {latestPrice, changePercent, open, high, low, previousClose, fetchedAt}`，snapshot 保持盘前基准不动。
- `service.ts` 新增 `refreshSignalsRealtime(dir, tradeDate?)`，只刷新 realtime 字段。
- `scheduler.ts` 新增 cron：`*/5 9-14 * * 1-5` + `0 15 * * 1-5`（收盘定格）。
- 新增 `POST /signals/refresh-realtime` 手动触发接口。
- `StrategiesTab.tsx` 两处展示改为 `realtime?.xxx ?? snapshot.xxx`，加"HH:MM 更新 / 盘前基准价"徽章。
- `confirmStockAnalysisSignal` fallback 优先级：`realtime.latestPrice > signal.latestPrice`。
- 验证：refresh-realtime 返回 updated=39/skipped=0，华丰 realtime=136.40 +3.43% 与东财完全一致。commit `7d2c340`。

### 2026-04-16 (session 3) v1.29.17 — 模型组表现统计修复
- 修复模型组表现两个问题：只显示 3 个模型（kimi-k2.5 缺失）+ 缺少供应商标注。
- 根因：`buildModelGroupPerformance()` 只处理当天 signals，kimi-k2.5 当天全部 fallback 导致 0 vote。
- 修复：重写为 async，聚合全部 12 个历史信号文件（15660 votes），按 `providerId/modelId` 组合键分组。
- 标准化 modelId（GLM-5→glm-5, qwen3.5-plus→qwen3.6-plus），旧数据无 provider 时只显示模型名。
- 前后端类型新增 `modelId/providerId/providerName/displayName`，`llm-inference.ts` vote 记录 provider（含 fallback）。
- 修复后显示 6 组：rules(5220) + glm-5(4177) + qwen3.6-plus(2726) + mimo-v2-pro(1988) + kimi-k2.5(1033) + kimi-for-coding(516)。commit `ec62c92`。

### 2026-04-16 (session 2) v1.29.16 — 自选股票 3 Bug
- **Bug 1（严重）**：同花顺 K 线源字段解析顺序错误。API 返回 `[date, open, high, low, close, ...]`，代码按 `[date, open, close, high, low, ...]` 解析导致所有 K 线蜡烛图显示为阳线。修复：`service.ts:948` 解构顺序改正，`:959` previousClose 索引 `[2]` → `[4]`。
- **Bug 2**：`getWatchlistWithQuotes()` name 优先级调整，避免腾讯 API 的 GBK 乱码。
- **Bug 3**：AIQuantApp 容器在 watchlist tab 条件性使用 `overflow-hidden`，配合 SVG `height=100%` + flex 布局确保一屏显示。
- 清除全部 500 个错误 K 线缓存后验证：OHLC 错误数 0，阳线 31/阴线 29。commit `0efe6d8`。

### 2026-04-16 v1.29.14 — 策略页 OHLC 行情展示 + README 更新
- 数据采集层（东方财富等）已获取完整 OHLC，但 `buildSnapshot()` 丢弃了 `open/high/low/previousClose`。
- 后端 `types.ts` + `buildSnapshot()` 补齐 4 字段，前端 `utils.ts` 新增 `formatPrice()`，`StrategiesTab.tsx` 左右双栏展示现价/开/收/高/低 + 涨跌幅颜色。
- README 更新：重点突出天华新能 04-13 当天涨 +17.42% 的高光交易。commit `707eb6e` + `5b44173`。

### 2026-04-13 ~ 2026-04-09 (v1.29.x 系列)
- **v1.29.13**：晨间补充数据采集（07:30 cron 只跑 Phase 4+5，合并到前一个交易日事实池）。
- **v1.29.11**：记忆复盘页面 UI 重写为 KPI 条带 + grid-cols-5 双层布局，信息密度大幅提升。
- **v1.29.10**：记忆复盘 7 个 bug 修复（B1-B7）：buildWeeklySummary/MonthlySummary 的 winRate/cumulativeReturn/maxDrawdown 从未计算；`calculatePerformance()` cumulativeReturn 从加权平均改为简单求和；trades.json 回填历史 buyDate/sellDate。
- **v1.29.9**：Conviction Filter 门槛统一下调 2 分（覆盖 5 种 regime，补全 high_volatility/low_volatility_range）；Override 追踪机制（override vs system 交易胜率分开统计）；Override 正反馈信号放宽（watch 在无否决+分差<5+胜率>60%+样本>=3 时升级 buy）。
- **v1.29.x 盘后回退护栏**：`data-agents.ts` 把 fact-pool 最近成功快照回退抽成独立逻辑，对 macro_economy / social_sentiment / global_markets 做最小兜底（宏观有效字段<=1/社交样本<3/全球市场字段=0 时回退）。
- **v1.29.x T+1 约束**：`closeStockAnalysisPosition` / `reduceStockAnalysisPosition` 加 T+1 校验；买入仓位允许前端输入"目标仓位(%)"；`RiskTab` 显示买入时间 + T+1 标签；`StrategiesTab` 买入表单升级为百分比 + 滑条 + 剩余仓位提示；`MemoryTab` 显示持有天数 + 原因。
- **v1.29.x 数据源可用性**：东方财富 push2his 全球市场失效→接 Yahoo Finance 备用；Python/AKShare 超时统一继承各 Agent `timeoutMs`（从 60s 默认 → 600000ms）；`createAgentResult` 成功率改为 `dataPoints/(dataPoints+errors)`。
- **行业趋势升级**：`buildIndustryTrendMap` 基于真实股票池行业名 + 真实个股 K 线聚合 20/60 日收益，生成 `industryTrendStrength` 百分位；`snapshot` 新增 `industryReturn20d/60d/industryTrendStrength`。只在 daily run 主链路计算，overview 路径宁可留空也不伪造。
- **评分口径分离**：`StockAnalysisSignal` 新增 `scoreBonus`，`compositeScore` 明确表示基础分，`finalScore` 表示决策分；持仓复评的 `scoreDelta` 只比较基础分，避免被买入时一次性 bonus 扭曲。

### 2026-04-12
- **v1.29.11/10**：记忆复盘 UI 重写 + 7 bug 修复（见上）。
- **公开仓库安全审计 + 硬编码清除**：完成 13 处硬编码路径替换（`/home/chriswong` → `${HOME}` / `path.join(tempHome, ...)`）；Git 作者改为 GitHub noreply；amend commit `2db0f5a` + force push。

### 2026-04-08 ~ 2026-04-07 (v1.18-v1.27 系列)
- **技术/量化五维升级**：技术分 = trend/momentumConfirmation/structure/participation/risk；量化分 = mediumTermMomentum/crossSectionalStrength/liquidityQuality/stability/meanReversion。引入 RSI/MACD/ATR/MA120/多周期动量/均线斜率/支撑阻力距离，全部基于真实 K 线。候选池从 30 扩到 60。
- **横截面动量**：`buildCrossSectionalMomentumMap` 计算 20/60 日收益百分位，接入 `crossSectionalStrength`。daily run 候选信号与持仓评估共享同一轮 rank 基准。
- **行业强弱**：东方财富 `f100` 行业字段 + 腾讯主源回退股票池真实行业名（不再代码前缀猜测）。`buildIndustryStrengthMap` 计算行业平均涨跌幅 + 上涨家数占比 + 强弱百分位。
- **v1.27.0 滴答 OpenAPI 接入**：根因——`routes/index.ts` 未挂载 dida 路由（404）+ `server.ts` BasicAuth 拦截 OAuth callback + `router.all('/proxy/*')` 在 Express5 触发 path-to-regexp 崩溃。修复：免鉴权白名单 + 改为正则 `^/proxy/.+` + OAuth2 重写（含 refresh_token）+ 前端全链路打通（project CRUD / task CRUD / 多选批量 / 拖拽排序）。
- **v1.26.0 全量本地化日志系统**（14 步）：sa-logger.ts 按天分割业务日志 + LLM JSONL + 前端上报 + 审计 + 30 天自动清理。修复 Winston 3 问题（路径错位/无轮转83MB/debug被丢弃）。前端 `logger.ts` + `ErrorBoundary` 防白屏。
- **v1.26 通知系统完整落地**：后端 `notifications/{types,store,service}.ts` + `/api/system/notifications` + SSE `/stream`；前端 `useNotificationStore` 后端驱动 + 6s 轮询兜底（SSE BasicAuth 失效）+ 本地 optimistic 注入；`createAppNotifier(appId)` SDK；下载管理 + 滴答 + AI 炒股接入（仅关键失败，失败不阻塞业务）。AI 炒股通知三层：执行层/风控层/数据可靠性层，`riskPriority: critical/high/medium`。
- **v1.25.1 东方财富 API 适配**：`getNewsByColumns` 新增必填参数且返回空；替换为 `newsapi.eastmoney.com/kuaixun` JSONP + `push2his.eastmoney.com` 逐只行情（100.SPX/100.NDX/100.HSI）+ `reportapi.eastmoney.com` 独立研报 API；UA 升级为完整浏览器 UA。
- **v1.25.0 P2 清零（20 问题）**：13 投资准确性（compositeScore 去重/Kelly 实际盈亏比/neutral 纳入 consensus/confidence z-score/holdingDays 交易日/加权 cumulativeReturn/neutral 阈值 0.5%/记忆衰减 0.8/Provider 熔断/AKShare 列名防御/buyCompositeScore 默认 65）+ 7 稳定性（withFileLock 队列/writeJson fsync/tmpPath 随机因子/trades 上限/scheduler 时区/trySource 重试）。
- **v1.24.0 全面复盘（3 P0 + 16 P1）**：P0 todayDate Asia/Shanghai / 买入二次确认 / 交易操作 withFileLock；P1 previousTradeDate 交易日窗口 / 止损重算 / 加权一致 / 极端熊市流动性检查 / maxTotalPosition / 风控暂停自动恢复 / 组合风控交易日窗口 / LLM `<think>` 剥离 / 文件损坏自动备份 / runPythonJson 60s 超时 / bootstrap 重置 running / data-agents 11 处 except success / 公告跨源去重。
- **v1.23 低流动性护栏最小化配置**：`lowLiquidityGuardrail` 可配置成交额分位阈值、危机判定广度、扣分值、仓位上限。重做危机判断：不再允许 `volumePercentile<0.10` 一票否决，要求"缩量+普跌+悲观情绪"同时成立。
- **v1.22 盘后 3 小时批处理窗口**：`POST_MARKET_BATCH_WINDOW_MS`，各 Phase 边界检查 deadline。
- **v1.21 LLM 韧性**：单模型超时 360s，单股票专家投票总预算 30min；取消"整轮超时即全部作废"，改为保留已成功的 LLM 票；sentiment_analyzer JSON 解析修复（优先解析最外层对象，避免把 hotTopics 数组误识别）。
- **v1.20 Kimi Coding 协议适配**：`llm-provider-adapter.ts` 按 provider+model 选择协议，`api.kimi.com/coding+kimi-for-coding` 自动切到 Anthropic `/v1/messages`。
- **v1.19 交易日历在线同步**：AKShare 同步 + 节假日修正（按国办发明电〔2025〕7号）。
- **v1.18 AI 炒股前端实时刷新**：`autoRefresh.ts` 盘中 30s / 非盘中 60s + focus/visibility/online/关键时间边界（09:15/09:25/09:30/11:30/13:00/14:57/15:00/15:05/16:00）。

### 2026-04-04 ~ 2026-04-03 (v1.10-v1.17)
- **v1.10-v1.13 Phase 1-5 AI 炒股骨架**：市场状态检测 / 初筛 / 三流评分（专家组）/ Conviction Filter / 持仓交易日志。真实股票池中证 500 成分股。
- **v1.14-v1.16 LLM 专家系统**：45 位专家（30 LLM + 15 规则），provider 池（阿里云/智谱/MiMo/Kimi），投票共识机制，confidence 归一化。
- **v1.17 记忆系统**：策略版本演进日志 + 行为画像（Mood/Stress + 偏差克服进度）+ 风险自担确认书硬核拦截（失控时输入特定文本才能推翻 AI）。

### 2026-04-02 及更早
- **AI 炒股原型 → 真实产品骨架**：从纯前端 Mock 升级为真实 API 驱动（市场状态/候选信号/持仓风控/交易记录/观望日志/模型组表现）。
- **Reader 重构为每日简报**：工作目录统一 `/home/chriswong/文档/RSS资讯`，OpenClaw 按 ingest-spec 投递 JSON 到 `inbox/pending/`，ClawOS 负责扫描/导入/去重/分类/生成简报（`feeds/` + `briefs/`）。RSS 分类异常 `author` 字段统一为字符串。Reader 新增 AI 全文翻译按钮 + AI 摘要（复用 OpenClaw 当前模型配置）+ 当天全量分页（30 条/次滚动加载）。
- **随手小记**：树形文件管理（文件夹/右键菜单/面包屑/ClawOS 风格弹窗/拖拽/内联重命名/定位高亮）；持久化为真实 `.md` 文件（legacy notes.json 自动迁移）；TipTap WYSIWYG + Markdown 存储；任务列表 + 图片拖拽上传到 `assets/`；queued atomic writes 修复并发写入竞态；中文路径走 query/body 而非 header。
- **音乐**：Local Music Pro（music-metadata ID3 + Netease 智能 fallback 填充封面/歌词）、Netease 沉浸式 SU7 风格歌词、playback token 防止快速切歌竞态、备份 netease_tracks.json 原子写入（修复 30 唯一→只保留 3 的 race）、本地音频媒体流 Cookie 鉴权。
- **下载**：aria2 RPC 业务层封装（engine status / task listing / history cleanup / 配置持久化）；buckets（下载中/排队中/已暂停/失败/已完成）；一键清理选项（保留本地文件）。
- **网盘**：AList 代理 + Quark 单凭证自动配置（credentials 写入 `addition` JSON）+ Quark 网页登录（proxy `pan.quark.cn` + `uop.quark.cn` + 注入 request-rewrite 脚本绕过 CORS）。
- **OpenClaw embed**：trusted-proxy-auth 模式（`x-forwarded-user: clawos`），解除 pairing required；token bootstrap 从 sessionStorage 同步到 iframe `#token=` fragment。
- **服务监控**：两层可用性（process state + health probe）、中文友好描述、三层备份看板（restic+OSS / Timeshift / ClawBackUp）、`VERSIONS.md` 索引对比。
- **安全加固**：ClawOS 绑定 127.0.0.1:3001（仅 Tailscale Funnel 暴露），自定义鉴权中间件（不弹浏览器原生弹窗），FileBrowser/AList/aria2/SearXNG 全部 local-only，AList/aria2 强密码 + 环境变量，前端 LoginScreen 内存鉴权（刷新需重新输入）。
- **设置服务端化**：desktop 偏好（dockSize/autoHideDock/defaultFullscreen/wallpaper/showWidgets/musicQuality/quickNote）+ 路径配置中心（downloads/local music/netease/video/notes/readerDir/stockAnalysisDir）全部持久化到 `/api/system/config/ui`，远程会话体验接近"真实远程桌面"。
- **桌面 widgets**：`auto-rows-[160px]` 网格 + Dida 双高主卡片 + 系统状态合并卡片；`musicBridge.ts` 持久化内存桥替换一次性事件链。
