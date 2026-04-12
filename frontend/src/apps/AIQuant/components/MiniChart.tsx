/**
 * 纯 SVG 图表组件，用于绩效可视化。不依赖任何第三方图表库。
 * 支持折线图（含面积填充）和柱状图，适配 AI 炒股 Memory Tab 的数据展示。
 */

interface DataPoint {
  label: string
  value: number
}

interface MiniLineChartProps {
  data: DataPoint[]
  width?: number
  height?: number
  /** 折线颜色 */
  strokeColor?: string
  /** 面积填充颜色（含透明度）*/
  fillColor?: string
  /** 是否显示零线 */
  showZeroLine?: boolean
  /** 值格式化函数 */
  formatValue?: (value: number) => string
  /** 标题 */
  title: string
}

const PADDING = { top: 20, right: 16, bottom: 40, left: 56 }

function computeScale(
  data: DataPoint[],
  chartWidth: number,
  chartHeight: number,
): { xScale: (index: number) => number; yScale: (value: number) => number; minVal: number; maxVal: number } {
  const values = data.map((d) => d.value)
  let minVal = Math.min(...values)
  let maxVal = Math.max(...values)

  // 确保有至少一些范围，避免所有值相同时 y 轴退化
  if (maxVal === minVal) {
    minVal -= 1
    maxVal += 1
  }

  // 给 y 轴留 10% 边距
  const range = maxVal - minVal
  minVal -= range * 0.1
  maxVal += range * 0.1

  const xScale = (index: number) => (data.length > 1 ? (index / (data.length - 1)) * chartWidth : chartWidth / 2)
  const yScale = (value: number) => chartHeight - ((value - minVal) / (maxVal - minVal)) * chartHeight

  return { xScale, yScale, minVal, maxVal }
}

function generateGridLines(minVal: number, maxVal: number, count: number): number[] {
  const step = (maxVal - minVal) / (count + 1)
  const lines: number[] = []
  for (let i = 1; i <= count; i++) {
    lines.push(minVal + step * i)
  }
  return lines
}

function defaultFormat(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

export function MiniLineChart({
  data,
  width = 400,
  height = 200,
  strokeColor = '#4f46e5',
  fillColor = 'rgba(79, 70, 229, 0.08)',
  showZeroLine = false,
  formatValue = defaultFormat,
  title,
}: MiniLineChartProps) {
  if (data.length < 2) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
        <h4 className="font-semibold text-slate-700 mb-2 text-sm">{title}</h4>
        <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: height - 40 }}>
          数据不足，至少需要 2 个周期
        </div>
      </div>
    )
  }

  const chartWidth = width - PADDING.left - PADDING.right
  const chartHeight = height - PADDING.top - PADDING.bottom
  const { xScale, yScale, minVal, maxVal } = computeScale(data, chartWidth, chartHeight)

  // 构建折线路径
  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.value)}`)
    .join(' ')

  // 构建填充区域路径
  const areaPath = `${linePath} L ${xScale(data.length - 1)} ${chartHeight} L ${xScale(0)} ${chartHeight} Z`

  // 网格线
  const gridLines = generateGridLines(minVal, maxVal, 3)

  // 零线位置（如果在可视范围内）
  const zeroY = showZeroLine && minVal <= 0 && maxVal >= 0 ? yScale(0) : null

  // X 轴标签：最多显示 6 个，均匀分布
  const maxLabels = Math.min(6, data.length)
  const labelIndices: number[] = []
  if (data.length <= maxLabels) {
    for (let i = 0; i < data.length; i++) labelIndices.push(i)
  } else {
    for (let i = 0; i < maxLabels; i++) {
      labelIndices.push(Math.round((i / (maxLabels - 1)) * (data.length - 1)))
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      <h4 className="font-semibold text-slate-700 mb-2 text-sm">{title}</h4>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          {/* 网格线 */}
          {gridLines.map((val) => (
            <g key={`grid-${val}`}>
              <line
                x1={0}
                y1={yScale(val)}
                x2={chartWidth}
                y2={yScale(val)}
                stroke="#e2e8f0"
                strokeDasharray="3,3"
              />
              <text
                x={-8}
                y={yScale(val)}
                textAnchor="end"
                dominantBaseline="middle"
                className="text-[10px]"
                fill="#94a3b8"
              >
                {formatValue(val)}
              </text>
            </g>
          ))}

          {/* 零线 */}
          {zeroY !== null ? (
            <line
              x1={0}
              y1={zeroY}
              x2={chartWidth}
              y2={zeroY}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4,2"
            />
          ) : null}

          {/* 面积填充 */}
          <path d={areaPath} fill={fillColor} />

          {/* 折线 */}
          <path d={linePath} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinejoin="round" />

          {/* 数据点 */}
          {data.map((d, i) => (
            <g key={`point-${i}`}>
              <circle
                cx={xScale(i)}
                cy={yScale(d.value)}
                r={data.length <= 12 ? 3 : 2}
                fill="white"
                stroke={strokeColor}
                strokeWidth={1.5}
              />
              {/* Tooltip 区域（不可见但可 hover） */}
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </g>
          ))}

          {/* X 轴标签 */}
          {labelIndices.map((i) => (
            <text
              key={`xlabel-${i}`}
              x={xScale(i)}
              y={chartHeight + 16}
              textAnchor="middle"
              className="text-[9px]"
              fill="#94a3b8"
            >
              {data[i].label}
            </text>
          ))}

          {/* 最新值标注 */}
          <text
            x={xScale(data.length - 1)}
            y={yScale(data[data.length - 1].value) - 10}
            textAnchor="end"
            className="text-[11px] font-semibold"
            fill={strokeColor}
          >
            {formatValue(data[data.length - 1].value)}
          </text>
        </g>
      </svg>
    </div>
  )
}

interface MiniBarChartProps {
  data: DataPoint[]
  width?: number
  height?: number
  /** 正值颜色 */
  positiveColor?: string
  /** 负值颜色 */
  negativeColor?: string
  /** 值格式化函数 */
  formatValue?: (value: number) => string
  /** 标题 */
  title: string
}

export function MiniBarChart({
  data,
  width = 400,
  height = 200,
  positiveColor = '#ef4444',
  negativeColor = '#22c55e',
  formatValue = defaultFormat,
  title,
}: MiniBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
        <h4 className="font-semibold text-slate-700 mb-2 text-sm">{title}</h4>
        <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: height - 40 }}>
          暂无数据
        </div>
      </div>
    )
  }

  const chartWidth = width - PADDING.left - PADDING.right
  const chartHeight = height - PADDING.top - PADDING.bottom
  const values = data.map((d) => d.value)
  let minVal = Math.min(...values, 0)
  let maxVal = Math.max(...values, 0)

  if (maxVal === minVal) {
    minVal -= 1
    maxVal += 1
  }

  const range = maxVal - minVal
  minVal -= range * 0.05
  maxVal += range * 0.05

  const yScale = (value: number) => chartHeight - ((value - minVal) / (maxVal - minVal)) * chartHeight
  const zeroY = yScale(0)

  const barGap = 2
  const barWidth = Math.max(4, (chartWidth - barGap * (data.length - 1)) / data.length)

  // 网格线
  const gridLines = generateGridLines(minVal, maxVal, 3)

  // X 轴标签
  const maxLabels = Math.min(6, data.length)
  const labelIndices: number[] = []
  if (data.length <= maxLabels) {
    for (let i = 0; i < data.length; i++) labelIndices.push(i)
  } else {
    for (let i = 0; i < maxLabels; i++) {
      labelIndices.push(Math.round((i / (maxLabels - 1)) * (data.length - 1)))
    }
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      <h4 className="font-semibold text-slate-700 mb-2 text-sm">{title}</h4>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          {/* 网格线 */}
          {gridLines.map((val) => (
            <g key={`grid-${val}`}>
              <line x1={0} y1={yScale(val)} x2={chartWidth} y2={yScale(val)} stroke="#e2e8f0" strokeDasharray="3,3" />
              <text x={-8} y={yScale(val)} textAnchor="end" dominantBaseline="middle" className="text-[10px]" fill="#94a3b8">
                {formatValue(val)}
              </text>
            </g>
          ))}

          {/* 零线 */}
          <line x1={0} y1={zeroY} x2={chartWidth} y2={zeroY} stroke="#94a3b8" strokeWidth={1} />

          {/* 柱子 */}
          {data.map((d, i) => {
            const x = i * (barWidth + barGap)
            const barY = d.value >= 0 ? yScale(d.value) : zeroY
            const barH = Math.abs(yScale(d.value) - zeroY)
            const color = d.value >= 0 ? positiveColor : negativeColor

            return (
              <g key={`bar-${i}`}>
                <rect
                  x={x}
                  y={barY}
                  width={barWidth}
                  height={Math.max(1, barH)}
                  fill={color}
                  rx={2}
                  opacity={0.85}
                />
                <title>{`${d.label}: ${formatValue(d.value)}`}</title>
              </g>
            )
          })}

          {/* X 轴标签 */}
          {labelIndices.map((i) => (
            <text
              key={`xlabel-${i}`}
              x={i * (barWidth + barGap) + barWidth / 2}
              y={chartHeight + 16}
              textAnchor="middle"
              className="text-[9px]"
              fill="#94a3b8"
            >
              {data[i].label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}
