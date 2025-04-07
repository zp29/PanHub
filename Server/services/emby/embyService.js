/**
 * Emby服务模块
 * 处理所有与Emby相关的操作
 */
const logger = require('../../utils/logger');
const httpClient = require('../../utils/httpClient');
const axios = require('axios');
const config = require('../../config.json');

/**
 * Emby服务类
 */
class EmbyService {
  constructor() {
    // 从配置文件中获取Emby配置
    this.config = config.emby || {
      apiKey: '',
      baseUrl: 'http://localhost:8096'
    };
  }
  
  /**
   * 通知Emby刷新指定项目
   * @param {String} embyItemId - Emby项目 ID
   * @returns {Promise<boolean>} 操作是否成功
   */
  async notifyEmby(embyItemId) {
    let response;
    
    try {
      logger.info(`开始通知Emby刷新项目`, { itemId: embyItemId });
      
      if (embyItemId) {

        // 刷新指定项目
        const url = `${this.config.baseUrl}/emby/Items/${embyItemId}/Refresh?api_key=${this.config.apiKey}`;
        const headers = this.getAuthHeaders();

        logger.info(`通知Emby刷新项目URL:`, url);
        
        response = await axios.post(url, undefined, headers);
        
        logger.info(`刷新指定项目响应:`, response);
      } else {
        // 如果没有指定ID，尝试刷新所有媒体库
        logger.warn('未指定项目ID，执行全库刷新');
        
        const url = `${this.config.baseUrl}/emby/library/Refresh?api_key=${this.config.apiKey}`;
        const headers = this.getAuthHeaders();

        logger.info(`通知Emby刷新所有媒体库URL:`, url);
        
        response = await axios.post(url, undefined, headers);
        
        logger.info(`刷新所有媒体库响应:`, response);
      }
      
      // 判断最终响应是否成功
      const isSuccess = this.isSuccessResponse(response);
      
      if (!isSuccess) {
        logger.error('通知Emby刷新失败', response);
      } else {
        logger.info('通知Emby刷新成功');
      }
      
      return isSuccess;
    } catch (error) {
      logger.error('通知Emby刷新时发生错误:', error);
      return false;
    }
  }
  
  /**
   * 更新所有Emby媒体库
   * @returns {Promise<Object>} 操作结果
   */
  async updateAllLibraries() {
    try {
      logger.info('开始更新所有Emby媒体库');
      
      // 获取所有媒体库ID
      const isSuccess = await this.notifyEmby();
      
      return { 
        success: isSuccess,
        message: isSuccess ? `Emby全部媒体库更新任务已执行` : `Emby全部媒体库更新任务执行失败`,
      };
    } catch (error) {
      logger.error('更新所有Emby媒体库出错:', error);
      return { success: false, message: `更新Emby媒体库失败: ${error.message}` };
    }
  }
  
  /**
   * 更新电影媒体库
   * @returns {Promise<Object>} 操作结果
   */
  async updateMovieLibraries() {
    try {
      const embyItemId = config.emby.libraryIds?.movie || null;
      logger.info('开始更新Emby电影媒体库', { embyItemId });
      
      const isSuccess = await this.notifyEmby(embyItemId);

      console.log('embyService.js Emby电影媒体库 isSuccess -> ', isSuccess)
      
      return { 
        success: isSuccess,
        message: isSuccess ? 'Emby电影媒体库更新任务已执行' : 'Emby电影媒体库更新任务执行失败'
      };
    } catch (error) {
      logger.error('更新电影媒体库出错:', error);
      return { success: false, message: `更新电影媒体库失败: ${error.message}` };
    }
  }
  
  /**
   * 更新电视剧媒体库
   * @returns {Promise<Object>} 操作结果
   */
  async updateTvLibraries() {
    try {
      const embyItemId = config.emby.libraryIds?.tv || null;
      logger.info('开始更新Emby电视剧媒体库', { embyItemId });
      
      const isSuccess = await this.notifyEmby(embyItemId);
      
      return { 
        success: isSuccess,
        message: isSuccess ? 'Emby电视剧媒体库更新任务已执行' : 'Emby电视剧媒体库更新任务执行失败'
      };
    } catch (error) {
      logger.error('更新电视剧媒体库出错:', error);
      return { success: false, message: `更新电视剧媒体库失败: ${error.message}` };
    }
  }
  
  /**
   * 更新动漫媒体库
   * @returns {Promise<Object>} 操作结果
   */
  async updateAnimeLibraries() {
    try {
      const embyItemId = config.emby.libraryIds?.anime || null;
      logger.info('开始更新Emby动漫媒体库', { embyItemId });
      
      const isSuccess = await this.notifyEmby(embyItemId);
      
      return { 
        success: isSuccess,
        message: isSuccess ? 'Emby动漫媒体库更新任务已执行' : 'Emby动漫媒体库更新任务执行失败'
      };
    } catch (error) {
      logger.error('更新动漫媒体库出错:', error);
      return { success: false, message: `更新动漫媒体库失败: ${error.message}` };
    }
  }
  
  /**
   * 判断响应是否成功
   * @param {Object} response - 响应对象
   * @returns {boolean} 是否成功
   */
  isSuccessResponse(response) {
    console.log('embyService.js response.status -> ', response.status)
    return response && (response.status === 200 || response.status === 204 || 
           (typeof response === 'object' && (response.errcode === 0 || response.success === true)));
  }
  
  /**
   * 获取授权头信息
   * @returns {Object} 头信息对象
   */
  getAuthHeaders() {
    return {
      headers: {
        'accept': '*/*',
        'content-type': 'application/x-www-form-urlencoded'
      }
    };
  }
}

module.exports = new EmbyService();
