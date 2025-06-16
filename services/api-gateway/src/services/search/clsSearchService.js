/**
 * CLS搜索服务
 * 处理CLS平台的资源搜索
 */
const logger = require('../../utils/logger');
const httpClient = require('../../utils/httpClient');

// CLS搜索API配置
const CLS_API_URL = 'https://cls.zp29.xyz:29';
const CLS_USERNAME = 'zp29';
const CLS_PASSWORD = 'zp960420';

// 保存CLS API的token
let clsTokenCache = {
  token: '',
  expiresAt: 0
};

/**
 * CLS搜索服务
 */
const clsSearchService = {
  /**
   * 获取CLS API的访问令牌
   * @returns {Promise<string>} - 返回访问令牌
   */
  async getToken() {
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
   * 搜索CLS资源
   * @param {string} query - 搜索关键词
   * @returns {Promise<Array>} - 搜索结果
   */
  async search(query) {
    try {
      logger.info(`开始从CLS API搜索: ${query}`);
      
      // 获取token
      const token = await this.getToken();
      
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
   * 格式化搜索结果为图文消息项
   * @param {Array} results - 搜索结果数组
   * @param {number} limit - 限制数量
   * @param {number} startIndex - 开始序号
   * @returns {Array} - 格式化后的图文消息项数组
   */
  formatResults(results, limit = 5, startIndex = 0) {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return [];
    }
    
    const articles = [];
    const itemLimit = Math.min(limit, results.length);
    
    for (let i = 0; i < itemLimit; i++) {
      const item = results[i];
      
      // 获取云盘链接
      let url = 'https://cls.zp29.xyz:29';
      if (item.cloudLinks && item.cloudLinks.length > 0) {
        url = item.cloudLinks[0].link;
      }
      
      // 添加到图文消息
      articles.push({
        title: `${startIndex+i+1}. ${item.title || '未知标题'} ${item.channel}`,
        description: '',
        url: url,
        picurl: item.image || ''
      });
    }
    
    return articles;
  },
  
  /**
   * 获取第一个有效的图片URL
   * @param {Array} results - 搜索结果数组
   * @returns {string} - 图片URL
   */
  getFirstImageUrl(results) {
    if (!results || !Array.isArray(results) || results.length === 0) {
      return '';
    }
    
    for (const item of results) {
      if (item.image) {
        return item.image;
      }
    }
    
    return '';
  }
};

module.exports = clsSearchService; 