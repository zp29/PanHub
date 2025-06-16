/**
 * XML解析中间件
 * 用于解析微信发送的XML消息
 */

/**
 * XML解析中间件
 * 捕获原始请求体，特别处理XML格式数据
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express中间件下一步函数
 */
function xmlParserMiddleware(req, res, next) {
  // 只处理含有XML的请求体或POST请求
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('xml') || req.method === 'POST') {
    let rawBody = '';
    req.setEncoding('utf8');
    
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    
    req.on('end', () => {
      // 存储原始请求体
      req.rawBody = rawBody;
      
      // 如果包含XML数据，直接设置body
      if (rawBody && (rawBody.includes('<xml') || rawBody.includes('ToUserName'))) {
        req.body = rawBody;
      }
      next();
    });
  } else {
    // 非XML请求直接继续
    next();
  }
}

module.exports = xmlParserMiddleware;
