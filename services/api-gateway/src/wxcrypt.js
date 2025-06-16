/**
 * 企业微信消息加解密工具
 * 用于解密企业微信发送的加密消息
 */
const crypto = require('crypto');
const xml2js = require('xml2js');

class WXBizMsgCrypt {
  /**
   * 构造函数
   * @param {string} token - 企业微信后台设置的token
   * @param {string} encodingAESKey - 企业微信后台设置的EncodingAESKey
   * @param {string} corpId - 企业微信的企业ID
   */
  constructor(token, encodingAESKey, corpId) {
    this.token = token;
    this.corpId = corpId;
    // 将EncodingAESKey转换为解密用的AESKey
    this.aesKey = Buffer.from(encodingAESKey + '=', 'base64');
    this.iv = this.aesKey.slice(0, 16); // 初始向量从AESKey中取前16字节
  }

  /**
   * 验证URL函数
   * @param {string} msgSignature - 签名
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @param {string} echostr - 加密的随机字符串
   * @returns {string} 解密后的消息内容
   */
  verifyURL(msgSignature, timestamp, nonce, echostr) {
    // 校验签名
    const signature = this.getSignature(timestamp, nonce, echostr);
    if (signature !== msgSignature) {
      throw new Error('签名验证失败');
    }
    // 解密echostr
    return this.decrypt(echostr);
  }

  /**
   * 检查签名
   * @param {string} msgSignature - 企业微信加密签名
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @param {string} encryptMsg - 加密消息体
   * @returns {boolean} 签名是否有效
   */
  checkSignature(msgSignature, timestamp, nonce, encryptMsg) {
    return this.getSignature(timestamp, nonce, encryptMsg) === msgSignature;
  }

  /**
   * 解密消息
   * @param {string} msgSignature - 签名
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @param {string|Object} msgEncrypt - 加密的XML消息或已解析的对象
   * @returns {Promise<Object>} 解密后的消息对象
   */
  async decryptMsg(msgSignature, timestamp, nonce, msgEncrypt) {
    let encrypt;
    
    // 如果是字符串，解析XML
    if (typeof msgEncrypt === 'string') {
      try {
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(msgEncrypt);
        
        if (result && result.xml) {
          encrypt = result.xml.Encrypt;
        } else {
          throw new Error('无效的XML消息格式');
        }
      } catch (err) {
        throw new Error('解析XML失败：' + err.message);
      }
    } else if (msgEncrypt.Encrypt) {
      // 如果已经是解析后的对象
      encrypt = msgEncrypt.Encrypt;
    } else if (msgEncrypt.xml && msgEncrypt.xml.Encrypt) {
      encrypt = msgEncrypt.xml.Encrypt;
    } else {
      throw new Error('消息格式不正确，找不到Encrypt字段');
    }
    
    // 验证签名
    if (!this.checkSignature(msgSignature, timestamp, nonce, encrypt)) {
      throw new Error('签名验证失败');
    }
    
    // 解密消息
    const decrypted = this.decrypt(encrypt);
    
    // 解析解密后的XML
    try {
      const parser = new xml2js.Parser({ explicitArray: false });
      return await parser.parseStringPromise(decrypted);
    } catch (err) {
      throw new Error('解析解密后的XML失败: ' + err.message);
    }
  }

  /**
   * 加密消息
   * @param {string} replyMsg - 回复消息
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @returns {Object} 加密后的消息对象
   */
  encryptMsg(replyMsg, timestamp, nonce) {
    // 加密回复消息
    const encrypt = this.encrypt(replyMsg);
    
    // 生成签名
    const signature = this.getSignature(timestamp, nonce, encrypt);
    
    // 构造返回的XML
    const result = {
      Encrypt: encrypt,
      MsgSignature: signature,
      TimeStamp: timestamp,
      Nonce: nonce
    };
    
    // 将对象转换为XML
    const builder = new xml2js.Builder();
    return builder.buildObject({ xml: result });
  }

  /**
   * 加密函数
   * @param {string} text - 待加密文本
   * @returns {string} 加密后的Base64字符串
   */
  encrypt(text) {
    // 生成16位随机字符串作为补位
    const randomString = crypto.randomBytes(16).toString('hex');
    
    // 拼接明文： 16位随机字符串 + 4字节网络字节序表示的文本长度 + 明文文本 + CorpID
    const msgLength = Buffer.alloc(4);
    msgLength.writeUInt32BE(Buffer.byteLength(text), 0);
    
    const buffer = Buffer.concat([
      Buffer.from(randomString),
      msgLength,
      Buffer.from(text),
      Buffer.from(this.corpId)
    ]);
    
    // 使用PKCS#7填充
    const padLength = 32 - (buffer.length % 32);
    const padBuffer = Buffer.alloc(padLength, padLength);
    const padded = Buffer.concat([buffer, padBuffer]);
    
    // AES-256-CBC加密
    const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, this.iv);
    cipher.setAutoPadding(false); // 因为我们已经自己做了填充
    const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
    
    // Base64编码
    return encrypted.toString('base64');
  }

  /**
   * 解密函数
   * @param {string} text - 待解密的Base64编码加密文本
   * @returns {string} 解密后的文本
   */
  decrypt(text) {
    // Base64解码
    const encryptedMsg = Buffer.from(text, 'base64');
    
    // AES-256-CBC解密
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, this.iv);
    decipher.setAutoPadding(false); // 因为我们需要自己处理填充
    const decrypted = Buffer.concat([decipher.update(encryptedMsg), decipher.final()]);
    
    // 去除PKCS#7填充
    const padLength = decrypted[decrypted.length - 1];
    const unpadded = decrypted.slice(0, decrypted.length - padLength);
    
    // 从明文中提取数据: 16字节随机字符串 + 4字节消息长度 + 消息内容 + CorpID
    const msgLength = unpadded.readUInt32BE(16);
    const content = unpadded.slice(20, 20 + msgLength).toString();
    
    // 验证CorpID
    const receivedCorpId = unpadded.slice(20 + msgLength).toString();
    if (receivedCorpId !== this.corpId) {
      throw new Error('CorpID不匹配');
    }
    
    return content;
  }

  /**
   * 生成签名
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @param {string} encrypt - 加密的消息
   * @returns {string} 签名
   */
  getSignature(timestamp, nonce, encrypt) {
    // 按字典序排序
    const sortedArray = [this.token, timestamp, nonce, encrypt].sort();
    
    // 拼接后进行sha1签名
    const sha1 = crypto.createHash('sha1');
    sha1.update(sortedArray.join(''));
    
    return sha1.digest('hex');
  }
}

module.exports = WXBizMsgCrypt;
