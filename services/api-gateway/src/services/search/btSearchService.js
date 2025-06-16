/**
 * BT搜索服务
 * 处理BT站点的资源搜索
 */
const logger = require('../../utils/logger');
const httpClient = require('../../utils/httpClient');

// 搜索API配置
const SEARCH_API_URL = 'https://bt.zp29.xyz:29/api/v1/search';
const SEARCH_API_KEY = 'c41f203fed0c4e668fe230d447f23360';

/**
 * BT搜索服务
 */
const btSearchService = {
  /**
   * 搜索BT资源
   * @param {string} query - 搜索关键词
   * @returns {Promise<Array>} - 搜索结果
   */
  async search(query) {
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
      
      articles.push({
        title: `${startIndex+i+1}. ${item.title || '未知标题'} ${item.indexer}`,
        description: `${item.indexer}`,
        url: item.guid || 'https://bt.zp29.xyz:29',
        picurl: 'https://img1.baidu.com/it/u=556723102,3829940608&fm=253&fmt=auto&app=138&f=JPEG?w=787&h=500'
      });
    }
    
    return articles;
  }
};

module.exports = btSearchService; 