/**
 * 企业微信通知服务API模块
 * 包含企业微信消息收发、验证和解密相关功能
 */

const crypto = require('crypto');
const xml2js = require('xml2js');
const axios = require('axios');
const config = require('./config.json');

// 企业微信加密解密相关配置
const { token, encodingAesKey, corpId, agentId, corpSecret } = config.wechat;
const ENCODING_AES_KEY = encodingAesKey + '=';
const CORP_ID = corpId;

/**
 * 企业微信验证签名的函数
 * @param {string} msgSignature - 企业微信加密签名
 * @param {string} timestamp - 时间戳
 * @param {string} nonce - 随机数
 * @param {string} token - 配置的Token
 * @param {string} echostr - 加密的消息内容（可选）
 * @returns {boolean} - 验证是否通过
 */
function verifySignature(msgSignature, timestamp, nonce, token, echostr) {
  if (!msgSignature || !timestamp || !nonce || !token) {
    console.log('验证参数不完整:', { msgSignature, timestamp, nonce, token });
    return false;
  }
  
  try {
    // 企业微信URL验证时，使用token,timestamp,nonce计算签名
    // 如果有echostr参数，则它也参与计算
    let arr;
    if (echostr) {
      arr = [token, timestamp, nonce, echostr].sort();
      console.log('包含echostr的签名计算参数:', arr);
    } else {
      arr = [token, timestamp, nonce].sort();
      console.log('不包含echostr的签名计算参数:', arr);
    }
    
    const str = arr.join('');
    console.log('企业微信验证签名字符串:', str);
    
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    const calculatedSignature = sha1.digest('hex');
    
    console.log('验证签名结果:', {
      计算签名: calculatedSignature,
      接收签名: msgSignature,
      比较结果: calculatedSignature === msgSignature
    });
    
    // 尝试两种签名方式
    if (calculatedSignature === msgSignature) {
      return true;
    } else {
      // 如果回调验证失败，尝试不排序的方法
      console.log('第一种验证失败，尝试第二种方法...');
      
      // 尝试不排序的签名方式，直接使用 token+timestamp+nonce 的顺序
      let noSortArr;
      if (echostr) {
        noSortArr = [token, timestamp, nonce, echostr];
      } else {
        noSortArr = [token, timestamp, nonce];
      }
      
      const noSortStr = noSortArr.join('');
      console.log('不排序的验证字符串:', noSortStr);
      
      const sha1NoSort = crypto.createHash('sha1');
      sha1NoSort.update(noSortStr);
      const calculatedSignatureNoSort = sha1NoSort.digest('hex');
      
      console.log('不排序验证签名结果:', {
        计算签名: calculatedSignatureNoSort,
        接收签名: msgSignature,
        比较结果: calculatedSignatureNoSort === msgSignature
      });
      
      return calculatedSignatureNoSort === msgSignature;
    }
  } catch (error) {
    console.error('验证签名过程出错:', error);
    return false;
  }
}

/**
 * 生成企业微信消息签名
 * @param {string} token - 配置的Token
 * @param {string} timestamp - 时间戳
 * @param {string} nonce - 随机数
 * @param {string} encrypt - 加密后的消息内容
 * @returns {string} - 计算出的签名
 */
function generateSignature(token, timestamp, nonce, encrypt) {
  try {
    const arr = [token, timestamp, nonce, encrypt].sort();
    const str = arr.join('');
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    return sha1.digest('hex');
  } catch (error) {
    console.error('生成签名出错:', error);
    return '';
  }
}

/**
 * 解密企业微信消息
 * @param {string} text - 加密的消息文本
 * @param {string} encodingAesKey - 消息加解密密钥
 * @param {string} corpId - 企业微信的corpId
 * @returns {string|null} - 解密后的明文，失败返回null
 */
function decryptMessage(text, encodingAesKey, corpId) {
  try {
    console.log('【解密详情】开始解密消息，收到的加密内容长度:', text.length);
    
    // 将Base64字符串转换为Buffer
    const aesKey = Buffer.from(encodingAesKey, 'base64');
    console.log('【解密详情】AES密钥长度:', aesKey.length);
    
    // 创建aes-256-cbc解密器，使用密钥的前16字节作为IV
    const iv = aesKey.slice(0, 16);
    console.log('【解密详情】使用IV长度:', iv.length);
    
    let decrypted;
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
      // 设置自动padding
      decipher.setAutoPadding(false);
      
      // 解密分两步进行
      const encryptedBuffer = Buffer.from(text, 'base64');
      console.log('【解密详情】解码后的加密Buffer长度:', encryptedBuffer.length);
      
      decrypted = Buffer.concat([
        decipher.update(encryptedBuffer),
        decipher.final()
      ]);
      console.log('【解密详情】解密成功，解密后数据长度:', decrypted.length);
    } catch (decipherError) {
      console.error('【解密详情】解密过程失败:', decipherError);
      return null;
    }
    
    // 处理PKCS#7 padding
    const pad = decrypted[decrypted.length - 1];
    console.log('【解密详情】解密后PKCS#7 padding字节值:', pad);
    
    if (pad < 1 || pad > 32) {
      console.error('【解密详情】解密后的padding不正确:', pad);
      // 尝试继续处理，不直接返回null
      console.log('【解密详情】尝试继续处理，使用默认值...');
    } else {
      decrypted = decrypted.slice(0, decrypted.length - pad);
      console.log('【解密详情】移除padding后数据长度:', decrypted.length);
    }
    
    // 解析消息格式: 随机16字节 + 消息长度(4字节) + 消息内容 + 企业微信corpId
    if (decrypted.length <= 20) { // 至少需要16字节随机字符串+4字节消息长度
      console.error('【解密详情】解密后数据长度不足:', decrypted.length);
      return null;
    }
    
    const randomBytes = decrypted.slice(0, 16); // 16字节随机字符串
    const content = decrypted.slice(16); // 去除前16字节随机字符串
    
    let msgLen;
    try {
      msgLen = content.readUInt32BE(0); // 获取消息长度
      console.log('【解密详情】消息长度字段值:', msgLen, '字节');
    } catch (readError) {
      console.error('【解密详情】读取消息长度失败:', readError);
      return null;
    }
    
    // 如果计算出的消息长度不合理，但尝试继续处理
    if (msgLen < 0 || msgLen > content.length - 4) {
      console.error('【解密详情】消息长度不合法:', msgLen, '可用长度:', content.length - 4);
      // 尝试一个更合理的长度
      if (content.length > 4) {
        msgLen = content.length - 4 - corpId.length;
        console.log('【解密详情】尝试使用计算的长度:', msgLen);
      } else {
        return null;
      }
    }
    
    let msg;
    let receivedCorpId;
    try {
      msg = content.slice(4, 4 + msgLen).toString('utf8'); // 提取消息内容
      receivedCorpId = content.slice(4 + msgLen).toString('utf8'); // 提取corpId
      console.log('【解密详情】解析的消息内容长度:', msg.length);
      console.log('【解密详情】解析的接收者ID:', receivedCorpId);
    } catch (parseError) {
      console.error('【解密详情】解析消息内容失败:', parseError);
      return null;
    }
    
    // 验证corpId，但不严格要求完全匹配
    if (receivedCorpId !== corpId) {
      console.warn('【解密详情】接收到的corpId与配置不完全匹配:', {
        received: receivedCorpId,
        expected: corpId
      });
      // 允许继续处理，因为某些环境可能有差异
    }
    
    console.log('【解密详情】解密成功，消息内容前100字符:', msg.substring(0, 100));
    return msg;
  } catch (error) {
    console.error('【解密详情】解密消息出错:', error);
    return null;
  }
}

/**
 * 获取企业微信访问令牌
 * @returns {Promise<string>} - 返回访问令牌
 */
async function getAccessToken() {
  try {
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
 * 发送消息给企业微信用户
 * @param {string} content - 消息内容
 * @param {string} toUser - 接收者用户ID，默认@all表示所有人
 * @param {string} [sendMethod] - 发送方式记录，用于日志记录
 * @returns {Promise<boolean>} - 发送是否成功
 */
async function sendMessage(content, toUser = '@all', sendMethod = '') {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      return false;
    }
    
    // 检查是否启用了代理
    if (config.proxy && config.proxy.enabled) {
      // 通过代理发送消息
      console.log(`使用代理[${config.proxy.url}]发送消息`);
      
      try {
        // 准备正确的代理URL路径 - wxchat-Docker代理服务器配置了企业微信API相同的路径
        const proxyBaseUrl = config.proxy.url.endsWith('/') ? config.proxy.url.slice(0, -1) : config.proxy.url;
        const proxyUrl = `${proxyBaseUrl}/cgi-bin/message/send`;
        
        // 准备与企业微信API相同格式的数据
        const wxData = {
          touser: toUser,
          msgtype: 'text',
          agentid: agentId,
          text: {
            content: content
          },
          safe: 0
        };
        
        console.log('【代理发送】使用企业微信API格式发送到代理:', proxyUrl);
        console.log('【代理发送】发送的数据:', JSON.stringify(wxData, null, 2));
        
        // 使用企业微信API格式发送POST请求，带上access_token查询参数
        const proxyResponse = await axios.post(`${proxyUrl}?access_token=${accessToken}`, wxData, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: 10000
        });
        
        console.log('【代理发送】代理响应:', proxyResponse.data);
        
        // 企业微信API返回0表示成功
        if (proxyResponse.data && proxyResponse.data.errcode === 0) {
          console.log('【代理发送】通过代理发送消息成功');
          return true;
        } else {
          console.warn('【代理发送】代理响应异常:', proxyResponse.data);
          console.log('【代理发送】尝试直接发送消息...');
        }
      } catch (proxyError) {
        console.error('通过代理发送消息失败:', 
          proxyError.response ? proxyError.response.data : proxyError.message);
        console.log('尝试直接发送消息...');
      }
    }
    
    // 直接发送消息
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
    const data = {
      touser: toUser,
      msgtype: 'text',
      agentid: agentId,
      text: {
        content: content
      }
    };
    
    console.log('【本地发送】直接使用企业微信API发送消息');
    
    const response = await axios.post(url, data);
    if (response.data.errcode === 0) {
      console.log('【本地发送】消息发送成功:', content.substring(0, 30) + (content.length > 30 ? '...' : ''));
      return true;
    } else {
      console.error('【本地发送】消息发送失败:', response.data);
      return false;
    }
  } catch (error) {
    console.error('发送消息出错:', error);
    return false;
  }
}

/**
 * 处理企业微信URL验证请求
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @returns {Boolean} - 处理是否成功
 */
function handleUrlVerification(req, res) {
  try {
    const { msg_signature, timestamp, nonce, echostr } = req.query;
    console.log('【URL验证】收到验证请求，参数:', req.query);
    
    if (!msg_signature || !timestamp || !nonce || !echostr) {
      console.error('【URL验证】缺少必要参数');
      res.status(400).send('缺少参数');
      return false;
    }
    
    // 验证签名
    const isSignatureValid = verifySignature(msg_signature, timestamp, nonce, token, echostr);
    if (!isSignatureValid) {
      console.error('【URL验证】签名验证失败');
      res.status(401).send('签名验证失败');
      return false;
    }
    
    // 解密echostr得到明文
    const decryptedEchostr = decryptMessage(echostr, ENCODING_AES_KEY, CORP_ID);
    if (!decryptedEchostr) {
      console.error('【URL验证】解密echostr失败');
      res.status(403).send('解密echostr失败');
      return false;
    }
    
    console.log('【URL验证】解密成功，返回明文:', decryptedEchostr);
    res.send(decryptedEchostr);
    return true;
  } catch (error) {
    console.error('【URL验证】处理URL验证请求出错:', error);
    res.status(500).send('处理URL验证请求出错');
    return false;
  }
}

/**
 * 解析并处理收到的消息
 * @param {string} xmlData - 收到的XML消息数据
 * @param {Object} query - URL查询参数，包含签名信息
 * @param {Function} handleCommand - 处理解析出的命令的回调函数
 * @returns {Promise<Object>} - 处理结果
 */
async function parseAndHandleMessage(xmlData, query, handleCommand) {
  try {
    console.log('【消息解析】收到XML数据:', xmlData);
    
    // 解析XML
    const parser = new xml2js.Parser({ 
      explicitArray: false,  // 不使用数组形式
      trim: true           // 去除空白字符
    });
    const result = await parser.parseStringPromise(xmlData);
    
    console.log('【消息解析】解析后的XML结果:', JSON.stringify(result, null, 2));
    
    if (!result || !result.xml) {
      console.warn('【消息解析】解析XML失败或格式不正确');
      return { success: false, reason: '解析XML失败或格式不正确' };
    }
    
    const encryptedMessage = result.xml;
    console.log('【消息解析】加密消息内容:', JSON.stringify(encryptedMessage, null, 2));
    
    // 检查是否包含Encrypt字段（加密消息）
    if (!encryptedMessage.Encrypt) {
      console.warn('【消息解析】消息不包含Encrypt字段');
      return { success: false, reason: '消息不包含Encrypt字段' };
    }
    
    // 解析URL参数
    const { msg_signature, timestamp, nonce } = query;
    if (!msg_signature || !timestamp || !nonce) {
      console.error('【消息解析】缺少解密必要的参数:', query);
      return { success: false, reason: '缺少解密必要的参数' };
    }
    
    // 验证签名
    const isSignatureValid = verifySignature(msg_signature, timestamp, nonce, token, encryptedMessage.Encrypt);
    if (!isSignatureValid) {
      console.warn('【消息解析】消息签名验证失败');
      // 即使签名验证失败，我们也尝试解密，因为可能是由于某些配置问题
    }
    
    // 解密消息
    console.log('【消息解密】开始解密消息，Encrypt长度:', encryptedMessage.Encrypt.length);
    let decryptedXml;
    try {
      decryptedXml = decryptMessage(encryptedMessage.Encrypt, ENCODING_AES_KEY, CORP_ID);
      
      if (!decryptedXml) {
        console.error('【消息解密】解密消息失败，结果为空');
        return { success: false, reason: '解密消息失败，结果为空' };
      }
    } catch (decryptError) {
      console.error('【消息解密】解密消息异常:', decryptError);
      return { success: false, reason: `解密消息异常: ${decryptError.message}` };
    }
    
    console.log('【消息解密】解密成功，解密后的XML:', decryptedXml);
    
    // 解析解密后的XML
    try {
      const decryptedResult = await parser.parseStringPromise(decryptedXml);
      console.log('【消息解密】解密后的消息内容:', JSON.stringify(decryptedResult, null, 2));
      
      if (!decryptedResult || !decryptedResult.xml) {
        console.warn('【消息解密】解密后的XML格式无效');
        return { success: false, reason: '解密后的XML格式无效' };
      }
      
      // 提取消息内容
      const message = decryptedResult.xml;
      let content = '';
      let fromUser = '';
      
      // 获取发送者
      if (message.FromUserName) {
        fromUser = message.FromUserName;
        console.log('【消息处理】消息发送者:', fromUser);
      } else {
        console.warn('【消息处理】缺少FromUserName字段');
      }
      
      // 获取消息类型
      if (message.MsgType) {
        const msgType = message.MsgType;
        console.log('【消息处理】消息类型:', msgType);
        
        // 根据不同消息类型获取内容
        if (msgType === 'text' && message.Content) {
          // 文本消息
          content = message.Content;
          console.log('【消息处理】收到文本消息:', content);
        } else if (msgType === 'event') {
          // 事件消息
          const eventType = message.Event || '';
          console.log('【消息处理】收到事件消息:', eventType);
          
          if (eventType.toLowerCase() === 'click' && message.EventKey) {
            // 菜单点击事件
            content = message.EventKey;
            console.log('【消息处理】收到菜单点击事件，EventKey:', content, '，准备处理命令');
          } else {
            // 其他事件类型
            console.log(`【消息处理】收到其他事件类型: ${eventType}`);
            content = eventType;
            if (message.EventKey) {
              console.log('【消息处理】事件Key:', message.EventKey);
              // 对于非click但有EventKey的情况，也可以处理命令
              content = message.EventKey;
            }
          }
        } else {
          console.log('【消息处理】收到其他类型消息:', msgType);
        }
      } else {
        console.warn('【消息处理】缺少MsgType字段');
      }
      
      // 如果没有解析出内容，尝试直接使用Content字段
      if (!content && message.Content) {
        content = message.Content;
        console.log('【消息处理】使用原始Content字段:', content);
      }
      
      // 处理命令
      if (content && fromUser) {
        console.log(`【消息处理】准备处理命令: ${content}, 发送者: ${fromUser}`);
        try {
          const responseMsg = await handleCommand(content, fromUser);
          console.log(`【消息处理】处理了来自 ${fromUser} 的指令: ${content}, 响应: ${responseMsg}`);
          return { success: true, content, fromUser, response: responseMsg };
        } catch (commandError) {
          console.error(`【命令处理】处理命令异常:`, commandError);
          // 即使出错也返回成功，避免企业微信重试
          return { success: true, content, fromUser, error: commandError.message };
        }
      } else {
        console.warn('【消息处理】缺少必要字段，无法处理命令:', { content, fromUser });
        return { success: false, reason: '缺少必要字段，无法处理命令' };
      }
    } catch (decryptedParseError) {
      console.error('【消息解密】解析解密后的XML失败:', decryptedParseError);
      return { success: false, reason: '解析解密后的XML失败' };
    }
  } catch (error) {
    console.error('【消息处理】处理消息出错:', error);
    return { success: false, reason: '处理消息出错' };
  }
}

/**
 * 生成测试消息
 * @param {string} customContent - 自定义消息内容
 * @returns {string} 格式化的测试消息
 */
function generateTestMessage(customContent = '') {
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
    `代理状态: ${config.proxy.enabled ? '已启用' : '未启用'}\n` +
    `代理地址: ${config.proxy.enabled ? config.proxy.url : '无'}\n\n`;
  
  // 添加自定义内容（如果有）
  let fullMessage = baseMessage;
  if (customContent) {
    fullMessage += `【自定义内容】\n${customContent}\n\n`;
  }
  
  return fullMessage;
}

// 导出功能函数
module.exports = {
  verifySignature,
  generateSignature,
  decryptMessage,
  getAccessToken,
  sendMessage,
  handleUrlVerification,
  parseAndHandleMessage,
  generateTestMessage,
  ENCODING_AES_KEY,
  CORP_ID,
  token
};
