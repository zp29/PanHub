# PanHub

PanHub是一个网盘服务项目，通过企业微信或后台管理系统找到资源，使用115或123网盘的离线下载功能，资源准备好后自动生成115直链strm，并通知emby更新。

## 项目结构

```
PanHub/
├── services/                   # 所有微服务
│   ├── api-gateway/            # Node.js API网关服务
│   ├── wechat-service/          # 企业微信对接服务 (Node.js)
│   ├── pan115-service/         # 115网盘服务 (Python)
│   ├── pan123-service/         # 123网盘服务 (Python)
│   ├── transfer-service/       # 网盘转换服务 (Python)
│   └── emby-service/           # Emby对接服务
├── frontend/                   # Vue前端
├── docker-compose.yml          # 服务编排
└── docs/                       # 文档
```

## 功能特性

- 企业微信对接：通过企业微信应用发送和接收消息
- 网盘资源管理：对接115网盘和123网盘API
- 离线下载：支持网盘离线下载功能
- 资源转换：支持阿里云资源转115，115资源转123
- Emby集成：自动生成STRM链接并通知Emby更新
- 资源搜索：使用Prowlarr或jackett进行资源搜索

## 快速开始

### 使用Docker Compose启动

```bash
docker-compose up -d
```

### 本地开发

1. 安装依赖

```bash
# API网关
cd services/api-gateway
npm install

# 企业微信服务
cd services/wechat-service
npm install

# 115网盘服务
cd services/pan115-service
pip install -r requirements.txt
```

2. 启动服务

```bash
# API网关
cd services/api-gateway
npm run dev

# 企业微信服务
cd services/wechat-service
npm run dev

# 115网盘服务
cd services/pan115-service
python app/main.py
```

## 规划
1. 企业微信通讯(node)
2. 115扫码(python)
3. 115生成Strm(node)
4. 磁力115(python)
5. 阿里云扫码(python)


## 功能列表
- [] 账号管理
- [] 115 扫码
- [] 115 Strm
- [] 资源搜索
- [] 磁力 115
- [] 阿里云扫码
- [] AliYun  115
- [] 123 扫码
- [] 115  123
- [] Alist Strm
- [] 主页：豆瓣喜欢&豆瓣榜单