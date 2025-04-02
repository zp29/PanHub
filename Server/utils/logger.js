/**
 * 日志工具模块
 * 提供统一的日志记录功能
 */
const fs = require('fs');
const path = require('path');

/**
 * 日志级别
 */
const LogLevel = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

/**
 * 确保日志目录存在
 * @param {string} logDir - 日志目录路径
 */
function ensureLogDir(logDir) {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

/**
 * 将消息写入日志文件
 * @param {Object} data - 日志数据
 * @param {string} filename - 日志文件名
 */
function writeToLogFile(data, filename) {
  try {
    const timestamp = new Date().getTime();
    const logDir = path.join(__dirname, '..', 'logs');
    ensureLogDir(logDir);
    
    const logFilePath = path.join(logDir, `${filename}_${timestamp}.json`);
    fs.writeFileSync(
      logFilePath,
      JSON.stringify({
        ...data,
        timestamp: new Date().toISOString()
      }, null, 2)
    );
    return true;
  } catch (error) {
    console.error('写入日志文件失败:', error);
    return false;
  }
}

/**
 * 日志记录器对象
 */
const logger = {
  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  info(message, data = {}) {
    console.log(`【INFO】${message}`, data);
  },
  
  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  warn(message, data = {}) {
    console.warn(`【警告】${message}`, data);
  },
  
  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {Object|Error} error - 错误对象或附加数据
   */
  error(message, error = {}) {
    console.error(`【错误】${message}`, error);
  },
  
  /**
   * 记录微信消息
   * @param {Object} data - 微信消息数据
   */
  wechatMessage(data) {
    console.log('【微信消息】记录消息');
    return writeToLogFile(data, 'wechat_msg');
  }
};

module.exports = logger;
