/**
 * 命令处理服务
 * 处理从企业微信接收到的各种命令
 */
const logger = require('../utils/logger');
const wechatService = require('./wechatService');
const searchService = require('./search/searchService');

// 导入专门的服务模块
const embyService = require('./emby/embyService');

// 用户会话状态管理
const userSessions = new Map();

// 搜索API配置
const SEARCH_API_URL = 'https://bt.zp29.xyz:29/api/v1/search';
const SEARCH_API_KEY = 'c41f203fed0c4e668fe230d447f23360';

// CLS搜索API配置
const CLS_API_URL = 'https://cls.zp29.xyz:29';
const CLS_USERNAME = 'zp29';
const CLS_PASSWORD = 'zp960420';

// 保存CLS API的token
let clsTokenCache = {
  token: '',
  expiresAt: 0
};

// 默认图片URL
const DEFAULT_IMAGE_URL = 'https://img.zcool.cn/community/01c2a85d145346a8012051cdb52836.jpg@1280w_1l_2o_100sh.jpg';

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
    // logger.info('开始处理命令', {
    //   command: command || '空',
    //   fromUser: fromUser || '未知用户',
    //   commandType: typeof command,
    //   fromUserType: typeof fromUser
    // });
    
    if (!command) {
      logger.warn('收到空命令');
      return '收到空命令，请提供有效的指令';
    }
    
    // 清理命令字符串
    const trimmedCommand = command.trim();
    
    // 检查用户是否在等待输入资源名称
    if (userSessions.has(fromUser) && userSessions.get(fromUser) === 'waiting_for_search_input') {
      // 如果命令是其他已知命令，则取消等待状态
      if (this.isSystemCommand(trimmedCommand)) {
        userSessions.delete(fromUser);
        logger.info(`用户 ${fromUser} 触发了系统命令，取消等待输入状态`);
      } else {
        // 用户输入了资源名称，执行搜索
        logger.info(`用户 ${fromUser} 输入了资源名称: ${trimmedCommand}，执行搜索`);
        userSessions.delete(fromUser);
        const searchResult = await searchService.searchResource(trimmedCommand, fromUser);
        return searchResult; // 直接返回结果，后面不会再处理
      }
    }
    
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

      case 'SearchResource':
        logger.info('处理 SearchResource 指令, 等待用户输入资源名称');
        // 设置用户会话状态为等待搜索输入
        userSessions.set(fromUser, 'waiting_for_search_input');
        responseMsg = `请输入资源名称: 例如：海贼王`;
        break;
        
      case 'help':
      case '帮助':
        responseMsg = this.getHelpMessage();
        break;
        
      default:
        // 将未识别的指令直接视为搜索关键词
        logger.info(`未识别的指令: ${trimmedCommand}，将其视为搜索关键词`);
        const searchResult = await searchService.searchResource(trimmedCommand, fromUser);
        return searchResult; // 直接返回结果，后面不会再处理
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
- SearchResource：搜索资源
- help/帮助：显示此帮助信息
    `.trim();
  },
  
  /**
   * 判断是否为系统命令
   * @param {string} command - 命令字符串
   * @returns {boolean} - 是否为系统命令
   */
  isSystemCommand(command) {
    const systemCommands = [
      'UpdateEmbyAll', 'UpdateEmbyMov', 'UpdateEmbyTv', 'UpdateEmbyAmi',
      'ServiceStatus', 'SearchResource', 'help', '帮助'
    ];
    return systemCommands.includes(command);
  },
  
  /**
   * 获取CLS API的访问令牌
   * @returns {Promise<string>} - 返回访问令牌
   */
  async getClsToken() {
    // 检查缓存的令牌是否有效
    const now = Date.now();
    if (clsTokenCache.token && clsTokenCache.expiresAt > now) {
      return clsTokenCache.token;
    }
    
    try {
      logger.info('开始获取CLS API Token');
      
      const url = `${CLS_API_URL}/api/user/login`;
      const data = {
        username: CLS_USERNAME,
        password: CLS_PASSWORD
      };
      const options = {
        headers: {
          'priority': 'u=1, i',
          'content-type': 'application/json',
          'Accept': '*/*',
          'Host': 'cls.zp29.xyz:29',
          'Connection': 'keep-alive'
        }
      };
      
      const response = await httpClient.post(url, data, options);
      
      if (response.success && response.data && response.data.token) {
        // 从JWT token中提取过期时间（假设token有效期为6小时）
        const expiresIn = 6 * 60 * 60 * 1000; // 6小时
        clsTokenCache = {
          token: response.data.token,
          expiresAt: now + expiresIn
        };
        logger.info('成功获取CLS API Token');
        return response.data.token;
      } else {
        throw new Error(`获取CLS API Token失败: ${response.message || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('获取CLS API Token出错:', error);
      throw error;
    }
  },
  
  /**
   * 从CLS API搜索资源
   * @param {string} query - 搜索关键词
   * @returns {Promise<Array>} - 搜索结果
   */
  async searchFromClsApi(query) {
    try {
      logger.info(`开始从CLS API搜索: ${query}`);
      
      // 获取token
      const token = await this.getClsToken();
      
      // 构建请求URL和请求头
      const url = `${CLS_API_URL}/api/search?keyword=${encodeURIComponent(query)}&lastMessageId=`;
      const options = {
        headers: {
          'authorization': `Bearer ${token}`,
          'priority': 'u=1, i',
          'Accept': '*/*',
          'Host': 'cls.zp29.xyz:29',
          'Connection': 'keep-alive'
        }
      };
      
      // 发送请求
      const response = await httpClient.get(url, {}, options);
      
      // 检查响应
      if (response.success && Array.isArray(response.data)) {
        logger.info(`CLS API 搜索成功，返回 ${response.data.length} 个频道`);
        
        // 提取并格式化搜索结果
        const results = [];
        
        for (const channelData of response.data) {
          if (channelData.list && Array.isArray(channelData.list)) {
            for (const item of channelData.list) {
              results.push({
                title: item.title || '未知标题',
                content: item.content,
                image: item.image || '',
                cloudLinks: item.cloudLinks || [],
                tags: item.tags || [],
                magnetLink: item.magnetLink || '',
                channel: item.channel || channelData.channelInfo?.name || '未知频道',
                channelId: item.channelId || channelData.channelInfo?.id || ''
              });
            }
          }
        }
        
        logger.info(`CLS API 搜索结果处理完成，共 ${results.length} 条`);
        return results;
      } else {
        logger.warn(`CLS API 搜索返回异常: ${JSON.stringify(response)}`);
        return [];
      }
    } catch (error) {
      logger.error(`CLS API 搜索失败: ${error.message}`, error);
      return [];
    }
  },
  
  /**
   * 搜索资源
   * @param {string} query - 搜索关键词
   * @param {string} fromUser - 用户ID
   * @returns {Promise<string>} - 搜索结果
   */
  async searchResource(query, fromUser) {
    try {
      logger.info(`开始搜索资源: ${query}`);
      
      // 从BT API获取结果
      const btResults = await this.searchFromBtApi(query);
      
      // 从CLS API获取结果
      const clsResults = await this.searchFromClsApi(query);
      
      // 如果两个API都没有结果
      if ((!btResults || btResults.length === 0) && (!clsResults || clsResults.length === 0)) {
        const noResultMsg = `没有找到与 "${query}" 相关的资源`;
        await wechatService.sendMessage(noResultMsg, fromUser);
        return noResultMsg;
      }
      
      // 准备图文消息
      const articles = [];
      
      // 添加BT API结果
      if (btResults && btResults.length > 0) {
        const btLimit = Math.min(5, btResults.length);
        for (let i = 0; i < btLimit; i++) {
          const item = btResults[i];
          
          articles.push({
            title: `${i+1}. ${item.title || '未知标题'} ${item.indexer}`,
            description: `${item.indexer}`,
            url: item.guid || 'https://bt.zp29.xyz:29',
            picurl: 'https://img1.baidu.com/it/u=556723102,3829940608&fm=253&fmt=auto&app=138&f=JPEG?w=787&h=500'
          });
        }
      }
      
      // 添加CLS API结果
      if (clsResults && clsResults.length > 0) {
        const clsLimit = Math.min(5, clsResults.length);
        const startIndex = articles.length;
        
        for (let i = 0; i < clsLimit; i++) {
          const item = clsResults[i];
          
          // 构建云盘链接文本
          let linksText = '';
          if (item.cloudLinks && item.cloudLinks.length > 0) {
            for (const link of item.cloudLinks) {
              linksText += `\n${link.cloudType}: ${link.link}`;
            }
          }
          
          // 添加到图文消息
          articles.push({
            title: `${startIndex+i+1}. ${item.title || '未知标题'} ${item.channel}`,
            description: `${item.channel}\n${linksText}`,
            url: item.magnetLink || 'https://cls.zp29.xyz:29',
            picurl: item.image || 'https://img.zcool.cn/community/01c2a85d145346a8012051cdb52836.jpg@1280w_1l_2o_100sh.jpg'
          });
        }
      }
      
      // 发送图文消息
      if (articles.length > 0) {
        const sendResult = await wechatService.sendNewsMessage(articles, fromUser);
        logger.info('图文消息发送状态:', sendResult ? '成功' : '失败');
      }
      
      // 返回一个普通文本，但不会被发送
      return `已发送 ${articles.length} 个搜索结果`;
    } catch (error) {
      logger.error(`搜索资源失败: ${error.message}`, error);
      const errorMsg = `搜索失败: ${error.message}`;
      await wechatService.sendMessage(errorMsg, fromUser);
      return errorMsg;
    }
  },
  
  /**
   * 从BT API搜索资源
   * @param {string} query - 搜索关键词
   * @returns {Promise<Array>} - 搜索结果
   */
  async searchFromBtApi(query) {
    try {
      logger.info(`开始从BT API搜索: ${query}`);
      
      // 构建请求URL和请求头
      const url = `${SEARCH_API_URL}?query=${encodeURIComponent(query)}&apikey=${SEARCH_API_KEY}`;
      const options = {
        headers: {
          'User-Agent': 'Apifox/1.0.0 (https://apifox.com)',
          'Accept': '*/*',
          'Host': 'bt.zp29.xyz:29',
          'Connection': 'keep-alive'
        }
      };
      
      // 发送请求
      const response = await httpClient.get(url, {}, options);
      logger.info(`BT API 搜索结果数量: ${response?.length || 0}`);
      
      if (response && Array.isArray(response) && response.length > 0) {
        return response;
      } else {
        return [];
      }
    } catch (error) {
      logger.error(`BT API 搜索失败: ${error.message}`, error);
      return [];
    }
  }
};

module.exports = commandService;
