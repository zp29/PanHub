/**
 * 企业微信菜单管理模块
 * 用于创建和管理企业微信应用的自定义菜单
 */

const axios = require('axios');
const config = require('./config.json');
const { menu } = config;

/**
 * 获取企业微信访问令牌
 * @returns {Promise<string>} - 返回访问令牌
 */
async function getAccessToken() {
  try {
    const { corpId, corpSecret } = config.wechat;
    const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${corpId}&corpsecret=${corpSecret}`;
    const response = await axios.get(url);
    
    if (response.data.errcode === 0) {
      return response.data.access_token;
    } else {
      console.error('获取企业微信访问令牌失败:', response.data);
      return null;
    }
  } catch (error) {
    console.error('获取企业微信访问令牌出错:', error);
    return null;
  }
}

/**
 * 创建企业微信自定义菜单
 * @param {Object} menuData - 菜单数据
 * @returns {Promise<Object>} - 返回创建结果
 */
async function createMenu(menuData) {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, message: '获取访问令牌失败' };
    }

    const agentId = config.wechat.agentId;
    const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/create?access_token=${accessToken}&agentid=${agentId}`;
    
    console.log('【菜单创建】准备创建菜单，数据:', JSON.stringify(menuData, null, 2));
    
    const response = await axios.post(url, menuData);
    console.log('【菜单创建】企业微信响应:', response.data);
    
    if (response.data.errcode === 0) {
      return { success: true, message: '菜单创建成功' };
    } else {
      return { 
        success: false, 
        message: `菜单创建失败: ${response.data.errmsg}`,
        errorCode: response.data.errcode
      };
    }
  } catch (error) {
    console.error('【菜单创建】创建菜单出错:', error);
    return { 
      success: false, 
      message: `创建菜单出错: ${error.message}` 
    };
  }
}

/**
 * 查询企业微信自定义菜单
 * @returns {Promise<Object>} - 返回菜单数据
 */
async function getMenu() {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, message: '获取访问令牌失败' };
    }

    const agentId = config.wechat.agentId;
    const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/get?access_token=${accessToken}&agentid=${agentId}`;
    
    const response = await axios.get(url);
    console.log('【菜单查询】企业微信响应:', response.data);
    
    if (response.data.errcode === 0) {
      return { 
        success: true, 
        message: '菜单查询成功',
        menu: response.data.button
      };
    } else {
      return { 
        success: false, 
        message: `菜单查询失败: ${response.data.errmsg}`,
        errorCode: response.data.errcode
      };
    }
  } catch (error) {
    console.error('【菜单查询】查询菜单出错:', error);
    return { 
      success: false, 
      message: `查询菜单出错: ${error.message}` 
    };
  }
}

/**
 * 删除企业微信自定义菜单
 * @returns {Promise<Object>} - 返回删除结果
 */
async function deleteMenu() {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return { success: false, message: '获取访问令牌失败' };
    }

    const agentId = config.wechat.agentId;
    const url = `https://qyapi.weixin.qq.com/cgi-bin/menu/delete?access_token=${accessToken}&agentid=${agentId}`;
    
    const response = await axios.get(url);
    console.log('【菜单删除】企业微信响应:', response.data);
    
    if (response.data.errcode === 0) {
      return { success: true, message: '菜单删除成功' };
    } else {
      return { 
        success: false, 
        message: `菜单删除失败: ${response.data.errmsg}`,
        errorCode: response.data.errcode
      };
    }
  } catch (error) {
    console.error('【菜单删除】删除菜单出错:', error);
    return { 
      success: false, 
      message: `删除菜单出错: ${error.message}` 
    };
  }
}

/**
 * 创建Emby更新菜单
 * @returns {Promise<Object>} - 返回创建结果
 */
async function createEmbyMenu() {
  // 创建自定义菜单，包含特定命令的菜单项
  const menuData = menu;
  
  return await createMenu(menuData);
}

// 导出功能函数
module.exports = {
  getAccessToken,
  createMenu,
  getMenu,
  deleteMenu,
  createEmbyMenu
};
