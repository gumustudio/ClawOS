# Changelog

## [1.35.13] - 2026-04-29 — AI 炒股弱牛市与追高风控修复
### 修复
- **[市场状态] 热股榜不再冒充社交情绪**：东方财富热股/人气榜改为中性热度源，不再参与多空情绪聚合；市场状态现在使用多源情绪，避免“100% 看多”的热度榜把弱广度行情误判成乐观牛市。
- **[策略门槛] 弱广度/悲观情绪下不再按牛市放宽**：当 `bull_trend` 同时出现 `risingRatio < 0.45` 或 `sentiment=pessimistic` 时，策略改用普通震荡体制的阈值和权重，避免纯指数趋势带动过度买入。
- **[Conviction Filter] 修复 bull_trend 门槛被自动学习压到 60 的问题**：自动阈值调整现在至少需要 20 笔已平仓样本，且按市场体制设置安全地板；真实运行配置已把 `bull_trend.minCompositeScore` 恢复为 `70`。
- **[三流融合] 提高专家流最低权重**：学习权重调整后专家流最低占比从 `25%` 提升到 `32%`，避免技术/量化在专家明显分歧时单独把信号冲成买入。
- **[追高风控] 新增过热动量惩罚**：`RSI > 70`、`pricePosition20d > 0.95`、`20日涨幅 > 30%` 会扣分；多项同时触发或 20 日涨幅极端时，买入信号强制降级为 `watch`。
- **[专家共识] 只对极低共识强制降级**：普通低于门槛的专家共识仍进入综合评分，但 `consensus < 0.42` 会阻止技术/量化单独升级为 `buy/strong_buy`。

### 测试
- 更新 `backend/tests/socialSentiment.test.ts`、`backend/tests/stockAnalysisService.test.ts`、`backend/tests/stockAnalysisScoringUpgrade.test.ts`，覆盖热度源中性化、多源情绪降级、专家权重下限、追高降级、弱牛市门槛、自动阈值样本下限与 bull floor 恢复。

## [1.35.12] - 2026-04-26 — AI 炒股模型组胜率链路修复
### 修复
- **[记忆复盘 / 模型组表现] 修复“有预测次数但胜率 0%”的数据链路问题**：`extractMemoryEntriesFromSignals()` 不再跳过规则专家和 fallback 投票，daily-memory 与 expert-performance 现在保留实际 `modelId/providerId/providerName/assignedModelId/usedFallback`，避免 `kimi-for-coding (Kimi)`、`glm-5.1 (OpenCodeGo)` 等模型因为缺专家表现样本而显示 0%。
- **[模型组统计] 改为优先从完整 `daily-memories` 聚合已结算胜率**：`model-groups` 不再依赖 `expert-performance.recentOutcomes` 的 50 条截断窗口；`expert-performance` 只作为专家权重来源和旧数据兜底，避免模型切换后旧模型胜率被截断成 0%。
- **[历史数据回填] 新增 `rebuildExpertPerformanceFromSignals()`**：可从历史 `signals/*.json` 重建 `expert-performance.json` 与 `daily-memories`，用于修复旧数据断档。

### 运行处理
- 已备份真实 `experts/expert-performance.json` 与 `experts/model-groups.json` 到 `experts/backups/`。
- 已对 `/home/chriswong/文档/AI炒股分析` 执行历史重建：回填 `45` 位专家、`10260` 条结算样本；`kimi-for-coding (Kimi)` 胜率变为 `38.32%`，`glm-5.1 (OpenCodeGo)` 胜率变为 `39.49%`，规则引擎胜率变为 `35.73%`。

### 测试
- 更新 `backend/tests/expertPredictionDualTrack.test.ts`，覆盖规则专家/fallback 投票提取、expert-performance 同步、历史 signals 重建与 outcome 日期顺序。
- 更新 `backend/tests/stockAnalysisModelGroupsReset.test.ts`，覆盖按实际 provider/model 聚合胜率，以及优先使用完整 daily-memories 避免 recentOutcomes 截断。
- 后端定向测试、`npm run test:build`、`npm run build` 通过。

## [1.35.11] - 2026-04-23 — AI 炒股系统说明页更新到当前真实逻辑
### 变更
- **[AI 炒股 / 系统说明] 重写“系统说明”页面文案**：按当前真实代码逻辑更新时间线、页面功能、自动执行、盘中监控、实时行情、组合风控和本地存储说明，去掉过期口径。
- **[时间线] 补充 09:31 开盘自动执行与盘中 `realtime` 刷新语义**：明确 `strong_buy` 自动买入、`buy/watch` 自动忽略，以及 `snapshot` 与 `realtime` 的职责分离。
- **[风控说明] 修正组合风控语义**：页面现在明确“日/周/月/回撤都会进入风险状态，但真正触发暂停新开仓的是月度亏损超限或最大回撤超限；暂停后仍允许平仓/减仓”。
- **[页面导航] 说明页同步补入“自选股票”页面**：强调其作用是全市场观察，不参与中证500主策略自动交易。

## [1.35.10] - 2026-04-22 — AI 炒股新增盘中自动止盈阈值
### 新增
- **[盘中自动平仓] 新增“盘中自动止盈阈值 (%)”全局配置项**：`strategy.json` 新增 `intradayAutoCloseProfitPercent`，默认值为 `10`。当持仓在交易日连续竞价时段内盘中盈利达到该阈值时，系统会自动执行全平仓卖出。

### 变更
- **[盯盘自动退出] 自动止损与自动止盈统一走同一套盘中平仓链路**：`pollIntradayOnce()` 现在同时处理“亏损超过阈值自动平仓”和“盈利达到阈值自动止盈平仓”，都复用 `closeStockAnalysisPosition()`，并写入对应审计备注。
- **[AI 炒股 / 全局设置] 盘中自动平仓区域新增“自动止盈阈值 (%)”输入框**：页面说明明确为“亏损触发止损平仓 / 盈利触发止盈平仓”两套盘中强制退出规则。

### 测试
- 更新 `backend/tests/stockAnalysisRoutes.test.ts`，覆盖 `intradayAutoCloseProfitPercent` 的读取与持久化。
- 更新 `backend/tests/stockAnalysisV135Fixes.test.ts`，新增“盈利达到 10% 自动止盈平仓”和“止盈阈值可配置”的回归。

## [1.35.8] - 2026-04-22 — AI 炒股月度亏损阈值改为全局可配
### 修复
- **[组合风控] 日度/周度亏损暂停阈值也改为全局可配置**：`portfolioRiskLimits.maxDailyLossPercent`、`maxWeeklyLossPercent`、`maxMonthlyLossPercent` 现在统一通过 AI 炒股“全局设置”页面修改，默认值分别为 `10% / 20% / 30%`。
- **[组合风控] 月度亏损暂停阈值改为全局可配置，默认值从 `10%` 调整为 `30%`**：`portfolioRiskLimits.maxMonthlyLossPercent` 现在通过 AI 炒股“全局设置”页面直接配置，避免轻微月度回撤就触发整套交易暂停。
- **[风控状态] 保存阈值后立即重算暂停状态**：更新全局配置时会立刻基于当前交易记录重算 `riskControl`，如果旧的 `10%` 已触发暂停但新的 `30%` 不再触发，会自动解除暂停，不再要求用户等待下一次后台任务。
- **[交易语义] 风控暂停不再禁止平仓/减仓**：`paused=true` 现在只禁止新增风险（如买入），不再阻止用户平仓或减仓退出风险，修正“越风控越不让止损”的错误行为。

### 变更
- **[AI 炒股 / 全局设置] 新增“日度 / 周度 / 月度亏损暂停阈值 (%)”表单**：页面说明明确这些阈值都是组合级新开仓闸门，并说明保存后会立即重算当前暂停状态。
- **[风险页文案] 收口“交易暂停”措辞**：风险页改为“新开仓限制 / 组合风控限制”等更准确的表述，避免和“禁止平仓/减仓”产生误解。

### 测试
- 更新 `backend/tests/stockAnalysisRoutes.test.ts`，覆盖月度阈值保存、配置持久化，以及保存后自动解除错误暂停。
- 更新 `backend/tests/stockAnalysisV135Fixes.test.ts`，改为覆盖“风控暂停时仍允许平仓/减仓退出风险”。

## [1.35.7] - 2026-04-22 — AI 炒股新增全局设置页
### 新增
- **[AI 炒股 / 全局设置] 新增独立“全局设置”页面**：在 AI 炒股左侧导航增加 `全局设置` tab，用于承载系统级策略参数，避免把这类全局行为配置混进单只股票或 AI 模型页面。
- **[盘中自动平仓] 亏损阈值改为可配置**：`strategy.json` 新增 `intradayAutoCloseLossPercent`，默认 `5`。盘中轮询自动平仓不再写死 `-5%`，而是按该配置执行。

### 变更
- **新增 `PUT /api/system/stock-analysis/config`**：当前支持从前端保存 `intradayAutoCloseLossPercent`，并在后端做数值校验（`0-100`）。
- **全局设置页文案明确行为边界**：页面说明已强调该阈值仅在“交易日连续竞价时段”的盯盘轮询里生效，午休、收盘后与休市日不会触发自动卖出。

### 测试
- 更新 `backend/tests/stockAnalysisRoutes.test.ts`，覆盖配置读取与 `PUT /config` 持久化。
- 更新 `backend/tests/stockAnalysisV135Fixes.test.ts`，新增“盘中自动平仓读取配置阈值”的回归。
- 新增 `frontend/src/apps/AIQuant/components/GlobalSettingsTab.test.ts`。
- backend 定向测试通过，frontend 定向测试通过，frontend/backend build 通过。

## [1.35.6] - 2026-04-22 — 盘中亏损超 5% 自动全平仓
### 新增
- **[盘中监控] 持仓盘中亏损超过 5% 时自动全平仓**：`pollIntradayOnce()` 新增自动止损卖出逻辑；当持仓实时亏损 `<= -5%` 且当前处于 A 股交易日连续竞价时段时，系统会直接复用现有平仓链路按实时价执行 `closeAll`，并写入“系统盘中自动止损平仓”审计备注。

### 约束
- **仅限盯盘期间真实交易时段触发**：自动平仓严格依赖 `checkTradingAvailability().canTrade`。午休、15:00 后、周末和法定休市日，即使盘中监控仍在运行、即使亏损已超过 5%，也不会自动卖出。

### 测试
- 更新 `backend/tests/stockAnalysisV135Fixes.test.ts`，新增两条回归：交易时段内亏损超过 5% 自动平仓；非交易时段不自动平仓。
- 后端定向测试通过，backend build 通过。

## [1.35.3] - 2026-04-22 — 模型组表现重置语义修复
### 修复
- **[记忆复盘] expert-performance 清空后不再误读旧 model-groups 缓存**：`getStockAnalysisOverview`、`generateWeeklyReport`、`generateMonthlyReport` 现在统一以 `expert-performance.entries` 是否存在为准；若已重置且暂无新样本，模型组表现返回空列表，而不是继续展示旧缓存或历史全量聚合结果。
- **[daily run] 空样本状态不再把旧模型组统计重新写回磁盘**：当专家表现样本为空时，daily run 持久化 `model-groups.json` 为 `[]`，避免下一次任务又把重置前口径刷回来。

## [1.35.4] - 2026-04-22 — 模型组表现改为当日收盘结算
### 变更
- **[模型组表现 / 动态权重] 改为预测日当天收盘结算**：盘后 `runDailyMemoryUpdate` 现在直接用当日 `signal.realtime.changePercent`（无则回退 `snapshot.changePercent` / `quote cache`）结算专家预测结果，并同步写入 `expert-performance.json`。模型组表现和专家动态权重不再等待平仓，也不再依赖 5 日预测。
- **[权重学习语义收口] 停止把平仓 pnl 混入专家预测表现**：卖出路径不再异步调用旧的 `updateExpertPerformance`；专家/模型组表现统一以“开盘前预测，收盘后当日结算”作为主口径，避免持仓周期把模型表现拖迟或扭曲。
- **[记忆系统] 移除 5 日预测统计链路**：删除 `T+5` 回填和 `1d/5d` 双轨胜率累加逻辑，`ExpertDailyMemoryEntry` 保留原字段名以兼容旧数据，但语义已改为“当日收盘结算结果”。
- **[前端文案] 专家分析页将“次日收益”改为“当日结算”**，避免继续误导当前结算口径。

### 测试
- 新增 `backend/tests/stockAnalysisModelGroupsReset.test.ts`，覆盖 overview / 周报 / 月报三条路径在“expert-performance 已清空但旧 model-groups 仍存在”时的回归行为。
- 后端定向测试通过，backend build 通过。

### 测试
- 新增 `backend/tests/stockAnalysisModelGroupsReset.test.ts`，覆盖 overview / 周报 / 月报三条路径在“expert-performance 已清空但旧 model-groups 仍存在”时的回归行为。
- 重写 `backend/tests/expertPredictionDualTrack.test.ts`，改为覆盖“当日 realtime 收盘结算”和 `expert-performance` 同步累加/幂等。
- 后端定向测试通过，backend build 通过，frontend build 通过。

## [1.35.2] - 2026-04-21 — AI 炒股通知激进精简（去重降噪）
### 变更
- **AI 炒股主动操作成功提示降为页面内 toast**：手动运行今日分析、一键自动执行、刷新股票池、确认/拒绝/忽略信号、平仓、减仓、忽略卖出提醒、手动盘后分析、盘中监控启停，不再同时写系统通知中心，避免“一次操作三处弹”。
- **主动操作失败只在高风险场景升级为系统通知**：默认仅本页 toast；仅当风控已暂停或数据状态不正常时，才追加系统级高危通知。
- **系统通知白名单收口**：AI 炒股系统通知只保留高风险被动事件：风控暂停/恢复、数据状态异常/恢复、`stop_loss`、`daily_loss_limit`。`take_profit`、普通减仓建议、换仓建议不再写系统通知。
- **AI 炒股关键通知历史去掉流水账**：顶部“关键通知历史”现在只展示 `risk/data/intraday` 且 `critical/high` 的事件，不再重复展示 execution/analysis 成功提示。
- **持仓提醒与盘中预警去重**：盘中监控运行时，不再让持仓动作提醒与 intraday alert 双重推送；critical 预警沿用系统通知，页面内仍保留 `DashboardTab` 告警横幅和 `StrategiesTab` 待处理卖出入口。

### 新增
- 新增 `frontend/src/apps/AIQuant/notificationPolicy.ts`，集中管理 AI 炒股通知分层规则。
- 新增 `frontend/src/apps/AIQuant/notificationPolicy.test.ts`，覆盖关键通知白名单与升级条件。

### 测试
- 前端测试 64/64 通过。
- frontend build 通过。

## [1.35.1] - 2026-04-21 — 第 5 批 P0 修复（前端契约 + 日志治理 + systemd secrets）
### 修复（P0）
- **[A9-P0-1] 前端 DecisionSource 契约补齐**：`frontend/src/apps/AIQuant/types.ts` 新增完整 `DecisionSource` 7 值枚举并贯通到 `StockAnalysisSignal` / `ExpertAnalysisResponse`；`dashboardMeta` 行为统计把 `system_auto_buy` 计入 execution、`system_auto_ignore` 计入 ignore，修复自动决策在前端统计与展示漏计问题。
- **[A4-P0-2] 前端交易请求补全 clientNonce**：`closeStockAnalysisPosition` / `reduceStockAnalysisPosition` 自动附带 `clientNonce`，降低双击与网络重试导致的重复操作风险。
- **[A10-P0-2] SA 日志总量治理**：`sa-logger.ts` 新增 30 天保留 + 128MB 总量上限的双层清理策略，并把旧 `stock-analysis-debug.log` 纳入清理；同时加入按小时惰性触发，避免服务长期不重启时日志继续失控。
- **[A10-P0-3] 收口业务日志双写**：`saLog` 改为本地业务日志文件单一事实源，只将 `warn/error` 镜像到 Winston，避免 `info/debug` 再重复写入 `backend-out.log`。
- **[A10-P0-1] systemd 明文 secrets 外移**：`~/.config/systemd/user/clawos.service` 改用 `EnvironmentFile=/home/chriswong/.config/clawos/clawos.env`，服务单元不再内嵌 AList/Aria2 凭据；env 文件权限收紧为 `600`。

### 测试
- 新增 `backend/tests/stockAnalysisSALogger.test.ts`，覆盖旧 debug 日志与过期日志清理。
- 更新 `frontend/src/apps/AIQuant/dashboardMeta.test.ts`，补自动决策统计测试并同步现行 Overview 类型契约。
- 更新 `frontend/src/apps/musicViewCache.test.ts`，补齐缓存快照新字段。
- 前端测试 64/64 通过，后端测试 277/277 通过，frontend/backend build 均通过。

### 运行验证
- `systemctl --user daemon-reload && systemctl --user restart clawos.service` 成功。
- `systemctl --user show clawos.service --property=EnvironmentFiles` 确认已加载 `/home/chriswong/.config/clawos/clawos.env`。
- 真实调用 AI 炒股接口后，日志目录从 `228MB` 回收到 `1.8MB`，`stock-analysis-debug.log` 已清除。

## [1.35.0] - 2026-04-21 — 第 2 批 P0 修复（数据正确性）
### 修复（P0）
- **[A1-P0-1] 修复 Tencent qt GBK 乱码**：`fetchBatchFromTencent` 用 `TextDecoder('gbk')` 正确解码，不再用 `binary` 编码导致中文特殊字节与 `~` 分隔符冲突产生字段错位。
- **[A1-P0-2] parseTencentQtFundamentals 哨兵校验**：新增 4 层哨兵（名称 CJK 字符 / 最新价正数 / PE [-200,2000] / PB [0,100]），任一失败返回 null 并 warn，外层走 fallback。修复"社区接口字段顺序变化静默写入污染缓存"。
- **[A1-P0-3] 跨年交易日历懒加载**：`getRecentTradeDates` 回溯到未加载年份时触发磁盘缓存异步加载；`validateAndSyncCalendarOnStartup` 在 1-3 月预加载上一年缓存。避免节后首日 K 线对齐错位。
- **[A1-P0-4] 修正 successRate 口径**：`createAgentResult` 新增源级成功率参数；向后兼容路径把 errors 权重提升到 10x（防止 100 条数据 + 4 个源失败仍算 96% 这种虚高）。
- **[A4-P0-3] T+1 时区安全**：`assertPositionCanSellToday` 优先用 `position.openDate`（北京日期），否则用 Asia/Shanghai 时区转 openedAt。修复跨 UTC 午夜买入 → 当天北京日期卖出可绕过 T+1 的 bug。
- **[A1-P1-4] PE=0 转 null**：亏损股 PE 返回 0 时转为 null，避免 LLM 误判"价格远低于盈利"。

### 测试
- 新增 `tests/stockAnalysisV135Batch2.test.ts` 8 个单元测试
- 更新 `fundamentalsBlock.test.ts` / `stockAnalysisDataAgents.test.ts` 期望值适应新 successRate 公式
- 全套件 266/266 通过 0 回归

## [1.35.0] - 2026-04-21 — 第 1 批 P0 修复（资金安全 + 信号状态保护）
经过 10 agent 全栈审计 + 源码级交叉验证，第一批修复 6 个资金安全关键 bug。

### 修复（P0）
- **[A2-P0-1] 修复 dashboard race 幽灵持仓**：`getStockAnalysisOverview` 现在在 `TRADING_LOCK_KEY` 锁内重读 positions 再计算行情运行时字段，避免与 close/reduce 并发时用陈旧快照覆盖。已平仓的仓位不会被复活。
- **[A4-P0-1] 风控暂停时禁止卖出**：close / reduce / dismissPositionAction 三个路径新增 `riskControl.paused` 强校验，paused=true 时直接抛错并写入 risk event，防止自动风控触发后仍可继续卖出。
- **[A4-P0-2] 平仓 / 减仓幂等性保护**：
  - `position.lastTradeAt` 字段：2 秒内同一仓位重复操作直接拒绝
  - `clientNonce` 机制：前端 uuid v4 透传，60 秒内同 nonce 直接拒绝，防止网络重试 / 双击扣两倍仓位
- **[A3-P0-1] Daily 重跑保留用户决策**：`saveStockAnalysisSignals` 改为读旧文件按 ID 合并，已有 `decisionSource ∈ {user_confirmed, user_rejected, user_ignored, user_override}` 的信号必须保留用户态字段。防止手工重跑 daily 后 user 状态被洗白、可再次确认导致重复开仓。
- **[A3-P0-2] weight 参数强校验**：`confirmStockAnalysisSignal` 拒绝 NaN / Infinity / 负值 / 零 / 超界 (> 1) 的 weight，不再做静默 clamp。`reduceStockAnalysisPosition` 同步拒绝 NaN weightDelta。
- **[A2-P0-3] dismissPositionAction 加 TRADING_LOCK_KEY**：避免与 close/reduce 并发 race 导致 lost-update。

### 架构
- 新增 `StockAnalysisPosition.lastTradeAt` 字段
- 新增 `StockAnalysisTradeRequest.clientNonce` 字段
- 新增 `reduceIdempotencyCache` 模块级 Map（LRU 自清理，200 条上限）
- 新增 `SA_BYPASS_TRADING_HOURS` test-only env（仅 NODE_ENV=test 生效）

### 测试
- 新增 `tests/stockAnalysisV135Fixes.test.ts`：14 个单元测试全部通过
- 全套件 258/258 通过，0 回归

## [1.33.0] - 2026-04-19
### 重大 - LLM 专家预测系统全面根治改造（P0 + P1 六项）
针对 30 个 LLM 专家预测准确率长期偏低的问题，一次性做完 6 项根因改造：

#### P0 - 上下文稀缺根治（专家看不到该看的数据）
- **P0-1 技术指标注入 prompt**：RSI14 / MACD / ATR / 行业相对强度（industryStrength）原本只存在快照里、不进 prompt。现在 `buildStockContext` 按"技术指标"层注入，全专家强制可见（不走 `infoSubset`）
  - 文件：`llm-inference.ts` 新增 `buildIndicatorBlock`
- **P0-2 近 30 日 OHLC 摘要**：专家完全看不到历史 K 线，无法做趋势 / 形态判断。现在压缩成 ~1500 中文字符注入 prompt：
  - 统计概览（均价、最高最低、总涨跌幅、平均换手）
  - 近 10 日逐日简报（OHLC+成交量）
  - 早期 20 日折叠为 5 段摘要
  - 关键形态（连涨/连跌天数、最大单日振幅）
  - 文件：`llm-inference.ts` 新增 `buildKlineDigest`
- **P0-3 FactPool 拆分 global + perStock**：原本公告 / 行业新闻用全局 factPool，导致贵州茅台看见宁德时代的公告，LLM 被无关信息污染。现在每只股票构建专属 summary：
  - 公告：本股优先、补全局 major
  - 行业新闻：按 `snapshot.sector` 过滤，本行业优先
  - 文件：`memory.ts` 新增 `buildFactPoolSummaryForStock`

#### P1 - 反馈闭环根治（自我提升机制失灵）
- **P1-1 次日收益校准（三轨胜率）**：原本只用持仓平仓盈亏校准，样本稀少（不卖就没反馈）。现在每天盘后三轨并行更新：
  - `winRatePosition`：持仓实际 pnl 胜率（保留原逻辑）
  - `winRate1d`：T+1 日预测方向胜率（|return| < 0.5% 记 neutral）
  - `winRate5d`：T+5 日预测方向胜率，盘后 `backfill5dResults()` 补齐
  - 文件：`memory.ts`（`backfill5dResults`、`updateExpertPredictionStats`）+ `service.ts`（Phase 7 挂接）
- **P1-2 基本面注入 prompt**：PE / PB / ROE / 总市值 原本完全缺失，基本面专家只能胡猜。现在每日按需抓取 + 本地缓存过夜失效：
  - 数据源：Tencent qt 接口（`qt.gtimg.cn`）批量抓取，项目已验证稳定
  - 缓存路径：`{stockAnalysisDir}/cache/fundamentals/{code}.json`
  - 过夜失效：`fetchedDate != today` 则重抓
  - prompt 注入："公司基本面"层，按"<0 亏损 / 15-25 正常 / >40 高估"等业务语义标注
  - 文件：新建 `fundamentals.ts`；`llm-inference.ts` 新增 `buildFundamentalsBlock`
- **P1-3 移除 stance 预设结论**：原本 STANCE_GUIDE 告诉专家"你是看多派 / 看空派 / 中立派"，导致专家不看数据直接按 stance 输出结论。现在改为"你的职责是诚实分析"，`buildFallbackVote` 也去除 stance 偏置
  - 文件：`llm-inference.ts` 重写 STANCE_GUIDE

### 新增
- `backend/src/services/stock-analysis/fundamentals.ts`（166 行）：Tencent qt 批量抓取 + 缓存管理
- 测试文件（45 测试全通过）：
  - `tests/llmPromptEnrichment.test.ts`（P0-1 + P0-2，10 测试）
  - `tests/llmStanceNeutralization.test.ts`（P1-3，6 测试）
  - `tests/factPoolPerStock.test.ts`（P0-3，8 测试）
  - `tests/expertPredictionDualTrack.test.ts`（P1-1，7 测试）
  - `tests/fundamentalsBlock.test.ts`（P1-2，14 测试）

### 修改文件
- `backend/src/services/stock-analysis/types.ts`：新增 `StockFundamentals`、扩展 `ExpertDailyMemoryEntry` / `StockAnalysisExpertPerformanceEntry` / `StockAnalysisExpertOutcome`（1d / 5d 胜率 + source 标识）
- `backend/src/services/stock-analysis/llm-inference.ts`：三段 prompt 块（技术指标 / K线摘要 / 基本面）+ STANCE_GUIDE 重写 + 函数签名链路加 `fundamentals`
- `backend/src/services/stock-analysis/memory.ts`：FactPool 拆分 + `backfill5dResults` + `updateExpertPredictionStats`
- `backend/src/services/stock-analysis/service.ts`：
  - 主流程预取 `fundamentalsMap`（candidatePool + 持仓）并传给 `buildSignal` / `evaluatePositionScores`
  - 盘后 Phase 2 同样预取 + 传入
  - Phase 7 挂接 `backfill5dResults`

### 兼容性
- 所有新字段走末尾可选参数，不破坏旧调用
- 基本面抓取失败不阻塞信号生成（Map 查不到就传 null，prompt 不输出基本面块）
- 三轨胜率：旧 memoryStore 没有 1d/5d 字段时自动初始化为 0

## [1.32.2] - 2026-04-19
### 修复
- **模型组表现数据重置与清理**：因多个历史 bug 导致模型胜率数据失真，执行完整重置
  - 清空 `expert-performance.json`、`model-groups.json`、`weights.json`，所有模型回到初始平均状态
  - 删除 4/1-4/16 的旧信号数据（缺少 providerId，导致同一模型出现多行）
  - 修复 `inferProvider` 多供应商拼接问题：无法确定供应商时不再拼接，按纯 modelId 分组
  - 修复 `getAdjustedFusionWeights` 防御性检查：`learnedWeights` 为空对象时不再崩溃

## [1.32.1] - 2026-04-18
### 修复
- **"忽略"按钮点击后不生效**：dismiss 写入的 `action=hold` 会被 `updatePositionRuntime()` 重新计算覆盖回 reduce/stop_loss 等，导致 UI 上忽略按钮点了没反应
  - 根因：`updatePositionRuntime()` 每次拉 overview 时都重新评估持仓 action（根据价格 vs 止盈/止损），覆盖掉 dismiss 状态
  - 修复：`StockAnalysisPosition` 新增 `dismissedAction` 字段，记录用户已忽略的 action 类型；`updatePositionRuntime()` 计算完 action 后检查：若 `action === dismissedAction` 则保持 hold；若 action 变化（升级/降级）则清除 dismiss 并触发新提醒
- **Kimi 模型胜率显示 0%**：记忆复盘页面中 kimi-k2.5 和 kimi-for-coding 两个模型始终显示 0% 胜率
  - 根因：`buildModelGroupPerformance()` 中 `expertGroupMap` 用 first-come-first-serve 将 expertId 映射到 groupKey，但早期 kimi vote 没有 providerId（groupKey=`kimi-k2.5`），而 groupMap 使用带 providerId 的 key（`prov_xxx/kimi-k2.5`），两边不匹配导致 kimi 组查不到胜率数据
  - 修复：将 `expertGroupMap` 改为 `expertGroupsMap`（一对多映射），一个 expert 可关联所有使用过它的模型组，胜率数据分配给所有相关模型

### 修改文件
- `backend/src/services/stock-analysis/types.ts` — `StockAnalysisPosition` 新增 `dismissedAction` 可选字段
- `backend/src/services/stock-analysis/service.ts` — dismiss 保护逻辑 + 模型组胜率映射修复

## [1.32.0] - 2026-04-17
### 新增
- **自选股票搜索覆盖 A 股全市场（~5500 只）**：修复「搜京东方 000725 搜不到」的问题。此前 `searchStockPool` 只搜中证500成分股（500 只），导致京东方A、贵州茅台、招商银行、宁德时代等大盘股/中小盘股全部搜不到
  - 新增 A 股全市场代码表缓存：`cache/a-stock-all.json`（+ `.meta.json`），数据源 AKShare `stock_info_a_code_name`，TTL 7 天
  - `searchStockPool` 优先在全市场表搜索，失败才回退中证500池（保底可用）
  - **不影响 AI 选股主业务**：中证500 股票池（`stock-pool.json`）仍独立维护，只是搜索多了一个独立的全市场表
  - 加全角→半角字母归一化（AKShare 返回的「京东方Ａ」带全角Ａ，用户搜「京东方A」半角也能命中）

### 新增/修改文件
- `backend/src/services/stock-analysis/store.ts` — 新增 `readAllAStockList` / `saveAllAStockList` / `readAllAStockListMeta` / `saveAllAStockListMeta`
- `backend/src/services/stock-analysis/service.ts` — 新增 `ALL_A_STOCK_LIST_SCRIPT` + `fetchAllAStockListFresh()` + `getAllAStockList()` + `normalizeFullwidth()`；改写 `searchStockPool()`
- `backend/tests/stockAnalysisSearch.test.ts` — 新增 2 个单测（京东方搜索、结果上限 20）

### 验证
- 后端 `npm run build` 通过
- `npx tsx --test tests/stockAnalysisSearch.test.ts` 2/2 通过
- 实测搜索（`/api/system/stock-analysis/watchlist/search?q=xxx`）：京东方、贵州茅台、宁德时代、招商银行、600519 均命中

## [1.31.0] - 2026-04-17
### 变更
- **解除仓位比例限制**（用户明确决策）：`maxSinglePosition` 与 `maxTotalPosition` 默认值由 `0.3 / 0.85` 调整为 `1.0 / 1.0`，同步更新持久化配置 `config/strategy.json`
- **移除市场级风控对总仓位上限的压制**：`confirmStockAnalysisSignal` 不再用 `lowLiquidityGuardrail.maxPositionRatio`（0.65/0.35）压低 `effectiveMaxTotalPosition`；低流动性场景仅保留 info 日志提示
- **`evaluateMarketLevelRisk`**：`effectiveMaxPositionRatio` 不再由 lowLiquidity / extremeVolatility 硬编码为 0.65/0.5/0.85，改为直接跟随 `config.maxTotalPosition`（默认 1.0）；确保前端展示与后端校验对齐
- 前端 `StrategiesTab` / `RiskTab` 默认展示上限由 85% 改为 100%；`MarketLevelRiskState.effectiveMaxPositionRatio` 类型注释同步更新

### 保留（未改）
- 极端熊市拦截（`extremeBearActive` → throw）
- 流动性危机拦截（`liquidityCrisisActive` → throw）
- 持仓数量上限（`maxPositions = 3`）
- 黑名单拦截、`runtimeStatus.riskControl.paused` 拦截
- 校验分支未删除：当用户将 `maxSinglePosition / maxTotalPosition` 配置回更小值时，校验仍然生效

### 备注
- 测试 fixture（`stockAnalysisRoutes.test.ts` 等）保留原值 `0.3 / 0.85`，属于用例场景输入，不代表运行时默认值
- 后端全量测试 197/197 通过；前端测试存在与本次修改无关的历史类型失同步问题

## [1.30.2] - 2026-04-17
### 修复
- **彻查「ClawOS 股价与官方数据严重不符」根因**：signals 文件由盘前 08:05 cron 一次性生成并落盘，此时市场未开盘，`snapshot.latestPrice/changePercent/open/high/low` 只能是昨收数据；signals 文件一整天不再更新，导致前端「每日策略」页面展示的「现价/涨跌/开高低」全天都是**前一交易日的收盘价**（以华丰科技 688629 为例：官方 4-17 收盘 136.40 +3.43%，ClawOS 展示 131.88 -0.08% = 4-16 收盘价）。
  - **不是数据源挂了、不是字段错位、不是 v1.30.x 引入的 bug**，是原本就存在的「早生成 + 不刷新」时效性问题
  - 持仓 `currentPrice/returnPercent` 本身是对的（由 post-market/intraday cron 从 quotes.json 刷新），本次 bug 只影响 signals 展示链

### 新增
- **`signal.realtime` 字段**（后端 `StockAnalysisSignalRealtime` 类型）：与 `snapshot` 分离，snapshot 保留为信号生成时刻的历史基准（用于策略溯源、支撑压力位等），realtime 承载盘中实时行情（latestPrice/changePercent/open/high/low/previousClose/fetchedAt）
- **`refreshSignalsRealtime(dir, tradeDate?)`** 后端服务函数：读取当日 signals → 批量调 `getQuoteData` → 写回每条 signal 的 realtime 字段；数据源全挂时保留旧 realtime 不清空，容错落 saLog
- **Cron 自动刷新**：工作日 09:30-11:30 / 13:00-14:55 每 5 分钟刷新 + 15:00 收盘定格 1 次（`*/5 9-14 * * 1-5` + `0 15 * * 1-5`，Asia/Shanghai 时区）
- **手动刷新接口**：`POST /api/system/stock-analysis/signals/refresh-realtime`（支持 `{ tradeDate }` 可选入参）

### 变更
- **前端 StrategiesTab**：信号展示全面切换到「realtime 优先，回退 snapshot」策略
  - 现价/涨跌幅/开高低均优先读 `signal.realtime.*`，未刷新时回退 `signal.snapshot.*`
  - 现价旁新增小徽章：已刷新展示「15:30 更新」（fetchedAt 北京时间），未刷新展示「盘前基准价」提示
- **`confirmStockAnalysisSignal`**：买入取价 fallback 优先级改为 `realtime.latestPrice > signal.latestPrice`，进一步降低用昨收价建仓的风险

### 备注
- 策略决策价格（`suggestedPriceRange / supportResistance / stopLossPrice / takeProfitPrice1/2`）**仍锁定在 signal 生成时刻**，不跟随 realtime 变化，这是量化策略的正确行为（止损位不应盘中随便抖动）
- 老的历史 signal 文件（4-17 前）不回填 realtime，保持历史档案不变；当日首次手动调 `refresh-realtime` 可立即修正展示

## [1.30.1] - 2026-04-17
### 新增
- **开盘自动执行 cron**：工作日 09:31（Asia/Shanghai）自动触发「一键自动执行」逻辑。开盘后 1 分钟执行，紧跟 08:05 的每日分析之后
- 与手动按钮共用 `runAutoDecisions()`，同日重复触发安全（`decisionSource !== 'system'` 的信号会被守卫跳过）
- 带 `isTradingDay()` 节假日守卫 + `hasCronCompletedToday('autoExecute')` 同日去重守卫

## [1.30.0] - 2026-04-17
### 新增
- **每日策略「一键自动执行」**：在「每日策略」页面新增按钮，点击后：
  1. 对今日 `strong_buy`（强烈买入）信号按 `finalScore` 降序排序，依次自动开仓，每只 30% 仓位，总仓位 100% 上限
  2. 已持仓的标的自动跳过
  3. 最后一只装不下完整 30% 时，按剩余仓位买入（可能不足 30%）
  4. 对今日 `buy`（买入）和 `watch`（观望）信号自动标记为忽略，理由统一为「买入信号不够强烈，条件满足度不够高」
- **DecisionSource 新增两个枚举值** `system_auto_buy` / `system_auto_ignore`，区分人机决策来源，便于后续统计分析
- **后端新增路由** `POST /api/system/stock-analysis/auto-execute`，返回 `{ autoBoughtCount, autoIgnoredCount, skippedCount, autoBought[], autoIgnored[], skipped[] }`
- **后端新增服务函数** `runAutoDecisions(dir, tradeDate?)`，核心逻辑集中于此

### 变更
- `confirmStockAnalysisSignal` 新增可选参数 `options: { bypassTradingHours?, autoBuy? }`，自动买入流程旁路交易时段校验并打 `system_auto_buy` 来源
- `rejectStockAnalysisSignal` 的 `decisionSource` 参数类型扩展支持 `system_auto_ignore`
- 前端 `decisionSourceLabel` 增加两个新来源的中文标签与徽章样式

### 备注
- 目前仅 MVP（手动一键触发），cron 每日 09:30 自动执行将在后续版本接入
- 不涉及真实资金与券商接口，纯模拟，仅写入 positions.json / trades.json / signals/*.json

## [1.29.18] - 2026-04-17
### 修复
- **AI 配置模型测试按钮全部失败**（真正的根因）：后端 `GET /ai-config` 返回时把 apiKey 遮罩为 `sk-****xxxx`（隐私保护），前端表单拿到的就是遮罩串，点测试按钮时把遮罩串当真 apiKey 发给后端，而 `POST /ai-config/test-model` 路由缺少和 `PUT /ai-config/providers` 一样的恢复逻辑，直接用遮罩串去调大模型 → 全部 401。修复：test-model 路由新增 apiKey 恢复——若 apiKey 含 `****` 则按 providerId 从存储查真实 key；前端 `testModelConnectivity` 签名同步增加 providerId 参数
- **v1.29.17 部署遗漏**：上个版本 AI 配置按钮 key 不匹配的修复只改了源码，没重新 `npm run build`，dist 仍是旧 bundle。本次构建已确认 JS hash 变化（`B8_MgFrS` → `BSupUHGo`）

## [1.29.17] - 2026-04-16
### 修复
- **模型组表现统计**：重写 `buildModelGroupPerformance()` 为 async，聚合全部历史信号（12 个信号文件，15660 个 votes），按 `providerId/modelId` 组合键分组。从 AI 配置反推旧数据的 provider 信息：单一供应商直接标注，多供应商列出所有名称（如 `glm-5 (Aliyun/ZHIPU/OpenCodeGo)`）。标准化 modelId（GLM-5→glm-5、qwen3.5-plus→qwen3.6-plus）。修复效果：模型组从 4 个 → 6 个，kimi-k2.5 (1033 preds) 重新显示
- **AI 配置测试按钮点击无反应**：testResults 存储 key 用后端返回的 providerId='test'，但按钮读取时用 form.id（真实供应商 ID），key 不匹配导致结果永远显示不出来。修复：handleTestModel 新增 providerId 参数，统一用 form.id 作为 key

## [1.29.16] - 2026-04-16
### 修复
- **K 线数据字段错位**：同花顺 K 线源解析时 close/high/low 三个字段顺序错误（API 实际返回 `[date, open, high, low, close]`，代码按 `[date, open, close, high, low]` 解析），导致所有蜡烛图显示为阳线且形态完全不对。修正字段映射并清除所有错误缓存
- **股票名称乱码**：自选股票详情中名称显示为菱形乱码，原因是优先使用了腾讯实时行情 API 返回的编码异常 name。改为优先使用用户添加时保存的正确名称
- **自选页面可滚动**：watchlist tab 时外层容器改为 `overflow-hidden`，确保 K 线图和所有内容严格一屏显示
- **K 线阳线渲染**：阳线改为红色空心（`fill: #fff` + 加粗描边），符合 A 股习惯

## [1.29.15] - 2026-04-16
### 新增
- **自选股票 Tab**：AI 炒股应用新增"自选股票"页面，支持盯盘和自选管理
  - **搜索添加**：模糊搜索股票代码/名称（中证500股票池），点击即添加到自选（上限50只）
  - **自选列表**：左侧紧凑表格展示名称、代码、现价、涨跌幅、成交量，点击切换详情
  - **详情面板**：右侧展示选中股票的 OHLC 指标（开/高/低/昨收）、成交量、换手率、市值等
  - **日 K 线蜡烛图**：纯 SVG 实现，红涨绿跌，含成交量柱状图，占比大适合盯盘
  - **备注功能**：每只自选股票可添加/编辑文字备注
  - **自动刷新**：盘中 30 秒 / 非盘中 60 秒自动更新行情数据
  - **后端 API**：5 个新端点（获取自选+行情、搜索、添加、移除、更新备注）
  - **数据存储**：`config/watchlist.json`，原子写入，per-file 互斥锁
  - K 线历史数据复用 `getStockHistoryData()` 6 级回退机制

## [1.29.14] - 2026-04-16
### 新增
- **策略页面 OHLC 行情数据**：每只候选股票新增开盘价、最高价、最低价、昨收价、实时涨跌幅展示
  - 后端 `StockAnalysisStockSnapshot` 类型补充 `open`/`high`/`low`/`previousClose` 四个字段
  - `buildSnapshot()` 从数据采集的 `SpotQuote` 中填充 OHLC 数据（此前被丢弃）
  - 前端右侧候选列表：新增现价、涨跌幅百分比、开/收/高/低四格行情
  - 前端左侧详情面板：现价行增加涨跌幅标注，新增开盘/最高/最低/昨收行
  - 兼容旧数据：前端类型标记为可选，使用 `formatPrice()` 安全格式化

## [1.29.13] - 2026-04-13
### 新增
- **晨间补充数据采集**：交易日 07:30 自动运行补充分析，采集夜间产生的新闻/公告等增量数据
  - 只运行 Phase 4（数据采集）+ Phase 5（LLM 信息提取），不重复跑持仓评估和风控
  - 采集结果合并到前一个交易日的事实池和 LLM 提取结果中，供当天盘前分析使用
  - `store.ts` 新增 `mergeFactPool()` 和 `mergeLLMExtractionResult()` 合并函数（追加去重）
  - `scheduler.ts` 新增 07:30 cron 任务，含交易日守卫和防重复机制

## [1.29.12] - 2026-04-13
### 安全
- **登录暴力破解防护**：新增 IP 级速率限制，同一 IP 连续 5 次登录失败后锁定 15 分钟。覆盖两个认证入口：
  - `POST /api/system/auth/verify`（前端登录）
  - Basic Auth middleware（API 调用）
- 成功登录后自动清零失败计数
- 改进客户端 IP 识别：优先读取 `X-Forwarded-For`（支持 Tailscale Funnel 等反向代理场景）
- 定时清理过期锁定记录，防止内存泄漏
- 所有登录失败和锁定事件记录到日志

## [1.29.11] - 2026-04-12
### 优化
- **记忆复盘页 UI 布局全面重写**：
  - 顶部改为 KPI 条带（累计收益/胜率/盈亏比/夏普替代/最大回撤/观望准确率）一字排开，极致紧凑。
  - 主体改为 grid-cols-5 布局：左 3/5（周度绩效 + 预警建议 + 4 个绩效图表 2x2）+ 右 2/5（周报卡片 + 月度汇总 + 最近交易）。
  - 底部 grid-cols-5：左 3/5 模型组表格 + 右 2/5 观望日志。
  - 间距从 gap-3 统一缩减到 gap-2，内边距从 p-3 缩减到 p-2.5，字号整体下调提升信息密度。
  - 右侧最近交易列表增加 max-height + overflow-y-auto 限高滚动，防止数据多时撑破布局。

## [1.29.10] - 2026-04-12
### 修复
- **记忆复盘页全面审计修复**（共修复 7 个 bug）：
  - [P0] `buildWeeklySummary()` 从不计算 `winRate`（始终为 0），现在按周内卖出交易的胜负比正确计算。
  - [P0] `buildWeeklySummary()` 从不计算 `cumulativeReturn`（始终为 0），现在按时间正序跨周累加。
  - [P1] `buildMonthlySummary()` 从不计算 `winRate` 和 `maxDrawdown`，现在按月内卖出交易正确计算。
  - [P1] `calculatePerformance()` 的 `cumulativeReturn` 使用加权平均但 `weeklyReturn` 使用简单求和，语义矛盾。统一为简单求和，修复累计收益从 -4.33% 恢复为正确的 +6.59%。
  - [P2] 历史卖出交易缺少 `buyDate`/`sellDate` 字段，导致持有天数始终显示 1 天。已回填全部 6 笔卖出记录和 8 笔买入记录的日期字段。
  - 修复 `trades.json` 中 10 条 `weight=0` 的早期 override 交易记录，回填为 `weight=0.1`。
  - 清除修复前生成的 `weekly-summary.json` 和 `monthly-summary.json` 旧缓存，确保 overview 使用修复后的计算逻辑重新生成。

### 修复后核心指标
- 累计收益：-4.33% → **+6.59%**
- 胜率：0% → **83.33%**（5 胜 1 负）
- 周度 winRate/cumulativeReturn：从全 0 恢复正常
- 月度 winRate/maxDrawdown：从全 0 恢复正常
- 卖出交易持有天数：从全部 1 天恢复为实际天数

## [1.29.9] - 2026-04-11
### 新增
- AI 炒股新增 Override（主观判断）追踪与正反馈机制：
  - 后端新增 `buildOverrideStats()` 函数，通过 `relatedPositionId` 关联买入/卖出记录，分别统计 override 与系统推荐交易的胜率和平均收益。
  - `buildPerformanceDashboard()` 新增 `overrideStats` 字段输出，override 胜率 > 60% 且样本 >= 3 时自动生成提示告警。
  - 前端 `MemoryTab` 绩效指标区从 4 列扩为 5 列，新增"主观判断"卡片（笔数 + 胜率）；周度绩效仪表板增加"主观判断均收"行。
- AI 炒股新增 Override 正反馈信号放宽逻辑：当系统判定为 watch 且分数差距 < 5 分、无一票否决、且用户 override 历史胜率 > 60%（样本 >= 3）时，自动将 watch 升级为 buy 并注明原因。

### 变更
- Conviction Filter 门槛统一下调 2 分（含 minCompositeScore、minExpertConsensus、minTechnicalScore、minQuantScore），覆盖所有 5 种市场 regime，改善当前 2.78% 过低通过率。
- 持久化配置 `config/strategy.json` 同步更新，并补全之前缺失的 `high_volatility` 和 `low_volatility_range` regime 配置。

## [1.29.8] - 2026-04-10
### 修复
- AI 炒股盘后数据采集补上“最近成功 fact-pool 真实快照回退”收口：`macro_economy` 在仅拿到 0-1 个有效字段时、`social_sentiment` 在样本少于 3 条时、`global_markets` 在当日完全空时，都会回退到最近一次成功快照，避免当天接口集体抖动时把事实池打穿。
- 回退结果不再伪装成“当日全成功”：对应 Agent 会保留原始错误，并额外写入 `已回退到最近成功...快照(日期)` 审计信息，方便后续从日志、质量报告和 fact-pool 明确识别这是备份回退而不是实时采集成功。

### 新增
- 新增 `stockAnalysisDataAgents.test.ts` 回退覆盖，验证最近 fact-pool 选择逻辑，以及宏观、社交舆情、全球市场三类真实快照回退行为；后端定向测试通过，后端构建通过。

## [1.29.7] - 2026-04-08
### 修复
- AI 炒股超时口径重新统一为“宁可慢也要尽量跑完”：模型连通性测试超时提升到 60 秒，默认数据采集 Agent 超时也同步提升到 60 秒，避免慢模型或慢接口被过早误判为不可用。
- AI 配置页与后端保存校验的 `timeoutMs` 上限统一放宽到 `600000ms`，修复前端仍限制 `120000ms`、与当前实盘容忍慢模型策略不一致的问题。
- 修复 `social_sentiment` 实际上大量依赖价格代理和默认中性值的问题：现在改为以 AKShare 提供的**雪球真实讨论/关注热度**和**微博真实舆情报告**为主数据源，10jqka/东方财富热榜仅作为热点补充，不再把空情绪伪装成“社交舆情”。
- 修复 `DataCollectionTab.tsx` 的作用域与类型引用错误：`AI 数据收集` 页面现已能正确按“主舆情源 / 热榜补充”展示社交舆情，前端构建恢复通过。
- AI 专家分析页新增“更新于”时间展示：后端 `expert-analysis` 接口现在返回当日信号中的最新 `createdAt` 作为 `analyzedAt`，方便快速判断这批专家分析是不是最新结果。
- AI 炒股前端新增统一自动刷新机制，修复页面状态随时间自然过时的问题：`overview + tradingStatus` 现在会在盘中每 30 秒、非盘中每 60 秒自动刷新，并在窗口重新聚焦、页面重新可见、网络恢复和关键交易时间边界时主动刷新，减少必须手动刷新的情况。

### 变更
- 数据采集 Agent 的默认超时进一步统一为 `600000ms`（600 秒），前端输入回退值和后端运行时默认请求超时同步调整，确保“默认值”和“允许上限”口径一致。
- 系统说明页已同步更新到当前版本：补齐 45 位专家、AI 专家分析/AI 数据收集审计页、真实社交舆情来源、关键通知、高危常驻提醒、`600000ms` Agent 超时和 3 小时盘后批处理窗口等最新行为说明。

## [1.29.6] - 2026-04-08
### 修复
- AI 炒股新增按 `provider + model` 动态适配的 LLM 协议层：`kimi-for-coding` 现在会走 Kimi Coding 所需的 Anthropic `/v1/messages`，不再被系统内默认的 OpenAI `/chat/completions` 调用方式错误拦截。
- 盘后信息提取、专家记忆压缩和模型连通性测试已统一复用同一套 provider adapter，避免 `kimi-for-coding` 在专家投票之外仍因为旧调用路径误报 403 或直接不可用。

### 新增
- 新增 `backend/tests/llmProviderAdapter.test.ts`，覆盖 Kimi Coding 识别、Anthropic messages URL 组装和 usage 字段归一化，降低后续协议适配回归风险。

## [1.29.5] - 2026-04-08
### 修复
- AI 炒股 LLM fallback 现在会主动跳过已知无效的 `provider + model` 组合（当前包括 `OpenCodeGo/MiMo-V2-Pro` 与 `OpenCodeGo/GLM-5`），避免在慢模型场景下继续把 15 分钟 Agent 预算和 30 分钟专家投票预算浪费在明确不支持的候选上。
- 盘后分析与市场级风控补齐了更可审计的本地日志：现在会明确记录当前市场流动性状态、低流动性护栏/流动性危机触发原因，以及 3 小时窗口超时时停在哪个阶段。

### 变更
- 低流动性护栏从硬编码升级为策略配置项 `lowLiquidityGuardrail`，当前可统一调整成交额分位阈值、危机判定的上涨家数阈值、扣分值、低流动性仓位上限和流动性危机仓位上限，方便后续按真实盘感继续微调。

## [1.29.4] - 2026-04-08
### 修复
- AI 炒股盘后调度层现在真正接入 3 小时全局批处理窗口：`runStockAnalysisPostMarket()` 默认使用 `POST_MARKET_BATCH_WINDOW_MS = 3h`，并在各个阶段边界以及持仓评估循环前检查 deadline，避免只放宽单股/单模型超时后，整轮日终任务仍无限拉长。

### 新增
- 新增 `backend/tests/stockAnalysisScheduler.test.ts`，校验盘后批处理窗口常量为 3 小时，并验证超过 deadline 时会在阶段边界主动停止。

## [1.29.3] - 2026-04-08
### 修复
- AI 炒股大幅放宽 LLM 超时策略：单模型调用超时提升到 360 秒，信息提取单 Agent fallback 总预算提升到 15 分钟，单股票专家投票总预算提升到 30 分钟，适配当前模型响应偏慢且 prompt/数据量较大的真实运行环境。
- 修复 `sentiment_analyzer` 的 JSON 解析误判：情绪提取现在优先解析最外层 JSON 对象，不再因为对象内部存在 `hotTopics: []` 而误把内部数组当成整条响应，导致合法结果被记为“解析异常”。
- 修复专家投票“整轮超时即整轮作废”的激进降级策略：现在会优先保留已经成功返回的 LLM 专家票，仅对超时未完成的专家做规则降级补齐；只有有效 LLM 票低于最低门槛时才整体退回规则推断。
- 修复市场级流动性风控误判：`volumePercentile < 0.10` 不再单独触发“流动性危机”一票否决，而是要求“缩量 + 普跌 + 悲观情绪”同时成立；像 2026-04-08 这种上涨家数占比 94% 的大涨日，现在会降级为“低流动性护栏”而不是直接禁买。

### 变更
- 低流动性日的处理方式从“暂停新开仓”调整为“降仓位 + 小幅扣分”：当仅有成交额分位偏低、但未达到全面危机时，系统会把市场级最大仓位上限降到 0.65，并对候选信号做温和扣分，而不是直接否决全部机会。

## [1.29.2] - 2026-04-08
### 新增
- 系统设置新增“通知常驻显示”开关：可在常驻显示与自动消失之间切换，统一控制右上角 Toast 的停留行为。
- AI 炒股应用接入系统通知：关键流程现在会推送系统级通知，包括今日分析、盘后分析、股票池刷新、信号处理、平仓/减仓、卖出提醒忽略、盘中监控启停与关键失败场景。
- AI 炒股新增“待处理卖出提醒”系统通知：当持仓首次进入止损、止盈、减仓或到期复核状态时，会自动推送通知；只在新触发或原因变化时提醒，避免每次刷新重复弹出。
- AI 炒股进一步补齐高优先级风控通知：新增盘中预警实时通知、风控暂停/恢复通知、数据回退/恢复通知，以及换仓建议变化通知，尽量覆盖会影响真金白银决策的关键状态变化。
- AI 炒股新增“关键通知历史”视图，并为系统通知增加 `riskPriority` / `category` 元数据：现在可在应用内查看最近关键风险事件，按高危/重要/关注区分优先级，便于实盘场景快速回看和复盘。
- `critical` 级通知现在会强制常驻并使用更醒目的红色强提醒样式，不再受普通自动消失设置影响，确保高风险事件不会被轻易错过。
- AI 炒股的买入、平仓、减仓确认已从原生 `window.confirm` 升级为风险摘要确认面板：执行前会展示交易动作、组合风控、市场状态和数据状态，降低误操作概率。

### 变更
- 系统通知底层新增更聪明的降噪策略：支持基于 `dedupeKey` 的短时间去重，以及基于 `batchKey` 的异常通知聚合，避免同类错误在短时间内刷屏。
- 下载管理与滴答清单的异常通知已升级为智能策略：相同错误会自动去重，多次连续失败会合并为摘要通知。
- Toast 行为现在由全局通知设置驱动：关闭常驻时按自动消失逻辑处理，开启常驻时保留到用户手动关闭。

## [1.29.1] - 2026-04-08
### 变更
- 精简下载管理通知策略：仅保留失败类系统通知（创建失败、任务操作失败、删除失败、清理失败、目录更新失败），移除创建成功、暂停/恢复成功、删除成功、清理成功、目录更新成功等高频成功通知，避免通知中心被操作提示刷屏。
- 精简滴答清单通知策略：仅保留关键异常通知（未授权、同步失败、任务/清单/标签/批量操作失败），移除任务创建/编辑/完成/删除、清单重命名/删除、标签重命名/删除、批量成功等成功类通知，保留应用内即时状态反馈不变。

## [1.29.0] - 2026-04-07
### 新增
- 新增系统级通知后端模块：`backend/src/services/notifications/*`，支持通知创建、列表查询、已读、删除、清空、未读计数。
- 新增通知路由：`/api/system/notifications`，为所有应用提供统一通知接口。
- 新增通知实时推送通道：`GET /api/system/notifications/stream` (SSE)，支持桌面和应用内实时同步通知变化。
- 新增通知后端测试：`backend/tests/notificationsRoutes.test.ts`，覆盖通知 CRUD 和参数校验。
- 前端通知中心与 Toast 改为接入后端统一通知 API，并通过 SSE 实时同步通知状态。
- 新增前端通知 SDK：`frontend/src/lib/notifications.ts` 与应用级封装 `frontend/src/apps/notify.ts`，便于各应用一行代码发系统通知。
- 新增通知接口文档：`docs/notifications-api.md`。
- 下载管理应用已接入系统通知：新建任务、暂停/恢复、删除、清理历史、目录更新的成功/失败会推送到通知中心。
- 滴答清单应用已接入系统通知：任务创建/更新/完成/删除、清单管理、批量操作、标签操作、同步失败都会推送系统通知。

## [1.28.0] - 2026-04-07
### 新增
- 实现了系统级通知中心与右上角悬浮 Toast 通知功能。
- 提供全局 `notify` API 供所有应用快速调用推送通知。
- 支持通知的历史记录查看与按时间分组（今天、昨天、更早）。
- 增加了未读消息角标与状态管理。

## [1.27.1] - 2026-04-07
### 新增
- 桌面右侧 widgets 新增双高 `滴答清单` 总览卡片：直接显示待办总数、今日到期、已逾期和重点任务列表，可一键打开 Dida 应用。
- 桌面滴答 widget 重做为更接近官方小组件的极简白卡样式，仅保留 `收集箱` 视图、顶部快速创建入口和任务列表。
- 桌面滴答 widget 的快速创建输入接入与主 Dida 应用一致的自然语言日期识别，支持如“明天18:30开会”“今晚8点缴费”这类输入直接落库为带日期/提醒的任务。
- 桌面滴答 widget 的输入区新增轻量识别预览，会展示识别到的时间词和最终解析的到期时间；同时修复 `今晚8点` 被错误解析为上午 8 点的问题。
- 网易云应用新增视图缓存：打开应用时会优先恢复上次缓存的用户信息、歌单与当前列表，再在后台静默刷新，避免首屏先空白加载。
- 网易云缓存进一步改为“按页面独立缓存”：搜索页和每个歌单页都分别保存自己的歌曲列表，切换页面时先显示对应页面的缓存，再后台刷新，消除显示上一个页面内容的延滞感。
- 网易云搜索结果进一步按“关键词”独立缓存，不同搜索词之间不会再复用同一份 `search` 列表，搜索切换时能立即回填对应关键词的缓存结果。
- 网易云缓存继续增强：加入按视图时间戳的过期判断、最近访问页预热刷新、搜索输入防抖和最近搜索记录，进一步减少切页与搜索时的等待感与跳变感。

### 修复
- 修复浏览器内原生 `<audio>` 请求无法继承 `fetch` Basic Auth 头导致的媒体流鉴权问题：登录成功后后端现在会额外下发 `clawos_media_auth` 媒体访问 Cookie，并允许该 Cookie 访问 `/api/system/music/stream_local` 与 `/api/system/localmusic/stream/:id`。
- 因此 `网易云下载后本地播放` 和 `本地音乐 Pro` 的本地音频流现在都可以在浏览器内正常播放，不再出现系统播放器能播、ClawOS 内不能播的情况。
- 修复桌面 `系统状态` widget 的底部溢出：将网络下载/上传速率压缩为同一行双列展示，为底部内存与存储进度条腾出稳定空间。
- 进一步压缩桌面 `系统状态` widget：移除标题区并收紧卡片内边距、网络区和进度条行距，确保 `系统存储` 等底部内容在固定高度内完整显示。
- 继续微调桌面 `系统状态` widget 的视觉布局：移除位置突兀的 `实时` 标签，回到更干净的纯指标排版，避免为省空间而破坏观感。

### 变更
- 右侧桌面卡片布局改为支持双高卡片的 `auto-rows` 网格，滴答 widget 现在与其他卡片严格对齐。
- 将原本分离的 `硬件状态` 与 `网络速率` 合并为更紧凑的 `系统状态` 卡片，为双高 Dida widget 腾出空间。
- 移除桌面区 `灵感速记` 卡片，整体视觉层级改为“一个主卡 + 四个辅卡”的更清晰结构。
- 桌面滴答 widget 现在支持直接创建收集箱待办，并可在桌面上直接勾选任务完成，无需先进入 Dida 应用。
- 继续压缩滴答 widget 的视觉密度：减小头部图标/字号、收紧输入条高度、压缩任务行间距与空态留白，整体更接近官方小组件的紧凑观感。

## [1.27.0] - 2026-04-07
### 新增
- 新增 `dida` 官方 OpenAPI 后端路由（`backend/src/routes/dida.ts`），实现 OAuth2 授权链接生成、回调换 token、本地 token 持久化、刷新 token、统一 `/proxy` 转发。
- 新增滴答 token 过期判断与刷新逻辑（`backend/src/utils/didaAuth.ts`），支持 `refresh_token` 自动续期。
- 前端 Dida 应用改为真实 API 数据流：清单/任务从后端代理实时加载，任务增删改查与完成状态同步官方接口（`frontend/src/apps/DidaApp/api.ts`, `store.tsx`）。
- Dida 前端补全关键体验：按视图显示已完成任务分组（可展开/收起）、提醒/重复信息展示、日期弹窗与官方字段映射（reminder/repeatFlag）。

### 修复
- 修复 Dida 时间字段兼容问题：统一处理 OpenAPI 返回的 `+0000` 时区格式，前端详情/日历/列表不再因 `Invalid Date` 丢失显示时间。
- 修复自然语言创建含时间任务的时间落库稳定性：创建与更新任务时统一格式化 `startDate/dueDate` 为官方可接受格式，避免“识别到时间但详情不显示”的问题。
- 修复任务输入框自然语言高亮时的光标错位：统一预览层与输入层字重/行高/字距并移除高亮片段额外横向 padding，光标恢复与文本末尾一致。
- 修复滴答授权失败根因：`/api/system/dida/callback` 被全局 BasicAuth 拦截，回调无法落地；现已加入白名单。
- 修复滴答路由未挂载问题：`routes/index.ts` 之前未 `router.use('/dida', ...)`，导致前端状态检查始终异常。
- 修复后端服务启动崩溃：Express5 + path-to-regexp 不接受 `'/proxy/*'` 字符串路由，改为正则 `^/proxy/.+`。
- 修复代理 endpoint 解析：去除 query 串污染，避免上游 URL 错误。
- 修复 `/clawos` 子路径部署下 redirect_uri 不一致：按请求路径自动生成带 `/clawos` 前缀的回调地址。
- 修复 P0 数据空白：OpenAPI `project` 列表为空时，前端之前仅依赖该接口导致页面无任务；现新增 `project/inbox/data` 拉取并注入真实 inbox 项目与任务。

### 变更
- 重绘桌面图标，完美还原原版滴答清单（Dida365）的圆环形与黄色对勾经典样式
- 极简壁纸精简：删除了所有不符合要求的系统预设壁纸，仅保留最顺眼的两张绝对极简、浅色纯净、横屏比例的本地壁纸（`clean-1`和`clean-6`），彻底贯彻“元素简单、浅色、横屏”的要求。

- TaskList/TaskItem/TaskDetail/CalendarView 全面适配真实数据与后端同步，日期弹窗设置（日期/时间/提醒/重复）可落库。
- Dida repeat/reminder 映射采用官方常见格式：`RRULE:*` 与 `TRIGGER:*`，并保留字符串透传兼容未来扩展。
- Dida 前端进一步补全核心能力：
  - 清单管理：新增清单、重命名、删除（删除后任务回收至收集箱）
  - 标签管理：重命名、删除（通过批量更新任务标签实现）
  - 列表增强：拖拽排序（按 sortOrder 持久化）、多选模式、批量完成/删除/移动清单
  - 任务列表新增“已完成任务折叠区”
- 收集箱任务分组新增“没有日期”，无截止日期任务不再混入“更远”。

## [1.26.0] - 2026-04-07
### 新增（全量本地化日志系统）
- **统一日志模块 `sa-logger.ts`**: 按天分割业务日志 + LLM 全量 JSONL + 前端上报日志 + 审计日志，自动清理 30 天以前的文件
- **前端日志模块 `logger.ts`**: 缓冲 + 批量上报到后端 API，全局 `unhandledrejection`/`error` 事件捕获，页面卸载时 `sendBeacon` 保底发送
- **`ErrorBoundary` 组件**: React 渲染错误全局捕获，防止白屏，自动上报错误到日志系统
- **`POST /api/system/stock-analysis/client-log`**: 前端日志上报 API，支持批量提交（最多 100 条/次），输入校验 + 字段截断

### 变更（全模块日志覆盖）
- **service.ts**: 删除旧 `appendStockAnalysisLog` 函数，17 处调用迁移到 `saLog.audit()`；`buildSignal` 信号评分链路 debug 日志；`pollIntradayOnce` 盘中监控日志；`runStockAnalysisPostMarket` 盘后运行日志（含耗时/持仓评估/卖出建议/风控事件）；`bootstrapStockAnalysis` 初始化日志
- **llm-inference.ts**: `callLLMOnce` 成功/失败均记录 JSONL（含完整 prompt/response/latency/tokens/reasoningContent）；`callExpertLLMWithFallback` 成功/失败日志；`runExpertVoting` 开始/完成/超时日志；`aggregateVotes` 聚合详情 debug 日志
- **llm-extraction.ts**: 三个 `doExtract*` 函数 LLM 调用 JSONL 日志；`callWithFallback` 成功/失败日志；`runLLMExtraction` 开始/完成汇总日志
- **data-agents.ts**: `collectAllAgents` 开始日志（含 tradeDate + Agent 数 + 持仓数）；逐 Agent 详细日志（数据点/成功率/耗时/错误）；完成汇总（总耗时/质量分/各类数据有无）
- **store.ts**: `readJson`/`writeJson` debug 日志（文件名/大小KB/耗时）；`withFileLock` 锁竞争等待日志
- **memory.ts**: `callMemoryLLM` LLM JSONL 日志；`runDailyMemoryUpdate` 开始/完成汇总（含当日条目数/耗时）；`runLongTermMemoryUpdate` 开始/完成汇总（含更新专家数/耗时）
- **scheduler.ts**: 所有 cron 任务（每日分析/周度报告/月度报告/盘后分析/盘中监控启停/日历同步）添加开始/完成/失败日志
- **AIQuant/api.ts**: `requestJson` 添加请求耗时 + 状态码 + 错误详情日志

### 修复
- **Winston 路径错位**: `path.resolve(__dirname, '../../../logs')` 在 dist 下运行时写入错误目录，改为 `../../logs`
- **Winston 无日志轮转**: 83MB 无限增长，添加 `maxsize: 50MB, maxFiles: 5`
- **Winston debug 级别丢弃**: level 从 `'info'` 改为 `'debug'`，恢复 13 处 debug() 调用

## [1.25.1] - 2026-04-07
### 修复（数据收集 — 东方财富 API 适配）
- **政策法规 Eastmoney-news**: `getNewsByColumns` API 已失效（要求新增 client/biz/column/req_trace 参数且仍返回空），替换为 `kuaixun` JSONP 接口（data-agents.ts）
- **全球市场 Eastmoney-global**: `clist` 批量查询全球指数返回 SSL 错误/空数据，替换为 `push2his` 逐只查询（100.SPX/100.NDX/100.HSI），并行请求（data-agents.ts）
- **全球市场 Eastmoney-commodity**: `clist` 批量查询商品期货同样失效，替换为 `push2his` 逐只查询（101.GC00Y=COMEX黄金, 102.CL00Y=NYMEX原油）（data-agents.ts）
- **行业新闻 Eastmoney-industry**: `getNewsByColumns?columns=350` 失效，替换为 `kuaixun` JSONP 接口 column=104（data-agents.ts）
- **行业新闻 Eastmoney-research**: `getNewsByColumns?columns=311` 失效，替换为 `reportapi.eastmoney.com` 独立研报 API（data-agents.ts）
- **User-Agent 升级**: 所有 HTTP 请求的 UA 从简易字符串升级为完整浏览器 UA，降低被反爬封禁风险（data-agents.ts）

### 新增
- `fetchEastmoneyKuaixun()`: 东方财富快讯 JSONP 接口解析工具（data-agents.ts）
- `fetchEastmoneyQuote()`: 东方财富 push2his 单只证券行情查询工具，f170→涨跌幅转换（data-agents.ts）

## [1.25.0] - 2026-04-07
### 修复（投资准确性）
- **compositeScore 双重计算修复**: 移除 consensus/volumeBreakout/pricePosition 的额外加分（已在三流评分中体现），仅保留"三流方向一致"跨维度加分（service.ts）
- **Kelly 盈亏比改用实际数据**: `calculateKellyPosition()` 现在调用 `calculateProfitLossRatio()` 使用真实交易历史的盈亏比，不足时回退默认 1.5（service.ts）
- **neutral 投票纳入 consensus**: neutral 被视为 0.5 的方向性贡献，高 neutral 比例会降低交易信心（llm-inference.ts）
- **confidence 归一化**: 按 modelId 分组做 z-score 标准化，解决不同模型 confidence 分布差异导致的权重不可比（llm-inference.ts）
- **持仓天数改用交易日**: `holdingDays` 从自然日改为交易日计算，避免长假期间过早触发到期评估（service.ts）
- **累计收益加权计算**: `calculatePerformance` 中 cumulativeReturn 按仓位权重加权，反映实际组合收益（service.ts）
- **neutral 正确性阈值收紧**: 从 1% 改为 0.5%，降低 neutral 预测"碰巧正确"的概率（memory.ts）
- **中期记忆衰减**: 旧数据样本量按 0.8 衰减因子缩减，确保近期市场数据权重更高（memory.ts）
- **Provider 级熔断**: 连续 3 次失败后暂停 60 秒，避免 30×14 次无效重试风暴（llm-inference.ts）
- **LLM 提取 callLog 区分**: 调用成功但解析为空时标记 success=false，使数据质量分不再虚高（llm-extraction.ts）
- **AKShare 列名防御**: CPI/PMI/GDP 列名改为多候选遍历匹配，兼容 AKShare 版本升级（data-agents.ts）
- **社交情绪标注**: `computeBullBearRatio` 明确标注为价格衍生指标（非真实社交情绪）（data-agents.ts）
- **buyCompositeScore 默认值**: 从 70 改为 65（buy/watch 分界线），避免虚假 scoreDelta 下降（service.ts）
- **估值维度标注**: 明确标注量化分中的 value 指标为"均值回归度"而非真正估值（service.ts）

### 修复（稳定性/断电断网/长期运行）
- **withFileLock 竞态修复**: 改用 Promise 队列模式，修复多等待者同时获锁的边界条件（store.ts）
- **writeJson 加 fsync**: 写入后强制 fsync 刷盘，防止断电时 rename 后文件内容为空（store.ts）
- **tmpPath 加随机因子**: 防止同毫秒并发写入的临时文件名碰撞（store.ts）
- **trades.json 增长上限**: 超过 2000 条自动归档，防止长期运行后文件过大（store.ts）
- **watch-logs.json 增长上限**: 保留上限 1000 条（store.ts）
- **scheduler 时区修复**: `todayDateStr()` 改用 Asia/Shanghai，与 cron 时区一致（scheduler.ts）
- **数据源单次重试**: `trySource` 首次失败后等待 1 秒重试一次，缓解网络抖动（data-agents.ts）

## [1.24.0] - 2026-04-07
### 修复（P0 致命）
- **时区修复**: `todayDate()` 从 UTC 改为 `Asia/Shanghai`，修复凌晨 0-8 点日期错误（service.ts）
- **买入二次确认**: 买入确认和强制买入操作添加 `window.confirm()` 弹窗，防止误触（AIQuantApp.tsx）
- **并发竞态修复**: `confirmSignal/closePosition/reducePosition` 全部加 `withFileLock` 互斥锁，串行化关键数据写入，防止并发操作导致持仓/交易记录丢失（service.ts）

### 修复（P1 严重）
- **交易日修复**: `previousTradeDate` 和 FactPool 加载改用 `getRecentTradeDates()` 获取真正的前一个交易日，修复跨周末/节假日记忆回填丢失和周一 LLM 缺失市场情报的问题（service.ts）
- **止损止盈基准修复**: 确认买入时基于实际买入价格重新计算止损/止盈价，而非使用信号生成时的静态价格（service.ts）
- **评估权重统一**: `evaluatePositionScores` 现在使用与 `buildSignal` 一致的 `getAdjustedFusionWeights`，确保 `scoreDelta` 比较公平（service.ts）
- **市场级风控**: 确认买入时新增极端熊市和流动性危机检查，`user_override` 不再能绕过市场级风控（service.ts）
- **总仓位控制**: 确认买入时新增 `maxTotalPosition` 检查，防止总仓位权重超过配置上限（service.ts）
- **风控自动恢复**: 当触发暂停的条件（月度亏损/最大回撤）不再满足时，自动解除暂停，无需手动干预（service.ts, types.ts 新增 `pause_lifted` 事件）
- **风控交易日窗口**: `assessPortfolioRisk` 中日/周/月亏损窗口改为按交易日计算（1/5/22 交易日），而非自然日（service.ts）
- **LLM thinking 防护**: `callLLMOnce` 和 `callLLMChat` 新增 `<think>` 标签剥离和 `reasoning_content` 字段识别，防止 DeepSeek R1 等模型的思考内容干扰 JSON 解析（llm-inference.ts, llm-extraction.ts）
- **JSON 损坏备份**: 关键文件（positions/trades/strategy/runtime-status）解析失败时自动备份损坏文件，防止下次写入时不可逆覆盖（store.ts）
- **Python 子进程超时**: `service.ts` 中的 `runPythonJson` 新增 60 秒超时，防止 Python 脚本挂起导致整个分析流程永久阻塞
- **Bootstrap 残留恢复**: 启动时检测残留的 `running` 状态（超过 30 分钟视为残留）并重置为 `idle`；检测残留的盘中监控状态并在交易时段自动恢复定时器（service.ts）
- **Python 异常可见化**: data-agents.ts 中 11 处 Python `except` 块的 `success: True` 改为 `success: False`，使 AKShare 异常正确传播到 `trySource` 并记入 errors 数组
- **公告/新闻去重**: company_info 和 industry_news agent 在返回前按标题精确匹配去重，防止同一条公告/新闻从多个数据源重复采集导致 LLM 提取放大信号（data-agents.ts）

## [1.23.0] - 2026-04-07
### 新增
- **待卖出"忽略"按钮**: 止损/止盈/减仓/到期评估触发的"待处理卖出"现在可以忽略。忽略后 action 重置为 hold，下次行情刷新时重新评估；不受交易时间限制（service.ts, routes, StrategiesTab.tsx）
- **数据收集日期源独立**: `GET /available-dates?type=data-collection` 扫描 `data-agents/` 目录中的 fact-pool 文件，数据收集页面不再使用信号日期，确保下拉选项只包含有数据的日期（store.ts, service.ts, routes, DataCollectionTab.tsx）

### 修复
- **"已确认观望"文案**: 确认观望信号后，状态从错误的"已确认买入"改为"已确认观望"（蓝色标签），通过让 `decisionSourceLabel()` 感知信号原始 action 实现（utils.ts, StrategiesTab.tsx）
- **FactPool 空检测**: `readFactPool()` 文件不存在时返回 null 而非空对象，前端可正确显示"盘后分析尚未运行"空状态提示（store.ts, types.ts）

### 修复（数据采集 Agent 5 个持久 bug + 多源 fallback）
- **Eastmoney 公告 API 解析**: `resp.data` 实际是 `{list: [...]}` 嵌套对象，修正为 `resp.data?.list`，解决上市公司公告始终为空的问题（data-agents.ts）
- **股吧 API 替换**: `guba.eastmoney.com/interface/GetData` 已永久下线(404)，替换为同花顺热股排名 API（`dq.10jqka.com.cn`）+ 东方财富人气排名 API（`emappdata.eastmoney.com`）双备份（data-agents.ts）
- **AKShare 汇率参数名修正**: `currency_boc_sina()` 的 `date_start`/`date_end` 改为正确的 `start_date`/`end_date`，传入最近 7 天有效日期范围（data-agents.ts）
- **汇率三级 fallback**: Eastmoney 实时汇率 → AKShare 中行汇率 → AKShare 即时外汇报价（`fx_spot_quote`），避免假日单源失败导致零数据（data-agents.ts）
- **国债收益率修复**: `bond_china_yield()` 传入最近 30 天有效日期；曲线名匹配从 `中债国债收益率曲线(到期)` 修正为 `中债国债收益率曲线`；增加东方财富国债行情 fallback（data-agents.ts）
- **央视新闻日期参数**: `news_cctv(date="")` 修正为传入当天/昨天日期（`YYYYMMDD` 格式），当天无数据时自动尝试前一天（data-agents.ts）
- **全球指数数值校验**: sp500Change/nasdaqChange/hsiChange 增加 `validateNumericRange(-20, 20)` 校验，过滤假日 API 返回价格而非百分比的异常值（data-agents.ts）
- **HSI 恒生指数补全**: AKShare 全球指数 fallback 新增 `stock_hk_index_daily_sina("HSI")` 采集恒生指数涨跌幅（data-agents.ts）
- **千股千评产出优化**: AKShare `stock_comment_em()` 从仅返回计数改为产出涨跌统计快照（上涨/下跌/平盘数量 → 多空比），实际贡献 SocialSentimentSnapshot（data-agents.ts）

## [1.22.0] - 2026-04-07
### 修复（P2 全量清零 — 20 项）
- **跨年日历预同步**: 12月份自动同步下一年交易日历，避免跨年后无在线数据（trading-calendar.ts）
- **启动日历同步竞态**: 日历自检完成后再延迟启动业务初始化，消除启动时 isTradingDay 使用过期数据的竞态（scheduler.ts）
- **AKShare 版本兼容**: 新增 `checkAkShareVersion()` 启动时检测并记录 AKShare 版本，低于推荐版本时发出警告（data-agents.ts）
- **数值合理性校验**: 新增 `validateNumericRange()` 函数，Agent 1 宏观数据（CPI/PMI/GDP/汇率/利率/国债收益率）超出合理范围时过滤为 null（data-agents.ts）
- **DEFAULT_MAX_TOKENS 降级**: 从 50000 降为 8192，避免超出小模型上限。已配置 maxTokens 的 provider 不受影响（llm-inference.ts）
- **Fallback 优先不同 provider**: `buildFallbackCandidates()` 排序改为不同 provider 优先、同 provider 不同 model 在后，提高 fallback 成功率（llm-inference.ts）
- **截断 JSON 逐元素恢复**: 新增 `recoverArrayItems()` 函数，LLM 输出被截断时逐个提取完整的 `{...}` 元素，避免整批丢失（llm-extraction.ts）
- **Prompt 数量一致性**: 公告/新闻提取的 user message 使用实际截取后的数量（如 30 条），不再用原始总数（如 100 条）误导 LLM（llm-extraction.ts）
- **SentimentIndex ratio 归一化**: bullRatio + bearRatio + neutralRatio 不等于 1.0 时自动归一化；overallSentiment 和 sentimentChange24h 钳位到 [-1, 1]（llm-extraction.ts）
- **AnnouncementEvent 全字段校验**: 从仅校验 company/eventType/sentiment 扩展到全部 7 个字段（含 magnitude/confidence/keyMetrics/riskFlags），不完整记录直接丢弃（llm-extraction.ts）
- **观望评估 tPlus5Return=0**: 从 `<= 0` 算 correct 改为 `< 0` 算 correct、`> 0` 算 wrong、`=== 0` 保持 pending，避免 0 涨幅误判为"正确观望"（service.ts）
- **runtimeStatus 写入节流**: 历史 K 线抓取阶段从每个候选都写 runtimeStatus 改为每 20 个写一次，~500 次磁盘写入降至 ~25 次（service.ts）
- **Overview 持仓评估注释**: 明确标注 Overview 实时评估使用公式模拟是有意设计（LLM 投票耗时 30-120s/股不适合实时请求），LLM 评估通过 daily run 缓存（service.ts）
- **buildExpertScoreFallback 钳位**: bullishCount 上限 40、bearishCount 上限 45-bullishCount，确保 neutralCount >= 0 且三者之和恒为 45（service.ts）
- **残留 .tmp 文件清理**: 新增 `cleanupStaleTemporaryFiles()` 清理超过 1 小时的 .tmp 文件，bootstrap 时自动扫描 8 个子目录（store.ts）
- **文件路径参数校验**: 新增 `validatePathSegment()` 函数，getHistoryCachePath/getSignalPath/getMarketStatePath/getRunPath 的 code/tradeDate 参数必须匹配 `^[A-Za-z0-9._-]{1,30}$`，防止路径遍历攻击（store.ts）
- **callMemoryLLM min max_tokens**: 从 `Math.min(maxTokens ?? 2000, 4096)` 改为 `Math.max(512, Math.min(..., 4096))`，确保至少 512 token 避免输出截断（memory.ts）
- **记忆存储竞态保护**: `updateMemoryStore()` 和 `runLongTermMemoryUpdate()` 的 read-modify-write 操作包裹在 `withFileLock()` 中（memory.ts，store.ts 导出 withFileLock）
- **错误响应消毒**: 新增 `sanitizeErrorMessage()` 函数，41 个 500 响应的 error 字段不再直接返回 `error.message`（可能含文件路径等内部信息），改为脱敏后的安全概要（routes/stock-analysis.ts）
- **quantity 100 股整数倍**: confirm/close/reduce 三个端点的 quantity 参数自动 `Math.floor(qty / 100) * 100` 对齐到手（routes/stock-analysis.ts）
- **前端 Overview 类型对齐**: 16 个字段从 `?` 可选改为必填（匹配后端实际行为），含 marketRegime/fusionWeights/stats.maxPositions/recentReviews/riskEvents/riskLimits/positionEvaluations/swapSuggestions/notifications/marketLevelRisk/learnedWeights/expertPerformance/thresholdHistory/riskControl/postMarketAt/intradayMonitor

## [1.21.0] - 2026-04-07
### 修复
- **严重: confirm/reject 信号读不到历史日期信号**: `getStockAnalysisSignals` 只查最新日期，T+1 确认 T 日信号时 `find` 返回 null。新增 `findSignalByIdAcrossDates` 遍历最近 7 天信号文件
- **严重: 盘中告警无去重**: 每分钟重复生成相同 positionId+alertType 的告警，一天可达 240 条重复。新增 `unackedAlertKeys` Set 去重，同一持仓同一类型只保留一条未确认告警
- **严重: `runPythonJson` 无超时**: 17 处 Python 子进程调用无 timeout 参数，AKShare 卡网络时进程永久挂起。添加 `timeout: 60_000`
- **严重: Agent 7 sp500/nasdaq 数据语义错误**: AKShare fallback 数据源返回收盘价绝对值赋给 `sp500Change` 字段（应为涨跌幅百分比），下游 LLM 分析用收盘价当涨跌幅。改为 `(close - prev) / prev * 100` 计算涨跌幅
- **安全: extraction-agent assign 端点泄露 API Key**: 唯一遗漏 `maskApiKey` 的写入端点，明文 API Key 暴露到浏览器
- **安全: test-model 端点 SSRF 漏洞**: `baseUrl` 无校验，可探测内网（localhost、172.x、192.168.x 等）。添加 URL 协议和内网地址校验
- **安全: Python 代码注入风险**: 股票代码直接拼接进 Python 脚本，添加 `validateStockCode` 正则校验（仅允许字母数字和点号）
- **`runPythonJson` JSON.parse 错误缺乏上下文**: stdout 为非 JSON 时错误信息只有 `Unexpected token`，添加 stdout 前 200 字符预览
- **`buildQuantScore` 权重不归一化**: regime 调整后总权重偏离 1.0（如牛市 1.04），添加动态权重归一化
- **`compositeScore` 与 `finalScore` 语义不一致**: compositeScore 可超过 100（加分项），finalScore clamp 到 [0,100]，换仓比较时产生错误 delta。统一 compositeScore 也使用 clamp 后的值
- **`adjustConvictionThresholds` 修改 config 不持久化**: 内存中修改了 minCompositeScore 但未调用 `saveStockAnalysisConfig`，重启后丢失
- **盘后流程失败不更新 `runtimeStatus.lastError`**: 前端看不到失败原因
- **`buildReviewRecord` 只查最新日期信号**: 历史持仓的买入信号查不到，复盘使用默认值 0
- **`readJson` 静默吞掉所有错误**: 文件损坏（非 ENOENT）也返回默认值且无日志。区分 ENOENT（静默）和其他错误（记录警告）
- **Agent 4 `dataPoints` 初始值偏差**: 初始值为 `quotes.size` 导致 successRate 永远不为 0
- **短期记忆按条数截断**: `MAX_SHORT_TERM_DAYS * 10 = 50` 条硬编码，每日分析 >10 只时截断错误。改为按实际交易日截断
- **JSON 贪婪匹配跨越多 JSON 片段**: `llm-extraction.ts` 的 `[\s\S]*` 正则改为括号平衡匹配
- **`movingAverage60` 为 0 时除零**: 规则引擎 MA60 偏离计算产生 Infinity，添加零值防护
- **记忆截断日志显示截断后长度**: 保存原始长度到变量再打日志
- **`formatDateStr`/`isWithinTradingHours` 时区不安全**: 依赖服务器本地时区，非 Asia/Shanghai 服务器日期判断全错。强制使用 `toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })`
- **`getRecentTradeDates` MAX_ITERATIONS 过小**: `count * 5` 在长假时不够回溯。改为 `Math.max(count * 5, 30)`
- **前端减仓数量可能为 0**: `position.quantity < 200` 时 `Math.floor(q/2/100)*100 = 0`。添加 `quantity < 200` 时 disable 按钮
- **前端买入确认无 quantity 校验**: confirm/override_buy 模式下 quantity <= 0 可提交

### 新增
- **`findSignalByIdAcrossDates`**: 跨日期信号查找函数，先查最新日期再遍历最近 7 天
- **`atomicUpdateRuntimeStatus`**: 原子性读-改-写 runtimeStatus（带文件锁防并发覆盖）
- **`withFileLock`**: 简单的 per-file 异步互斥锁
- **`sanitizeNote`**: 路由层统一 note 截断（最大 2000 字符）
- **`validateStockCode`**: 股票代码格式校验函数
- **`extractBalancedJson`**: 括号平衡匹配 JSON 提取（替代贪婪正则）
- **LLM 专家投票整体超时**: `runExpertVoting` 5 分钟整体超时，超时后规则降级填充
- **信号量改为 Promise 队列**: `waitForGlobalSlot` 从 50ms 轮询改为主动 resolve
- **signals/market/daily-runs 目录自动清理**: signals 保留 90 天、market 保留 90 天、daily-runs 保留 60 天
- **前端 `IntradayAlert.alertType` 补全**: 添加 `volatility_spike` 和 `sector_anomaly`

## [1.20.0] - 2026-04-07
### 修复
- **AI 配置页面保存后模型配置清空**: 保存供应商/层级分配/专家分配后，后端响应缺少 `modelPool` 字段，前端用不完整数据替换状态导致所有模型下拉菜单变空。统一 4 个写入端点返回 `modelPool` + 遮罩 API Key，与 GET 端点保持一致
- **LLM 调用缺少 User-Agent 导致 OpenCodeGo 403**: `llm-inference.ts`、`llm-extraction.ts`、`memory.ts` 的 LLM 调用均未设 `User-Agent` 请求头，OpenCodeGo Zen/Go 网关拒绝无 UA 的请求。三个文件统一添加 `User-Agent` 头
- **XiaoMi mimo-v2-pro 模型名大小写敏感**: 配置中 `MiMo-V2-Pro`（大写）被小米 API 拒绝（403 Illegal access），修正为 `mimo-v2-pro`（小写）
- **严重: 20/30 LLM 专家主调用 100% 失败**: `max_tokens` 默认值 200000 超出阿里云 (上限 65536) 和智谱 (参数拒绝) 的 API 限制，导致 HTTP 400 错误。默认值从 200000 降至 50000，各平台均可兼容
- **`llm-extraction.ts` 硬编码 `max_tokens: 200000`**: 提取 Agent 的 LLM 调用忽略 provider 配置，改为读取 `provider.maxTokens ?? 50000`
- **`degradeRatio` 误算**: LLM fallback（换模型但仍是真实 LLM 分析）被等同于规则引擎降级。现区分三类：LLM 主成功 / LLM fallback 成功 / 规则引擎降级，`degradeRatio` 仅基于规则降级计算
- **专家权重误降约 21%**: `buildSignal` 降权逻辑适配新的 `degradeRatio` 语义，LLM fallback 不再触发降权

### 新增
- **`LLMExpertScore` 新增字段**: `llmFallbackCount`（LLM fallback 数）和 `ruleFallbackCount`（规则降级数），前后端类型同步更新
- **Prompt 上下文长度保护**: `buildExpertUserMessage` 增加 50000 字符上限，记忆部分超长时自动截断（优先保留股票数据和 FactPool）
- **记忆 LLM `max_tokens` 钳位**: `callMemoryLLM` 的 `max_tokens` 增加 `Math.min(..., 4096)` 硬性保护，防止 provider 全局配置过大导致记忆压缩调用失败
- **`llm-inference.ts` 测试导出**: 新增 `_testing` 导出（aggregateVotes, parseLLMResponse 等），新增 `llmInference.test.ts` 10 个测试
- **前端展示优化**: 策略页/专家分析页区分"LLM 成功"和"规则降级"，不再笼统显示"降级 N 票"

### 预期效果
- 阿里云 qwen3.5-plus (5 专家) + 智谱 GLM-5 (8 专家) 主调用恢复正常
- `degradeRatio` 从 ~70% 降至接近 0%（仅 mimo-v2-pro 网关 500 错误仍可能 fallback）
- 专家权重不再被不必要地降低

## [1.19.0] - 2026-04-07
### 新增
- **在线交易日历同步**: 通过 AKShare (tool_trade_date_hist_sina) 拉取在线交易日历数据，缓存到本地 JSON 文件（`cache/trading-calendar-{year}.json`），与静态数据交叉校验，发现差异自动输出 ERROR 级别日志
- **启动自检机制**: 服务启动时自动执行 `validateAndSyncCalendarOnStartup()`，检查静态数据覆盖范围、当天日期逻辑一致性、在线缓存是否过期（>7天自动刷新）
- **`isTradingDay` 双层数据源**: 优先查在线缓存的交易日集合（工作日有效），在线不可用时降级到静态假日数据，补班日始终优先返回 true
- **定期同步 cron**: 每天 07:30（盘前分析前）检查缓存是否过期并刷新；每月 1 日 06:00 强制刷新
- **交易日历专属测试**: 新增 `tradingCalendar.test.ts` 35 个测试，覆盖静态数据完整性、isTradingDay、交易时段、在线同步、启动自检

### 修复
- **严重: 交易日历节假日数据错误**: 2026年清明节假日数据为早期预估值，4月7日被错误列为清明假日导致当天无法交易。已依据国务院办公厅正式通知（国办发明电〔2025〕7号）全面修正 2026 年数据
- **2026年节假日修正**: 清明 4/4-4/6（移除错误的4/7）、春节补充2/23、五一补充5/4-5/5
- **2026年调休补班日修正**: 新增 1/4（元旦）、5/9（五一）、9/20（国庆），移除错误的 9/19（中秋无调休）

## [1.18.0] - 2026-04-07
### 新增
- **全量框架审计完成**: 对照设计文档 v2.0 完成 44 项问题全部修复（H:7, MH:2, M:14, L:21），详见 `docs/STOCK-ANALYSIS-GAP-REPORT.md`
- **三层记忆体系补全 (H4)**: 实现 `runLongTermMemoryUpdate` 月度长期记忆构建，LLM/统计降级双通道
- **Agent4 数据持久化 (H5)**: 资金流向/龙虎榜/大宗交易数据写入 FactPool.priceVolumeExtras 并注入 prompt
- **重大事件一票否决 (MH1)**: `buildSignal` 增加 eventVetoCodes 参数，从 FactPool 公告+LLM 提取结果构建否决集合
- **盘中监控增强 (MH2)**: 添加 volatility_spike（盘中振幅>6%）和 sector_anomaly（同板块3+跌停）检测
- **Kelly 公式仓位计算 (M5)**: 半 Kelly 公式变体，winRate 取自 learnedWeights，钳位 [0.05, 0.3/0.2]
- **前端 Toast 通知系统 (L20)**: AIQuantApp 新增 Toast 队列（success/error/info），action 级别错误改为 toast 而非全页面 ErrorState
- **前端确认对话框 (L21)**: 平仓和减仓操作添加 `window.confirm()` 二次确认，显示股票名称/代码/数量
- **内存 LLM fallback 链 (L16)**: 新增 `callMemoryLLM()` 多供应商 fallback 函数
- **文件增长清理 (L13)**: 通用 `pruneOldDateFiles` 函数，FactPool/PostMarket/LLMExtraction 自动清理
- **JSON 括号匹配 (L3)**: `extractOutermostJson()` 三级降级解析

### 修复
- **市场状态百分位法 (M3)**: detectVolatility/detectLiquidity 优先使用百分位法(75th/25th)
- **专家 fallback 降权 (M4)**: isSimulated 时专家权重降50%，部分降级按 degradeRatio 降权
- **显式时区 (M7)**: 所有 cron.schedule 调用添加 `timezone: 'Asia/Shanghai'`
- **防重复执行 (M8)**: 防重复守卫移至 scheduler.ts cron 回调
- **API Key 遮罩 (M10)**: GET 返回遮罩后的 apiKey（`sk-****1234` 格式），PUT 自动恢复
- **data-agent-config 输入校验 (M11)**: 验证 body 结构、agents 数组、每个元素必填字段
- **maxPositions 配置化 (M14)**: overview API 新增 maxPositions 字段，前端从配置读取
- **原子写入 (L14)**: writeJson 改为 write-to-temp-then-rename
- **每日记忆清理 (L15)**: saveExpertDailyMemories 调用 pruneOldDateFiles
- **Python 异常处理 (L18)**: 全部 17 个 bare `except:` 改为 `except Exception as e` 并输出 stderr

### 优化
- **Agent 并行化 (L17)**: collectMacroEconomy 独立数据源 Promise.all 并行采集
- **路由路径缓存 (L19)**: getStockAnalysisDir 模块级缓存 + 5 分钟 TTL
- **store 目录缓存 (L1)**: ensureStockAnalysisStructure 模块级 Set 缓存
- **isSimulated 语义扩展 (L4)**: 新增 degradeRatio 数值字段，兼容原 boolean
- **max_tokens 可配置 (L5)**: provider.maxTokens 可选字段，默认 200000
- **routes 架构统一 (L6)**: 3 个路由从直接 store 改为调用 service 层函数
- **记忆 backfill 扩展 (L2)**: 从 quoteCache 补填昨日记忆中缺失的股票
- **统计压缩加权平均 (M12)**: 基于 sampleCount 加权，向后兼容旧数据

### 验证
- 后端 54/54 测试通过（3 service + 6 position-eval + 1 routes + 44 memory）
- 前端 84/84 测试通过，前端 + 后端 build 通过
- GAP-REPORT: 44/44 问题全部修复 (100%)

## [1.17.0] - 2026-04-04
### 新增
- **LLM 提取 Agent 独立模型配置**：3 个 LLM 提取 Agent（公告解析器、新闻影响分析器、舆情情感分析器）现在各自可独立分配模型，不再共享单一模型。支持 per-agent `assignedModel` 配置，失败时自动 fallback 到其它可用模型。
  - 后端 `llm-extraction.ts` 完全重写，新增 `pickPrimaryCandidate()`、`buildFallbackCandidates()`、`callWithFallback()` 等函数。
  - 后端 `types.ts` 新增 `LLMExtractionAgentId` 类型和 `LLMExtractionAgentConfig` 接口。
  - 后端 `store.ts` 新增 `DEFAULT_EXTRACTION_AGENTS` 常量及旧配置 backward compatibility。
  - 后端 `service.ts` 新增 `assignModelToExtractionAgent()` 函数。
  - 后端 `routes/stock-analysis.ts` 新增 `POST /ai-config/extraction-agents/:agentId/assign` 路由。
  - 前端 AI 配置页面新增「Section 5: LLM 提取 Agent 模型配置」，下拉框选择模型，支持"自动选择"和手动指定。
- **前端类型和 API**：`types.ts` 新增 `LLMExtractionAgentId`、`LLMExtractionAgentConfig`；`api.ts` 新增 `assignModelToExtractionAgent()` 函数。

### 优化
- **候选股票池缩减**：每日策略初筛候选池从 50 只缩减至 30 只，减少 LLM 专家分析的 token 消耗和执行时间。

### 验证
- 后端 41/41 测试通过（3 service + 6 position-eval + 1 routes + 31 memory）。
- 前端 84/84 测试通过，前端 + 后端 build 通过。
- 服务重启后 API 正常响应，`extractionAgents` 配置字段正确返回（旧配置自动补充）。

## [1.16.0] - 2026-04-04
### 新增
- **AI 专家分析页面**：新增 `ExpertAnalysisTab`，支持按日期查看所有 45 位 AI 专家的投票明细，按分析层分组展示每位专家的判断（看多/看空/中性）、信心度、推理原因、使用模型和延迟。同时展示专家记忆库（短期/中期/长期三层）和当日专家记忆条目表格。
- **AI 数据收集页面**：新增 `DataCollectionTab`，支持按日期查看 FactPool 全部内容（宏观经济、政策事件、公司公告、行业新闻、社交情绪、全球市场、数据质量报告），以及 LLM 提取结果（公告事件、新闻影响、情绪指数）和 LLM 调用日志。
- **3 个新 API 端点**：
  - `GET /available-dates` — 扫描信号目录返回可用日期列表（最新在前）
  - `GET /expert-analysis?date=` — 返回指定日期的信号投票明细 + 专家记忆
  - `GET /data-collection?date=` — 返回指定日期的 FactPool + LLM 提取结果
- **侧边栏导航**：AI 炒股应用新增「AI专家分析」和「AI数据收集」两个页签入口。

### 修复
- **types.ts 重复接口**：修复 `DataAgentResult` 接口重复定义导致的 `agentId` 类型冲突。

### 验证
- 后端 41/41 测试通过（3 service + 6 position-eval + 1 routes + 31 memory）。
- 前端 84/84 测试通过，前端 + 后端 build 通过。
- 服务重启后 3 个新 API 端点正常响应（available-dates 返回 3 个日期，expert-analysis 返回 39 个信号含投票明细，data-collection 返回空 FactPool 符合预期）。

## [1.15.0] - 2026-04-04
### 修复
- **信号操作状态未锁定**：`confirmStockAnalysisSignal()` 和 `rejectStockAnalysisSignal()` 新增 `decisionSource !== 'system'` 前置检查，已操作的信号不可重复操作，抛出"该信号已被处理"错误。前端 StrategiesTab 已操作信号替换操作按钮为状态横幅（"今日已操作：已确认买入/已放弃/已忽略"），侧边栏信号卡片显示操作状态徽章。
- **买入价使用过时数据**：`confirmStockAnalysisSignal()` 在用户未指定价格时，现通过 `getQuoteData()` 获取实时报价（与卖出/减仓一致），仅在实时获取失败时降级使用 `signal.latestPrice`。

### 新增
- **交易时间限制**：新增共享模块 `trading-calendar.ts`，包含 `CHINA_MARKET_HOLIDAYS`（2025-2027 年）、`isTradingDay()`、`isWithinTradingHours()`、`checkTradingAvailability()`、`getRecentTradeDates()`。买入确认、平仓、减仓操作在非交易时间被阻止；确认观望/忽略/放弃等非交易操作不受限制。
- **交易状态 API**：新增 `GET /api/system/stock-analysis/trading-status` 端点，返回 `{ canTrade, reason }`，前端据此禁用交易按钮并显示琥珀色提示横幅。
- **`decisionSourceLabel()` 工具函数**：前端 `utils.ts` 新增决策来源中文标签映射函数。

### 变更
- **`memory.ts` 重构**：将内联的 `CHINA_MARKET_HOLIDAYS`、`getRecentTradeDates()`、`formatDate()` 替换为从 `trading-calendar.ts` 导入，消除重复代码。
- **`service.ts` 中 `isWithinTradingHours()` 委托**：盘中监控轮询的交易时间判断现委托给共享模块。
- **前端 RiskTab**：新增 `tradingStatus` 属性，非交易时间禁用减仓/平仓按钮。
- **前端 AIQuantApp**：新增 `tradingStatus` 状态管理，传递至 StrategiesTab 和 RiskTab。

### 验证
- 后端 41/41 测试通过（3 service + 6 position-eval + 1 routes + 31 memory）。
- 前端 84/84 测试通过，前端 + 后端 build 通过。
- 服务重启后 `/trading-status` 和 `/overview` API 正常响应。
- 交易状态正确返回周末休市信息。

## [1.14.0] - 2026-04-04
### 新增
- **策略页面「待处理卖出」区域**：StrategiesTab 顶部新增红色卖出卡片区域，展示 `buildDailyAdviceSummary().sells` 数据，含股票名/代码、触发原因、盈亏百分比、数量，以及「减半」「平仓」操作按钮。
- **ActionMode 扩展**：新增 `'acknowledge'`（确认观望/已阅）和 `'override_buy'`（推翻观望主动开仓）两种操作模式。
- **DecisionSource 扩展**：新增 `'user_override'` 类型，标记用户推翻 watch/none 信号主动买入的决策来源。

### 变更
- **后端 confirm 逻辑按信号类型分支**：`confirmStockAnalysisSignal()` 根据 `signal.action` 和 `request.quantity` 四种组合分别处理：
  - watch/none + quantity=0 → 仅标记已确认，不创建持仓
  - buy/strong_buy + quantity=0 → 抛错要求指定委托数量
  - watch/none + quantity>0 → 创建持仓，`sourceDecision='user_override'`
  - buy/strong_buy + quantity>0 → 正常确认流程
- **前端按信号类型分化操作按钮**：strong_buy/buy 显示「确认买入」+「放弃买入」+「忽略」；watch 显示「确认观望」+「我要买入」+「忽略」；none 显示「已阅」+「我要买入」。
- **前端按信号类型差异化信息展示**：watch/none 隐藏仓位/止盈/止损行，仅显示现价 + 支撑/压力位；strong_buy/buy 展示全部交易参数。
- **confirm 路由放宽 quantity 校验**：不再强制要求 quantity > 0，允许 acknowledge 模式零数量确认。
- **StrategiesTabProps 扩展**：新增 `onClosePosition` 和 `onReducePosition` 回调属性。

### 验证
- 后端 41/41 测试通过（3 service + 6 position-eval + 1 routes + 31 memory）。
- 前端 84/84 测试通过，前端 + 后端 build 通过。
- 服务重启后 overview API 正常响应。

## [1.13.0] - 2026-04-04
### 修复
- **P0-1: 社交情绪 bull/bear ratio 硬编码**：全部 4 个数据源（东方财富股吧、AKShare 热股排名、东方财富热股、微博热搜）已替换为 `computeBullBearRatio()` 函数，基于真实涨跌数据计算，无数据时使用均匀分布 (0.33/0.33/0.34)。同时修正了平台名称 `'guba'` → `'eastmoney_hot'`。
- **P0-2: 持仓评估始终使用公式模拟**：`evaluatePositionScores` 改为 `async`，新增可选 `aiConfig` 等参数，有 LLM 配置时调用 `runExpertVoting()` 获取真实专家评分，失败时降级为公式模拟。日常运行和盘后运行均传递 AI 配置，Overview（只读展示）仍用公式模拟以节省开销。
- **P1-4: AKShare 全球数据只计数未赋值**：`akGlobal.sp500` 和 `akGlobal.nasdaq` 现在正确赋值到 `snapshot.sp500Change` 和 `snapshot.nasdaqChange`。
- **P1-6: 政策/公告/新闻分类始终默认**：新增 `classifyPolicyCategory()`、`classifyAnnouncementCategory()`、`classifyNewsSectors()` 三个基于关键词的分类函数，覆盖货币政策/监管/财政/产业、业绩/股权/内幕/诉讼、10 大行业板块等分类维度。全部 14 处硬编码分类已替换。
- **P1-7: `getRecentTradeDates` 不考虑中国节假日**：新增 `CHINA_MARKET_HOLIDAYS` 静态表（2025-2027 年元旦/春节/清明/五一/端午/中秋/国庆），跳过法定假日。回溯上限从 `count*2` 提高到 `count*3` 以覆盖长假。
- **P2-9: 数据源名称 `AKShare-xueqiu` 误导**：重命名为 `AKShare-hot-rank-em`，与实际调用的 `ak.stock_hot_rank_em()` 一致。
- **P2-10: Agent 5 和 Agent 3 重复新浪 URL**：行业新闻 Agent 数据源 2 从 `lid=2516`（产经新闻）改为 `lid=2686`（上市公司新闻），消除重复。

### 新增
- **P1-5: 美国 10 年期国债收益率数据源**：全球市场 Agent 新增数据源 6（`AKShare-us10y`），使用 `ak.bond_zh_us_rate()` 获取 10Y 收益率日环比变动，填充 `us10yYieldChange` 字段。

### 删除
- **P2-8: 死代码 `trySourcesInOrder`**：已删除未使用的函数（定义于 data-agents.ts 但无调用点）。

### 变更
- **P0-3 (上次会话)**: `activeTimeoutMs` 竞态条件已在上次会话中修复（参数化超时，消除全局可变状态）。
- `SocialSentimentSnapshot.platform` 类型扩展：新增 `'eastmoney_hot'` 字面量。
- 持仓评估测试（3 个）更新为 `async/await` 以匹配函数签名变更。

### 验证
- 后端 41/41 测试通过（3 service + 6 position-eval + 1 routes + 31 memory）。
- 前端 84/84 测试通过，前端 + 后端 build 通过。
- 服务重启后 overview API 正常响应。

## [1.12.0] - 2026-04-04
### 新增
- **专家 AI 记忆系统**（`memory.ts`，~719 行）：
  - 三层记忆架构：短期记忆（最近 5 日原始预测）、中期记忆（30 日 LLM 压缩摘要）、长期记忆（历史教训与模式）。
  - 记忆维度：按专家（per-expert）汇总，所有股票预测合并到一个专家记忆中。
  - Token 预算控制：记忆部分上限 80,000 tokens。
  - FactPool 数据注入：将 8 大数据采集 Agent 的结果摘要（宏观经济/政策法规/公司公告/价量异动/行业新闻/社交舆情/全球市场/数据质量）注入专家 LLM 提示词。
  - 专家行为画像注入：将每位专家的历史胜率、连胜/连败、看多/看空偏好等画像信息注入 system prompt。
  - LLM 压缩：中期记忆由 LLM 将近 30 日预测记录压缩为关键模式和教训摘要，失败时自动降级为统计摘要。
  - 盘后分析 Phase 7：`runDailyMemoryUpdate` 自动更新所有专家的短期记忆和中期记忆。
  - 31 个测试全部通过。
- **数据采集 Agent 配置 UI**：
  - 后端新增 GET/PUT `/data-agent-config` API，支持读取和保存 8 个数据 Agent 的启用/禁用和超时配置。
  - 前端 AI 配置页新增"第 4 节：数据采集 Agent"，每个 Agent 卡片含开关切换和超时毫秒数输入框。
  - `collectAllAgents` 运行时根据配置过滤禁用的 Agent，并使用独立超时。
- **工具栏按钮提示**：顶部 4 个操作按钮（盘中监控/盘后分析/刷新股票池/运行今日分析）均添加 `title` 属性，鼠标悬停显示功能说明。

### 验证
- 后端 41/41 测试通过（3 service + 6 position-eval + 1 routes + 31 memory）。
- 前端 84/84 测试通过，前端 + 后端 build 通过。
- 服务重启后 overview API 和 data-agent-config API 均正常响应。

## [1.11.0] - 2026-04-04
### 新增
- **G1: 双循环流程（盘后分析）**：每日 16:00 自动运行盘后分析（`runStockAnalysisPostMarket`），6 阶段流程：刷新行情与市场状态 → 持仓健康评估 → 组合风控检查 → 数据采集（G3） → LLM 抽取（G3+M3） → 持久化结果。支持手动触发（`POST /run/post-market`）。
- **S1: 盘中实时监控**：交易时段（09:30-11:30, 13:00-15:00）每 60 秒轮询，检查止损、止盈1、止盈2、最大持仓天数 4 种告警条件。支持手动启停（`POST /intraday/start`, `POST /intraday/stop`），查看状态（`GET /intraday/status`）和告警列表（`GET /intraday/alerts`），以及告警确认（`POST /intraday/alerts/:id/acknowledge`）。
- **G3: 八大数据采集 Agent**（`data-agents.ts`，~620 行）：
  - 宏观经济、政策法规、公司公告、价量异动、行业动态、社会舆情、全球市场、数据质量共 8 个 Agent。
  - 每个 Agent 配置 5 个备用数据源（AKShare / Eastmoney / CNINFO / Sina / Tencent），保障"宁可旧，不可挂"。
  - 7 个数据 Agent 并行采集（`Promise.all`），结果汇入共享 FactPool。
- **G3+M3: LLM 抽取层**（`llm-extraction.ts`，~290 行）：
  - 公告解析器：从 FactPool 中提取公告事件（`AnnouncementEvent[]`）。
  - 新闻影响分析器：评估新闻对个股/板块的影响程度（`NewsImpactEvent[]`）。
  - 情绪分析器：综合多源数据生成市场情绪指数（`SentimentIndex`）。
  - 3 个抽取 Agent 并行运行，AI 未配置时 graceful fallback。
- **G7: 事件驱动选股**：在每日分析的候选筛选后（Phase 3.5）插入事件驱动选股，读取前一日 LLM 抽取结果，将正面公告（sentiment > 0.3, confidence > 0.6）和利好新闻影响的股票自动加入候选池。
- **前端 API 函数**：`api.ts` 新增 6 个函数对接盘后分析和盘中监控端点。
- **前端类型同步**：`types.ts` 新增 `IntradayMonitorState`、`IntradayAlert`、`IntradayMonitorStatus`、`DataAgentResult`、`StockAnalysisPostMarketResult` 等类型。Overview 的 `systemStatus` 新增 `intradayMonitor` 摘要字段。
- **前端 UI 完善**：
  - **顶部工具栏**：新增"盘中监控"按钮（绿色启动/红色停止切换）和"盘后分析"按钮，一键触发对应后端流程。
  - **Dashboard 盘中告警横幅**：监控运行时每 30 秒轮询告警列表，红色横幅展示未确认的告警（止损/止盈/追踪止损/超期持仓），支持逐条确认已读。
  - **Dashboard 盘中监控徽章**：系统状态栏旁显示监控运行状态（待机/运行中/已暂停），含轮询次数和活跃告警数。
  - **Dashboard 系统状态**：新增"盘后分析"时间戳和"盘中监控"详细状态信息。
- **调度器扩展**：新增 3 个 cron 任务（16:00 盘后分析、09:25 启动盘中监控、15:05 停止盘中监控）。
- **Overview API 扩展**：`getStockAnalysisOverview()` 新增读取 intradayMonitorStatus，返回 `systemStatus.intradayMonitor` 摘要（state/lastPollAt/pollCount/activeAlertCount/startedAt）。

### 验证
- 后端 10/10 测试通过，前端 84/84 测试通过，后端 + 前端 build 通过。
- 服务重启后 overview API 返回 `intradayMonitor` 和 `postMarketAt` 字段正常。
- 顶部工具栏按钮可正常调用盘后分析和盘中监控 API。

## [1.10.0] - 2026-04-04
### 新增
- **M7: 支撑/阻力位定价**：基于历史 K 线计算关键支撑位和阻力位，用于优化买入/卖出时机和止盈止损价位。
- **市场级风控**：根据市场状态（趋势、波动率、流动性、情绪）动态调整最大持仓数、单票仓位上限、止损阈值等风控参数，熊市自动收紧、牛市适当放宽。
- **S2: 自动周报生成**：每周五 16:00 自动生成周度报告，包含交易笔数、周收益、累计收益、胜率、夏普比率、最佳模型组等指标摘要，及策略预警和调优建议。支持手动触发（`POST /reports/generate-weekly`）。
- **S3: 自动月报生成**：月末最后一个交易日 16:30 自动生成月度报告，包含完整月度统计、模型组表现排名、7 条规则引擎驱动的调优建议（胜率阈值、保守策略检测、模型组弱势识别、观望比率、止损频率、Conviction Filter 通过率等）。生成 markdown 格式叙事报告。支持手动触发（`POST /reports/generate-monthly`）。
- **通知系统**：
  - 自动报告生成后创建通知，在前端 Dashboard 顶部以横幅形式展示（区分周报/月报类型标签）。
  - 支持已读确认（`POST /notifications/:id/acknowledge`），确认后从 Dashboard 横幅中移除。
  - Overview API 返回最近 10 条未读通知。
  - 新增 5 个 API 端点：通知列表、确认已读、月报列表、手动触发周报/月报。
- **调优建议引擎**（`generateTuningSuggestions`）：7 条规则自动检测策略问题并生成具体可操作建议（含当前值和建议值）。

### 修复
- `service.ts` 止损频率统计：`t.reason` 修正为 `t.note`（`StockAnalysisTradeRecord` 无 `reason` 字段）。

### 验证
- 后端 10/10 测试通过，前端 84/84 测试通过，后端+前端 build 通过。
- 手动触发周报生成成功，通知创建/确认 API 验证通过。
- ClawOS 服务重启后 API 正常返回 `notifications` 字段。

## [1.9.0] - 2026-04-04
### 新增
- **G5: 专家个体表现追踪系统**：
  - 新增 `StockAnalysisExpertPerformanceEntry` / `StockAnalysisExpertOutcome` / `StockAnalysisExpertPerformanceData` 类型，追踪每位专家（LLM + 规则）的预测次数、正确率、置信度、校准度和动态权重。
  - 新增 `readStockAnalysisExpertPerformance()` / `saveStockAnalysisExpertPerformance()` 持久化函数，数据存储于 `experts/expert-performance.json`。
  - 新增 `updateExpertPerformance()` 函数，在平仓时自动评估每位专家的买入预测是否正确（看多+盈利=正确，看空+亏损=正确），更新 winRate / calibration / weight。
  - 新增 `computeExpertWeight()` 函数，基于历史胜率和 60 天半衰期衰减计算动态权重（范围 0.1-2.0），最少 5 次预测后才偏离默认权重。
  - `getStockAnalysisOverview()` 返回数据新增 `expertPerformance` 字段，前端可直接消费。
- **G4: 专家权重融入投票聚合**：
  - `aggregateVotes()` 新增可选 `expertWeights` 参数，每位专家的投票贡献 = 动态权重 × 置信度（原来仅用置信度）。
  - `runExpertVoting()` 和 `buildSignal()` 签名更新，支持传入专家权重 Map。
  - `runStockAnalysisDaily()` 在信号生成前加载专家表现数据，构建权重 Map 传入信号生成流程。
- **S9: 专家权重衰减**：动态权重内含时间衰减机制（60 天半衰期），长期未预测的专家权重自然回归 1.0。
- **G5-4: 模型组真实胜率**：`buildModelGroupPerformance()` 现在从专家表现数据中聚合真实 winRate / calibration / weight（原来硬编码 0）。
- **前端类型同步**：`StockAnalysisExpertPerformanceData` 等类型已添加到前端 `types.ts`，`StockAnalysisOverview` 新增 `expertPerformance` 可选字段。

### 验证
- 后端 10/10 测试通过，前端 84/84 测试通过，后端+前端 build 通过。
- API 已验证返回 `expertPerformance` 字段（首次启动时为空 entries，平仓后自动填充）。

## [1.8.5] - 2026-04-04
### 新增
- **S4: 黑名单集成到每日筛选**：`runStockAnalysisDaily()` 候选选股阶段读取 `blacklist.json`，将黑名单股票直接排除在候选之外，避免浪费 LLM 调用额度。筛选日志新增 `黑名单排除=N` 字段。
- **S5: 持仓满时跳过 LLM 调用**：当 `currentPositions.length >= maxPositions` 时，新信号生成使用 fallback 评分（公式模拟），跳过昂贵的 LLM 调用。信号仍会生成以支持换仓比较。
- **S6: 次新股过滤**：历史 K 线记录不足 60 条的股票（上市不足 60 个交易日）直接跳过，避免数据不足导致技术指标失真。
- **S7: 停牌股过滤**：在获取历史数据前检查 `quote.open <= 0 || quote.turnoverRate <= 0`，过滤停牌/未正常交易的股票。
- **M8: 减仓功能（减半卖出）**：
  - 后端：新增 `reduceStockAnalysisPosition()` 函数，支持部分卖出（验证卖出数量 < 总持仓量，获取实时行情定价，按比例调整仓位权重）。
  - 路由：新增 `POST /positions/:id/reduce` API 端点。
  - 前端：风控面板持仓卡片新增"减半"按钮（仅当持仓 > 100 股时显示），卖出数量自动对齐到 100 股整数倍（A股最小交易单位）。

### 验证
- **M5: 自动复盘**：确认 `buildReviewRecord()` 在 `closeStockAnalysisPosition()` 中已自动调用，每次平仓自动生成复盘记录，无需额外修改。
- 后端 10/10 测试通过，前端 84/84 测试通过，build 通过。

## [1.8.4] - 2026-04-04
### 修复
- **BUG-1: 平仓 pnl 始终为 0%**：`closeStockAnalysisPosition()` 在 `request.price` 缺失时，现在主动通过 `getQuoteData()` 获取实时行情作为卖出价，不再回退到 `position.currentPrice`（该值在未更新时等于买入价）。仅当实时行情获取失败时才降级使用 `currentPrice`。
- **BUG-2: 选股崩溃，候选数降至 0**：根因是腾讯 K 线数据源仅返回 6 字段（无成交额），代码硬编码 `turnover: 0`，导致 `averageTurnoverAmount20d >= 50,000,000` 硬过滤淘汰全部 500 只股票。

### 新增
- **6 级 K 线数据源 fallback 链**：个股历史 K 线获取现在依次尝试 6 个数据源，确保成交额数据真实可靠：
  1. **同花顺 (10jqka)** — JSONP 格式，真实成交额（元），约 140 条记录 ✅ 主力源
  2. **搜狐 (Sohu)** — JSON 格式，成交额（万元）+ 换手率，约 141 条记录 ✅
  3. **东方财富 (Eastmoney)** — JSON 格式，全字段（OpenSSL 3.5.x TLS 可能失败）✅
  4. **新浪 (Sina)** — JSON 格式，通过 volume×avgPrice 推导成交额 ✅
  5. **腾讯 (Tencent)** — JSON 格式，通过 volume×avgPrice×100 推导成交额 ✅
  6. **本地缓存兜底** — 过期缓存回退 ✅
- **选股筛选漏斗日志**：`runStockAnalysisDaily()` 在选股完成后输出详细筛选漏斗（候选数/成交额不足/振幅不足/连跌超限/通过数），便于排查筛选异常。
- **腾讯数据源成交额推导**：`fetchStockHistoryFromTencent()` 不再硬编码 `turnover: 0`，改为 `volume × avgPrice × 100` 推导近似成交额。

### 验证结果
- 筛选漏斗：`候选=500, 成交额不足=0, 振幅不足=461, 通过hardFilter=39`（修复前：成交额不足=500, 通过=0）
- Daily run 成功完成：`candidates=39, signals=39`
- 所有 500 只股票历史缓存已从同花顺重新获取，均包含真实成交额数据
- 后端 10/10 测试通过，前端 84/84 测试通过，build 通过

## [1.8.3] - 2026-04-04
### 新增
- **LLM 调用自动 fallback 机制**：当主分配的模型/供应商调用失败时，自动依次尝试其他可用的 provider + model 组合，直到成功或全部候选耗尽才降级为规则推断。
  - 新增 `callLLMOnce()` 底层单次调用函数和 `callExpertLLMWithFallback()` 带重试逻辑的上层函数。
  - 新增 `buildFallbackCandidates()` 构建备选模型池（排除主分配，遍历所有 enabled provider 的全部 model）。
  - fallback 尝试过程有完整日志记录（成功/失败均记录到 StockAnalysis 模块日志）。
- **全局并发上限**：新增 `MAX_GLOBAL_CONCURRENCY = 8`，防止跨 provider 并行时同时发出过多请求。
- **OpenCodeGo 供应商接入**：新增 OpenCodeGo provider（4 个模型：kimi-k2.5, glm-5, mimo-v2-pro, minimax-m2.7），全部连通性测试通过。

### 变更
- **思考模式优先分配策略**：30 个 LLM 专家按"思考模式优先"重新均匀分配到 8 个模型上。
  - 6 个支持思考模式的模型（OpenCodeGo/kimi-k2.5, OpenCodeGo/glm-5, OpenCodeGo/mimo-v2-pro, ZHIPU/GLM-5, Aliyun/glm-5, Aliyun/qwen3.5-plus）：各分配 4-5 个专家（共 28 个）。
  - 2 个不支持思考模式的模型（Aliyun/kimi-k2.5, OpenCodeGo/minimax-m2.7）：各分配 1 个专家（低优先级）。
- **`runLLMByProvider()` 重命名为 `runLLMWithFallback()`**：整合 fallback 机制和全局并发控制。
- **max_tokens 从 512 提升至 200000**：用户要求利用百万级上下文窗口，防止 ZHIPU 等将 reasoning_tokens 计入 max_tokens 导致输出截断。

### 修复
- **ZHIPU baseUrl 修正**：从通用 API 端点 `api.z.ai/api/paas/v4/` 更新为 Coding Plan 专属端点 `api.z.ai/api/coding/paas/v4`。
- **OpenCodeGo baseUrl 修正**：移除多余的 `/chat/completions` 后缀（代码会自动拼接该路径）。

### 验证结果
- 后端 10/10 测试通过，前端 84/84 测试通过，build 通过。
- OpenCodeGo 4 个模型连通性测试全部通过（延迟 1-2s）。
- 思考模式验证：6 个模型支持 reasoning（glm-5, qwen3.5-plus, OpenCodeGo/kimi-k2.5, OpenCodeGo/glm-5, OpenCodeGo/mimo-v2-pro, ZHIPU/GLM-5），2 个不支持（Aliyun/kimi-k2.5, OpenCodeGo/minimax-m2.7）。

## [1.8.2] - 2026-04-03
### 修复
- **LLM 调用可靠性大幅提升**：从首轮 93.3% 降级修复至 34.7% 降级（剩余降级为独立 provider 配置问题，非代码 bug）。
  - **超时修复**：`LLM_CALL_TIMEOUT_MS` 从 20s 提升至 90s，适配 glm-5（平均 50s）和 qwen3.5-plus（平均 48s）的深度思考模式。
  - **response_format 兼容性修复**：移除 `response_format: { type: "json_object" }`，该参数与 kimi-k2.5 不兼容导致输出截断。`parseLLMResponse` 的 3 级容错解析已足够处理所有格式。
  - **system message 修复**：`callExpertLLM` 改用专家自身的 `systemPrompt`，不再使用硬编码的通用系统消息。拆分为 `buildExpertSystemMessage()` + `buildExpertUserMessage()` 两个函数。
  - **max_tokens 提升**：从 200 提升至 512，避免推理模型输出被截断。
  - **保留深度思考**：移除 `enable_thinking: false`，保持模型质量。

### 新增
- **Per-Provider 并发控制**：每个 AI 供应商可独立配置 `concurrency`（最大并发调用数），替代全局统一的 `MAX_LLM_CONCURRENCY`。
  - 快速模型（如 kimi-k2.5，平均 2s）可设更高并发，慢速思考模型（如 glm-5）可设低并发。
  - 各 provider 组之间并行执行，组内按 concurrency 限流。
  - 旧配置自动补丁 `concurrency: 3` 默认值。
- **前端并发数编辑 UI**：AI 配置页供应商编辑器新增"最大并发数"数字输入框。

### 变更
- **`runExpertVoting()` 重写为 `runLLMByProvider()`**：按 providerId 分组执行专家 LLM 调用，每组使用该 provider 的 concurrency 限制。
- **`StockAnalysisAIProvider` 类型**：新增 `concurrency: number` 字段（前后端同步）。

### 验证结果
- kimi-k2.5: 35/35 成功 (100%), 平均 2.1s
- glm-5 (Aliyun): 30/30 成功 (100%), 平均 49.9s
- qwen3.5-plus: 33/35 成功 (94.3%), 平均 48.0s
- 后端 10/10 测试通过，前端 84/84 测试通过，build 通过。

## [1.8.1] - 2026-04-03
### 新增
- **30 个独立 LLM 专家 systemPrompt**：每个 LLM 专家拥有唯一的角色设定、分析框架（4-5 条）和决策风格，替代旧版"层级 prompt + 立场引导"的同质化拼接方式。
  - 涵盖 9 个分析层：产业链(3)、公司基本面(4)、卖方研报(3)、世界格局(3)、全球宏观(3)、风控治理(3)、情绪面(4)、市场交易(3)、买方视角(4)。
  - 同层内专家视角互补（如产业链层：上游供给 / 下游需求 / 产业政策），不同层间正交。
  - 全部 systemPrompt 使用中文，150-300 字。
- **infoSubset 数据过滤**：`buildStockContext()` 新增 `infoSubset` 参数，按专家关注维度（basic/price/momentum/ma/volume/volatility/market/technical）过滤传给 LLM 的上下文数据，减少无关信息干扰。
- **systemPrompt 前端编辑**：AIConfigTab 展开专家列表后可查看/编辑每个 LLM 专家的 systemPrompt，支持实时保存。
- **后端 API**：新增 `PUT /ai-config/experts/:id/system-prompt` 端点，支持单个专家 systemPrompt 的独立更新。

### 变更
- **专家数量从 45 LLM 减少到 30 LLM**：精简重复视角，总数 45 个（30 LLM + 15 规则函数）。
- **`buildExpertPrompt()` 优先使用 systemPrompt**：非空 systemPrompt 直接作为 prompt 主体，空值时回退到旧版 `LAYER_PROMPTS + STANCE_GUIDE` 拼接（向后兼容）。
- **AI 配置版本升级至 v2**：首次加载时自动从 v1（45 LLM 无 systemPrompt）迁移到 v2（30 LLM + systemPrompt），保留用户已有的模型分配。
- **前端 `StockAnalysisExpertDefinition` 类型**：新增 `systemPrompt` 字段，`frameworkPrompt` 标记为 `@deprecated`。

### 测试
- 后端 3 个测试文件全部通过（10/10）。
- 前端 84/84 测试全部通过。
- 后端+前端 `npm run build` 编译通过。
- 服务重启后 API 验证通过，AI 配置迁移成功（v2, 30 LLM, 模型分配已保留）。

## [1.8.0] - 2026-04-03
### 新增
- **LLM 专家投票系统接入**：将 45 个 LLM 专家的评分从数学公式模拟替换为真实 AI 推理调用。
  - 新增 `llm-inference.ts`：封装 OpenAI 兼容 API 调用、Prompt 构造（9 个分析层专属 prompt + 3 种立场引导）、JSON 响应解析（3 级容错：直接解析→Markdown 代码块提取→花括号匹配）。
  - 45 个 LLM 专家通过阿里云百炼 API 并发调用（限流 5 并发），每个专家返回 verdict/confidence/reason 结构化结果。
  - 15 个规则函数专家保持本地计算，基于技术指标（动量、RSI、布林带、量比、换手率、波动率等）直接评分。
  - 任何 LLM 调用失败时自动降级为基于立场和市场数据的规则推断，确保系统始终可用。
  - 当 AI 配置不完整（无 provider 或无专家分配模型）时，自动 fallback 到旧版公式模拟。

### 变更
- **`buildSignal()` 改为异步**：从同步函数改为 `async function`，支持 LLM 并发调用。`runStockAnalysisDaily()` 中的信号生成改为 `runLimitedConcurrency(candidatePool, 3, ...)` 限流并行。
- **`StockAnalysisExpertScore` 类型扩展**：新增 `votes`（专家投票详情数组）、`llmSuccessCount`、`fallbackCount`、`isSimulated` 字段。
- **`StockAnalysisModelGroupPerformance.group` 类型放宽**：从 `'gpt' | 'claude' | 'gemini' | 'qwen' | 'rules'` 硬编码字面量改为 `string`，支持真实模型名（如 `qwen3.5-plus`、`glm-5`、`kimi-k2.5`）。
- **`buildModelGroupPerformance()` 替换 `buildDefaultModelGroupPerformance()`**：不再返回伪造的 GPT/Claude/Gemini 统计数据，改为从信号中的真实投票数据按 modelId 聚合。
- **前端"模拟"警告改为动态条件显示**：
  - `StrategiesTab`：当 `isSimulated` 为 true 时显示模拟警告，LLM 接入后显示成功/降级票数。
  - `MemoryTab`：模型组表现追踪的"模拟统计"警告改为仅在全部模拟时显示，"模拟"标签改为"规则"。
  - `GuideTab`：移除"LLM 集群尚未接入"文案，专家分描述改为"LLM 集群 + 规则引擎"，免责声明移除"公式模拟"措辞。

### 测试
- 后端 3 个测试文件全部通过（10/10），测试环境自动降级为公式模拟。
- 前端 84/84 测试全部通过。
- 后端+前端 `npm run build` 编译通过。
- 服务重启后 API 验证通过。

## [1.7.3] - 2026-04-03
### 修复
- **AI 炒股数据源优先级修复**：将腾讯 API 提升为所有行情数据的主源，东方财富降级为备源。根因：Ubuntu 25.10 的 OpenSSL 3.5.x 与东方财富 `push2/push2his` 子域存在 TLS 不兼容，导致所有请求失败。
- **修复 `fetchCsi500IndexHistoryFresh()`**：指数历史数据获取顺序从"东方财富→腾讯→AKShare"改为"腾讯→东方财富→AKShare"。
- **修复 `getQuoteData()`**：实时行情获取顺序从"东方财富→腾讯→缓存"改为"腾讯→东方财富→缓存"；消除嵌套 try-catch，改为扁平化多源串行尝试。
- **修复 `getStockHistoryData()`**：个股K线获取顺序从"东方财富→腾讯→缓存"改为"腾讯→东方财富→缓存"；同样消除嵌套 try-catch。
- **修复 fallback 语义**：旧代码中腾讯成功获取新鲜数据时仍错误标记 `usedFallback: true`（因为它是"备源"成功）。修复后只有真正回退到本地过期缓存时才标记 `usedFallback: true`，在线源成功一律标记 `false`。
- **结果**：`runtime-status.json` 中 `isUsingFallback` 从 `true` 变为 `false`，`staleReasons` 从非空变为 `[]`，前端不再显示"使用回退数据"误报。

### 测试
- 后端 3 个测试文件全部通过（10/10），已更新 Tencent fallback 测试的断言以匹配新语义。
- 前端 84/84 测试全部通过。
- 后端+前端 `npm run build` 编译通过。
- 服务重启后 API 验证通过，daily run 返回 `usedFallbackData: false, staleReasons: []`。

## [1.7.2] - 2026-04-03
### 优化
- **AI 炒股全 7 Tab 多列布局重构**：将所有 Tab 从 1-2 列布局升级为 3 列布局，充分利用 3440x1440 宽屏空间，大幅减少页面滚动。
- **DashboardTab**：底部信号+周报区域从 `grid-cols-2` → `grid-cols-3`（信号占 2 列含内部 2x2 网格，周报占 1 列）。
- **StrategiesTab**：候选列表从 `grid-cols-2` → `grid-cols-3`，卡片 padding 进一步压缩。
- **RiskTab**：顶部事前+系统风控从 `grid-cols-2` 加全宽摘要条 → `grid-cols-3`（事前+系统+组合概况三等分卡片）；底部时间线+复盘 gap 压缩。
- **MemoryTab**：顶层间距 `space-y-4` → `space-y-3`，各卡片 padding `p-4` → `p-3`，底部月度+交易 gap `gap-4` → `gap-3`。
- **ProfileTab**：主体从 `grid-cols-2` → `grid-cols-3`（执行画像+建议+系统阶段三列）；学习权重和阈值自适应面板改为 `grid-cols-2` 并排；全面压缩 `space-y-6` → `space-y-3`、`p-5` → `p-3`、`gap-6` → `gap-3`。
- **AIConfigTab**：顶层 `space-y-8` → `space-y-3`；供应商列表改为 `grid-cols-2` 并排显示；各 section 标题间距压缩。
- **GuideTab**：移除 `max-w-4xl` 约束全宽显示；使用指南内容改为 `grid-cols-2` 双列布局（左列：概述+流程+概念，右列：风控+数据+建议）；页面功能表和免责声明保持全宽。

### 测试
- 前端 `npm run build` 通过，全部 84 个前端测试通过。
- 服务重启后 API 验证通过。

## [1.7.1] - 2026-04-03
### 优化
- **AI 炒股 UI 布局优化**：全面压缩四个主 Tab 的卡片间距和内边距，减少页面滚动，充分利用横向空间。
- **DashboardTab**：统计信息条和市场状态标签合并为一张卡片（原为两个独立区块）；信号列表项改为内联 flex 布局；"系统能力说明"移至独立的"系统说明"页签。
- **StrategiesTab**：4 张 StatCard 替换为单行紧凑信息条，市场体制标签合并到信息条右侧；信号详情卡片、三流评分区、操作按钮、候选策略列表全面缩减间距和字号。
- **RiskTab**：事前+系统级面板改为左右并排（`grid-cols-2`）；MiniPanel 摘要替换为单行紧凑汇总条；事件时间线+事后面板改为左右并排；事中面板的持仓详情和止盈止损合并为 flex-wrap 单行；评估评分从 4 列网格改为 inline flex。
- **MemoryTab**：月度汇总和近期交易改为左右并排（`grid-cols-2`）；月度汇总改为水平 flex（标签左对齐、数值右对齐）；周报卡片、观望日志、模型组表格全面减少间距。

### 新增
- **系统说明页签 (GuideTab)**：在侧边栏"AI 配置"下方新增"系统说明"入口，包含：
  - 系统能力说明（已实现 vs 尚未接入，从总览看板迁移至此）
  - 完整使用指南：以入门炒股者视角编写，涵盖应用介绍、每日使用流程、核心概念（三流评分/Conviction Filter/市场体制）、风控机制说明、各页面功能一览表、数据来源与更新说明、新手建议、免责声明

### 测试
- 前端 `npm run build` 通过，全部 84 个前端测试通过。
- 后端 `npm run build` 通过。
- 服务重启后 API 验证通过。

## [1.7.0] - 2026-04-03
### 新增
- **Phase 5 AI 专家集群配置系统 (v1.7.0)**：为 AI 炒股应用接入 AI 能力的基础配置层，实现三层配置流：供应商管理 → 模型池 → 分析层批量分配。
- **后端 AI 配置持久化**：新增 `config/ai-config.json`，包含供应商列表、60 位专家定义（45 LLM + 15 规则函数）、10 个分析层的模型分配。首次读取时自动初始化默认配置。
- **后端 7 个新类型**：`StockAnalysisAIProvider`（供应商）、`StockAnalysisAIModelRef`（模型引用）、`StockAnalysisExpertLayer`（10 种分析层）、`StockAnalysisExpertStance`（立场）、`StockAnalysisExpertDefinition`（专家定义）、`StockAnalysisLayerAssignment`（层级分配）、`StockAnalysisAIConfig`（完整配置）、`StockAnalysisModelTestResult`（连通性测试）。
- **后端 5 个 API 端点**：
  - `GET /ai-config` — 获取完整配置 + 聚合模型池
  - `PUT /ai-config/providers` — 保存供应商列表
  - `POST /ai-config/layers/:layer/assign` — 按分析层批量分配模型
  - `POST /ai-config/experts/:id/assign` — 单个专家模型覆盖
  - `POST /ai-config/test-model` — 模型连通性测试（发送最小 chat completion 请求）
- **后端业务逻辑**：`buildDefaultExperts()` 生成 60 位默认专家，`buildDefaultLayerAssignments()` 生成 10 个层级配置，`buildModelPool()` 从已启用供应商聚合模型池，`testModelConnectivity()` 测试 API 连通性。
- **前端 AI Config Tab**：新增"AI 配置"标签页（`AIConfigTab.tsx`），三层配置面板：
  - 供应商管理：添加/删除/启用停用供应商，配置 Base URL、API Key、模型列表，每个模型旁有连通性测试按钮
  - 模型池概览：展示所有已启用供应商的可用模型汇总
  - 分析层批量分配：10 个分析层各有模型下拉菜单，点击展开可查看该层下所有专家及其立场、分配状态
- **前端类型同步**：`types.ts` 新增 8 个 Phase 5 类型，包含 `StockAnalysisAIConfigWithPool` 扩展类型。
- **前端 API 层**：`api.ts` 新增 5 个 AI Config 相关函数。

### 测试
- 后端 `npm run build` 通过，全部 10 个后端测试通过。
- 前端 `npm run build` 通过，全部 84 个前端测试通过。
- 服务重启后 API 验证通过：`GET /ai-config` 返回 60 位专家、10 个分析层、空供应商和空模型池。

## [1.6.0] - 2026-04-03
### 新增
- **Phase 4.1 专家权重学习 (computeLearnedWeights)**：基于历史复盘记录，使用指数衰减（半衰期 30 天）计算专家/技术/量化三维度预测准确性，生成零和权重调整因子（最大偏移 ±20%），持久化到 `experts/weights.json`。需至少 5 条含维度分析的复盘记录才启用。
- **Phase 4.1 融合权重动态调整 (getAdjustedFusionWeights)**：在每日信号生成时，将学习到的权重调整因子叠加到体制基准权重上，归一化确保总和为 1。`buildSignal()` 新增可选 `learnedWeights` 参数。
- **Phase 4.2 Conviction Filter 阈值自适应 (adjustConvictionThresholds)**：基于最近 20 笔交易的胜率自动调整 `minCompositeScore` 门槛——胜率 >60% 放宽 2 分（捕捉更多机会），胜率 <40% 收紧 3 分（提高选股质量），下限 60 上限 85。调整历史持久化到 `config/threshold-history.json`。
- **Phase 4.3 四维复盘自动化 (buildDimensionAnalysis)**：每笔卖出交易结束后自动生成四维偏差分析——专家维度（预测方向 vs 实际涨跌）、技术维度（买入技术分 vs 目标是否达成）、量化维度（动量方向是否正确）、执行维度（滑点、持仓效率、是否遵循计划）。分析结果附加在复盘记录的 `dimensionAnalysis` 字段。
- **每日分析集成**：`runStockAnalysisDaily()` 在信号生成前调用 `computeLearnedWeights()` 获取学习权重，传入 `buildSignal()` 影响评分；信号生成后调用 `adjustConvictionThresholds()` 更新门槛。
- **Overview API 扩展**：`getStockAnalysisOverview()` 新增 `learnedWeights`（学习权重 | null）和 `thresholdHistory`（最近 20 条阈值调整记录）字段。融合权重展示改为经学习调整后的实际值。
- **前端 ProfileTab 增强**：新增学习权重面板（维度准确性 + 偏移量可视化）和阈值自适应面板（调整历史时间线）。系统阶段标签新增"学习权重 4.1"、"阈值自适应 4.2"、"四维复盘 4.3"，已激活时显示绿色。
- **后端新增类型**：`StockAnalysisDimensionAnalysis`、`StockAnalysisLearnedWeights`、`StockAnalysisWeightUpdateEntry`、`StockAnalysisThresholdAdjustment`、`StockAnalysisThresholdHistory`。
- **store 层扩展**：新增 `readStockAnalysisLearnedWeights/saveStockAnalysisLearnedWeights` 和 `readStockAnalysisThresholdHistory/saveStockAnalysisThresholdHistory`，阈值历史上限 100 条。

### 测试
- 后端 `npm run build` 通过，全部 10 个后端测试（service 3 + routes 1 + positionEval 6）通过。
- 前端 `npm run build` 通过，全部 84 个前端测试通过。
- 服务重启后 API 验证通过，`learnedWeights`（null，因复盘记录不足预期）和 `thresholdHistory`（[]，因交易记录不足预期）字段正确返回。

## [1.5.5] - 2026-04-03
### 新增
- **风控 Tab 四层面板重写 (Phase 3.2)**：将风控面板从扁平结构改为四层语义化结构——事前/事中/事后/系统级，信息层次更清晰。
- **事前风控面板**：展示三项否决条件的实时状态——仓位限制（持仓数/上限）、交易暂停状态、风控阈值是否超限。每项以绿色/红色圆点和通过/否决标签直观表示。
- **事中风控面板增强**：个股持仓监控卡片化，每只持仓展示完整生命周期信息——成本价/现价/仓位/持仓天数、止盈1&2/止损/移动止损状态条、实时评分变化（当前综合分 vs 买入综合分 + 分差 + 专家共识）、AI 建议及平仓操作。
- **系统级风控面板**：日/周/月亏损和最大回撤的进度条现在从 API 返回的 `riskLimits` 动态读取阈值，不再硬编码。
- **事后风控面板增强**：复盘面板新增统计摘要（盈/亏笔数 + 平均盈亏），增加市场体制显示。
- **风控事件时间线**：新增时间线组件，按时间倒序展示所有风控触发事件。每条事件包含类型标签（红色=阈值触发/暂停、琥珀色=移动止损、灰色=否决）、原因描述、相关指标快照和关联股票代码。使用竖线+圆点的经典时间线布局。
- **风控事件类型系统**：新增 `StockAnalysisRiskEventType`（9 种事件类型）和 `StockAnalysisRiskEvent` 接口，支持日/周/月/回撤阈值触发、暂停交易、移动止损触发、三种否决（仓位满/黑名单/已暂停）。
- **后端事件采集**：`assessPortfolioRisk()` 重构为返回 `{ state, newEvents }` 结构，自动检测状态跳变（false→true）生成风控事件。`confirmStockAnalysisSignal()` 在否决时发射 veto 事件。事件持久化到 `journal/risk-events.json`，上限 200 条。
- **Overview API 扩展**：`/api/system/stock-analysis/overview` 新增 `riskEvents`（最近 50 条）和 `riskLimits`（阈值配置）字段。
- **utils 扩展**：新增 `riskEventTypeLabel()` 和 `riskEventTypeBadge()` 工具函数，为 9 种风控事件类型提供中文标签和颜色样式。

### 测试
- 后端 `npm run build` 通过，全部 10 个后端测试（service 3 + routes 1 + positionEval 6）通过。
- 前端 `npm run build` 通过，全部 84 个前端测试通过。
- 服务重启后 API 验证通过，`riskEvents` 和 `riskLimits` 字段正确返回。

## [1.5.4] - 2026-04-03
### 新增
- **绩效图表可视化 (Phase 3.1)**：Memory Tab 新增四张绩效图表，用纯 SVG 实现，不引入任何第三方图表库。
- **MiniLineChart 折线图组件**：支持面积填充、零线标注、自适应坐标轴、悬浮提示。用于累计收益曲线、最大回撤曲线、胜率趋势图。
- **MiniBarChart 柱状图组件**：支持红涨绿跌双色柱、零线基准、自适应柱宽。用于每周收益柱状图。
- **图表数据准备函数**：`buildCumulativeReturnChartData()`、`buildDrawdownChartData()`、`buildWinRateChartData()`、`buildWeeklyReturnChartData()` — 从周报数据（时间倒序）转换为图表所需的时间正序数据点。
- **MemoryTab 集成**：当周报数据 >= 2 周时，在"周度绩效仪表板"和"模型组表现追踪"之间展示 2x2 布局的绩效图表区域；数据不足时不显示。

### 测试
- 前端 `dashboardMeta.test.ts` 新增 6 个图表数据测试（共 14 个），覆盖多周数据正序转换、空数据处理、单周数据边界。
- 前端全部 84 个测试通过，`npm run build` 通过。
- 服务重启后 API 验证通过。

## [1.5.3] - 2026-04-03
### 新增
- **持仓主动评估与卖出信号生成 (Phase 2.3)**：系统不再只被动等触发止损/止盈，而是在每日分析时主动对所有持仓重新评分，在评分恶化时提前发出卖出信号。
- **`evaluatePositionScores()` 函数**：对每个持仓股票用当前市场数据重新运行三流评分（专家/技术/量化），计算与买入时综合评分的差值。当综合评分下降 ≥ 15 分时触发 `score_drop` 卖出建议；当专家共识 < 0.4 且技术破位（价格跌破 MA20+MA60 且技术分 < 40）时触发 `expert_bearish` 卖出建议。
- **`buildSwapSuggestions()` 换仓逻辑**：当持仓已满且有新买入信号的综合评分 > 最弱持仓当前评分 + 10 分时，自动生成"卖弱买强"的换仓建议，包含卖出/买入代码、评分差距和决策理由。
- **每日分析流程集成**：`runStockAnalysisDaily()` 现在在信号生成后自动执行持仓评估和换仓逻辑，结果一并写入当日快照。
- **Overview API 增强**：`/api/system/stock-analysis/overview` 新增 `positionEvaluations` 和 `swapSuggestions` 字段，从缓存的每日分析结果或实时计算中返回。
- **前端仪表盘适配**：`buildDailyAdviceSummary()` 重写为包含三类卖出信号——被动卖出（止损/止盈/减仓/复审）、主动卖出（来自持仓评估的 score_drop/expert_bearish）、换仓建议。同一股票在被动和主动中不会重复出现。
- **前端换仓区域**：DashboardTab 新增紫色调的换仓建议展示区。AdviceSection 组件新增 `'purple'` tone 支持。
- **"系统能力说明"更新**：将"动态三流融合权重"、"四层风控体系"、"持仓评估 + 卖出信号 + 换仓建议"从"尚未接入"移至"已实现"。
- **新增类型**：`PositionSellReason`（`'score_drop' | 'expert_bearish' | 'swap_candidate'`）、`StockAnalysisPositionEvaluation`、`StockAnalysisSwapSuggestion`。
- **测试导出**：`service.ts` 新增 `_testing` 导出，暴露 `evaluatePositionScores`、`buildSwapSuggestions`、`buildExpertScore`、`buildTechnicalScore`、`buildQuantScore`、`buildSignal` 供单元测试直接调用。

### 测试
- 后端新增 `stockAnalysisPositionEval.test.ts`，6/6 通过：覆盖正常持仓不触发卖出、评分下降触发卖出、专家转空+技术破位触发卖出、持仓未满不换仓、持仓满+优势足够触发换仓、优势不足不换仓。
- 前端 `dashboardMeta.test.ts` 新增 4 个测试（共 8 个），覆盖主动卖出信号、换仓建议和去重逻辑。
- 后端 `npm run build` 通过，现有 service/routes 测试 4/4 通过。
- 前端 `npm run build` 通过，全部 78 个测试通过。
- 服务重启后 API 验证通过，`positionEvaluations` 和 `swapSuggestions` 字段正确返回。

## [1.5.2] - 2026-04-03
### 新增
- **四层风控体系 (Phase 2.2)**：实现完整的多层风控机制，从个股到组合全面覆盖。
- **移动止损（Trailing Stop）**：当个股浮盈达到 3% 后自动激活，若从最高价回撤 2% 则触发止损卖出。逻辑集成在 `updatePositionRuntime()` 中，优先级高于固定止盈。
- **买入前否决机制**：`confirmStockAnalysisSignal()` 新增三重校验——持仓数量上限（默认 3）、黑名单拦截、风控暂停状态检查。任一条件触发则拒绝开仓并返回明确错误信息。
- **组合级风控评估**：新增 `assessPortfolioRisk()` 函数，实时计算日/周/月亏损百分比和最大回撤，与 `portfolioRiskLimits` 配置（日 3%、周 6%、月 10%、回撤 15%）进行对比。月度亏损或最大回撤超限时自动暂停交易。
- **交易复盘记录**：平仓时自动生成 `StockAnalysisReviewRecord`，包含买入时的三流评分、综合评分、市场体制、卖出原因，以及自动生成的经验教训提示。复盘记录持久化到 `journal/reviews.json`，最多保留 100 条。
- **风控状态 API 输出**：`/api/system/stock-analysis/overview` 返回 `systemStatus.riskControl`（含 paused/日周月亏损/回撤/各项是否超限）和 `recentReviews`（最近 10 条复盘）。
- **前端风控面板增强**：`RiskTab` 重写为四层结构——个股持仓监控（含移动止损激活提示）、仓位/回撤/建议面板、组合级风控进度条面板（日/周/月/回撤四条进度条+暂停状态醒目提示）、近期交易复盘列表。
- **新增类型**：`StockAnalysisRiskControlState`、`StockAnalysisTrailingStopConfig`、`StockAnalysisPortfolioRiskLimits`、`StockAnalysisReviewRecord`。
- **新增 store 函数**：`readStockAnalysisBlacklist()`、`saveStockAnalysisBlacklist()`、`readStockAnalysisReviews()`、`saveStockAnalysisReviews()`。
- **默认配置扩展**：`DEFAULT_STOCK_ANALYSIS_CONFIG` 新增 `trailingStop`（激活 3%、回撤 2%）和 `portfolioRiskLimits`（日 3%、周 6%、月 10%、回撤 15%）。
- **向后兼容**：`readStockAnalysisConfig` 的 merge 逻辑覆盖所有新增嵌套字段，旧 config 文件不会导致崩溃。Overview 中 `riskControl` 使用 `?? DEFAULT_RISK_CONTROL_STATE` 兜底。

### 测试
- 前端 `npm test` 56/56 通过，`npm run build` 通过。
- 后端 `npm run build` 通过，相关测试 4/4 通过。
- 服务重启后 API 验证通过，`riskControl` 和 `recentReviews` 字段正确返回。

## [1.5.1] - 2026-04-03
### 新增
- **动态三流融合权重 (Phase 2.1)**：综合评分不再使用硬编码的 0.35/0.35/0.30 权重，改为根据市场体制自动调整。
- **5 态市场体制**：新增 `MarketRegime` 类型（牛市趋势、熊市趋势、高波动市、低波动震荡、常规震荡），从 `MarketState` 的趋势和波动率两维度自动推导。
- **`fusionWeightsByRegime` 配置**：在 `strategy.json` 中新增 5 态融合权重表，每种体制下专家/技术/量化三流的权重不同：
  - 牛市趋势：35% / 35% / 30%（均衡）
  - 熊市趋势：40% / 25% / 35%（重防守，提高专家和量化权重）
  - 高波动市：30% / 40% / 30%（重技术面信号）
  - 低波动震荡：35% / 30% / 35%（重基本面和量化因子）
  - 常规震荡：35% / 35% / 30%（均衡）
- **`marketThresholds` 扩展为 5 态**：每种市场体制有独立的入场门槛（综合分/专家共识/技术分/量化分），替代原来仅按趋势区分的 3 态。
- **信号输出增强**：每个 `Signal` 现在携带 `marketRegime` 和 `fusionWeights` 字段，方便追溯该信号是在什么体制、什么权重配比下生成的。
- **Overview 增强**：`/api/system/stock-analysis/overview` 返回顶层 `marketRegime` 和 `fusionWeights`，前端可直接展示。
- **前端展示**：策略页新增"当前体制 + 融合权重"概览条，信号详情区新增融合权重和市场体制两行信息。
- **向后兼容**：`readStockAnalysisConfig` 自动合并旧 config 中缺失的新字段，不会因为 `strategy.json` 未更新而崩溃。

### 测试
- 前端 `npm test` 56/56 通过，`npm run build` 通过。
- 后端 `npm run build` 通过，相关测试 4/4 通过。
- 服务重启后 API 验证通过，`marketRegime` 和 `fusionWeights` 字段正确返回。

## [1.5.0] - 2026-04-03
### 变更
- **Phase 1 完成**：`AI 炒股` 前端完成首轮迭代，对齐设计文档 v2.0 的诚实标注、信息层级与代码结构要求。
- **诚实标签 (Phase 1.1)**：在记忆复盘页模型组表现上方新增"模拟数据"醒目警告；策略页三流评分区新增"专家共识由公式近似，非真实 AI 投票"免责说明；总览页新增"系统能力说明"面板，明确区分"已实现"与"尚未接入"能力。
- **仪表盘信息层级重构 (Phase 1.2)**：将"今日操作建议"提升到总览首屏位置并添加靛蓝强调边框；将原 4 张 StatCard 压缩为单行紧凑信息条；将 9 宫格市场状态压缩为 2 行标签+关键指标；系统运行状态改为默认折叠可展开；"系统能力说明"移至页面底部。
- **代码拆分 (Phase 1.3)**：将 1097 行的 `AIQuantApp.tsx` 拆分为 8 个模块文件：`utils.ts`（工具函数）、`shared.tsx`（共享组件）、`DashboardTab.tsx`、`StrategiesTab.tsx`、`RiskTab.tsx`、`MemoryTab.tsx`、`ProfileTab.tsx`，主文件缩减至约 210 行。

### 测试
- 前端 `npm test` 56/56 通过，`npm run build` 通过。
- 后端 `npm run build` 通过，`npm test` 通过。

## [1.4.5] - 2026-04-03
### 优化
- 强化 `AI 炒股` 数据源鲁棒性：后端新增“东方财富失败后自动切换腾讯接口”的降级链路，覆盖实时行情、个股历史 K 线和中证 500 指数历史，避免单一上游抖动导致整轮分析失败。
- 完整保留现有缓存优先与快照优先策略，并补充更清晰的 `staleReasons` 来源标记（例如“实时行情主源失败，已切换腾讯接口”），便于前端和日志直接感知当前数据质量状态。

### 测试
- 后端新增并通过降级测试：`stock analysis daily run uses Tencent fallback for quote and history when Eastmoney endpoints fail`。
- 后端 `npm run build` 与 `tests/stockAnalysisService.test.ts`、`tests/stockAnalysisRoutes.test.ts` 通过。

## [1.4.4] - 2026-04-02
### 新增
- `AI 炒股` 后端补齐文档 v2.0 所需的核心追踪数据结构：`watch-logs` 新增 `T+1/T+5` 结果与 `outcome` 判定，`overview` 新增 `monthlySummary` 与 `performanceDashboard`，并将这些字段纳入持久化读写。

### 变更
- `run/daily` 现在会在落盘前自动评估观望日志的后验表现（观望正确/错误/待评估），并生成周度/月度汇总、Conviction Filter 通过率、观望准确率、夏普替代指标、最佳/最弱模型组、预警与调参建议。
- 前端 `AI 炒股` 已改为优先展示上述后端真实字段，不再主要依赖前端临时派生，记忆页可直接查看月度汇总和观望后表现（T+1/T+5）。

### 测试
- 后端 `npm run build` 通过；`tests/stockAnalysisService.test.ts`、`tests/stockAnalysisRoutes.test.ts` 通过。
- 前端 `npm test` 与 `npm run build` 通过。

## [1.4.3] - 2026-04-02
### 变更
- 补全 `AI 炒股` 前端到更接近设计文档 v2.0 的完整展示形态：总览页新增“今日操作建议”与 `Conviction Filter` 统计，策略页补充门槛感知、通过/观望/否决条件面板，记忆页新增周度绩效仪表板、预警与调参建议，行为画像页新增执行率/推翻率/忽略率/纪律分等执行偏差视图。
- 前端现已把文档中最核心的四类展示落到真实 UI：`操作建议展示`、`四表追踪的主要视图入口`、`绩效仪表板`、`专家/模型组表现可视化`。其中仍缺后端真实数据支撑的部分字段，当前以前端派生统计和显式“模拟统计”标签补足。

### 测试
- 新增 `frontend/src/apps/AIQuant/dashboardMeta.test.ts`，锁定每日建议汇总、周度仪表板派生、行为画像统计和 Conviction Filter 阈值摘要等前端派生逻辑。
- 前端 `npm test` 与 `npm run build` 通过。

## [1.4.2] - 2026-04-02
### 修复
- 为 `AI 炒股` 的中证 500 指数历史新增更短的备用抓取链路：服务端现在会优先直接请求东方财富指数 K 线主接口，不再先依赖 AKShare 的指数代码映射请求；若直连失败，再回退到 AKShare，再回退到本地缓存与简化市场状态，进一步降低首次拉取时被上游抖动打穿的概率。
- 保留现有“宁可旧，不可挂”的快照优先策略，同时补强指数历史失败时的错误聚合信息，方便在 `runtime-status/health` 与日志里直接区分“东方财富直连失败”和“AKShare 备用源失败”。

### 测试
- 新增后端 `stockAnalysisService.test.ts`，覆盖“指数历史直连成功优先于 AKShare”和“双源失败后回退本地缓存”两条关键稳定性链路。
- 后端 `npm run build` 通过。

## [1.4.0] - 2026-04-02
### 新增
- 将 `AI 炒股` 从纯前端静态原型升级为真实前后端模块：后端新增 `stock-analysis` 路由与服务层，前端改为真实 API 驱动，不再展示固定写死的 mock 数据。
- 新增服务端路径配置 `stockAnalysisDir`，默认工作目录为 `/home/chriswong/文档/AI炒股分析`，并建立 `config/`、`cache/`、`market/`、`signals/`、`portfolio/`、`journal/`、`reports/`、`experts/`、`logs/` 目录结构。
- 新增中证 500 真实股票池链路：后端通过受控 Python/AKShare 子进程读取 `000905` 成分股，再由 TypeScript 业务层统一做行情抓取、初筛、评分和持久化。

### 变更
- 新增 `POST /api/system/stock-analysis/run/daily`、`/stock-pool/refresh`、`/signals/:id/confirm|reject|ignore`、`/positions/:id/close` 等产品级接口，支持生成每日信号、刷新股票池、记录用户执行/推翻/忽略决策和手动平仓。
- `AI 炒股` 页面已接入真实总览看板、每日策略、持仓风控、记忆复盘和行为画像五个视图，展示市场状态、候选信号、持仓、交易记录、观望日志和模型组表现。
- 新增 AI 炒股专用调度器：服务启动后会自动预热数据，工作日 `08:05` 自动运行盘前分析；测试环境下不注册调度器，避免测试进程被挂住。

### 测试
- 新增后端 `stockAnalysisRoutes` 回归测试，覆盖配置目录解析、信号读取和总览接口输出。
- 新增前端 `AIQuant/api.test.ts`，覆盖概览读取、运行分析、刷新股票池和确认信号等关键请求行为。
- 后端 `npm run build` 通过。
- 前端 `npm test` 与 `npm run build` 通过。

## [1.4.1] - 2026-04-02
### 修复
- 将 `AI 炒股` 改为“快照优先”模式：`overview/signals` 不再在读取接口里强制重跑全量分析，而是优先展示最近一次成功快照；当上游行情接口抖动时，页面仍可稳定展示旧结果。
- 为股票池、实时行情、指数历史和个股 K 线新增本地缓存、TTL、超时与重试逻辑；当最新拉取失败时，会自动回退到缓存结果，并把“使用回退数据 / 哪些缓存已过期”直接暴露给前端。
- 新增运行状态机与健康状态：后端现会持久化 `runState/currentRun/dataState/staleReasons/isUsingFallback` 等状态，前端会显示“运行中 / 回退数据 / 最近错误 / 当前展示快照日期”，降低上游失败时的黑盒感。
- 修正 AI 炒股写回一致性问题：确认/推翻/忽略信号现在按信号自身 `tradeDate` 写回，不再错误写入当天文件；股票池刷新时间不再被每日分析误覆盖；交易记录新增 `pnlPercent` 字段，周报统计不再靠解析备注文案猜收益。

### 测试
- 更新后端 `stockAnalysisRoutes` 测试，覆盖新的 runtime-status/health 状态结构。
- 前端 `npm test` 通过。
- 前后端 `npm run build` 通过。

## [1.3.16] - 2026-04-02
### 变更
- 压缩 `每日简报` / `OpenClaw资讯` 列表卡片高度，去掉卡片中的摘要文本，只保留标题、来源、重要度、作者和时间，提升列表密度。
- `OpenClaw资讯` 顶部补充独立的 `刷新` 按钮，但不显示 `拉取最新订阅`，让本地投递刷新逻辑与 RSS 拉取继续区分。

### 验证
- 重新构建前端并重启运行中的 ClawOS 后端，浏览器真实登录验证：卡片摘要已消失，`OpenClaw资讯` 顶部存在 `刷新` 按钮且不显示 `拉取最新订阅`。

## [1.3.15] - 2026-04-02
### 变更
- 精简 Reader 界面，移除左上角关于“刷新/拉取”的说明文案。
- 移除 `OpenClaw资讯` 视图顶部的 `待处理投递 / 最近已处理 / 失败文件` 三个状态卡片，仅保留文章列表。

### 验证
- 重新构建前端并重启运行中的 ClawOS 后端，浏览器实际登录验证上述内容已隐藏。

## [1.3.14] - 2026-04-02
### 修复
- 修复 OpenClaw 投递文件默认不会被及时处理的问题。此前 Reader 只在 `07:55` 的定时任务里扫描 `inbox/pending`，白天临时投递的文件如果不手动点“刷新”，就只能等到第二天早上。现在后端启动后会在 15 秒后先跑一次 inbox 自动扫描，之后每 60 秒后台轮询一次，OpenClaw 投递不再依赖人工处理。
- 修复“代码改了但界面没变化”的部署问题：重新构建并替换了生产运行中的 `frontend/dist` 和 `backend/dist`，并重启实际运行的 `node dist/server.js` 进程，确保 `OpenClaw资讯`、`刷新`、`拉取最新订阅` 和来源徽标真正进入线上页面。

### 验证
- 通过浏览器自动化实际登录 `http://127.0.0.1:3001`，确认 `OpenClaw资讯`、`刷新`、`拉取最新订阅`、`RSS/OpenClaw` 来源标识都已显示。
- 通过真实投递 `2026-04-02-02-01-auto-refresh-proof.json` 到 `inbox/pending`，验证文件在无需人工点击的情况下会在后台轮询后自动移入 `processed`。

## [1.3.13] - 2026-04-02
### 变更
- `OpenClaw资讯` 视图新增投递排查面板，直接展示 `pending / processed / failed` 三个 inbox 桶的文件数量与最近文件名，便于判断“文件到了没、导入了没、失败了没”。
- 替换默认 Reader 中已确认失效的两个预设源：`Anthropic Blog` 改为可用的 `Google DeepMind Blog`，`Reuters Business` 改为可用的 `MarketWatch Top Stories`，减少每次拉取订阅时的无效报错。
- 强化 OpenClaw 每日简报 Prompt，明确禁止示例数据、占位 URL、虚构标题和编造内容，要求只能输出真实抓取到的文章。

### 测试
- 后端 `readerRoutes` 测试新增 `inboxStatus` 回归校验。
- 前端与 Reader 后端聚焦测试通过。

## [1.3.12] - 2026-04-02
### 变更
- 为 `每日简报` 新增独立的 `OpenClaw资讯` 入口，单独展示本地任务投递进来的 `sourceType=openclaw` 文章，不再只能和 RSS 混在同一列表里查看。
- Reader 列表卡片和详情页新增来源徽标，明确区分 `OpenClaw 投递` 与 `RSS 订阅`。

### 测试
- 后端 `articles` 查询新增 `source` 过滤测试，覆盖 `openclaw/rss` 来源筛选。
- 前端 Reader API 测试新增 `source=openclaw` 查询参数验证。

## [1.3.11] - 2026-04-02
### 变更
- 将 `每日简报` 顶部操作拆分为两个明确动作：`刷新` 只扫描本地 `RSS资讯/inbox/pending` 并导入 OpenClaw 等本地投递的 JSON 资讯；`拉取最新订阅` 只抓取 RSS 订阅源，不再继续把两个动作混成一个“立即同步资讯”。
- Reader 定时任务重新对齐原设计：`07:55` 先拉取 RSS 再刷新本地投递，`08:00` 只重建每日简报，不再在“生成简报”时重复抓取订阅。

### 测试
- 更新后端 `readerRoutes` 回归测试，锁定 `pull` 与 `refresh` 两条 Reader 路由的语义分离。
- 更新前端 Reader API 测试，覆盖 `pull` 与 `refresh` 两个新接口。

## [1.3.10] - 2026-04-02
### 变更
- 扩充 `每日简报` Reader 预设订阅源，补齐中文游戏、财经、新闻来源。新增 `游戏茶馆`、`游戏陀螺`、`FT中文网`、`纽约时报中文网`、`RFI 中文`，让游戏与中文资讯覆盖更均衡。
- 本机 `RSS资讯/config/feeds.json` 同步写入新增预设源，避免只改代码、不改当前运行配置导致 UI 仍显示旧订阅集。

### 修复
- 修复 `今日简报` 滚动分页到底后自动跳回顶部的问题。根因是分页追加时错误复用了首屏 loading 状态，导致中栏列表短暂被整块替换为“加载中...”，滚动容器高度塌缩后被浏览器重置到顶部。现已拆分首屏加载与分页加载状态，追加下一页时只在底部显示加载提示。

### 测试
- 新增后端 `readerPresetFeeds` 测试，锁定新增中文订阅源及预设总数。
- 前端 `npm test` 通过。

## [1.3.9] - 2026-04-01
### 新增
- 将原 `RSS订阅` 应用升级为 `每日简报`：默认首页改为“今日简报”，新增五大领域浏览、稍后阅读、订阅管理和本地资讯库视图，不再沿用传统三栏原始 RSS 阅读器心智。
- 新增 `readerDir` 服务器路径配置，默认目录为 `/home/chriswong/文档/RSS资讯`，并建立统一目录结构：`inbox/pending|processed|failed`、`feeds/`、`briefs/`、`read-later/`、`cache/`、`config/`、`assets/`。
- 新增 OpenClaw 资讯投递规范文档 `docs/rss-openclaw-ingest-spec.md`，定义了 `inbox/pending/*.json` 的目录与 JSON 格式，便于后续 OpenClaw 定时任务直接投递资讯文件给 ClawOS 导入。

### 变更
- Reader 后端从单文件路由升级为服务层架构：新增 `backend/src/services/reader/`，支持预设订阅源、本地文章落盘、OpenClaw inbox 导入、去重、规则分类、每日简报生成与稍后阅读持久化。
- Reader 路由新增 `overview`、`sync`、`daily-brief`、`articles/:id/read`、`articles/:id/save` 等产品级接口，前端不再直接请求某个 feed 的原始 URL，而是改为围绕本地资讯库与每日简报工作。
- 新增 Reader 专用调度器，在真实服务启动时自动注册 `07:55` 抓取/导入和 `08:00` 生成简报任务；测试环境不再初始化该调度器，避免测试进程被定时器挂住。
- 桌面应用入口名称从 `RSS订阅` 改为 `每日简报`，关于页版本号更新为 `v1.3.9`。
- 补充 OpenClaw 对接落地材料：新增 `docs/openclaw-daily-brief-task-template.md`、`docs/examples/openclaw-reader-payload.example.json`，并在本机 `RSS资讯/config/` 下落地同名样例与任务模板，方便后续直接建 OpenClaw 定时资讯任务。
- 优化 `每日简报` 空状态 UI：首次无资讯时会直接显示 `inbox/pending` 投递路径、样例文件位置、模板文档入口和一键同步提示，不再是空白占位。

### 测试
- 新增后端 Reader 路由回归测试，覆盖 `overview`、手动新增订阅源、RSS 同步、OpenClaw inbox 导入、稍后阅读与每日简报读取。
- 新增前端 Reader API 测试，覆盖分类筛选查询参数、创建订阅源请求体和手动同步 POST 请求。
- 后端 `npm test` 通过，保留一个已知旧失败：`backend/tests/probe.test.ts` 仍在断言过期的 `direct-access`，与本轮 Reader 改动无关。
- 前端 `npm test` 通过。
- 前后端 `npm run build` 通过。

### 修复
- 修复 `每日简报` 点击资讯卡片后列表跳回顶部的问题。根因是点卡片时会触发 `markRead()`，而旧实现随后又全量刷新 `overview`，导致列表与详情重新装载、滚动位置被重置。现在改为局部更新当前文章与统计，不再为了“标记已读”重拉整个概览。
- 修复点击五大领域后偶发黑色空白页的问题。根因是部分 RSS 源（如 Google AI Blog）的 `author` 字段是对象而不是字符串，切换领域后命中这类文章会让 React 渲染失败。后端现已统一把作者字段拍平成字符串并兼容历史落地数据。
- 新增资讯全文翻译能力：后端新增 `POST /api/system/reader/articles/:id/translate`，优先复用 OpenClaw 当前模型配置（`~/.openclaw/agents/main/agent/models.json` 中的 `modelstudio` provider）调用兼容 OpenAI 的 `chat/completions` 接口，前端在英文资讯上显示“全文翻译”按钮，并把中文译文展示在正文下方。
- 将 `今日简报` 改为真正的“当天文章全量列表 + 动态分页加载”：前端中栏默认按当天文章分页拉取，每次 30 条，滚动到底部自动追加。统计文案改为“收录 X 篇 | 已加载 Y 篇”，不再让“总数”和“列表当前展示数”混淆。
- 修复 `今日简报` 滚动分页到底后自动跳回顶部的问题。根因是加载下一页时沿用了首屏加载态，导致中栏列表被整块替换成“加载中...”，滚动容器高度瞬间塌缩后被浏览器重置到顶部；现已拆分为“首屏加载”和“分页追加加载”两种状态，追加分页时只在列表底部显示加载提示。
- 移除左侧无意义的“今日统计”卡片，仅保留同步状态与危险操作入口，减少噪音信息。
- 新增 Reader AI 摘要链路：后端新增 `POST /api/system/reader/articles/:id/summarize`，通过 OpenClaw 当前模型配置生成 3 句中文摘要并持久化；前端详情页新增 `AI 摘要 / 重新 AI 摘要` 按钮，列表和详情优先展示 `aiSummary`。
- Reader 预设源补齐到 16 个，覆盖五大领域并混合中英文高质量来源：新增 `量子位`、`爱范儿`、`IT之家`、`少数派`、`36氪`、`Hugging Face Blog`、`Bloomberg Markets`、`NYTimes World` 等。
- 新增 Reader 运行数据清理接口 `DELETE /api/system/reader/runtime-data`，会删除已抓取文章、每日简报、稍后阅读和缓存，但保留订阅源配置、OpenClaw Prompt 模板和目录结构，便于重新做拟真测试。
- 新增可直接贴给 OpenClaw 的完整任务 Prompt 文档：`docs/openclaw-daily-brief-full-prompt.txt`，并同步落地到本机 `RSS资讯/config/OPENCLAW_DAILY_BRIEF_FULL_PROMPT.txt`。

## [1.3.8] - 2026-03-31
### 安全
- 新增 ClawOS HTTP Basic Auth 认证：所有访问（前端、API、代理）现在都需要用户名密码，防止公网无密码暴露
- 用户名固定为 `clawos`，密码从 `~/.clawos/.env` 的 `CLAWOS_PASSWORD` 读取
- 将后端绑定地址从 `*:3001` 改为 `127.0.0.1:3001`，阻止 LAN 和 Docker 网络的直接访问
- 仅保留 Tailscale Funnel 作为公网入口，走加密隧道 + Basic Auth 双重保护

### 变更
- 新增依赖 `express-basic-auth` 用于 HTTP 认证
- 服务启动日志现在会显示绑定的具体地址 `(bound to 127.0.0.1)`

### 验证
- 无认证访问返回 401 ✅
- 带认证访问返回 200 ✅
- LAN IP 直接访问连接被拒绝 ✅
- OpenClaw 代理通过认证后正常工作 ✅
- API 端点通过认证后正常工作 ✅

### UI 优化
- 新增集成式登录界面 `LoginScreen.tsx`，类似远程桌面的登录体验
- 用户进入网站时显示简洁的登录界面（深色渐变背景 + 玻璃拟态效果）
- 仅需输入密码（无需用户名），密码验证成功后进入 ClawOS 桌面
- 密码只存在于内存中，刷新页面或关闭标签页后需重新输入
- 所有 API 请求自动带上 `Authorization: Basic xxx` 认证头
- 新增 `/api/system/auth/verify` 接口用于前端密码验证
- **修复**: 移除 `express-basic-auth` 的浏览器弹窗，改为自定义中间件，避免"浏览器弹窗 + 前端界面"双重登录问题
- **修复**: 修复强制刷新 (Ctrl+F5) 导致页面崩溃显示 `{"success":false,"error":"Authentication required"}` 的问题。原因：多个 `useEffect` 在组件挂载时（未认证状态）就调用 API。解决：给所有 API 调用添加 `isAuthenticated` 依赖检查，确保只有认证后才执行。
- **优化**: 桌面 Widgets 现在始终保留在 DOM 中（使用 CSS opacity/pointer-events 控制显示/隐藏），打开应用时不再销毁，关闭应用回到桌面时无需重新加载数据和渲染
- **修复**: 修复服务监控中 clawos.service 显示"健康: 异常"和"风险: 中风险"的问题。原因：后端健康检查代码请求 `/api/system/hardware` 时未带 Basic Auth 认证头，而我们添加了认证中间件，导致返回 401。解决：修改 `probe.ts` 中的 `runServiceHealthCheck` 和 `getCoreServiceHealth` 函数，支持传入 Authorization header，并在 `routes/index.ts` 中读取密码传入，使 ClawOS 自身健康检查能正确通过。
- **修复**: 修复安全状态中的两个警告：
  1. ClawOS 主入口：配置更新后绑定到 `127.0.0.1`，但安全检查仍期望 `direct-access`。修复：将 `expected` 改为 `local-only`。
  2. SearXNG 未监听：容器意外停止，重启容器恢复正常。
- **修复**: 修复严重 bug - ClawOS 内 OpenClaw 页面显示 `{"success":false,"error":"Authentication required"}`。原因：iframe 加载 `/proxy/openclaw` 时不带 Basic Auth header，而 OpenClaw 代理路由在认证中间件之后，被拦截返回 401。修复：将 OpenClaw 代理路由移到 `authMiddleware` 之前，使其免 Basic Auth 认证（OpenClaw 本身有 token 认证保护）。

### 安全清理
- 删除旧密码备份文件 `~/.clawos/.env.save`，防止历史密码泄露
- 修复敏感配置文件权限：`~/.clawos/.env` 和 `~/.openclaw/.env` 从 664 改为 600（仅所有者可读写）
- RDP (3389) 保持启用（用户正在使用），监听所有接口

### 已知风险
- UFW 防火墙未安装，系统依赖应用层认证保护
- RDP 暴露在所有网络接口，建议之后考虑限制到 Tailscale IP

## [1.3.7] - 2026-03-30
### 优化
- 进一步优化服务监控页面的空间利用率：
  - 将原先占据大块垂直空间的 4 个独立统计卡片（监控总数/高风险/需关注/状态正常）合并为顶部单行紧凑的信息条，释放了更多屏幕高度。
  - 删除了次顶部的“优先处理”卡片区块（其功能已通过瀑布流中核心服务与自动守护的高风险置顶排序替代），使得首屏能无缝显示更多具体服务项。
- 优化服务监控页面的空间利用率，不再使用死板的双列网格，而是全面改用 `columns` 瀑布流自适应布局。
- 把巨大的“守护进程”卡片拆分为“核心服务”与“自动守护”两个独立模块，以平衡瀑布流各列的高度。
- 在 16:9 屏幕（1080p/1440p）上可以做到无缝双列或三列拼图排版，并大幅压缩了异常服务展示区的高度（横向展开），基本消除下方大量留白，极大提升了同屏信息密度。

## [1.3.6] - 2026-03-30
### 修复
- 将 OpenClaw 网关从不适合 iframe 持续使用的 `password` 鉴权切换为 `token` 鉴权，并移除 `gateway.tailscale.mode: "funnel"` 对 password 模式的强耦合，让 OpenClaw 回归“仅本机监听 + 由 ClawOS 代理嵌入”的访问模型。
- ClawOS 后端新增 `GET /api/system/openclaw/bootstrap` 同源 bootstrap 接口，前端 `openclawStorage` 现在会在嵌入 OpenClaw 前主动拉取当前网关 token 并写入 gateway-scoped `sessionStorage`，不再依赖之前浏览器里偶然残留的旧 token。
- 移除了上一轮为 password 模式临时添加的 OpenClaw 密码桥接方案，避免继续沿用与上游 token/session 设计冲突的内存注入逻辑。
- 继续收敛 OpenClaw 内嵌首连时序问题：`App.tsx` 现在会等待 token bootstrap 完成后再生成 iframe URL，并把 token 通过上游推荐的 `#token=` fragment 一次性导入 Control UI，避免 iframe 在 `sessionStorage` 尚未写入时抢先发起 `token_missing` 首连。
- 一次性修复 OpenClaw 内嵌残留的 `pairing required`：将 OpenClaw 网关切换为上游原生支持的 `trusted-proxy` 认证模式，由 ClawOS 代理在 HTTP 和 WebSocket 上统一注入 `x-forwarded-user: clawos` 及必要的 `x-forwarded-proto` / `x-forwarded-host` 头，让嵌入 Control UI 走“ClawOS 已认证入口”而不是继续依赖浏览器设备配对。

### 测试
- 更新后端 `openclawProxyInjection` 回归测试，改为锁定 token bootstrap、双代理前缀 rewrite 与 OpenClaw 代理基础配置，而不是旧的 password bridge 逻辑。
- 更新前端 `openclawStorage` 测试，新增同源 bootstrap token 写入与 gateway URL 规范化保持同一 scoped token key 的覆盖。
- 补充前端 `openclawStorage` 测试，覆盖“priming 返回解析后的 token”以及“iframe URL 使用 `#token=` fragment 导入 token”的行为。
- 补充后端 `openclawProxyInjection` 测试，锁定 trusted-proxy 身份头注入逻辑，避免后续再把 OpenClaw 代理退回依赖设备 pairing 的模式。

### 验证
- 后端 `npm test` 50/50 通过。
- 后端 `npm run build` 通过。
- 前端 `npm test` 56/56 通过。
- 前端 `npm run build` 通过。
- 已重启 `openclaw-gateway` 与 `clawos` 用户服务。
- 已用 Playwright 分别验证本机 `http://127.0.0.1:3001/clawos/` 和远程 Tailnet 入口下的内嵌 OpenClaw，iframe 均可直接进入 Control UI，不再出现 `pairing required` 阻塞。

### 已知问题
- 当前已知问题从“无法进入内嵌 OpenClaw”收敛为普通运行态观察项：前端仍保留 token bootstrap 与 `#token=` fragment 导入作为兼容兜底，但主访问控制已经切到 trusted-proxy。后续若继续整理，可考虑移除不再需要的 token 兜底逻辑，进一步简化架构。

## [1.3.5] - 2026-03-29
### 修复
- 修复 `ClawOS` 内嵌 `OpenClaw` 在新版网关下出现的多层连接退化问题：首先为 OpenClaw 网关补上 `gateway.trustedProxies`，让经由 `ClawOS` 本机代理转发的请求重新被识别为可信 loopback 代理，而不是误判成未受信任的远端来源。
- 补全 OpenClaw `controlUi.allowedOrigins`，将 `http://127.0.0.1:3001` 与 `http://localhost:3001` 加入允许来源，避免本机通过 `ClawOS` 入口访问时被 `origin not allowed` 拒绝。
- 为 `ClawOS` 后端新增 `OpenClaw` 密码桥接脚本接口，并让代理后的 OpenClaw HTML 自动注入这个同源脚本。桥接脚本只在页面内存中注入当前网关密码，不落盘到浏览器存储，符合上游“密码仅保留在内存中”的安全模型。
- 为 OpenClaw 密码桥接增加运行态兜底：当 `clawos.service` 自身没有继承 `OPENCLAW_GATEWAY_PASSWORD` 环境变量时，后端会只读解析 `~/.openclaw/.env` 获取网关密码，避免 systemd 环境缺失时桥接脚本退化为空密码。

### 测试
- 新增后端 `openclawProxyInjection` 回归测试，锁定 OpenClaw 代理同时覆盖两条代理前缀剥离逻辑、密码桥接脚本注入逻辑，以及 `.openclaw/.env` 密码兜底读取逻辑，防止后续再次把内嵌登录链路改坏。

## [1.3.4] - 2026-03-29
### 变更
- 将剩余的系统级个性化配置继续从浏览器本地状态迁移为服务器优先：`Dock` 大小、自动隐藏、默认全屏、壁纸、桌面 Widgets 显示、Dock 隐藏延迟、网易云音质偏好、桌面灵感速记现在都通过新增的 `config/ui` 服务端配置接口统一持久化，不再把远程访问体验绑定到某一台浏览器的 `localStorage`。
- `App`、`MusicApp`、`DesktopWidgets` 已接入新的服务端 UI 配置读写逻辑，因此其他设备打开同一台 ClawOS 时，会优先看到这台机器自己的桌面外观、网易云音质偏好和速记内容，更接近“远程桌面”而不是“每个浏览器一套设置”。

### 测试
- 新增后端 `config/ui` 路由测试，覆盖默认 UI 配置返回与更新持久化，防止后续改动让个性化设置再次退回进程内存或浏览器本地状态。
- 新增前端 `serverUiConfig` 测试，锁定客户端读取/保存服务器端 UI 配置的请求行为。
- 继续扩展自动化回归范围：新增后端 `speedtest / reader / cron / video` 路由测试、前端 `openclawStorage` 测试，并补充一条 Playwright 冒烟脚本，用于验证“服务端 UI 配置初始化 -> 设置页修改 -> 刷新后仍保持”的关键链路。
- 继续补强“机器状态归属”相关回归：新增网易云二维码登录成功后 cookie 落盘测试，并新增桌面 `quickNote` 的 Playwright 持久化脚本，验证速记内容写入服务器配置后刷新仍能恢复。

## [1.3.3] - 2026-03-29
### 变更
- 将路径类配置正式收口为“服务器持久化优先”模型。新增 `config/paths` 服务端配置中心，统一维护全局下载目录、本地音乐目录、网易云下载目录、视频下载目录、随手小记目录这几类路径，避免它们继续散落在各台远程浏览器的 `localStorage` 里，导致换设备或迭代后配置丢失。
- 前端已接入服务端路径配置：`随手小记`、`本地音乐`、`网易云音乐下载目录`、`视频下载目录` 现在启动时会先读取服务器配置，修改时也会直接写回服务器，因此其他电脑远程访问同一台 ClawOS 时，会看到一致的路径设置。
- 下载配置与服务器路径配置完成联动：更新 Aria2 全局下载目录时，服务器配置中的 `downloadsDir` 也会同步写入，保证“全局下载目录”不会再和其他服务端配置分叉。

### 测试
- 新增后端 `config/paths` 默认值测试，覆盖你当前要求的服务器默认路径：`/home/chriswong/下载`、`/home/chriswong/音乐`、`/home/chriswong/文档/随手小记`、`/home/chriswong/视频`。
- 新增前端 `serverPaths` 测试，锁定客户端读取/保存服务器路径配置的请求行为，避免后续又退回浏览器本地路径状态。
- 已将运行中的全局下载目录正式切换为 `/home/chriswong/下载`，并完成在线回归：服务器路径配置、下载状态接口、夸克云盘推送下载与音乐下载列表均确认使用新目录。

## [1.3.2] - 2026-03-29
### 变更
- 修复网易云登录态错误地绑定到“当前浏览器”而不是“这台电脑”的问题。现在网易云 cookie 会持久化保存到 ClawOS 本机目录，由后端统一读取与更新，因此其他电脑远程连接这台机器的 ClawOS 时，会共享这台电脑自己的网易云登录状态，而不是依赖各自浏览器的 `localStorage`。
- 调整前端网易云授权初始化逻辑：设置页不再把本地浏览器缓存当作唯一真相，而是启动时先向后端同步服务器端 cookie 状态，再更新本地 UI，避免不同远程设备看到不一致的登录状态。

### 测试
- 新增后端测试，覆盖“网易云 cookie 写入服务器端文件后，模块重载/服务重启后仍能恢复”这一关键场景，确保登录态真正归属于机器而不是内存或单个浏览器。

## [1.3.1] - 2026-03-29
### 变更
- 完成一轮只针对高风险面的安全收口，同时保持 ClawOS 主入口双模式可访问：保留 `:3001` 直连与 Tailscale/Funnel 访问，但将 `FileBrowser :18790`、`AList :5244`、`aria2 :6800`、`SearXNG :38080` 全部收口为仅本机可访问，阻断旁路直连敏感后台。
- 清除了 ClawOS 内部对 `AList` 管理密码和 `aria2` RPC secret 的硬编码依赖。后端改为统一从服务环境变量读取这些敏感配置，并同步把本机 `AList` 管理密码与 `aria2` secret 更换为新的强随机值，避免继续使用弱默认值。
- 调整网盘页面的后台入口交互，使其明确变成“仅本机后台”。远程访问 ClawOS 时仍能查看 AList 后台账号与复制密码，但不会再被引导去直连远程 `:5244` 管理页，从而与新的本机访问策略保持一致。
- 同步收口 `SearXNG` Docker 暴露方式并更新 OpenClaw 侧环境变量，使 OpenClaw 继续通过本机 `http://127.0.0.1:38080` 使用 SearXNG，避免安全修复后破坏联网搜索能力。

### 测试
- 新增/更新后端测试，覆盖 `AList` 管理密码来自环境变量、`aria2` 请求使用环境变量 secret，以及网盘状态响应里的 `localOnlyAdmin` 标记，防止后续改动重新引入硬编码敏感信息。
- 新增前端测试，锁定 AList 管理页入口固定为本机 `127.0.0.1`，确保远程访问场景下不会再次拼接远程主机地址直连敏感后台。
- 完成真实运行态验收：确认 `5244/6800/18790/38080` 已全部收口到 `127.0.0.1`，`3001` 保持对外；并验证 ClawOS 远程入口、服务监控、下载管理、网盘状态、FileBrowser 代理、OpenClaw 网关与备份监控接口均保持正常。
- 在安全改造后补了一轮夸克云盘下载回归：修复了我中途未重建生产包导致在线服务仍使用旧下载链路的问题，并新增后端测试锁定“`AList raw_url -> aria2.addUri` 使用环境变量 secret”的真实下载路径，确认夸克推送下载恢复正常。

## [1.3.0] - 2026-03-29
### 变更
- 将服务监控中的备份区整理为用户定义的“三重备份”视图：新增 `整机级备份` 卡片用于只读观测 `restic + OSS`，保留 `系统级备份` 用于 Timeshift，并将原 `OpenClaw 备份` 明确为 `应用级备份`，对应 ClawBackUp 工作区备份。
- 后端新增 `/api/system/restic-backup` 只读探针，通过读取 `/home/chriswong/ClawOSBackUp/restic/snapshots`、`restic-crontab.txt/restic-cron.conf` 与 `~/.config/restic-oss-env.sh` 来观测本地快照、OSS 配置和计划任务，不执行任何 restic 命令，也不修改备份系统配置，满足“只观测、不入侵”的要求。
- 按当前实际使用链路扩展服务监控范围：新增 `clawos-aria2.service`、`clawos-alist.service`、`clawos-display-inhibit.service` 三个关键进程，并把所有服务备注改写成面向小白可理解的说明，让用户能直接看懂“这个服务挂了会影响什么”。
- 将核心服务监控继续升级为“双层状态”：不仅显示 systemd 进程是否在运行，还会对 `ClawOS / FileBrowser / OpenClaw / aria2 / AList` 做只读可用性探测，区分“进程活着但接口异常”和“真正可用”，减少只看进程状态带来的误判。
- 继续优化服务监控的运维可读性：核心服务与 watchdog 现在会按异常优先排序，优先把高风险项排到最上方；同时新增 `风险: 高/中/低` 标签，以及 watchdog 的“多久前巡检过”提示，方便快速判断问题紧急程度。
- 完成服务监控的最后一层运维总览：顶部新增 `监控总数 / 高风险 / 需关注 / 状态正常` 四张摘要卡，并把所有异常服务自动汇总到 `优先处理` 区块置顶显示；同时每个服务新增一条面向小白的“建议动作”，帮助在发现异常后立刻知道先查什么、先重启什么。

### 测试
- 新增后端探针测试，覆盖 restic 本地快照最新项判断、OSS 配置与 cron 配置检测，以及缺少只读配置时的降级状态。
- 新增前端监控状态样式测试，锁定三重备份卡片的状态色映射，避免后续调整时破坏 `正常 / 告警 / 配置缺失/索引缺失` 的展示语义。
- 新增后端健康探测测试，覆盖 HTTP 探测成功和“接口可达但返回内容不符合预期”两种情况，锁定新的服务可用性判断逻辑。
- 新增前端监控元数据测试，覆盖风险等级、异常优先排序和相对时间文案，确保监控页后续继续迭代时不会退回“信息都在但不够好用”的状态。
- 继续补充前端监控元数据测试，覆盖异常检测、建议动作与总览统计，锁定最后一层运维面板逻辑。

## [1.2.8] - 2026-03-29
### 变更
- 将 `随手小记` 的底层存储从 `notes.json` 元数据列表彻底改为“目录内真实 `.md` 文件”模型。现在每条便签都会落地成独立 Markdown 文件，并在文件头写入最小 front matter 元数据，满足“存储格式本身就是 Markdown”的要求。
- 后端笔记存储层重写为基于 `.md` 文件目录的读写逻辑，并保留自动迁移：如果旧目录下仍存在历史 `notes.json`，首次读取时会自动转换成独立 `.md` 文件并删除旧 JSON 文件。

### 优化
- 增强 `随手小记` 编辑器的 Markdown 能力，不再只支持非常少的排版动作。当前工具栏已补充一级/二级/三级标题、粗体、斜体、下划线、删除线、行内代码、代码块、引用、无序列表、有序列表、分割线、链接等常用 Markdown 写作能力。
- 继续优化 Markdown 编辑体验：链接编辑不再走浏览器原生 `prompt()`，而是改成应用内小弹窗；同时补充图片插入、表格插入入口，以及一份轻量 Markdown 帮助面板，降低用户需要自己记忆 Markdown 语法的门槛。
- 继续增强随手小记的 Markdown 能力：编辑器现已支持任务列表（checkbox），并新增本地图片插入能力。图片会保存到当前笔记目录下的 `assets/` 子目录，再以相对 Markdown 路径写回正文，确保 `.md` 文件和资源文件可以一起迁移。
- 继续增强编辑器的实际可用性：图片和表格现在不再只是 Markdown 文本骨架，而是支持在编辑区里可视化显示；同时补上拖拽图片上传和粘贴图片上传，直接落入当前笔记目录的 `assets/` 子目录并插入相对路径图片节点。
- 保留所见即所得书写体验，同时让导出结果和底层存储结果都是真正的 Markdown 文件，不再出现“导出是 md、存储却是 json”的不一致。

### 测试
- 新增后端测试覆盖：旧 `notes.json` 自动迁移为 `.md` 文件，以及并发写入下多条 Markdown 笔记文件仍可稳定保存。
- 新增后端测试覆盖笔记图片资源上传接口，确保图片会落入当前笔记目录的 `assets/` 子目录并返回相对路径。

## [1.2.7] - 2026-03-29
### 优化
- 重做 `随手小记` 编辑体验，不再使用程序员导向的 `@uiw/react-md-editor` 双模式 Markdown 工具栏界面，改为单栏沉浸式笔记编辑布局，更接近手机便签和 Typora 的所见即所得书写体验。
- 新笔记编辑器底层仍然保存 Markdown，但前端改为通过富文本编辑区承载正文输入，并在内部完成 Markdown/HTML 双向转换，让用户可以直接面对排版后的文本，而不必手写 Markdown 语法。
- 笔记页整体改版为更轻、更像纸张的视觉语言：强化标题区、弱化工具感、优化侧栏摘要与更新时间展示，并保留自动保存状态提示。
- 新增笔记导出能力，当前活动笔记可直接导出为 `.md` 文件，满足后续迁移、备份和外部编辑需求。
- 修复 `随手小记` 这一轮迭代带来的几个可用性回归：目录设置改为全局蒙层弹窗，不再被主编辑区遮挡；新建笔记增加明确成功/失败提示；切换笔记目录时会主动扫描新目录中的现有便签，并在旧目录有内容时提示是否自动迁移。
- 后端新增笔记迁移接口 `/api/system/notes/migrate`，用于把旧目录和新目录的 `notes.json` 做按 `id` 去重合并并按更新时间排序，避免前端自己拼文件逻辑。
- 继续修复笔记目录切换失败的根因。实际问题不是目录切换逻辑本身，而是 `~/.clawos/notes.json` 被并发写入损坏，文件尾部出现重复 JSON 片段，导致读取当前目录便签时直接报解析错误。后端现已新增统一 `notesStore`，通过串行写入队列 + 临时文件原子替换保障 `notes.json` 不再被写裂，并让目录切换时的错误提示返回真实读写原因。
- 修复中文目录无法作为笔记目录使用的问题。根因是前端此前把目录路径塞进 `X-Notes-Dir` 请求头，浏览器会在请求发出前直接拒绝包含中文字符的 Header。现已改为 `GET` 用查询参数、`POST/PUT/DELETE` 用 JSON body 传递目录路径，并把随手小记默认目录切换为 `/home/chriswong/文档/随手小记`。
- 补全随手小记目录区域体验：侧栏现在会明确显示“当前目录”，并提供“打开目录”“复制路径”快捷动作；目录切换成功后的提示文案也改得更明确，迁移成功时会直接说明“已切换到新目录，并迁移 X 条便签”。
- 根据实际使用反馈继续精简随手小记目录 UI：移除占空间的“当前目录”信息卡片，只保留设置按钮左侧的一个小文件夹图标用于打开当前目录，目录详情收进悬停提示，避免侧栏被次要信息挤占。

### 测试
- 新增前端测试覆盖笔记摘要清洗、Markdown 转 HTML、HTML 回写 Markdown，确保新编辑器在保持 Markdown 底层存储时不会破坏基本转换链路。
- 新增后端笔记迁移测试，覆盖旧目录便签到新目录的合并迁移行为，确保切换存储目录后的迁移流程可验证。
- 新增后端笔记存储并发测试，覆盖 `notes.json` 在多次并发写入下仍保持合法 JSON，防止目录切换、自动保存和新建笔记交叉触发时再次把笔记文件写坏。
- 实测验证中文路径目录切换成功，`/home/chriswong/文档/随手小记` 可正常读取并作为默认笔记目录使用。

## [1.2.6] - 2026-03-29
### 优化
- 同步桌面右侧“下载队列”小组件到下载管理器新的业务语义，不再直接调用 `aria2.tellActive` 只显示活跃任务，而是改为读取 `/api/system/downloads/tasks`，与主下载页共用统一的任务状态、分类和文案规则。
- 小组件现在会优先展示“下载中 / 排队中 / 已暂停 / 失败”这些当前更值得关注的任务，并补充引擎在线/离线状态与各类任务计数，避免桌面卡片和下载管理页出现状态定义不一致的问题。
- 桌面“下载队列”卡片现已支持直接点击进入“下载管理”应用，失败任务也会直接展示后端返回的错误摘要，减少必须进入详情页才能看懂问题的来回跳转。
- 服务监控页面新增 `OpenClaw 备份` 卡片，放置在 `Timeshift 系统备份` 下方。后端新增 `/api/system/openclaw-backup` 探针，按真实目录结构分别监控 `/home/chriswong/OpenCLawSpace/ClawBackUp/versions` 与 `/home/chriswong/OpenCLawSpace/ClawBackUp/zips` 两种备份格式，并额外显示根目录下 `VERSIONS.md` 索引是否存在，避免把说明文件误算成备份项。
- OpenClaw 备份卡片继续增强：后端会解析 `VERSIONS.md` 最后一条索引版本，并校验它是否与 `versions/` 和 `zips/` 的最新备份保持一致；前端新增同步状态提示条，在索引缺失或三方不一致时显示明确告警。

### 测试
- 新增前端回归测试，覆盖下载小组件任务优先级排序、任务名回退逻辑，以及桌面状态颜色映射，确保桌面侧后续不会再退回旧的 aria2 活跃任务语义。
- 新增后端探针测试，覆盖备份目录按最后修改时间选取最新备份、缺失目录返回可读错误，以及 OpenClaw 的 `versions/` 和 `zips/` 两类备份分开统计，避免后续监控逻辑再次把根目录内容混算。
- 补充 OpenClaw 备份一致性测试，覆盖“索引与两类备份一致”以及“索引与实际最新备份漂移”两种场景，锁定 `VERSIONS.md` 解析与同步状态判断逻辑。

## [1.2.5] - 2026-03-29
### 修复
- 修复夸克网页登录弹窗卡在“官网落地页但无法真正登录”的关键问题。根因是被代理后的页面运行在 `http://<host>:3001/proxy/quark-auth/` 源下，但其登录脚本仍直接请求 `https://pan.quark.cn/...` 和 `https://uop.quark.cn/...`，导致二维码与手机号登录接口被浏览器按跨域拦截，只留下一个无效的 `ctoken`。
- 后端代理层现已为夸克网页登录补齐本地请求改写：新增 `uop.quark.cn` 代理入口，并在夸克首页 HTML 中注入请求重写脚本，把 `fetch/XMLHttpRequest` 指向 `pan.quark.cn` 与 `uop.quark.cn` 的绝对请求统一改写到本地 `/proxy/quark-auth` 与 `/proxy/quark-auth-uop`，让二维码登录轮询链路可以在 ClawOS 内正常工作。
- 修复“夸克登录成功但自动挂载失败”的配置写入错误。根因是 ClawOS 在调用 AList `storage/create` 时把 Quark/Baidu 驱动参数错误地放在顶层字段，AList 实际需要的是 `addition` JSON；结果存储虽然被创建出来，但 `cookie` 被写成空字符串，最终挂载状态变成 `require login [guest]`。
- `backend/src/routes/netdisk.ts` 现已改为把 Quark `cookie`、`root_folder_id` 以及百度 `refresh_token` 等驱动参数统一写入 `addition`，并兼容 AList 返回“已创建但初始化失败”的响应格式，保证后续还能继续读取真实挂载状态给前端展示。
- 修复 `/clawos/` 入口下点击“夸克网页登录”跳回主界面的问题。根因是后端为了把 `/clawos` 纠正到 `/clawos/` 增加了一条重定向路由，但 Express 的默认非严格匹配会把 `/clawos/` 也匹配进去，导致 `/clawos/` 本身陷入 302 自跳。现已改为按 `req.originalUrl === '/clawos'` 精确判断，只在缺少末尾斜杠时才重定向。
- 继续修复“点击夸克网页登录后又回到 ClawOS”的真实根因。问题不在后端代理，而在前端 `startQuarkWebLogin` 的开窗时序：此前先 `await reset` 再 `window.open(...)`，会把新窗口调用移出用户点击的同步手势链；后续改成“先开 about:blank 再赋值 location”后，又在真实浏览器里停留在 `about:blank` 不再导航。现在前端已改为在点击事件中同步 `window.open('/clawos/proxy/quark-auth/', '_blank', ...)` 直接打开目标登录页，再异步执行 reset，并增加本次登录开始时间判断，避免旧 Cookie 会话误触发自动配置。
- 修复网盘文件类型图标与筛选错乱的问题。根因是前端直接依赖 AList 返回的 `type` 数字来判断图片/视频/文档，但这个字段对 Quark 文件并不稳定，导致像 `mp3` 这样的音频文件被误映射成图片图标。现已改为统一按文件扩展名判断 `folder/image/video/audio/document`，并让图标与筛选逻辑共用同一套分类规则。

### 优化
- 重做下载管理应用的产品层体验，不再把前端当作 aria2 RPC 面板直接使用。后端新增下载引擎状态、任务列表、创建任务、任务动作、历史清理等业务接口；前端改为通过这些接口显示更友好的在线状态、任务计数、错误提示与成功反馈。
- 下载管理顶部新增下载引擎在线状态、全局速度/活跃任务统计，以及“清理记录”入口。支持按“清理已完成 / 清理失败与已删除 / 清空全部历史”分层清理下载历史，且默认只清理任务记录，不删除本地文件。
- 下载任务筛选改为“全部 / 下载中 / 排队中 / 已暂停 / 失败 / 已完成”，不再把 `waiting` 错误显示成“已暂停”。任务卡片补充保存目录、多文件数量、失败原因、剩余时间等信息，并提供打开目录、复制路径、暂停/继续、删除等更符合用户心智的动作。
- 新建下载任务流程补充成功/失败反馈，并区分普通链接与 magnet 链接：磁力任务提交后会提示“正在获取元数据”。目录设置文案也改为明确区分“全局默认下载目录”和“本次任务保存目录”。

### 优化
- 重做百度网盘与夸克网盘的首次使用流程：新增 `/api/system/netdisk/status` 挂载状态接口，前端不再一上来就直接进入文件列表，而是先显示“已绑定 / 未绑定 / 后台不可用 / 登录失效”等清晰状态。
- 将网盘接入改成更适合小白的分步向导：明确区分“登录 AList 底层挂载后台”和“填写百度/夸克授权信息”，并加入“打开底层挂载后台”“我已完成，重新检测”两个核心动作，降低理解门槛。
- 优化网盘文案与提示层级：弱化 AList 后台作为主入口的存在感，补充默认后台账号展示与操作说明，避免把 AList 管理登录误解成百度/夸克账号登录。
- 继续强化网盘傻瓜式引导：补充“存储类型 / 挂载路径”一键复制、AList 后台逐步操作顺序，以及按错误状态区分的排查提示，进一步降低首次接入成本。
- 补充 Cookie 获取说明：新增“推荐用 Cookie-Editor 插件复制 Cookie”和“手动用开发者工具复制 Cookie”两套步骤，并直接提供百度/夸克官网与 Cookie-Editor 入口，解决不会提取 Cookie 的使用障碍。
- 新增网盘“单凭据自动配置”能力：前端直接提供百度 `refresh_token` / 夸克 `cookie` 输入框，提交后由 ClawOS 自动调用 AList 管理接口创建或更新挂载，不再强制用户手动进入 AList 后台配置存储。
- 大幅精简百度/夸克网盘首页引导：将原先的大段说明压缩为“状态 + 关键配置 + 单凭据输入框 + 3 个核心按钮”，把长说明与 AList 默认账号折叠到可展开区域，减少阅读负担。
- 为夸克网盘新增“网页登录自动配置”链路：后端新增 Quark 代理登录页与 Cookie 会话管理，前端可直接在网盘应用内打开夸克官网登录，检测到登录 Cookie 后自动调用挂载配置接口，进一步减少手动复制 Cookie 的步骤。

## [1.2.4] - 2026-03-29
### 修复
- 重构桌面“正在播放”同步架构：新增常驻前端音乐桥 `frontend/src/lib/musicBridge.ts`，桌面卡片不再依赖一次性 `request/sync` 事件补拉，而是直接订阅统一状态源，解决系统启动后先开音乐再回桌面时状态长时间不刷新的问题。
- 修复网易云音乐补拉链路仍使用旧字段（`name/ar/al`）导致状态恢复不稳定的问题，统一改为使用标准化的 `title/artist/cover` 数据。
- 为网易云音乐与本地音乐加入双音源仲裁：后开始播放或进入 `preparing` 的音源自动接管桌面卡片，并主动暂停另一边，避免两个音乐应用同时播放和卡片来源来回乱跳。
- 优化点歌瞬间的桌面反馈：播放器在请求音频/缓冲前就先上报 `preparing` 状态，桌面卡片能立即显示歌名、歌手与封面，不再需要等真正播出很久后才更新。

## [1.2.3] - 2026-03-29
### 修复
- 修复桌面“正在播放”卡片中因数据映射错误（`.name` vs `.title`）导致无法显示歌名，并导致歌手文字占用主标题位置的问题。
- 优化了“正在播放”卡片中的歌名排版，增大了字号并加粗，以突出歌曲名称。
- 移除了冗余的 `clawos-music-state` 旧状态派发事件。

## [1.2.2] - 2026-03-29
### 新增
- 史诗级强化桌面“正在播放”音乐卡片功能：
  - 增加“网易云音乐 / 本地音乐”来源标识显示。
  - 增加对“上一首 / 播放·暂停 / 下一首”指令的双向控制。
  - 增加实时同步展示当前正在播放的单行歌词。
  - 彻底解决了状态多实例相互覆盖导致的卡片内容为空的问题，采用应用隔离与指令订阅模式进行解耦。

## [1.2.1] - 2026-03-29
### 优化
- 优化右侧桌面卡片(Widgets)的布局，将其改为更规整的“2列 x 3行”网格排列，统一设定卡片高度为 160px，极大地改善了在浏览器缩放（如125%）时的错位与排版异常问题。
- 优化网络速率卡片的文字显示逻辑，缩小字号并增加换行截断，防止在大网速（长字符串）时撑爆卡片导致变形。
- 修复音乐播放卡片无法同步状态和切歌的问题。现在只要打开了网易云或本地音乐，当窗口最小化退到后台后，组件会立即发起请求并同步最新的播放状态、封面和暂停/继续指令。

## [1.2.0] - 2026-03-29
### 新增
- 在桌面右侧新增了“便捷信息卡片 (Widgets)”面板，提供六大模块：
  1. **系统时间与日历**：展示当前日期时间，并提示下一个即将运行的计划任务。
  2. **硬件状态**：实时显示 CPU、内存与磁盘占用率及动态进度条。
  3. **网络速率**：实时显示当前的上传与下载网速。
  4. **下载队列**：实时显示 Aria2 正在进行中的下载任务与进度比例。
  5. **灵感速记**：一个支持实时自动保存到本地的快捷便签本，方便随时记录想法。
  6. **正在播放**：联动“网易云音乐”与“本地音乐”，在后台播放时展示封面、歌名和播放状态，并可直接在桌面点击切换播放/暂停。
- 在“系统设置 -> 个性化”中增加了“显示右侧桌面卡片”开关，支持用户自由隐藏或显示此侧边栏。

## [1.1.0] - 2026-03-29
### 新增
- 在全局设置的“个性化”页面新增了“系统壁纸”设置选项。
- 内置了 10 张额外的高清桌面壁纸（包含抽象、自然、星空、极简、macOS风格等），支持点击切换并在本地缓存持久化用户的壁纸选择。

## [1.0.6] - 2026-03-29
### 修复
- 修复网易云音乐图标中间白色音符过小的问题。通过剔除 Simple Icons 原始 SVG 中的外层反选遮罩层路径，直接提取正向音符形状，将其等比缩放并完美居中于标准的 14px 半径红色背景圆内，彻底恢复了官方的尺寸比例。

## [1.0.5] - 2026-03-29
### 修复
- 缩小网易云音乐的图标比例，使其与百度网盘、夸克等其它第三方应用图标保持完美的一致大小，修复了之前全幅填充导致图标在 Dock 栏上过大的问题。

## [1.0.4] - 2026-03-29
### 修复
- 撤销之前的简化双音符图标，使用官方原版的网易云音乐 SVG 矢量路径重新渲染图标，保持与官方设计完全一致。

## [1.0.3] - 2026-03-29
### 修复
- 修复网易云音乐应用图标，替换为更加规整清晰的双音符图标，解决原SVG路径复杂导致的“一团糟”显示问题。

## [1.0.2] - 2026-03-29
### 修复
- 调整本地音乐元数据来源标签展示：移除歌曲行上的“缓存补全”标示，仅保留“云端补全”“混合信息”和“补全失败”，减少列表视觉噪音。
- 修复 `~/.clawos/music_cache/netease_tracks.json` 在本地音乐批量预热时容易被并发写入覆盖的问题。根因是网易云缓存采用“读文件 -> 改数组 -> 直接写回”的无锁流程，多个异步请求同时写入时后写覆盖前写，最终只剩极少量条目。
- 为网易云元数据缓存写入增加进程内串行锁和临时文件原子替换，避免预热过程中的丢条目、半写入和读取到损坏 JSON 的风险。
- 修复本地音乐重新扫描时复用旧 DB 条目却不重新校验封面文件存在性的缺陷。此前如果 `db.json` 里遗留了 `hasCover: true`，但实际 `~/.clawos/music_cache/<trackId>.jpg` 已丢失，扫描结果仍会继续返回假阳性，导致前端持续请求一个必然 404 的封面地址。
- 修复本地音乐封面接口对隐藏目录文件的兼容性问题。由于缓存文件位于 `~/.clawos/music_cache/`，`res.sendFile()` 默认拒绝 dotfile 路径，导致即使封面 JPG 存在也会稳定返回 404；现在显式允许读取隐藏目录中的缓存封面文件。

### 测试
- 新增并发写入回归测试，验证 `upsertNeteaseTrackCache()` 在 25 个并发写入下仍能完整保留全部缓存条目。
- 新增本地音乐扫描回归测试，验证旧缓存中封面状态失真时，重新扫描会把 `hasCover` 正确修正回 `false`。
- 新增本地音乐链路级回归测试，覆盖“扫描 -> 复用网易云缓存补全歌手/专辑 -> 写入本地歌词缓存 -> `/list` 返回增强结果”整条后端流程，确保这条核心补全链路不会再静默回退。
- 新增封面接口回归测试，验证 `/api/system/localmusic/cover/:id` 可以正确读取 `~/.clawos/music_cache/` 隐藏目录中的 JPG 缓存文件。

### 验证
- 安装了前端 Playwright 依赖与 Chromium 浏览器，补充浏览器自动化脚本 `frontend/scripts/e2e-validate.mjs`，用于验证本地音乐扫描/补全与网易云搜索/播放的 UI 链路。
- 在浏览器实测中进一步定位出一个环境问题：默认 `3001` 端口上存在常驻 ClawOS 服务，容易与临时验证实例混用；改到独立端口后，封面接口 `curl` 验证已恢复 `200`，但浏览器 E2E 仍受当前本机端口/进程环境干扰，需要在干净端口或停掉常驻服务后再跑最终 UI 全量验收。

## [1.0.1] - 2026-03-28
### 修复
- 修复网易云音乐后端本地下载检测接口的 `fs` 导入错误与严格模式编译失败问题。
- 修复网易云音乐默认下载目录读取错误，改为与 Aria2 配置保持一致。
- 修复网易云音乐本地流播放缺少 Range 支持与错误 MIME 类型的问题，提升本地文件拖动和兼容性。
- 修复网易云音乐前端播放状态与实际音频状态不同步的问题，补充 `audio.play()` 错误处理与恢复进度等待逻辑。
- 修复网易云音乐已下载歌曲识别过于脆弱的问题，改为返回结构化下载数据并做规范化匹配。
- 修复本地音乐切换目录后仍显示旧曲库的问题，后端现在会记录扫描目录并在目录变化时提示重新扫描。
- 修复本地音乐与网易云音乐在继续播放、单曲循环、音频加载失败时的状态不同步问题。
- 修复本地音乐流接口缺少 MIME 校验与非法 Range 保护的问题，提升拖动和兼容性。
- 修复网易云音乐部分搜索结果/歌单歌曲没有专辑封面的关键问题，后端现在会通过 `/detail` 回补并缓存封面 URL。
- 修复网易云音乐与本地音乐歌词解析只识别单个时间标签的问题，支持一行多个时间戳和无毫秒歌词。
- 修复快速切歌时旧歌词请求回写到新歌曲界面的竞态问题。
- 修复网易云音乐下载推送后本地标记刷新过慢的问题，改为短延迟 + 二次刷新。
- 修复网易云音乐下载链路仅靠文件名匹配的问题，新增后端下载映射表并优先按 `songId` 识别本地文件。
- 修复网易云与本地音乐在快速切歌、单曲循环、切音质时的播放竞态问题，增加播放 token 与延迟 seek 恢复逻辑。
- 修复本地音乐从后台切回前台后曲库状态不刷新的问题，现在窗口聚焦和页面恢复可自动刷新曲库。
- 修复网易云与本地音乐歌词请求使用 React 旧闭包状态导致歌词始终被清空的问题，改为基于 `activeSongIdRef` 判定当前歌曲。
- 修复网易云封面补图请求被全局 requestId 互相覆盖导致大部分封面永远补不回来的问题，改为按歌曲独立去重请求。
- 修复网易云歌词接口把 `yrc/klyric` 误当普通 LRC 返回导致前端无法解析的问题，现在只返回标准 `lrc.lyric`。
- 修复网易云专辑封面只补前 6 首的缺陷，改为对当前列表全部缺封面歌曲进行补全。
- 修复网易云下载标示只扫描顶层目录且重新打开窗口不主动刷新问题，后端改为递归扫描，前端在应用重新激活时主动重扫下载目录。

### 变更
- 新增统一网易云元数据缓存 `backend/src/utils/musicCache.ts`，将歌曲信息、封面 URL、歌词与匹配键持久化到 `~/.clawos/music_cache/netease_tracks.json`。
- 网易云搜索、歌单、详情、歌词请求现在会持续写入本地元数据缓存，减少重复请求并为本地音乐补全提供数据源。
- 本地音乐扫描时会优先复用网易云缓存补全歌手、专辑、封面与歌词缓存，缺失项再走网易云接口拉取。
- 修复本地音乐切到后台后曲库“消失”的问题：前端 `loadLibrary` 现在会带上当前自定义目录请求后端，不再误用默认 `~/Music` 目录导致返回 `needsScan: true`。
- 本地音乐列表接口现在会在读取缓存时再次尝试应用网易云缓存元数据，避免必须重新手动扫描后才能看到补充后的信息。
- 强化本地音乐的网易云匹配策略：增加多轮关键词搜索、文件名清洗（如去掉“无损”“Live”“版本”后缀）与候选打分，提高旧曲库批量预热命中率。
- 本地扫描与列表读取现在都会触发后台元数据强制预热，持续补全 `netease_tracks.json`、本地封面缓存和歌词缓存，而不再依赖手动点歌触发。
- 新增本地音乐元数据预热状态接口 `/api/system/localmusic/warmup-status`，前端可实时看到补全进度、当前歌曲与已更新数量。
- 本地音乐页面新增“元数据补全”进度条，让后台自动补封面/歌词/专辑信息的过程对用户可见。
- 本地音乐歌曲行现在会显示元数据来源标记（如“云端补全”“缓存补全”“混合信息”），便于判断哪些信息来自网易云增强。
- 为本地曲目元数据预热增加失败记录、失败原因和有限重试次数，避免对始终匹配失败的歌曲无限重复撞接口。

### 测试
- 新增后端自动化测试基础设施（`backend/tsconfig.test.json` + `npm run test:build && npm test`），覆盖音乐匹配与缓存关键词生成逻辑。
- 新增前端自动化测试基础设施（`frontend/tsconfig.test.json` + `npm test`），覆盖 LRC 歌词解析核心逻辑。
- 修复测试接入过程中暴露的真实问题：文件名回退 artist 的关键词生成不正确，以及前后端测试文件被正式构建错误纳入的问题。
- 补齐后端路由级测试：覆盖 `localmusic/list` 的目录不匹配分支、`localmusic/warmup-status` 返回结构，以及 `music/downloaded` 的递归扫描行为。
- 补齐前端展示逻辑测试：覆盖本地音乐元数据来源标签判断逻辑（补全失败、云端补全、嵌入信息不显示标签）。

### 变更
- 网易云音乐已下载标记与本地优先播放逻辑改为使用后端过滤后的音频文件列表。
- 本地音乐曲库缓存从纯数组升级为带扫描目录信息的结构化存储，以避免不同目录之间的数据串用。

## [1.4.0] - 2026-03-30
### 新增
- 新增 **AI 炒股 (AI Quant)** 应用，作为量化交易系统的交互枢纽。
- 完整实现了基于 v3.4 架构设计的前端界面，包含：
  - **总览看板**：核心数据指标与收益对比。
  - **每日策略**：AI 策略推送接收与人工决策工作台（支持确认、忽略、推翻，并强制要求推翻理由）。
  - **持仓风控**：动态持仓监控与系统风控预警（行业集中度、VaR 压力测试）。
  - **记忆复盘**：展示 AI 的置信度校准、因子有效性追踪及最近周报。
  - **行为画像**：用户行为偏差诊断、决策胜率对比，以及二级/三级系统干预警告弹窗。

## [0.4.5] - 2026-03-30
### 新增 (AI 炒股应用)
- 策略页：增加确认执行微型交易表单（市价/限价、委托数量设定）
- 策略页：增加历史策略状态 Timeline，支持查看持仓中和已平仓的策略回顾
- 画像页：增加“风险自担确认书”弹窗，拒绝冷静期需手动输入文字以确认高风险操作
- 画像页：增加评估心境网格 (Mood/Stress) 和已克服的恶习 (学习进度) 展示
- 风控页：在持仓列表增加“手动平仓”操作按钮
- 风控页：增加持仓相关性预警面板，动态提示多股之间同涨同跌风险
- 记忆页：增加策略引擎版本演进历史展示，记录系统自我修正与升级轨迹
