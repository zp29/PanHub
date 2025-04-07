/**
 * 命令处理服务
 * 处理从企业微信接收到的各种命令
 */
const logger = require('../utils/logger');
const wechatService = require('./wechatService');

// 导入专门的服务模块
const embyService = require('./emby/embyService');

/**
 * 命令处理服务
 */
const commandService = {
  /**
   * 处理收到的命令
   * @param {string} command - 收到的命令
   * @param {string} fromUser - 发送命令的用户ID
   * @returns {Promise<string>} - 响应消息
   */
  async handleCommand(command, fromUser) {
    // 输出详细日志
    logger.info('开始处理命令', {
      command: command || '空',
      fromUser: fromUser || '未知用户',
      commandType: typeof command,
      fromUserType: typeof fromUser
    });
    
    if (!command) {
      logger.warn('收到空命令');
      return '收到空命令，请提供有效的指令';
    }
    
    // 清理命令字符串
    const trimmedCommand = command.trim();
    logger.info(`准备处理命令: ${trimmedCommand}`);
    
    // 处理不同的命令
    let responseMsg = '';
    
    switch (trimmedCommand) {
      case 'UpdateEmbyAll':
        logger.info('处理 UpdateEmbyAll 指令');
        // 调用embyService更新所有媒体库
        const allResult = await embyService.updateAllLibraries();
        responseMsg = `Emby全部更新指令执行结果: ${allResult.message}`;
        break;
        
      case 'UpdateEmbyMov':
        logger.info('处理 UpdateEmbyMov 指令');
        // 调用embyService更新电影媒体库
        const movResult = await embyService.updateMovieLibraries();
        responseMsg = `Emby电影更新指令执行结果: ${movResult.message}`;
        break;
        
      case 'UpdateEmbyTv':
        logger.info('处理 UpdateEmbyTv 指令');
        // 调用embyService更新电视剧媒体库
        const tvResult = await embyService.updateTvLibraries();
        responseMsg = `Emby电视剧更新指令执行结果: ${tvResult.message}`;
        break;
        
      case 'UpdateEmbyAmi':
        logger.info('处理 UpdateEmbyAmi 指令');
        // 调用embyService更新动漫媒体库
        const animeResult = await embyService.updateAnimeLibraries();
        responseMsg = `Emby动漫更新指令执行结果: ${animeResult.message}`;
        break;
        
      case 'ServiceStatus':
        logger.info('处理 ServiceStatus 指令');
        responseMsg = `系统状态正常，当前时间: ${new Date().toLocaleString('zh-CN')}`;
        break;
        
      case 'help':
      case '帮助':
        responseMsg = this.getHelpMessage();
        break;
        
      default:
        responseMsg = `未识别的指令: ${trimmedCommand}`;
        logger.info('收到未知命令:', trimmedCommand);
        break;
    }
    
    // 发送响应消息给用户
    logger.info(`准备发送响应消息给用户 ${fromUser}: ${responseMsg}`);
    try {
      const sendResult = await wechatService.sendMessage(responseMsg, fromUser);
      logger.info('响应消息发送状态:', sendResult ? '成功' : '失败');
    } catch (sendError) {
      logger.error('发送响应消息时出错:', sendError);
    }
    
    return responseMsg;
  },
  
  /**
   * 获取帮助信息
   * @returns {string} - 帮助信息
   */
  getHelpMessage() {
    return `
支持的命令列表:
- UpdateEmbyAll：更新所有Emby内容
- UpdateEmbyMov：更新电影内容
- UpdateEmbyTv：更新电视剧内容
- UpdateEmbyAmi：更新动漫内容
- ServiceStatus：查看服务状态
- help/帮助：显示此帮助信息
    `.trim();
  }
};

module.exports = commandService;
