/**
 * HTTP请求工具
 * 封装了axios请求方法，提供统一的HTTP请求接口
 */
const axios = require('axios');
const logger = require('./logger');

/**
 * HTTP客户端
 * 封装了常用的HTTP请求方法
 */
const httpClient = {
  /**
   * 发送GET请求
   * @param {string} url - 请求URL
   * @param {Object} params - URL参数
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} - 响应数据
   */
  async get(url, params = {}, options = {}) {
    try {
      const response = await axios.get(url, {
        params,
        ...options
      });
      return response.data;
    } catch (error) {
      logger.error(`GET请求失败: ${url}`, error);
      throw error;
    }
  },
  
  /**
   * 发送POST请求
   * @param {string} url - 请求URL
   * @param {Object|string} data - 请求体数据
   * @param {Object} options - 请求选项
   * @returns {Promise<Object>} - 响应数据
   */
  async post(url, data = {}, options = {}) {
    try {
      const response = await axios.post(url, data, options);
      logger.info(`POST请求成功: ${url}, 响应数据: ${JSON.stringify(response.data)}`);
      return response.data;
    } catch (error) {
      logger.error(`POST请求失败: ${url}`, error);
      throw error;
    }
  },
  
  /**
   * 转发请求到代理服务器
   * @param {string} proxyUrl - 代理服务器URL
   * @param {string} xmlData - XML数据
   * @param {Object} query - URL查询参数
   * @param {Object} headers - 请求头
   * @returns {Promise<Object>} - 代理服务器响应
   */
  async forwardToProxy(proxyUrl, xmlData, query = {}, headers = {}) {
    try {
      logger.info(`尝试转发消息到代理服务器: ${proxyUrl}`);
      
      const response = await axios.post(proxyUrl, xmlData, {
        headers: {
          'Content-Type': headers['content-type'] || 'text/xml',
          ...headers
        },
        params: query,
        timeout: 5000
      });
      
      logger.info('代理服务器响应成功');
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('转发到代理服务器失败', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

module.exports = httpClient;
