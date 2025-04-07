// 导入依赖
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 导入配置
const config = require('./config.json');

// 导入中间件
const xmlParserMiddleware = require('./middlewares/xmlParser');

// 导入控制器
const wechatController = require('./controllers/wechatController');
const menuController = require('./controllers/menuController');
const proxyController = require('./controllers/proxyController');

// 初始化Express应用
const app = express();
const port = config.server.port || 4001;

// 确保日志目录存在
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 配置中间件，注意顺序很重要
// 先应用XML解析中间件，捕获原始请求体
app.use(xmlParserMiddleware);

// 再应用其他中间件
app.use(express.json());
app.use(express.text());
app.use(cors());

// 根路径GET处理 - 用于企业微信URL验证或健康检查
app.get('/', wechatController.handleUrlVerification);

// 通用GET请求处理 - 健康检查路由
app.get(['/test', '/health', '/status'], (req, res) => {
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

// 微信消息处理路由 - 处理根路径和其他路径
app.post(['/', '/wechat', '/wechat/callback'], wechatController.handleMessage);

// 菜单管理相关路由
app.get('/api/menu/create', menuController.createMenu.bind(menuController));
app.get('/api/menu/get', menuController.getMenu.bind(menuController));
app.get('/api/menu/delete', menuController.deleteMenu.bind(menuController));

// 测试消息发送路由
app.get('/api/test/message', wechatController.sendTestMessage);

// 代理转发路由
app.post('/proxy', proxyController.handleProxyMessage);

// 启动服务器
app.listen(port, '0.0.0.0', () => {  // 监听所有网络接口以确保局域网访问
  console.log(`企业微信通知服务启动成功，监听所有网络接口，端口: ${port}`);
  console.log(`可以通过局域网IP访问: http://127.0.0.1:${port}`);
  
  // 如果启用了代理，显示代理地址
  if (config.proxy && config.proxy.enabled) {
    console.log(`已启用代理，代理地址: ${config.proxy.url}`);
  }
});
