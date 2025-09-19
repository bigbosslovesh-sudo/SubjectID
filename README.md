# AI 商品主体抠图工具

基于 302.ai 的智能商品图片处理工具，支持自动识别商品主体并生成透明背景图片。

## 功能特性

- 🎯 **智能识别**：自动识别图片中的商品主体
- ✂️ **精确裁切**：AI 分析商品边界框，精确提取主体
- 🖼️ **透明背景**：生成高质量透明背景 PNG 图片
- 📦 **批量处理**：支持多张图片同时处理和打包下载
- 📱 **响应式设计**：完美适配桌面端和移动端
- 🧹 **自动清理**：定时清理临时文件，节省存储空间

## 技术栈

- **后端**：Node.js + Express-like HTTP Server
- **图像处理**：Sharp + Jimp
- **AI 服务**：302.ai Gemini API
- **前端**：原生 HTML/CSS/JavaScript
- **文件处理**：Formidable + Archiver

## 快速开始

### 1. 环境要求

- Node.js >= 16.0.0
- npm 或 yarn

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件，填入你的 302.ai API Key
nano .env
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

### 5. 访问应用

打开浏览器访问：http://localhost:3000

## 环境变量配置

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `API_KEY` | 302.ai API 密钥 | 必须配置 |
| `API_URL` | 302.ai API 端点 | https://api.302ai.cn/v1/chat/completions |
| `MODEL_NAME` | AI 模型名称 | gemini-2.5-flash |
| `NODE_ENV` | 运行环境 | development |
| `PORT` | 服务端口 | 3000 |

## 使用说明

### 单张图片处理

1. 选择"单张图片"模式
2. 上传包含商品的图片（支持 JPG、PNG、GIF，最大 10MB）
3. 点击"开始抠图处理"
4. 等待 AI 分析和处理
5. 下载处理后的商品主体图

### 批量图片处理

1. 选择"批量处理"模式
2. 拖拽多张图片或整个文件夹
3. 点击"开始批量处理"
4. 等待所有图片处理完成
5. 点击"打包下载全部"获取 ZIP 文件

## 部署指南

### Docker 部署（推荐）

```bash
# 构建镜像
docker build -t ai-product-extractor .

# 运行容器
docker run -d \
  --name ai-extractor \
  -p 3000:3000 \
  -e API_KEY=your_302ai_api_key \
  -e NODE_ENV=production \
  ai-product-extractor
```

### PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动应用
pm2 start index.js --name "ai-extractor"

# 保存配置
pm2 save
pm2 startup
```

### 系统服务部署

```bash
# 创建系统服务文件
sudo nano /etc/systemd/system/ai-extractor.service

# 启动服务
sudo systemctl enable ai-extractor
sudo systemctl start ai-extractor
```

## 性能优化

### 日志管理

- 开发环境：显示详细调试日志
- 生产环境：仅显示关键信息和错误日志

### 文件清理

- 自动清理 24 小时前的临时文件
- 保留最新 10 个打包文件
- 启动时执行一次清理
- 每小时定时清理

### 内存优化

- 图片压缩后再发送 API
- 及时释放临时文件
- 分批处理大量图片

## API 接口

### POST /process-image

处理单张图片

**请求**：
- Content-Type: multipart/form-data
- Body: image 文件

**响应**：
```json
{
  "success": true,
  "processedImageUrl": "/processed/filename.png"
}
```

### POST /package-results

打包批量处理结果

**请求**：
```json
{
  "urls": ["/processed/file1.png", "/processed/file2.png"]
}
```

**响应**：
```json
{
  "success": true,
  "downloadUrl": "/processed/batch_timestamp.zip",
  "fileCount": 2,
  "zipSize": 1024000
}
```

## 故障排除

### 常见问题

1. **API Key 未配置**
   - 确保 .env 文件中已正确配置 API_KEY

2. **图片处理失败**
   - 检查图片格式和大小限制
   - 确认网络连接正常

3. **批量下载失败**
   - 检查处理后的文件是否存在
   - 确认有足够的磁盘空间

### 日志查看

```bash
# 实时查看日志
tail -f logs/app.log

# PM2 日志
pm2 logs ai-extractor
```

## 许可证

ISC License

## 更新日志

### v1.0.0 (2024-09-19)
- 首次发布
- 支持单张和批量图片处理
- 集成 302.ai API
- 响应式 UI 设计
- 自动文件清理机制