const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 8003;

// 企业微信消息接收
app.post('/api/wechat/receive', (req, res) => {
  console.log('Received message from wechat:', req.body);
  // 处理企业微信消息
  res.send('success');
});

// 企业微信验证接口
app.get('/api/wechat/receive', (req, res) => {
  // 处理企业微信验证
  res.send('success');
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'wechat-service' });
});

app.listen(PORT, () => {
  console.log(`wechat service running on port ${PORT}`);
}); 