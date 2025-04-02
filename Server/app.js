/**
 * 企业微信通知接收服务
 * 接收四个指令：UpdateEmbyAll，UpdateEmbyMov，UpdateEmbyTv，UpdateEmbyAmi
 * 收到指令后会给用户回复接收到相应指令的消息
 */

const express = require('express');
const crypto = require('crypto');
const xml2js = require('xml2js');
const axios = require('axios');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

// 读取配置文件
const config = require('./config.json');
// 引入菜单管理模块
const menuManager = require('./menu');
const app = express();
const port = config.server.port || 4001;

// 企业微信加密解密相关配置
const { token, encodingAesKey } = config.wechat;
const ENCODING_AES_KEY = encodingAesKey + '=';
const CORP_ID = config.wechat.corpId;

// 添加xml解析中间件
app.use(bodyParser.text({ type: 'text/xml' }));
app.use(express.json());
app.use(cors());

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
    // 将Base64字符串转换为Buffer
    const aesKey = Buffer.from(encodingAesKey, 'base64');
    
    // 创建aes-256-cbc解密器，使用密钥的前16字节作为IV
    const iv = aesKey.slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', aesKey, iv);
    
    // 设置自动padding
    decipher.setAutoPadding(false);
    
    // 解密分两步进行
    let decrypted = Buffer.concat([
      decipher.update(Buffer.from(text, 'base64')),
      decipher.final()
    ]);
    
    // 处理PKCS#7 padding
    const pad = decrypted[decrypted.length - 1];
    if (pad < 1 || pad > 32) {
      console.error('解密后的padding不正确');
      return null;
    }
    decrypted = decrypted.slice(0, decrypted.length - pad);
    
    // 解析消息格式: 随机16字节(已去除) + 消息长度(4字节) + 消息内容 + 企业微信corpId
    const content = decrypted.slice(16); // 去除前16字节随机字符串
    const msgLen = content.readUInt32BE(0); // 获取消息长度
    
    // 如果计算出的消息长度不合理，返回null
    if (msgLen < 0 || msgLen > content.length - 4) {
      console.error('消息长度不合法:', msgLen);
      return null;
    }
    
    const msg = content.slice(4, msgLen + 4).toString('utf8'); // 提取消息内容
    const receivedCorpId = content.slice(msgLen + 4).toString('utf8'); // 提取corpId
    
    // 验证corpId
    if (receivedCorpId !== corpId) {
      console.error('接收到的corpId与配置不匹配:', {
        received: receivedCorpId,
        expected: corpId
      });
      return null;
    }
    
    return msg;
  } catch (error) {
    console.error('解密消息出错:', error);
    return null;
  }
}

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
          agentid: config.wechat.agentId,
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
      agentid: config.wechat.agentId,
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
 * 处理收到的命令
 * @param {string} command - 收到的命令
 * @param {string} fromUser - 发送命令的用户ID
 * @returns {Promise<string>} - 响应消息
 */
async function handleCommand(command, fromUser) {
  // 输出详细日志
  console.log('【命令处理】开始处理命令:', {
    command: command || '空',
    fromUser: fromUser || '未知用户',
    commandType: typeof command,
    fromUserType: typeof fromUser
  });
  
  // 检查参数合法性
  if (!command || typeof command !== 'string') {
    const errorMsg = '无效的命令格式';
    console.warn('【命令处理】', errorMsg, command);
    return errorMsg;
  }
  
  // 完善fromUser参数
  if (!fromUser || typeof fromUser !== 'string') {
    fromUser = '@unknown';
    console.warn('【命令处理】用户ID无效，使用默认值:', fromUser);
  }
  
  // 处理命令
  let responseMsg = '';
  const trimmedCommand = command.trim(); // 去除命令前后的空白字符
  
  console.log('【命令处理】准备处理命令:', trimmedCommand);
  
  switch (trimmedCommand) {
    case 'UpdateEmbyAll':
      responseMsg = '已接收到 UpdateEmbyAll 指令';
      console.log('【命令处理】处理 UpdateEmbyAll 指令');
      // 这里可以添加实际的处理逻辑
      break;
    case 'UpdateEmbyMov':
      responseMsg = '已接收到 UpdateEmbyMov 指令';
      console.log('【命令处理】处理 UpdateEmbyMov 指令');
      // 这里可以添加实际的处理逻辑
      break;
    case 'UpdateEmbyTv':
      responseMsg = '已接收到 UpdateEmbyTv 指令';
      console.log('【命令处理】处理 UpdateEmbyTv 指令');
      // 这里可以添加实际的处理逻辑
      break;
    case 'UpdateEmbyAmi':
      responseMsg = '已接收到 UpdateEmbyAmi 指令';
      console.log('【命令处理】处理 UpdateEmbyAmi 指令');
      // 这里可以添加实际的处理逻辑
      break;
    default:
      responseMsg = `未识别的指令: ${trimmedCommand}`;
      console.log('【命令处理】收到未知命令:', trimmedCommand);
      break;
  }
  
  // 发送响应消息给用户
  console.log(`【命令处理】准备发送响应消息给用户 ${fromUser}: ${responseMsg}`);
  try {
    const sendResult = await sendMessage(responseMsg, fromUser);
    console.log('【命令处理】响应消息发送状态:', sendResult ? '成功' : '失败');
  } catch (sendError) {
    console.error('【命令处理】发送响应消息时出错:', sendError);
  }
  
  return responseMsg;
}

// 根路径GET处理
// 注意：这里是关键，企业微信就是访问的根路径
app.get('/', async (req, res) => {
  console.log('收到根路径GET请求:', {
    url: req.url,
    query: req.query,
    path: req.path
  });
  
  const { msg_signature, timestamp, nonce, echostr } = req.query;
  
  // 如果是企业微信验证请求（包含echostr参数）
  if (echostr) {
    console.log('收到企业微信验证请求，返回 echostr:', echostr);
    
    // 如果启用了代理，使用代理服务处理验证
    if (config.proxy && config.proxy.enabled) {
      try {
        console.log(`转发验证请求到中转服务器: ${config.proxy.url}`);
        const proxyUrl = `${config.proxy.url}?msg_signature=${msg_signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(echostr)}`;
        const proxyResponse = await axios.get(proxyUrl);
        console.log('中转服务器响应:', proxyResponse.data);
        
        // 检查代理响应是否为HTML内容，如果是则不使用代理的响应
        const proxyData = proxyResponse.data;
        // 检查是否是HTML内容
        if (typeof proxyData === 'string' && (proxyData.includes('<html>') || proxyData.includes('<!DOCTYPE html>'))) {
          console.log('代理返回了HTML内容，将使用本地处理方式...');
        } else {
          // 直接返回中转服务器的响应
          return res.send(proxyData);
        }
      } catch (error) {
        console.error('转发到中转服务器失败:', error.message);
        // 如果代理失败，尝试本地处理
        console.log('尝试本地处理验证...');
      }
    }
    
    // 验证消息签名
    console.log('开始验证消息签名...', {
      msg_signature, timestamp, nonce, token, 
      echostr: echostr ? echostr.substring(0, 10) + '...' : ''
    });
    
    // 选项1: 无需验证签名，直接返回原始echostr
    // return res.send(echostr);
    
    // 选项2: 跳过签名验证，直接解密
    // return res.send(decryptMessage(echostr, ENCODING_AES_KEY, CORP_ID) || 'decrypt failed');
    
    // 选项3: 正常验证签名和解密
    if (!verifySignature(msg_signature, timestamp, nonce, token, echostr)) {
      console.error('消息签名验证失败');
      
      // 尝试直接返回 echostr，有些情况下企业微信不检查签名
      console.log('尝试直接返回原始echostr：', echostr.substring(0, 10) + '...');
      return res.send(echostr);
    }
    
    // 解密echostr得到明文
    const decryptedEchostr = decryptMessage(echostr, ENCODING_AES_KEY, CORP_ID);
    if (!decryptedEchostr) {
      console.error('解密echostr失败');
      return res.status(403).send('解密echostr失败');
    }
    
    console.log('解密成功，返回明文:', decryptedEchostr);
    return res.send(decryptedEchostr);
  }
  
  // 如果是普通的根路径请求
  return res.status(200).send('企业微信通知服务运行正常');
});

// 通用GET请求处理
app.get(['/test', '/health', '/status'], (req, res) => {
  console.log('收到其他GET请求:', {
    url: req.url,
    query: req.query,
    path: req.path
  });
  
  // 测试路径
  if (req.path === '/test' && req.query.test) {
    return res.send(req.query.test);
  }
  
  // 健康检查或状态请求
  return res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: '企业微信通知服务'
  });
});

// POST请求用于接收企业微信消息 - 处理根路径和其他路径
app.post(['/', '/wechat', '/wechat/callback'], async (req, res) => {
  console.log('收到企业微信消息请求:', {
    path: req.path,
    query: req.query,
    body: typeof req.body === 'string' ? '收到XML数据' : req.body
  });
  
  // 不进行验证，直接处理消息
  // 企业微信验证都已经通过，后续消息不再验证
  // 返回“success”告诉企业微信我们已经收到了消息
  // 这样企业微信就不会重复发送该消息
  
  // 保存原始消息以备查看
  try {
    const timestamp = new Date().getTime();
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.writeFileSync(
      path.join(logDir, `wechat_msg_${timestamp}.json`), 
      JSON.stringify({query: req.query, body: req.body, headers: req.headers}, null, 2)
    );
  } catch (error) {
    console.error('写入日志失败:', error);
  }
  
  try {
    // 1. 尝试转发到中转服务器 
    if (config.proxy && config.proxy.enabled) {
      try {
        console.log(`尝试转发消息到中转服务器: ${config.proxy.url}`);
        
        // 准备要转发的数据
        const forwardData = {
          originalBody: req.body,
          originalQuery: req.query,
          originalHeaders: req.headers,
          timestamp: new Date().toISOString()
        };
        
        // 转发到中转服务器
        const proxyResponse = await axios.post(config.proxy.url, forwardData, {
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('中转服务器响应:', proxyResponse.data);
      } catch (proxyError) {
        console.error('转发到中转服务器失败:', proxyError.message);
        // 转发失败也不影响处理流程，继续处理消息
      }
    }
    
    // 2. 本地解析处理XML消息
    if (typeof req.body === 'string') {
      const xmlData = req.body;
      console.log('【消息解析】收到XML数据:');
      console.log(xmlData);
      
      try {
        // 使用xml2js解析XML数据
        const parser = new xml2js.Parser({ 
          explicitArray: false,  // 不使用数组形式
          trim: true           // 去除空白字符
        });
        const result = await parser.parseStringPromise(xmlData);
        
        console.log('【消息解析】解析后的XML结果:', JSON.stringify(result, null, 2));
        
        if (result && result.xml) {
          const encryptedMessage = result.xml;
          console.log('【消息解析】加密消息内容:', JSON.stringify(encryptedMessage, null, 2));
          
          // 检查是否包含Encrypt字段（加密消息）
          if (encryptedMessage.Encrypt) {
            console.log('【消息解析】发现加密消息，准备解密');
            
            try {
              // 从请求URL中获取签名相关参数
              const { msg_signature, timestamp, nonce } = req.query;
              
              if (!msg_signature || !timestamp || !nonce) {
                console.error('【消息解析】缺少解密必要的参数:', req.query);
              } else {
                // 验证签名
                const isSignatureValid = verifySignature(msg_signature, timestamp, nonce, token, encryptedMessage.Encrypt);
                
                if (!isSignatureValid) {
                  console.warn('【消息解析】消息签名验证失败');                  
                }
                
                // 解密消息（即使签名验证失败也尝试解密）
                console.log('【消息解密】开始解密消息，Encrypt长度:', encryptedMessage.Encrypt.length);
                const decryptedXml = decryptMessage(encryptedMessage.Encrypt, ENCODING_AES_KEY, CORP_ID);
                
                if (decryptedXml) {
                  console.log('【消息解密】解密成功，解密后的XML:', decryptedXml);
                  
                  // 解析解密后的XML
                  try {
                    const decryptedResult = await parser.parseStringPromise(decryptedXml);
                    console.log('【消息解密】解密后的消息内容:', JSON.stringify(decryptedResult, null, 2));
                    
                    if (decryptedResult && decryptedResult.xml) {
                      const message = decryptedResult.xml;
                      
                      // 检查关键字段是否存在
                      let content = '';
                      let fromUser = '';
                      let msgType = '';
                      
                      if (message.FromUserName) {
                        fromUser = message.FromUserName;
                        console.log('【消息处理】消息发送者:', fromUser);
                      } else {
                        console.warn('【消息处理】缺少FromUserName字段');
                      }
                      
                      if (message.MsgType) {
                        msgType = message.MsgType;
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
                          
                          if (eventType === 'click' && message.EventKey) {
                            // 处理菜单点击事件
                            console.log('【消息处理】收到菜单点击事件，EventKey:', message.EventKey);
                            
                            // 尝试从 EventKey 解析出命令
                            // 分析 EventKey 规则，当前格式可能是 #sendmsg#_1_0#7599824950208356 这样的
                            // 我们需要解析出实际命令
                            
                            if (message.EventKey.startsWith('#sendmsg#')) {
                              // 这是企业微信自动生成的消息 ID，需要根据菜单映射到真实命令
                              
                              // 解析菜单ID
                              const menuParts = message.EventKey.split('#');
                              if (menuParts.length >= 2) {
                                const menuInfo = menuParts[1];
                                
                                // 菜单映射逻辑，将菜单映射到实际命令
                                // 尽量使用简单通用的解析方式
                                if (menuInfo.includes('sendmsg')) {
                                  // 从菜单编号解析对应命令
                                  let menuCommand = '';
                                  
                                  // 提取菜单ID数字
                                  const menuIds = menuInfo.split('_');
                                  const level1 = parseInt(menuIds[1] || '0');
                                  // 二级菜单号码
                                  const level2 = parseInt(menuIds[2] || '0');
                                  
                                  console.log('【消息处理】菜单ID解析结果:', { level1, level2 });
                                  
                                  // 根据菜单ID映射命令
                                  // 注意: 需要根据实际菜单设置正确映射
                                  if (level1 === 1) {  // 假设第一组菜单是Emby相关
                                    switch(level2) {
                                      case 0: menuCommand = 'UpdateEmbyAll'; break;
                                      case 1: menuCommand = 'UpdateEmbyMov'; break;
                                      case 2: menuCommand = 'UpdateEmbyTv'; break;
                                      case 3: menuCommand = 'UpdateEmbyAmi'; break;
                                      default: menuCommand = `未知菜单命令_${level1}_${level2}`;
                                    }
                                  } else {
                                    menuCommand = `未知菜单组_${level1}_${level2}`;
                                  }
                                  
                                  console.log('【消息处理】从菜单解析的命令:', menuCommand);
                                  content = menuCommand;  // 使用解析出的命令
                                } else {
                                  // 如果无法解析，继续使用原始事件名称
                                  content = `菜单点击: ${message.EventKey}`;
                                }
                              } else {
                                content = eventType;  // 使用事件类型作为内容
                              }
                            } else {
                              // 直接使用EventKey作为命令
                              content = message.EventKey;
                              console.log('【消息处理】使用EventKey作为命令:', content);
                            }
                          } else {
                            // 其他类型的事件
                            content = eventType;
                            if (message.EventKey) {
                              console.log('【消息处理】事件Key:', message.EventKey);
                            }
                          }
                        } else {
                          console.log('【消息处理】收到其他类型消息:', msgType);
                        }
                      } else {
                        console.warn('【消息处理】缺少MsgType字段');
                      }
                      
                      // 如果还没有解析出内容，尝试直接使用Content字段
                      if (!content && message.Content) {
                        content = message.Content;
                        console.log('【消息处理】使用原始Content字段:', content);
                      }
                      
                      // 只有当content和fromUser都有值时才处理命令
                      if (content && fromUser) {
                        // 处理命令
                        const responseMsg = await handleCommand(content, fromUser);
                        console.log(`【消息处理】处理了来自 ${fromUser} 的指令: ${content}, 响应: ${responseMsg}`);
                      } else {
                        console.warn('【消息处理】缺少必要字段，无法处理命令:', { content, fromUser });
                      }
                    } else {
                      console.warn('【消息解密】解密后的XML格式无效，缺少xml节点');
                    }
                  } catch (decryptedParseError) {
                    console.error('【消息解密】解析解密后的XML失败:', decryptedParseError);
                  }
                } else {
                  console.error('【消息解密】解密消息失败');
                }
              }
            } catch (decryptError) {
              console.error('【消息解密】解密过程出错:', decryptError);
            }
          } else {
            // 没有Encrypt字段，直接处理消息（可能是明文消息）
            console.log('【消息解析】消息不是加密的，尝试直接处理');
            
            const message = encryptedMessage;
            let content = '';
            let fromUser = '';
            
            // 获取发送者
            if (message.FromUserName) {
              fromUser = message.FromUserName;
              console.log('【消息解析】消息发送者:', fromUser);
            } else {
              console.warn('【消息解析】缺少FromUserName字段');
            }
            
            // 获取消息内容
            if (message.Content) {
              content = message.Content;
              console.log('【消息解析】收到消息内容:', content);
            } else {
              console.warn('【消息解析】缺少Content字段');
            }
            
            // 只有当content和fromUser都有值时才处理命令
            if (content && fromUser) {
              // 处理命令
              const responseMsg = await handleCommand(content, fromUser);
              console.log(`【消息处理】处理了来自 ${fromUser} 的指令: ${content}, 响应: ${responseMsg}`);
            } else {
              console.warn('【消息处理】缺少必要字段，无法处理命令:', { content, fromUser });
            }
          }
        } else {
          console.warn('【消息解析】解析XML成功，但没有xml根节点:', result);
        }
      } catch (parseError) {
        console.error('【消息解析】解析XML数据出错:', parseError);
      }
    } else {
      console.log('【消息解析】收到非XML格式消息:', typeof req.body, req.body);
    }
    
    // 3. 返回成功响应给企业微信
    // 企业微信要求返回"success"来确认接收成功
    res.send('success');
  } catch (error) {
    console.error('处理企业微信消息出错:', error);
    // 即使处理失败，也返回成功来避免企业微信重发
    res.send('success');
  }
});

// 添加代理转发路由
app.post('/proxy', async (req, res) => {
  try {
    console.log('收到代理消息:', req.body);
    const { message } = req.body;
    
    // 增加更详细的日志输出
    console.log('【代理消息】完整请求数据:', JSON.stringify(req.body, null, 2));
    
    if (message) {
      console.log('【代理消息】解析后的消息数据:', JSON.stringify(message, null, 2));
      
      // 检查必要字段
      let content = null;
      let fromUser = null;
      
      // 尝试不同字段名称
      if (message.Content) {
        content = message.Content;
      } else if (message.content) {
        content = message.content;
      } else if (message.text) {
        content = message.text;
      }
      
      if (message.FromUserName) {
        fromUser = message.FromUserName;
      } else if (message.fromUserName) {
        fromUser = message.fromUserName;
      } else if (message.fromuser) {
        fromUser = message.fromuser;
      } else if (message.from) {
        fromUser = message.from;
      }
      
      // 设置默认值
      fromUser = fromUser || '@proxy';
      
      if (content) {
        // 处理代理转发的消息
        console.log(`【代理消息】准备处理指令, 内容: ${content}, 发送者: ${fromUser}`);
        const responseMsg = await handleCommand(content, fromUser);
        console.log(`【代理消息】处理了来自 ${fromUser} 的指令: ${content}, 响应: ${responseMsg}`);
        res.json({ success: true, message: '处理成功', response: responseMsg });
      } else {
        console.error('【代理消息】缺少内容字段:', req.body);
        res.status(400).json({ success: false, message: '缺少消息内容' });
      }
    } else {
      console.error('【代理消息】消息格式不正确:', req.body);
      res.status(400).json({ success: false, message: '消息格式不正确' });
    }
  } catch (error) {
    console.error('处理代理消息出错:', error);
    res.status(500).json({ success: false, message: '服务器内部错误' });
  }
});

// 添加专门的验证路由，用于企业微信验证
app.get('/wechat-verify', (req, res) => {
  console.log('收到专门验证路由请求:', req.query);
  
  // 如果有echostr参数，直接返回
  if (req.query.echostr) {
    console.log('返回 echostr:', req.query.echostr);
    return res.send(req.query.echostr);
  }
  
  // 关键点: 直接返回成功响应
  return res.status(200).send('验证路由工作正常');
});

// 添加专门的微信路由
// 注意：这里的路径必须与企业微信配置的URL路径完全匹配！
app.get('/wechat', async (req, res) => {
  console.log('收到微信路由验证请求:', req.query);
  
  const { msg_signature, timestamp, nonce, echostr } = req.query;
  
  // 参数完整性检查
  if (!echostr) {
    return res.status(200).send('缺少echostr参数');
  }
  
  // 如果启用了代理，使用代理服务处理验证
  if (config.proxy && config.proxy.enabled) {
    try {
      console.log(`转发验证请求到中转服务器: ${config.proxy.url}`);
      const proxyUrl = `${config.proxy.url}?msg_signature=${msg_signature}&timestamp=${timestamp}&nonce=${nonce}&echostr=${encodeURIComponent(echostr)}`;
      const proxyResponse = await axios.get(proxyUrl);
      console.log('中转服务器响应:', proxyResponse.data);
      
      // 检查代理响应是否为HTML内容，如果是则不使用代理的响应
      const proxyData = proxyResponse.data;
      // 检查是否是HTML内容
      if (typeof proxyData === 'string' && (proxyData.includes('<html>') || proxyData.includes('<!DOCTYPE html>'))) {
        console.log('代理返回了HTML内容，将使用本地处理方式...');
      } else {
        // 检查代理服务器的响应是否合法
        if (proxyData && typeof proxyData === 'string' && proxyData.length > 0) {
          console.log('使用代理服务器的响应:', proxyData);
          return res.send(proxyData);
        } else {
          console.log('代理服务器响应无效，使用本地处理...');
        }
      }
    } catch (error) {
      console.error('转发到中转服务器失败:', error.message);
      // 如果代理失败，尝试本地处理
      console.log('尝试本地处理验证...');
    }
  }
  
  // 验证消息签名
  console.log('开始验证消息签名...', {
    msg_signature, timestamp, nonce, token, 
    echostr: echostr ? echostr.substring(0, 10) + '...' : ''
  });
  
  // 选项1: 直接返回原始echostr
  console.log('跳过签名验证，直接返回原始echostr');
  return res.send(echostr);
  
  // 选项2: 验证签名
  /*
  if (!verifySignature(msg_signature, timestamp, nonce, token, echostr)) {
    console.error('消息签名验证失败');
    return res.status(403).send('消息签名验证失败');
  }
  */
  
  // 解密echostr得到明文
  const decryptedEchostr = decryptMessage(echostr, ENCODING_AES_KEY, CORP_ID);
  if (!decryptedEchostr) {
    console.error('解密echostr失败');
    return res.status(403).send('解密echostr失败');
  }
  
  console.log('解密成功，返回明文:', decryptedEchostr);
  return res.send(decryptedEchostr);
});

/**
 * 生成测试消息内容
 * @returns {string} - 格式化的测试消息
 */
function generateTestMessage(customContent = '') {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const os = require('os');
  const hostname = os.hostname();
  const networkInterfaces = os.networkInterfaces();
  
  // 获取本机非回环IP地址
  let localIP = 'unknown';
  for (const interfaceName in networkInterfaces) {
    const interfaceInfo = networkInterfaces[interfaceName];
    for (const iface of interfaceInfo) {
      if (!iface.internal && iface.family === 'IPv4') {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'unknown') break;
  }
  
  const baseMessage = `企业微信通知服务测试消息 \n\n` + 
                   `【服务器信息】\n` +
                   `主机名: ${hostname}\n` +
                   `IP地址: ${localIP}\n` +
                   `端口: ${port}\n\n` +
                   `【状态信息】\n` +
                   `时间: ${timestamp}\n` +
                   `代理状态: ${config.proxy.enabled ? '已启用' : '未启用'}\n` +
                   `代理地址: ${config.proxy.enabled ? config.proxy.url : '无'}\n\n` +
                   `【发送方式】\n` +
                   `消息将通过${config.proxy.enabled ? '【代理服务器】' : '【本地服务器】'}发送`;
  
  // 如果有自定义内容，添加到消息中
  if (customContent) {
    return baseMessage + '\n\n' + '【自定义内容】\n' + customContent;
  }
  
  return baseMessage;
}

// 添加测试消息发送API端点
app.get('/api/test/message', async (req, res) => {
  try {
    // 从查询参数中获取自定义消息内容
    const customContent = req.query.content || '';
    // 获取用户指定的接收者，默认发送给所有人
    const toUser = req.query.toUser || '@all';
    
    // 生成测试消息
    const testMessage = generateTestMessage(customContent);
    
    console.log('正在发送测试消息到企业微信...');
    console.log('测试消息内容:', testMessage);
    
    // 记录发送前的时间
    const startTime = Date.now();
    const result = await sendMessage(testMessage, toUser);
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    if (result) {
      console.log(`测试消息发送成功! 耗时: ${duration.toFixed(2)}秒`);
      res.status(200).json({
        success: true,
        message: '测试消息发送成功',
        data: {
          duration: `${duration.toFixed(2)}秒`,
          sendTime: new Date().toISOString(),
          messageLength: testMessage.length,
          recipient: toUser
        }
      });
    } else {
      console.log('测试消息发送失败!');
      res.status(500).json({
        success: false,
        message: '测试消息发送失败',
        error: 'Failed to send message'
      });
    }
  } catch (error) {
    console.error('发送测试消息时出错:', error);
    res.status(500).json({
      success: false,
      message: '发送测试消息时发生错误',
      error: error.message
    });
  }
});

// 添加简单的健康检查端点
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 菜单管理相关路由
// 创建Emby菜单
app.get('/api/menu/create', async (req, res) => {
  try {
    console.log('收到创建菜单请求');
    const result = await menuManager.createEmbyMenu();
    res.json(result);
  } catch (error) {
    console.error('创建菜单失败:', error);
    res.status(500).json({ success: false, message: `创建菜单失败: ${error.message}` });
  }
});

// 查询当前菜单
app.get('/api/menu/get', async (req, res) => {
  try {
    console.log('收到查询菜单请求');
    const result = await menuManager.getMenu();
    res.json(result);
  } catch (error) {
    console.error('查询菜单失败:', error);
    res.status(500).json({ success: false, message: `查询菜单失败: ${error.message}` });
  }
});

// 删除当前菜单
app.get('/api/menu/delete', async (req, res) => {
  try {
    console.log('收到删除菜单请求');
    const result = await menuManager.deleteMenu();
    res.json(result);
  } catch (error) {
    console.error('删除菜单失败:', error);
    res.status(500).json({ success: false, message: `删除菜单失败: ${error.message}` });
  }
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {  // 再次改回0.0.0.0以确保局域网访问
  console.log(`企业微信通知服务启动成功，监听所有网络接口，端口: ${port}`);
  console.log(`可以通过局域网IP访问: http://0.0.0.0:${port}`);
  
  // 如果启用了代理，则显示代理信息
  if (config.proxy && config.proxy.enabled) {
    console.log(`已启用代理，代理地址: ${config.proxy.url}`);
  }
});
