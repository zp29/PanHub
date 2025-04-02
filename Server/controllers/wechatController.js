/**
 * 微信控制器
 * 处理所有与微信相关的路由请求
 */
const wechatService = require('../services/wechatService');
const commandService = require('../services/commandService');
const logger = require('../utils/logger');
const httpClient = require('../utils/httpClient');
const config = require('../config.json');

/**
 * 微信控制器
 */
const wechatController = {
  /**
   * 处理URL验证请求
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  handleUrlVerification(req, res) {
    const { echostr } = req.query;
    if (!echostr) {
      return res.status(200).send('企业微信通知服务运行正常');
    }
    
    return wechatService.handleUrlVerification(req, res);
  },
  
  /**
   * 处理收到的微信消息
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async handleMessage(req, res) {
    logger.info('收到企业微信消息请求', {
      path: req.path,
      query: req.query,
      bodyType: typeof req.body,
      bodyLength: req.body ? (typeof req.body === 'string' ? req.body.length : JSON.stringify(req.body).length) : 0
    });
    
    // 记录原始消息到日志文件
    try {
      logger.wechatMessage({
        query: req.query, 
        body: req.body, 
        rawBody: req.rawBody,
        headers: req.headers
      });
    } catch (error) {
      logger.error('写入日志失败:', error);
    }
    
    // 1. 尝试转发到中转服务器
    if (config.proxy && config.proxy.enabled) {
      const xmlData = req.rawBody || req.body;
      const proxyUrl = `${config.proxy.url}/callback`;
      
      const proxyResult = await httpClient.forwardToProxy(
        proxyUrl, 
        xmlData, 
        req.query, 
        { 'Content-Type': req.headers['content-type'] || 'text/xml' }
      );
      
      if (proxyResult.success) {
        logger.info('中转服务器响应:', proxyResult.data);
      }
    }
    
    // 2. 获取XML数据
    let xmlData = null;
    
    // 优先使用rawBody处理XML数据
    if (req.rawBody && typeof req.rawBody === 'string' && req.rawBody.includes('<xml')) {
      xmlData = req.rawBody;
    } else if (req.body && typeof req.body === 'string' && req.body.includes('<xml')) {
      xmlData = req.body;
    } else if (req.body && typeof req.body === 'object' && req.body.xml) {
      xmlData = JSON.stringify(req.body);
    }
    
    // 如果无法获取XML数据，返回成功响应
    if (!xmlData) {
      logger.warn('无法获取XML数据');
      return res.send('success'); // 返回成功以避免企业微信重试
    }
    
    // 3. 处理XML消息
    try {
      const result = await wechatService.parseAndHandleMessage(
        xmlData, 
        req.query, 
        commandService.handleCommand.bind(commandService)
      );
      
      if (!result.success) {
        logger.warn('消息处理失败原因:', result.reason);
      }
    } catch (parseError) {
      logger.error('处理XML消息时出错:', parseError);
    }
    
    // 4. 返回成功响应给企业微信
    return res.send('success');
  },
  
  /**
   * 发送测试消息
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async sendTestMessage(req, res) {
    try {
      logger.info('收到测试消息请求:', req.query);
      
      // 从查询参数中获取自定义内容和接收者
      const { content: customContent, toUser } = req.query;
      const recipient = toUser || '@all';
      
      // 记录发送前的时间
      const startTime = Date.now();
      
      // 生成并发送测试消息
      const message = wechatService.generateTestMessage(customContent);
      const sendResult = await wechatService.sendMessage(message, recipient);
      
      // 记录耗时
      const elapsedTime = Date.now() - startTime;
      
      // 返回结果
      res.json({
        success: sendResult,
        message: sendResult ? '测试消息发送成功' : '测试消息发送失败',
        recipient,
        elapsedMs: elapsedTime
      });
    } catch (error) {
      logger.error('发送测试消息失败:', error);
      res.status(500).json({
        success: false,
        message: '发送测试消息失败',
        error: error.message
      });
    }
  }
};

module.exports = wechatController;
