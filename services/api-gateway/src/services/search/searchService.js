/**
 * 统一搜索服务
 * 整合不同来源的搜索结果
 */
const logger = require('../../utils/logger');
const btSearchService = require('./btSearchService');
const clsSearchService = require('./clsSearchService');
const wechatService = require('../wechatService');

// 默认图片URL
const DEFAULT_IMAGE_URL = 'https://img.zcool.cn/community/01c2a85d145346a8012051cdb52836.jpg@1280w_1l_2o_100sh.jpg';

/**
 * 统一搜索服务
 */
const searchService = {
  /**
   * 搜索资源
   * @param {string} query - 搜索关键词
   * @param {string} fromUser - 用户ID
   * @returns {Promise<string>} - 搜索结果
   */
  async searchResource(query, fromUser) {
    try {
      // 保存发送的状态消息ID，用于后续撤回
      const statusMsgIds = [];
      
      // 检查是否为重复搜索请求（防止多次调用导致重复发送消息）
      const searchKey = `${fromUser}:${query}`;
      
      // 使用简单的内存缓存防止短时间内的重复搜索
      if (!this._recentSearches) {
        this._recentSearches = new Map();
      }
      
      // 检查5秒内是否有相同的搜索请求
      const now = Date.now();
      const recentSearch = this._recentSearches.get(searchKey);
      
      if (recentSearch && (now - recentSearch) < 5000) {
        logger.info(`检测到重复搜索请求: ${searchKey}，已跳过`);
        return `正在处理 "${query}" 的搜索请求，请稍候...`;
      }
      
      // 记录本次搜索时间
      this._recentSearches.set(searchKey, now);
      
      // 清理过期的搜索记录
      if (this._recentSearches.size > 100) {
        for (const [key, timestamp] of this._recentSearches.entries()) {
          if (now - timestamp > 30000) { // 清理30秒前的记录
            this._recentSearches.delete(key);
          }
        }
      }
      
      logger.info(`开始搜索资源: ${query}`);
      
      // 步骤1: 发送开始查询状态
      const startMsg = await wechatService.sendMessage(`正在查询"${query}"相关资源...`, fromUser);
      if (startMsg.success && startMsg.msgid) {
        statusMsgIds.push(startMsg.msgid);
      }
      
      // 步骤2: 开始查询CLS API
      const clsPromise = clsSearchService.search(query).then(async results => {
        const clsMsg = await wechatService.sendMessage(`CLS API查询完成，找到${results?.length || 0}个结果`, fromUser);
        if (clsMsg.success && clsMsg.msgid) {
          statusMsgIds.push(clsMsg.msgid);
        }
        return results;
      });
      
      // 步骤3: 开始查询BT API
      const btPromise = btSearchService.search(query).then(async results => {
        const btMsg = await wechatService.sendMessage(`BT API查询完成，找到${results?.length || 0}个结果`, fromUser);
        if (btMsg.success && btMsg.msgid) {
          statusMsgIds.push(btMsg.msgid);
        }
        return results;
      });
      
      // 并行执行两个API请求，提高效率
      const [clsResults, btResults] = await Promise.all([clsPromise, btPromise]);
      
      // 如果两个API都没有结果
      if ((!btResults || btResults.length === 0) && (!clsResults || clsResults.length === 0)) {
        // 撤回之前发送的状态消息
        await this.recallStatusMessages(statusMsgIds);
        
        const noResultMsg = `没有找到与 "${query}" 相关的资源`;
        await wechatService.sendMessage(noResultMsg, fromUser);
        return noResultMsg;
      }
      
      // 准备图文消息
      const articles = [];
      
      // 获取CLS结果的第一个图片URL作为BT结果的图片
      let firstImageUrl = '';
      if (clsResults && clsResults.length > 0) {
        firstImageUrl = clsSearchService.getFirstImageUrl(clsResults);
      }
      
      // 优先添加CLS API结果
      if (clsResults && clsResults.length > 0) {
        const clsArticles = clsSearchService.formatResults(clsResults, 6, articles.length);
        articles.push(...clsArticles);
      }
      
      // 然后添加BT API结果
      if (btResults && btResults.length > 0) {
        // 修改BT搜索结果的picurl
        const btArticles = btSearchService.formatResults(btResults, 2, articles.length);
        
        // 如果有CLS的图片，替换BT结果的图片
        if (firstImageUrl) {
          for (const article of btArticles) {
            article.picurl = firstImageUrl;
          }
        }
        
        articles.push(...btArticles);
      }
      
      // 步骤5: 发送最终结果
      if (articles.length > 0) {
        // 撤回之前发送的状态消息
        await this.recallStatusMessages(statusMsgIds);
        
        const sendResult = await wechatService.sendNewsMessage(articles, fromUser);
        
        // 已经发送8条，更多结果请访问PC
        const totalResults = (clsResults?.length || 0) + (btResults?.length || 0);
        await wechatService.sendMessage(`共有${totalResults}个结果，已发送${articles.length}条`, fromUser);
        
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
   * 撤回所有状态消息
   * @param {Array<string>} msgIds - 消息ID数组
   * @returns {Promise<void>}
   */
  async recallStatusMessages(msgIds) {
    if (!msgIds || !Array.isArray(msgIds) || msgIds.length === 0) {
      return;
    }
    
    logger.info(`准备撤回 ${msgIds.length} 条状态消息`);
    
    // 并行撤回所有消息，加快处理速度
    const recallPromises = msgIds.map(msgid => wechatService.recallMessage(msgid));
    await Promise.all(recallPromises);
  }
};

module.exports = searchService; 