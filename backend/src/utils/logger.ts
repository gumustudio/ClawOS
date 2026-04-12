import winston from 'winston'
import path from 'path'

/**
 * Winston 通用日志
 *
 * 修复说明（v1.26.0）：
 * 1. 路径修正：使用 `../../logs` 替代 `../../../logs`，编译后 dist/utils/ 运行时写入 backend/logs/
 * 2. 日志轮转：maxsize 50MB，保留最近 5 个文件
 * 3. 级别降为 debug：配合 sa-logger 全量记录方案
 */

// dist/utils/ -> dist/ -> backend/ -> backend/logs/
const logDir = path.resolve(__dirname, '../../logs')

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, module }) => {
    return `[${timestamp}] [${module || 'System'}] [${level.toUpperCase()}] ${message}`
  })
)

export const logger = winston.createLogger({
  level: 'debug',
  format: logFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'backend-error.log'),
      level: 'error',
      maxsize: 50 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'backend-out.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
})

// 非 production 环境额外输出到控制台
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    ),
  }))
}
