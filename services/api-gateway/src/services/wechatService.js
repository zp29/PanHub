/**
 * 微信服务模块
 * 封装企业微信相关的API和功能
 */
const crypto = require('crypto');
const xml2js = require('xml2js');
const config = require('../config.json');
const logger = require('../utils/logger');
const httpClient = require('../utils/httpClient');

// 从配置中提取企业微信参数
const CORP_ID = config.wechat.corpId;
const CORP_SECRET = config.wechat.corpSecret;
const AGENT_ID = config.wechat.agentId;
const TOKEN = config.wechat.token;
const ENCODING_AES_KEY = config.wechat.encodingAesKey;

// 保存访问令牌
let accessTokenCache = {
  token: '',
  expiresAt: 0
};

/**
 * 微信服务
 */
const wechatService = {
  /**
   * 获取企业微信访问令牌
   * @returns {Promise<string>} - 返回访问令牌
   */
  async getAccessToken() {
    // 检查缓存的令牌是否有效
    const now = Date.now();
    if (accessTokenCache.token && accessTokenCache.expiresAt > now) {
      return accessTokenCache.token;
    }
    
    try {
      const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CORP_ID}&corpsecret=${CORP_SECRET}`;
      const response = await httpClient.get(url);
      
      if (response.errcode === 0) {
        // 缓存令牌，设置过期时间比微信返回的提前5分钟
        const expiresIn = (response.expires_in - 300) * 1000;
        accessTokenCache = {
          token: response.access_token,
          expiresAt: now + expiresIn
        };
        return response.access_token;
      } else {
        throw new Error(`获取访问令牌失败: ${response.errmsg}`);
      }
    } catch (error) {
      logger.error('获取访问令牌出错:', error);
      throw error;
    }
  },
  
  /**
   * 发送消息给企业微信用户
   * @param {string} content - 消息内容
   * @param {string} toUser - 接收者ID，默认为@all
   * @returns {Promise<Object>} - 发送结果，包含消息ID
   */
  async sendMessage(content, toUser = '@all') {
    if (!content) {
      logger.warn('发送的消息内容为空');
      return { success: false };
    }
    
    try {
      // 获取访问令牌
      const accessToken = await this.getAccessToken();
      
      // 优先尝试通过代理发送
      if (config.proxy && config.proxy.enabled) {
        try {
          // logger.info('使用代理发送消息');
          // 准备代理数据
          const proxyData = {
            touser: toUser,
            msgtype: 'text',
            agentid: AGENT_ID,
            text: {
              content: content
            },
            safe: 0
          };
          
          const proxyUrl = `${config.proxy.url}/cgi-bin/message/send`;
          const proxyResponse = await httpClient.post(proxyUrl, proxyData);
          
          if (proxyResponse.errcode === 0) {
            logger.info('通过代理发送消息成功');
            return { success: true, msgid: proxyResponse.msgid };
          } else {
            // logger.warn('代理响应异常:', proxyResponse);
          }
        } catch (proxyError) {
          logger.error('通过代理发送消息失败:', proxyError);
        }
      }
      
      // 直接发送消息
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
      const data = {
        touser: toUser,
        msgtype: 'text',
        agentid: AGENT_ID,
        text: {
          content: content
        }
      };
      
      logger.info('直接使用企业微信API发送消息');
      const response = await httpClient.post(url, data);
      
      if (response.errcode === 0) {
        logger.info('消息发送成功:', 
          content.length > 30 ? content.substring(0, 30) + '...' : content);
        return { success: true, msgid: response.msgid };
      } else {
        logger.error('消息发送失败:', response);
        return { success: false, error: response };
      }
    } catch (error) {
      logger.error('发送消息出错:', error);
      return { success: false, error };
    }
  },
  
  /**
   * 发送图文消息给企业微信用户
   * @param {Array} articles - 图文消息数组
   * @param {string} toUser - 接收者ID，默认为@all
   * @returns {Promise<boolean>} - 发送结果
   */
  async sendNewsMessage(articles, toUser = '@all') {
    if (!articles || !Array.isArray(articles) || articles.length === 0) {
      logger.warn('发送的图文消息数组为空');
      return false;
    }
    
    try {
      // 获取访问令牌
      const accessToken = await this.getAccessToken();
      
      // 优先尝试通过代理发送
      if (config.proxy && config.proxy.enabled) {
        try {
          // 准备代理数据
          const proxyData = {
            touser: toUser,
            msgtype: 'news',
            agentid: AGENT_ID,
            news: {
              articles: articles
            },
            safe: 0
          };
          
          const proxyUrl = `${config.proxy.url}/cgi-bin/message/send`;
          const proxyResponse = await httpClient.post(proxyUrl, proxyData);
          
          if (proxyResponse.errcode === 0) {
            logger.info('通过代理发送图文消息成功');
            return true;
          }
        } catch (proxyError) {
          logger.error('通过代理发送图文消息失败:', proxyError);
        }
      }
      
      // 直接发送图文消息
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
      const data = {
        touser: toUser,
        msgtype: 'news',
        agentid: AGENT_ID,
        news: {
          articles: articles
        }
      };
      
      logger.info('直接使用企业微信API发送图文消息');
      logger.info('图文消息内容:', JSON.stringify(articles));
      const response = await httpClient.post(url, data);
     
      console.log('wechatService.js response -> ', response)
      
      if (response.errcode === 0) {
        logger.info('图文消息发送成功');
        return true;
      } else {
        logger.error('图文消息发送失败:', response);
        return false;
      }
    } catch (error) {
      logger.error('发送图文消息出错:', error);
      return false;
    }
  },
  
  /**
   * 处理企业微信URL验证请求
   * @param {Object} req - Express请求对象
   * @param {Object} res - Express响应对象
   * @returns {Boolean} - 处理是否成功
   */
  handleUrlVerification(req, res) {
    try {
      const { msg_signature, timestamp, nonce, echostr } = req.query;
      logger.info('收到验证请求，参数:', req.query);
      
      if (!msg_signature || !timestamp || !nonce || !echostr) {
        logger.error('缺少必要参数');
        res.status(400).send('缺少参数');
        return false;
      }
      
      // 验证签名
      const isSignatureValid = this.verifySignature(msg_signature, timestamp, nonce, TOKEN, echostr);
      if (!isSignatureValid) {
        logger.error('签名验证失败');
        res.status(401).send('签名验证失败');
        return false;
      }
      
      // 解密echostr得到明文
      const decryptedEchostr = this.decryptMessage(echostr, ENCODING_AES_KEY, CORP_ID);
      if (!decryptedEchostr) {
        logger.error('解密echostr失败');
        res.status(403).send('解密echostr失败');
        return false;
      }
      
      logger.info('解密成功，返回明文');
      res.send(decryptedEchostr);
      return true;
    } catch (error) {
      logger.error('处理URL验证请求出错:', error);
      res.status(500).send('处理URL验证请求出错');
      return false;
    }
  },
  
  /**
   * 验证微信请求签名
   * @param {string} msgSignature - 消息签名
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @param {string} token - 验证令牌
   * @param {string} encryptedMsg - 加密的消息
   * @returns {boolean} 签名是否有效
   */
  verifySignature(msgSignature, timestamp, nonce, token, encryptedMsg) {
    try {
      // 按字典序排序
      const array = [token, timestamp, nonce, encryptedMsg].sort();
      // 连接成字符串
      const str = array.join('');
      // 创建SHA1哈希
      const sha1 = crypto.createHash('sha1');
      sha1.update(str);
      const signature = sha1.digest('hex');
      // 比较签名
      return signature === msgSignature;
    } catch (error) {
      logger.error('验证签名出错:', error);
      return false;
    }
  },
  
  /**
   * 解密微信消息
   * @param {string} text - 加密的消息文本
   * @param {string} encodingAesKey - AES密钥
   * @param {string} corpId - 企业ID
   * @returns {string|null} 解密后的消息或null
   */
  decryptMessage(text, encodingAesKey, corpId) {
    try {
      // 将Base64字符串转换为Buffer
      const aesKey = Buffer.from(encodingAesKey, 'base64');
      
      // 创建aes-256-cbc解密器，使用密钥的前16字节作为IV
      const iv = aesKey.slice(0, 16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
      
      // 设置自动padding
      decipher.setAutoPadding(false);
      
      // 解密分两步进行
      let decrypted;
      try {
        const encryptedBuffer = Buffer.from(text, 'base64');
        
        decrypted = Buffer.concat([
          decipher.update(encryptedBuffer),
          decipher.final()
        ]);
      } catch (decipherError) {
        logger.error('解密过程失败:', decipherError);
        return null;
      }
      
      // 处理PKCS#7 padding
      const pad = decrypted[decrypted.length - 1];
      
      if (pad < 1 || pad > 32) {
        logger.error('解密后的padding不正确:', pad);
        // 尝试继续处理
      } else {
        decrypted = decrypted.slice(0, decrypted.length - pad);
      }
      
      // 解析消息格式: 随机16字节 + 消息长度(4字节) + 消息内容 + 企业微信corpId
      if (decrypted.length <= 20) {
        logger.error('解密后数据长度不足:', decrypted.length);
        return null;
      }
      
      const randomBytes = decrypted.slice(0, 16); // 16字节随机字符串
      const content = decrypted.slice(16); // 去除前16字节随机字符串
      
      let msgLen;
      try {
        msgLen = content.readUInt32BE(0); // 获取消息长度
      } catch (readError) {
        logger.error('读取消息长度失败:', readError);
        return null;
      }
      
      // 如果计算出的消息长度不合理
      if (msgLen < 0 || msgLen > content.length - 4) {
        logger.error('消息长度不合法:', msgLen, '可用长度:', content.length - 4);
        // 尝试一个更合理的长度
        if (content.length > 4) {
          msgLen = content.length - 4 - corpId.length;
        } else {
          return null;
        }
      }
      
      let msg;
      let receivedCorpId;
      try {
        msg = content.slice(4, 4 + msgLen).toString('utf8'); // 提取消息内容
        receivedCorpId = content.slice(4 + msgLen).toString('utf8'); // 提取corpId
      } catch (parseError) {
        logger.error('解析消息内容失败:', parseError);
        return null;
      }
      
      // 验证corpId
      if (receivedCorpId !== corpId) {
        logger.warn('接收到的corpId与配置不完全匹配:', {
          received: receivedCorpId,
          expected: corpId
        });
      }
      
      return msg;
    } catch (error) {
      logger.error('解密消息出错:', error);
      return null;
    }
  },
  
  /**
   * 解析并处理收到的消息
   * @param {string} xmlData - 收到的XML消息数据
   * @param {Object} query - URL查询参数，包含签名信息
   * @param {Function} handleCommand - 处理解析出的命令的回调函数
   * @returns {Promise<Object>} - 处理结果
   */
  async parseAndHandleMessage(xmlData, query, handleCommand) {
    try {
      // logger.info('收到XML数据长度:', xmlData.length);
      
      // 解析XML
      const parser = new xml2js.Parser({ 
        explicitArray: false,  // 不使用数组形式
        trim: true             // 去除空白字符
      });
      const result = await parser.parseStringPromise(xmlData);
      
      if (!result || !result.xml) {
        logger.warn('解析XML失败或格式不正确');
        return { success: false, reason: '解析XML失败或格式不正确' };
      }
      
      const encryptedMessage = result.xml;
      
      // 检查是否包含Encrypt字段（加密消息）
      if (!encryptedMessage.Encrypt) {
        logger.warn('消息不包含Encrypt字段');
        return { success: false, reason: '消息不包含Encrypt字段' };
      }
      
      // 解析URL参数
      const { msg_signature, timestamp, nonce } = query;
      if (!msg_signature || !timestamp || !nonce) {
        logger.error('缺少解密必要的参数:', query);
        return { success: false, reason: '缺少解密必要的参数' };
      }
      
      // 验证签名
      const isSignatureValid = this.verifySignature(
        msg_signature, timestamp, nonce, TOKEN, encryptedMessage.Encrypt
      );
      if (!isSignatureValid) {
        logger.warn('消息签名验证失败');
      }
      
      // 解密消息
      let decryptedXml;
      try {
        decryptedXml = this.decryptMessage(encryptedMessage.Encrypt, ENCODING_AES_KEY, CORP_ID);
        
        if (!decryptedXml) {
          logger.error('解密消息失败，结果为空');
          return { success: false, reason: '解密消息失败，结果为空' };
        }
      } catch (decryptError) {
        logger.error('解密消息异常:', decryptError);
        return { success: false, reason: `解密消息异常: ${decryptError.message}` };
      }
      
      // 解析解密后的XML
      try {
        const decryptedResult = await parser.parseStringPromise(decryptedXml);
        
        if (!decryptedResult || !decryptedResult.xml) {
          logger.warn('解密后的XML格式无效');
          return { success: false, reason: '解密后的XML格式无效' };
        }
        
        // 提取消息内容
        const message = decryptedResult.xml;
        let content = '';
        let fromUser = '';
        let msgId = '';
        
        // 获取消息ID，用于去重
        if (message.MsgId) {
          msgId = message.MsgId;
          
          // 使用内存缓存检查消息是否已处理过（简单的消息去重机制）
          if (this._processedMsgIds && this._processedMsgIds.has(msgId)) {
            logger.info(`消息 ${msgId} 已处理过，跳过`);
            return { success: true, duplicate: true };
          }
          
          // 添加到已处理集合
          if (!this._processedMsgIds) {
            this._processedMsgIds = new Set();
          }
          this._processedMsgIds.add(msgId);
          
          // 控制缓存大小，避免内存泄漏
          if (this._processedMsgIds.size > 1000) {
            // 如果缓存过大，清除旧的记录
            const entriesToDelete = this._processedMsgIds.size - 800; // 保留800条最新记录
            const iterator = this._processedMsgIds.values();
            for (let i = 0; i < entriesToDelete; i++) {
              const entry = iterator.next();
              if (!entry.done) {
                this._processedMsgIds.delete(entry.value);
              }
            }
          }
        }
        
        // 获取发送者
        if (message.FromUserName) {
          fromUser = message.FromUserName;
          // logger.info('消息发送者:', fromUser);
        } else {
          logger.warn('缺少FromUserName字段');
        }
        
        // 获取消息类型
        if (message.MsgType) {
          const msgType = message.MsgType;
          // logger.info('消息类型:', msgType);
          
          // 根据不同消息类型获取内容
          if (msgType === 'text' && message.Content) {
            // 文本消息
            content = message.Content;
            // logger.info('收到文本消息:', JSON.stringify(message));
          } else if (msgType === 'event') {
            // 事件消息
            const eventType = message.Event || '';
            logger.info('收到事件消息:', eventType);
            
            if (eventType.toLowerCase() === 'click' && message.EventKey) {
              // 菜单点击事件
              content = message.EventKey;
              logger.info('收到菜单点击事件，EventKey:', content, '，准备处理命令');
            } else {
              // 其他事件类型
              logger.info(`收到其他事件类型: ${eventType}`);
              content = eventType;
              if (message.EventKey) {
                logger.info('事件Key:', message.EventKey);
                // 对于非click但有EventKey的情况，也可以处理命令
                content = message.EventKey;
              }
            }
          } else {
            logger.info('收到其他类型消息:', msgType);
          }
        } else {
          logger.warn('缺少MsgType字段');
        }
        
        // 如果没有解析出内容，尝试直接使用Content字段
        if (!content && message.Content) {
          content = message.Content;
          logger.info('使用原始Content字段:', content);
        }
        
        // 处理命令
        if (content && fromUser) {
          logger.info(`准备处理命令: ${content}, 发送者: ${fromUser}`);
          try {
            const responseMsg = await handleCommand(content, fromUser);
            logger.info(`处理了来自 ${fromUser} 的指令: ${content}, 响应: ${responseMsg}`);
            return { success: true, content, fromUser, response: responseMsg };
          } catch (commandError) {
            logger.error(`处理命令异常:`, commandError);
            // 即使出错也返回成功，避免企业微信重试
            return { success: true, content, fromUser, error: commandError.message };
          }
        } else {
          logger.warn('缺少必要字段，无法处理命令:', { content, fromUser });
          return { success: false, reason: '缺少必要字段，无法处理命令' };
        }
      } catch (decryptedParseError) {
        logger.error('解析解密后的XML失败:', decryptedParseError);
        return { success: false, reason: '解析解密后的XML失败' };
      }
    } catch (error) {
      logger.error('处理消息出错:', error);
      return { success: false, reason: '处理消息出错' };
    }
  },
  
  /**
   * 生成测试消息
   * @param {string} customContent - 自定义消息内容
   * @returns {string} 格式化的测试消息
   */
  generateTestMessage(customContent = '') {
    // 获取主机名和本地IP地址
    const hostname = require('os').hostname();
    const interfaces = require('os').networkInterfaces();
    let localIP = 'Unknown';
    
    // 尝试获取本地IP地址
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // 只获取IPv4地址且不是内部地址(127.0.0.1)
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'Unknown') break;
    }
    
    const timestamp = new Date().toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      hour12: false 
    });
    
    // 创建基础测试消息
    const baseMessage = `企业微信通知服务测试消息 \n\n` + 
      `【服务器信息】\n` +
      `主机名: ${hostname}\n` +
      `IP地址: ${localIP}\n` +
      `端口: ${config.server.port}\n\n` +
      `【状态信息】\n` +
      `时间: ${timestamp}\n` +
      `功能: 正常\n`;
    
    // 如果提供了自定义内容，添加到消息中
    if (customContent) {
      return baseMessage + `\n【自定义内容】\n${customContent}`;
    }
    
    return baseMessage;
  },
  
  /**
   * 撤回企业微信消息
   * @param {string} msgid - 消息ID
   * @returns {Promise<boolean>} - 撤回结果
   */
  async recallMessage(msgid) {
    if (!msgid) {
      logger.warn('撤回消息ID为空');
      return false;
    }
    
    try {
      // 获取访问令牌
      const accessToken = await this.getAccessToken();
      
      // 调用撤回消息接口
      const url = `https://qyapi.weixin.qq.com/cgi-bin/message/recall?access_token=${accessToken}`;
      const data = {
        msgid: msgid
      };
      
      logger.info(`尝试撤回消息: ${msgid}`);
      const response = await httpClient.post(url, data);
      
      if (response.errcode === 0) {
        logger.info(`消息撤回成功: ${msgid}`);
        return true;
      } else {
        logger.warn(`消息撤回失败: ${msgid}`, response);
        return false;
      }
    } catch (error) {
      logger.error(`撤回消息出错: ${msgid}`, error);
      return false;
    }
  }
};

module.exports = wechatService;
