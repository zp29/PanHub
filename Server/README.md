# 企业微信通知服务

这是一个用于接收和处理企业微信消息的服务端程序，支持自定义菜单和命令处理。

## 功能特性

- 接收企业微信消息和事件
- 处理自定义菜单点击事件
- 支持多种预设命令
- 提供服务状态检查
- 支持消息转发到代理服务器

## 目录结构

```
Server/
├── app.js                # 主应用入口，包含服务器配置和路由
├── config.json           # 配置文件
├── controllers/          # 控制器目录
│   ├── wechatController.js  # 微信消息处理控制器
│   ├── menuController.js    # 菜单管理控制器
│   └── proxyController.js   # 代理请求控制器
├── middlewares/          # 中间件目录
│   └── xmlParser.js         # XML解析中间件
├── services/             # 业务逻辑服务目录
│   ├── wechatService.js     # 微信业务逻辑
│   └── commandService.js    # 命令处理服务
└── utils/                # 工具函数目录
    ├── logger.js            # 日志工具
    └── httpClient.js        # HTTP请求工具
```

## 安装与配置

### 前置条件

- Node.js v14.0.0 或更高版本
- npm 或 yarn 包管理器
- 企业微信账号和应用

### 安装步骤

1. 克隆仓库：

```bash
git clone https://github.com/yourusername/PanHub.git
cd PanHub/Server
```

2. 安装依赖：

```bash
npm install
# 或
yarn install
```

3. 配置文件设置：

编辑 `config.json` 文件，填入您的企业微信应用信息：

```json
{
  "wechat": {
    "corpId": "您的企业ID",
    "corpSecret": "您的应用密钥",
    "agentId": "您的应用ID",
    "token": "您设置的令牌",
    "encodingAesKey": "您设置的加密密钥"
  },
  "server": {
    "port": 4001
  },
  "proxy": {
    "enabled": false,
    "url": "http://your-proxy-server.com"
  },
  "menu": {
    "button": [
      {
        "name": "Emby更新",
        "sub_button": [
          {
            "type": "click",
            "name": "全部更新",
            "key": "UpdateEmbyAll"
          },
          {
            "type": "click",
            "name": "电影更新",
            "key": "UpdateEmbyMov"
          },
          {
            "type": "click",
            "name": "电视剧更新",
            "key": "UpdateEmbyTv"
          },
          {
            "type": "click",
            "name": "动漫更新",
            "key": "UpdateEmbyAmi"
          }
        ]
      },
      {
        "type": "click",
        "name": "服务状态",
        "key": "ServiceStatus"
      }
    ]
  }
}
```

### 企业微信应用配置

1. 登录企业微信管理后台：https://work.weixin.qq.com/wework_admin/
2. 创建或选择一个自建应用
3. 设置应用的接收消息URL为您服务器的地址，如：`http://your-server.com:4001/`
4. 记录下应用的 corpId、corpSecret、agentId
5. 设置应用的可信IP（如果有）
6. 开启"接收消息"权限

## 运行服务

启动服务：

```bash
node app.js
```

使用进程管理器（推荐）：

```bash
# 安装pm2
npm install -g pm2

# 启动服务
pm2 start app.js --name "wechat-service"

# 查看日志
pm2 logs wechat-service

# 重启服务
pm2 restart wechat-service
```

## API接口说明

### 菜单管理

- 创建菜单：`GET /api/menu/create`
- 获取菜单：`GET /api/menu/get`
- 删除菜单：`GET /api/menu/delete`

### 测试接口

- 发送测试消息：`GET /api/test/message?toUser=用户ID&content=测试内容`

### 代理接口

- 代理消息处理：`POST /proxy`
  - 请求体格式：`{ "message": "消息内容", "touser": "接收者ID" }`

## 自定义命令

当前支持的命令：

- `UpdateEmbyAll`：更新所有Emby内容
- `UpdateEmbyMov`：更新电影内容
- `UpdateEmbyTv`：更新电视剧内容
- `UpdateEmbyAmi`：更新动漫内容
- `ServiceStatus`：查看服务状态
- `help` 或 `帮助`：显示帮助信息

### 添加新命令

在 `services/commandService.js` 文件中修改 `handleCommand` 方法，添加新的命令处理逻辑：

```javascript
switch (trimmedCommand) {
  // 现有命令...
  
  // 添加新命令
  case 'NewCommand':
    logger.info('处理 NewCommand 指令');
    responseMsg = `处理新命令的逻辑`;
    break;
}
```

## 日志记录

服务会在 `logs` 目录下生成日志文件，包括：

- 微信消息日志：`wechat_msg_*.json`
- 应用运行日志：通过控制台输出，使用pm2时可通过`pm2 logs`查看

## 故障排除

如果在使用过程中遇到问题，请尝试以下步骤：

1. 检查日志文件中的错误信息
2. 确认配置文件中的参数是否正确
3. 验证企业微信应用的接收消息设置是否正确
4. 确认服务器端口是否开放，网络连接是否正常

常见问题：

- Q: 创建菜单成功但点击没有响应？
  - A: 检查接收消息URL配置和服务器日志

- Q: 发送消息失败？
  - A: 检查企业微信应用权限和配置参数

## 开发与扩展

### 添加新功能

1. 在适当的目录下创建新模块（如新控制器、服务等）
2. 在 `app.js` 中引入模块并添加相应路由
3. 重启服务使更改生效

### 代码风格指南

- 使用异步/等待模式处理异步操作
- 添加适当的日志记录
- 遵循职责分离原则
- 使用有意义的变量和函数命名

## 许可证

本项目基于 MIT 许可证开源。

## 版本历史

- v1.0.0：初始版本
- v1.1.0：添加模块化结构和改进错误处理
