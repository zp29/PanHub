/**
 * 代理控制器
 * 处理代理相关的请求
 */
const logger = require('../utils/logger');
const wechatService = require('../services/wechatService');
const commandService = require('../services/commandService');

/**
 * 代理控制器
 */
const proxyController = {
  /**
   * 处理从代理服务器转发过来的消息
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async handleProxyMessage(req, res) {
    try {
      // 检查请求体是否包含消息
      if (req.body && req.body.message) {
        const { message, touser } = req.body;
        
        if (!message) {
          logger.warn('【代理消息】缺少消息内容');
          return res.status(400).json({ success: false, message: '缺少消息内容' });
        }
        
        logger.info(`【代理消息】收到代理消息, 发送给 ${touser || '@all'}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
        
        // 处理代理消息
        try {
          // 如果是命令，则处理命令
          const responseMsg = await commandService.handleCommand(message, touser || '@all');
          logger.info(`【代理消息】处理完成: ${responseMsg}`);
          
          return res.json({
            success: true,
            message: '代理消息处理成功',
            response: responseMsg
          });
        } catch (commandError) {
          logger.error('【代理消息】处理命令出错:', commandError);
          return res.status(500).json({
            success: false,
            message: '处理代理命令出错',
            error: commandError.message
          });
        }
      } else {
        logger.error('【代理消息】消息格式不正确:', req.body);
        return res.status(400).json({ success: false, message: '消息格式不正确' });
      }
    } catch (error) {
      logger.error('处理代理消息出错:', error);
      return res.status(500).json({ 
        success: false, 
        message: '处理消息出错', 
        error: error.message 
      });
    }
  }
};

module.exports = proxyController;
