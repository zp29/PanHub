/**
 * 菜单控制器
 * 处理企业微信自定义菜单相关的请求
 */
const logger = require('../utils/logger');
const config = require('../config.json');
const httpClient = require('../utils/httpClient');
const wechatService = require('../services/wechatService');

/**
 * 菜单控制器
 */
const menuController = {
  /**
   * 创建自定义菜单
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async createMenu(req, res) {
    try {
      logger.info('收到创建菜单请求');
      
      // 使用配置中的菜单数据或默认菜单
      const menuData = config.menu || this.getDefaultMenu();
      logger.info('准备创建菜单，数据:', JSON.stringify(menuData, null, 2));
      
      // 获取访问令牌
      const accessToken = await wechatService.getAccessToken();
      
      // 调用微信API创建菜单
      const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/create?access_token=${accessToken}&agentid=${config.wechat.agentId}`;
      const response = await httpClient.post(url, menuData);
      logger.info('企业微信响应:', response);
      
      if (response.errcode === 0) {
        console.log('菜单创建成功');
        if (res) {
          return res.json({
            success: true,
            message: '菜单创建成功'
          });
        }
        return { success: true, message: '菜单创建成功' };
      } else {
        throw new Error(`创建菜单API返回错误: ${response.errmsg}`);
      }
    } catch (error) {
      logger.error('创建菜单失败:', error);
      if (res) {
        return res.status(500).json({ 
          success: false, 
          message: `创建菜单失败: ${error.message}` 
        });
      }
      throw error;
    }
  },
  
  /**
   * 查询当前菜单
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async getMenu(req, res) {
    try {
      logger.info('收到查询菜单请求');
      
      // 获取访问令牌
      const accessToken = await wechatService.getAccessToken();
      
      // 调用微信API查询菜单
      const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/get?access_token=${accessToken}&agentid=${config.wechat.agentId}`;
      const response = await httpClient.get(url);
      
      if (response.errcode === 0 || response.menu) {
        return res.json({
          success: true,
          menu: response.menu || response
        });
      } else {
        throw new Error(`查询菜单API返回错误: ${response.errmsg || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('查询菜单失败:', error);
      return res.status(500).json({ 
        success: false, 
        message: `查询菜单失败: ${error.message}` 
      });
    }
  },
  
  /**
   * 删除当前菜单
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   */
  async deleteMenu(req, res) {
    try {
      logger.info('收到删除菜单请求');
      
      // 获取访问令牌
      const accessToken = await wechatService.getAccessToken();
      
      // 调用微信API删除菜单
      const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/delete?access_token=${accessToken}&agentid=${config.wechat.agentId}`;
      const response = await httpClient.get(url);
      
      if (response.errcode === 0) {
        return res.json({
          success: true,
          message: '菜单删除成功'
        });
      } else {
        throw new Error(`删除菜单API返回错误: ${response.errmsg}`);
      }
    } catch (error) {
      logger.error('删除菜单失败:', error);
      return res.status(500).json({ 
        success: false, 
        message: `删除菜单失败: ${error.message}` 
      });
    }
  },
  
  /**
   * 获取默认菜单配置
   * @returns {Object} 默认菜单配置
   */
  getDefaultMenu() {
    return {
      button: [
        {
          name: "Emby更新",
          sub_button: [
            {
              type: "click",
              name: "全部更新",
              key: "UpdateEmbyAll"
            },
            {
              type: "click",
              name: "电影更新",
              key: "UpdateEmbyMov"
            },
            {
              type: "click",
              name: "电视剧更新",
              key: "UpdateEmbyTv"
            },
            {
              type: "click",
              name: "动漫更新",
              key: "UpdateEmbyAmi"
            }
          ]
        },
        {
          type: "click",
          name: "服务状态",
          key: "ServiceStatus"
        }
      ]
    };
  }
};

module.exports = menuController;
