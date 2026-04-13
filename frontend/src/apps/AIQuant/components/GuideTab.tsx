/**
 * GuideTab — 系统说明页
 * 面向小白用户的完整使用说明，包含系统能力、自动时间线、核心概念、风控机制等。
 */

/* ── 时间线节点数据 ── */
const TIMELINE: {
  time: string
  label: string
  desc: string
  color: string
  icon: string
}[] = [
  {
    time: '07:30',
    label: '晨间补充采集',
    desc: '自动补充采集前一交易日夜间产生的新闻、公告等增量数据。只运行数据采集 + LLM 信息提取两个阶段，结果合并到前一交易日的事实池，供当天盘前分析使用。',
    color: 'bg-sky-500',
    icon: '🌅',
  },
  {
    time: '08:05',
    label: '盘前分析',
    desc: '自动拉取中证500股票池与行情，运行 45 位专家投票（30 位 LLM + 15 个规则专家）和三流评分，生成今日买入/观望信号。同时运行事件驱动选股（G7）和重大事件一票否决（MH1），并同步刷新权重、阈值和风险状态。',
    color: 'bg-blue-500',
    icon: '🔍',
  },
  {
    time: '09:25',
    label: '盘中监控启动',
    desc: '自动启动实时监控，每 60 秒刷新一次持仓行情，检查止损/止盈/移动止损/超期持仓四项风控条件，触发时发出告警。',
    color: 'bg-green-500',
    icon: '📡',
  },
  {
    time: '09:30 - 11:30',
    label: '上午交易时段',
    desc: '盘中监控持续运行。你可以在「总览看板」查看操作建议，在「每日策略」确认/推翻信号，在「持仓风控」查看实时盈亏和告警。',
    color: 'bg-emerald-500',
    icon: '📈',
  },
  {
    time: '13:00 - 15:00',
    label: '下午交易时段',
    desc: '监控继续。如有持仓触发止损或止盈条件，页面顶部会弹出红色告警卡片。点击「确认」标记已处理。',
    color: 'bg-emerald-500',
    icon: '📊',
  },
  {
    time: '15:05',
    label: '盘中监控停止',
    desc: '收盘后自动关闭盘中监控，停止行情轮询。',
    color: 'bg-slate-400',
    icon: '⏹️',
  },
  {
    time: '16:00',
    label: '盘后分析',
    desc: '自动进入最长 3 小时的盘后批处理窗口：刷新收盘价 → 持仓重评估 → 组合级风控 → 8 个数据采集 Agent → 3 个 LLM 提取 Agent → 专家记忆更新（短期/中期/长期三级） → 状态持久化。结果供次日盘前选股使用。',
    color: 'bg-purple-500',
    icon: '🧠',
  },
  {
    time: '17:00 (周五)',
    label: '自动周报',
    desc: '每周五收盘后自动生成周度绩效报告，包含本周交易统计、胜率、盈亏比、模型组排名，并推送通知到总览看板。',
    color: 'bg-indigo-500',
    icon: '📋',
  },
  {
    time: '17:30 (月末)',
    label: '自动月报',
    desc: '每月最后一个交易日生成月度总结，包含完整月度统计 + 7 条规则引擎自动调参建议，并触发长期记忆更新。',
    color: 'bg-pink-500',
    icon: '📑',
  },
]

/* ── 各页面功能表 ── */
const PAGE_TABLE: { name: string; desc: string; badge: string }[] = [
  { name: '总览看板', desc: '今日操作建议、盘中告警横幅、关键通知历史、市场状态、系统运行状态与数据健康度', badge: 'bg-blue-100 text-blue-700' },
  { name: '每日策略', desc: '候选信号详细三流评分、支撑/阻力位、事件驱动加分、待处理卖出区域，以及逐只确认、推翻或忽略', badge: 'bg-green-100 text-green-700' },
  { name: '持仓风控', desc: '实时盈亏、止盈止损进度、组合级风控、风险事件时间线、换仓建议与交易复盘', badge: 'bg-red-100 text-red-700' },
  { name: '记忆复盘', desc: '周/月汇总、交易记录、累计收益/回撤/胜率图表、观望日志后验、模型组表现与学习结果', badge: 'bg-amber-100 text-amber-700' },
  { name: '行为画像', desc: '执行率、推翻率、忽略率和纪律分，帮助识别你的决策偏差', badge: 'bg-violet-100 text-violet-700' },
  { name: 'AI 配置', desc: 'AI 供应商、模型池、9 个 LLM 分析层 + 1 个规则层分配、3 个 LLM 提取 Agent、8 个数据采集 Agent 与超时配置', badge: 'bg-cyan-100 text-cyan-700' },
  { name: 'AI专家分析', desc: '查看指定日期的完整专家投票明细、分层结论、专家记忆库（短期/中期/长期）和当日记忆条目', badge: 'bg-indigo-100 text-indigo-700' },
  { name: 'AI数据收集', desc: '查看指定日期的 FactPool、8 个 Agent 执行结果、真实社交舆情快照和 LLM 提取结果', badge: 'bg-fuchsia-100 text-fuchsia-700' },
  { name: '系统说明', desc: '当前页面。使用指南、时间线、核心概念、风控说明', badge: 'bg-slate-100 text-slate-600' },
]

export function GuideTab() {
  return (
    <div className="space-y-4 pb-20">
      <h2 className="text-xl font-bold text-slate-800">系统说明</h2>

      {/* ═══════════════ 一句话介绍 ═══════════════ */}
      <div className="bg-gradient-to-r from-indigo-50/80 to-blue-50/80 border border-indigo-200/60 rounded-2xl shadow-sm p-4">
        <h3 className="text-base font-bold text-indigo-900 mb-1">「AI 炒股」是什么？</h3>
        <p className="text-sm text-indigo-800 leading-relaxed">
          这是一个 <strong>辅助决策工具</strong>，每个交易日自动从中证500的500只股票中筛选少量候选，
          通过 <strong>45 位专家投票 + 技术面 + 量化因子</strong> 三维度评分，结合 <strong>事件驱动选股</strong> 和 <strong>重大事件一票否决</strong>，给出买入/观望/卖出建议。
          <strong>买不买、卖不卖，完全由你自己决定</strong>。系统忠实记录每次决策，帮你持续改进。
        </p>
      </div>

      {/* ═══════════════ 每日自动时间线 ═══════════════ */}
      <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm p-4">
        <h3 className="text-base font-bold text-slate-800 mb-1">每日自动运行时间线</h3>
        <p className="text-xs text-slate-500 mb-3">以下所有任务均在交易日自动执行（含节假日判断），无需手动操作。你也可以在界面顶部按钮手动触发。</p>

        <div className="relative ml-4">
          {/* 竖线 */}
          <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200" />

          <div className="space-y-3">
            {TIMELINE.map((node, i) => (
              <div key={i} className="relative flex items-start gap-3 group">
                {/* 圆点 */}
                <div className={`relative z-10 w-4 h-4 rounded-full ${node.color} ring-2 ring-white shadow-sm flex-shrink-0 mt-0.5`} />
                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 rounded px-1.5 py-0.5">{node.time}</span>
                    <span className="text-sm font-semibold text-slate-800">{node.icon} {node.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{node.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══════════════ 你需要做什么（每日操作指南）═══════════════ */}
      <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm p-4">
        <h3 className="text-base font-bold text-slate-800 mb-2">你每天需要做什么？</h3>
        <div className="grid grid-cols-3 gap-3">
          {/* 早盘 */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-3">
            <div className="text-sm font-bold text-blue-800 mb-1.5">开盘前 (08:30 左右)</div>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside leading-relaxed">
              <li>打开 <strong>总览看板</strong>，查看市场状态和操作建议</li>
              <li>如有<span className="text-red-600 font-medium">「卖出」</span>建议，优先处理</li>
              <li>如有<span className="text-green-600 font-medium">「买入」</span>建议，切到「每日策略」看详细评分</li>
              <li>对每个信号做出决策：确认 / 推翻 / 忽略</li>
            </ol>
          </div>
          {/* 盘中 */}
          <div className="rounded-xl border border-green-100 bg-green-50/50 p-3">
            <div className="text-sm font-bold text-green-800 mb-1.5">交易时段 (09:30 - 15:00)</div>
            <ol className="text-xs text-green-700 space-y-1 list-decimal list-inside leading-relaxed">
              <li>系统自动监控，无需盯盘</li>
              <li>如果总览看板弹出<span className="text-red-600 font-medium">红色告警卡片</span>，说明有持仓触发了风控条件</li>
              <li>点击告警卡片的「确认」按钮标记已处理</li>
              <li>可随时查看「持仓风控」页面了解实时盈亏</li>
            </ol>
          </div>
          {/* 收盘后 */}
          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-3">
            <div className="text-sm font-bold text-purple-800 mb-1.5">收盘后 (16:00 之后)</div>
            <ol className="text-xs text-purple-700 space-y-1 list-decimal list-inside leading-relaxed">
              <li>盘后分析自动运行，无需操作</li>
              <li>建议查看「记忆复盘」了解累计表现</li>
              <li>周五留意周报通知，月末留意月报</li>
              <li>在「行为画像」检查自己的决策质量</li>
            </ol>
          </div>
        </div>
      </div>

      {/* ═══════════════ 核心概念 + 风控 双列 ═══════════════ */}
      <div className="grid grid-cols-2 gap-4">
        {/* 核心概念 */}
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm p-4">
          <h3 className="text-base font-bold text-slate-800 mb-2">核心概念</h3>
          <div className="space-y-2.5 text-xs leading-relaxed text-slate-600">
            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">三流评分（每只股票的总分来源）</div>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                <div className="rounded bg-indigo-50 p-1.5 text-center">
                  <div className="font-bold text-indigo-700">专家分</div>
                  <div className="text-[10px] text-indigo-500">30 位 LLM 专家<br />+ 15 个规则专家</div>
                </div>
                <div className="rounded bg-teal-50 p-1.5 text-center">
                  <div className="font-bold text-teal-700">技术分</div>
                  <div className="text-[10px] text-teal-500">均线/MACD/RSI<br />成交量/板块对比</div>
                </div>
                <div className="rounded bg-amber-50 p-1.5 text-center">
                  <div className="font-bold text-amber-700">量化分</div>
                  <div className="text-[10px] text-amber-500">动量/波动率<br />相对强弱/因子</div>
                </div>
              </div>
              <p className="mt-1.5 text-slate-500">三项评分按当前市场体制加权求和 = <strong>综合评分</strong>。综合评分越高，股票越强。</p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">Conviction Filter（最终把关）</div>
              <p>综合评分超过门槛、且各项不被否决 → 推荐为「买入」。门槛会根据你的历史胜率自动上调或下调。</p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">市场体制（5种状态）</div>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(['牛市趋势', '熊市趋势', '高波动', '低波动震荡', '常规震荡'] as const).map((regime) => (
                  <span key={regime} className="inline-block px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-medium">{regime}</span>
                ))}
              </div>
              <p className="mt-1">不同体制下三流评分的权重不同，牛市偏重技术面，熊市偏重专家和量化。</p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">事件驱动选股（G7）</div>
              <p>盘前分析时，系统会读取前一日盘后 LLM 提取的公告事件和新闻影响，自动识别利好股票并将其加入候选池。即使某只股票因量化指标未入池，只要有高置信度的利好事件也会被纳入评估。</p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">重大事件一票否决（MH1）</div>
              <p>对即将发布财报、限售解禁、资产重组等重大不确定性事件的股票，无论评分多高，一律从候选池中剔除，避免踩中「地雷」。</p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">专家动态权重</div>
              <p>每位 AI 专家的投票权重会根据其历史预测准确率自动调整（0.1 ~ 2.0 倍），并有 60 天半衰期衰减。表现好的专家话语权更大。</p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">专家记忆系统（三级）</div>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                <div className="rounded bg-violet-50 p-1.5 text-center">
                  <div className="font-bold text-violet-700">短期记忆</div>
                  <div className="text-[10px] text-violet-500">近 5 个交易日<br />详细预测+结果</div>
                </div>
                <div className="rounded bg-violet-50 p-1.5 text-center">
                  <div className="font-bold text-violet-700">中期记忆</div>
                  <div className="text-[10px] text-violet-500">近 30 个交易日<br />LLM 压缩摘要</div>
                </div>
                <div className="rounded bg-violet-50 p-1.5 text-center">
                  <div className="font-bold text-violet-700">长期记忆</div>
                  <div className="text-[10px] text-violet-500">核心规律教训<br />最多 20 条</div>
                </div>
              </div>
              <p className="mt-1.5 text-slate-500">每日盘后自动更新短期+中期记忆，月末更新长期记忆。专家在投票时会参考自身历史记忆，避免重复犯错。</p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">数据采集与信息提取</div>
              <p>
                每天 16:00 盘后自动采集 8 个维度的数据（宏观经济、政策法规、上市公司公告、行业新闻、社交舆情、全球市场、量价补充、数据质量），
                再由 3 个 LLM 提取 Agent 做公告/新闻/情绪结构化抽取。
                次日 07:30 还会再跑一次增量采集，补充夜间产生的新闻和公告，合并到前一交易日的事实池中。
              </p>
            </div>

            <div className="rounded-lg bg-slate-50/80 p-2.5">
              <div className="font-semibold text-slate-800 mb-0.5">审计页面</div>
              <p>如果你想确认系统当天到底采集了什么、专家为什么这么投票，可以直接去「AI专家分析」和「AI数据收集」页面查看原始结果和更新时间，不需要盲信黑盒结论。</p>
            </div>
          </div>
        </div>

        {/* 风控机制 */}
        <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm p-4">
          <h3 className="text-base font-bold text-slate-800 mb-2">风控机制</h3>
          <div className="space-y-2.5 text-xs leading-relaxed text-slate-600">
            {/* 事前 */}
            <div className="rounded-lg border border-red-100 bg-red-50/40 p-2.5">
              <div className="font-semibold text-red-800 mb-1">事前风控（买入前自动否决）</div>
              <ul className="space-y-0.5 text-red-700">
                <li className="flex items-start gap-1.5"><span className="text-red-400 mt-0.5">●</span>持仓已满 3 只 → 自动否决新买入</li>
                <li className="flex items-start gap-1.5"><span className="text-red-400 mt-0.5">●</span>股票在黑名单中 → 短期不推荐</li>
                <li className="flex items-start gap-1.5"><span className="text-red-400 mt-0.5">●</span>组合亏损超限 → 暂停所有开仓</li>
                <li className="flex items-start gap-1.5"><span className="text-red-400 mt-0.5">●</span>次新股（上市&lt;60天）、停牌股 → 自动剔除</li>
                <li className="flex items-start gap-1.5"><span className="text-red-400 mt-0.5">●</span>重大事件股票（MH1 一票否决） → 自动剔除</li>
              </ul>
            </div>

            {/* 事中 */}
            <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
              <div className="font-semibold text-amber-800 mb-1">事中风控（盘中实时监控）</div>
              <div className="overflow-hidden rounded-lg border border-amber-200/80">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-amber-100/60">
                      <th className="px-2 py-1 text-left font-semibold text-amber-800">检查项</th>
                      <th className="px-2 py-1 text-left font-semibold text-amber-800">触发条件</th>
                      <th className="px-2 py-1 text-left font-semibold text-amber-800">建议操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    <tr>
                      <td className="px-2 py-1 font-medium text-amber-700">止损</td>
                      <td className="px-2 py-1">亏损 ≥ 3%</td>
                      <td className="px-2 py-1 text-red-600 font-medium">立即卖出</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 font-medium text-amber-700">第一止盈</td>
                      <td className="px-2 py-1">盈利 ≥ 3%</td>
                      <td className="px-2 py-1 text-green-600 font-medium">减半仓</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 font-medium text-amber-700">第二止盈</td>
                      <td className="px-2 py-1">盈利 ≥ 6%</td>
                      <td className="px-2 py-1 text-green-600 font-medium">全部卖出</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 font-medium text-amber-700">移动止损</td>
                      <td className="px-2 py-1">浮盈≥3%激活，从最高价回撤≥2%</td>
                      <td className="px-2 py-1 text-red-600 font-medium">卖出止损</td>
                    </tr>
                    <tr>
                      <td className="px-2 py-1 font-medium text-amber-700">超期持仓</td>
                      <td className="px-2 py-1">持仓 ≥ 20 个交易日</td>
                      <td className="px-2 py-1 text-amber-600 font-medium">考虑卖出</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-amber-600">盘中监控每 60 秒轮询一次，交易时段（09:30-11:30、13:00-15:00）自动运行；高危通知会常驻显示，避免被遗漏。</p>
            </div>

            {/* 组合级 */}
            <div className="rounded-lg border border-purple-100 bg-purple-50/40 p-2.5">
              <div className="font-semibold text-purple-800 mb-1">组合级风控（整体风险控制）</div>
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded bg-purple-100/60 px-2 py-1 text-center">
                  <div className="text-[10px] text-purple-500">日亏损上限</div>
                  <div className="font-bold text-purple-700">3%</div>
                </div>
                <div className="rounded bg-purple-100/60 px-2 py-1 text-center">
                  <div className="text-[10px] text-purple-500">周亏损上限</div>
                  <div className="font-bold text-purple-700">6%</div>
                </div>
                <div className="rounded bg-purple-100/60 px-2 py-1 text-center">
                  <div className="text-[10px] text-purple-500">月亏损上限</div>
                  <div className="font-bold text-purple-700">10%</div>
                </div>
                <div className="rounded bg-purple-100/60 px-2 py-1 text-center">
                  <div className="text-[10px] text-purple-500">最大回撤</div>
                  <div className="font-bold text-purple-700">15%</div>
                </div>
              </div>
              <p className="mt-1.5 text-purple-600">任一指标超限 → 自动暂停所有新开仓，保护本金。</p>
            </div>

            {/* 盘后复盘 */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
              <div className="font-semibold text-slate-700 mb-1">事后复盘（自动四维分析）</div>
              <p>每笔交易平仓后自动生成四维复盘：专家预测 vs 实际、技术评分 vs 目标、量化动量方向、执行效率/滑点。复盘结果反哺学习权重和专家记忆。</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ 数据来源 ═══════════════ */}
      <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm p-4">
        <h3 className="text-base font-bold text-slate-800 mb-2">数据来源与可靠性</h3>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="font-semibold text-slate-700 mb-1">股票池</div>
            <p className="text-slate-500">中证500指数成分股（约500只A股中盘股）。通过 AKShare 获取，自动缓存。行情来源：腾讯行情（主）+ 东方财富（备）。</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="font-semibold text-slate-700 mb-1">新闻与舆情</div>
            <p className="text-slate-500">社交舆情主源为 AKShare 雪球讨论/关注热度和微博舆情报告；热榜类来源只做补充。每日两次采集：16:00 盘后全量 + 07:30 晨间增量，确保夜间公告和新闻不遗漏。</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
            <div className="font-semibold text-slate-700 mb-1">运行策略与存储</div>
            <p className="text-slate-500">所有数据以 JSON 文件存储在本地，路径：<code className="bg-slate-200/80 px-1 rounded text-[10px]">~/文档/AI炒股分析</code>。数据采集 Agent 默认超时 <code className="bg-slate-200/80 px-1 rounded text-[10px]">10 分钟</code>，盘后批处理窗口最长 3 小时。交易日历通过在线 API 自动同步，节假日判断准确。</p>
          </div>
        </div>
      </div>

      {/* ═══════════════ 各页面功能表 ═══════════════ */}
      <div className="bg-white/70 border border-slate-200/60 rounded-2xl shadow-sm p-4">
        <h3 className="text-base font-bold text-slate-800 mb-2">各页面功能一览</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200/80 text-xs">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                <th className="px-3 py-2 font-semibold text-slate-700 w-28">页面</th>
                <th className="px-3 py-2 font-semibold text-slate-700">功能说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PAGE_TABLE.map((row) => (
                <tr key={row.name}>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${row.badge}`}>{row.name}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 leading-relaxed">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════ 新手建议 ═══════════════ */}
      <div className="bg-gradient-to-r from-green-50/80 to-emerald-50/80 border border-green-200/60 rounded-2xl shadow-sm p-4">
        <h3 className="text-base font-bold text-green-900 mb-2">给新手的 6 条建议</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { num: '1', title: '先观望，再实操', desc: '前两周只看建议，不做真实交易。等你理解了系统逻辑再入场。' },
            { num: '2', title: '永远执行止损', desc: '系统提示止损时一定要卖。亏 3% 很小，扛着可能亏 30%。' },
            { num: '3', title: '控制仓位上限', desc: '不要超过系统设定的最大持仓数（3 只），分散风险、避免重仓。' },
            { num: '4', title: '推翻时写清理由', desc: '如果你不同意系统建议，写下理由。日后对比才能知道谁更准。' },
            { num: '5', title: '每周看一次复盘', desc: '花 10 分钟看「记忆复盘」的绩效图表，了解自己的投资趋势。' },
            { num: '6', title: '熊市少操作', desc: '市场状态显示「熊市」时，少交易本身就是最好的策略。' },
          ].map((tip) => (
            <div key={tip.num} className="rounded-xl bg-white/70 border border-green-100 p-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 rounded-full bg-green-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">{tip.num}</span>
                <span className="text-sm font-semibold text-green-800">{tip.title}</span>
              </div>
              <p className="text-xs text-green-700 leading-relaxed">{tip.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ═══════════════ 免责声明 ═══════════════ */}
      <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl shadow-sm px-4 py-3">
        <h3 className="text-sm font-bold text-amber-800 mb-1">免责声明</h3>
        <p className="text-xs text-amber-700 leading-relaxed">
          本系统仅为个人学习和辅助决策工具，<strong>不构成任何投资建议</strong>。股市有风险，投资需谨慎。
          系统的历史表现不代表未来收益，所有交易决策和盈亏由用户自行承担。AI 专家的分析结论仅供参考，不应作为唯一决策依据。
        </p>
      </div>
    </div>
  )
}
