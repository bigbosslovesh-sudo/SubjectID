# Vercel部署说明文档

## 部署到Vercel后AI连接问题的解决方案

### 问题原因
原始代码使用传统Node.js HTTP服务器架构，与Vercel的serverless functions模式不兼容，导致AI API调用失败。

### 解决方案
已将应用重构为Vercel兼容架构：

#### 1. 架构调整
- 将原始的`index.js`服务器重构为Vercel API routes
- 创建`/api/process-image.js`处理图片处理
- 创建`/api/package-results.js`处理批量打包
- 静态文件通过`index.html`直接提供

#### 2. 配置文件
- `vercel.json`: Vercel部署配置
- `.env.example`: 环境变量模板

#### 3. 优化措施
- 图片压缩尺寸调整为600x450以适应Vercel限制
- API超时时间减少到25秒
- 重试次数减少到2次
- 使用base64编码传输处理结果而非文件系统

### 部署步骤

#### 1. 环境变量配置
在Vercel Dashboard中配置以下环境变量：
```
API_KEY=sk-8WBshZQ4u3MqAkCFDvtGR4goMNRFjhMbGtBAaPOVAZ4aFgE8
API_URL=https://api.302ai.cn/v1/chat/completions
MODEL_NAME=gemini-2.5-flash
NODE_ENV=production
```

#### 2. 部署命令
```bash
vercel --prod
```

#### 3. 验证功能
- 访问部署后的URL
- 测试单张图片上传和处理
- 测试批量处理功能
- 确认AI连接正常工作

### 关键改进
1. **serverless兼容**: 完全重构为serverless functions
2. **性能优化**: 减小图片尺寸和超时时间
3. **错误处理**: 改进API调用错误处理机制
4. **存储优化**: 使用内存处理而非文件系统

### 注意事项
- 确保在Vercel Dashboard中正确配置所有环境变量
- 部署后测试AI功能是否正常
- 监控函数执行时间确保不超过30秒限制