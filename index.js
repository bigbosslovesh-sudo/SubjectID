// 全局开发模式标志
const NODE_ENV = process.env.NODE_ENV || 'development';
const isDevelopment = NODE_ENV === 'development';

// 智能日志函数
function debugLog(...args) {
  if (isDevelopment) {
    console.log(...args);
  }
}

function infoLog(...args) {
  console.log(...args);
}

function errorLog(...args) {
  console.error(...args);
}

import http from 'http';
import fs from 'fs';
import path from 'path';
import { IncomingForm } from 'formidable';
import axios from 'axios';
import sharp from 'sharp';
import { Jimp } from 'jimp';
import archiver from 'archiver';

// 读取环境变量
import dotenv from 'dotenv';
dotenv.config();

// 初始化 302.ai API 配置
const API_KEY = process.env.API_KEY || 'your_api_key_here';
const API_URL = process.env.API_URL || 'https://api.302ai.cn/v1/chat/completions';
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-2.5-flash-image-preview';

if (!API_KEY || API_KEY === 'your_api_key_here') {
  console.warn('302.ai API Key not configured. Using mock processing.');
}

const server = http.createServer(async (req, res) => {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // 处理图片上传和处理请求
  if ((req.url === '/process-image' || req.url === '/api/process-image') && req.method === 'POST') {
    try {
      await handleImageProcess(req, res);
    } catch (error) {
      console.error('Error processing image:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: '服务器内部错误' }));
    }
    return;
  }

  // 处理批量打包下载请求
  if ((req.url === '/package-results' || req.url === '/api/package-results') && req.method === 'POST') {
    try {
      await handlePackageResults(req, res);
    } catch (error) {
      console.error('Error packaging results:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: '打包失败' }));
    }
    return;
  }

  // 处理静态文件请求
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './index.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 - File Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// 处理图片上传和处理的函数 - 简化版
async function handleImageProcess(req, res) {
  const form = new IncomingForm({
    uploadDir: './uploads',
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    filter: ({ mimetype }) => {
      return mimetype && mimetype.startsWith('image/');
    }
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Parse error:', err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: '文件上传失败' }));
      return;
    }

    try {
      const imageFile = files.image;
      if (!imageFile) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '未找到图片文件' }));
        return;
      }

      // 获取处理模式，默认为纯AI处理
      const processingMode = 'ai-only';
      debugLog('处理模式: 纯AI处理');

      let processedImagePath;
      // 使用AI生成专业产品照
      processedImagePath = await generateProductImage(imageFile[0] || imageFile);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        processedImageUrl: processedImagePath,
        processingMode: 'ai-generated'
      }));

    } catch (error) {
      console.error('Processing error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: error.message || '图片处理失败'
      }));
    }
  });
}

// AI生成专业产品照函数
async function generateProductImage(imageFile) {
  // 添加timestamp用于临时文件命名
  const timestamp = Date.now();

  // 获取原文件名（不含扩展名）
  const originalFileName = path.basename(imageFile.originalFilename || imageFile.name || 'image', path.extname(imageFile.originalFilename || imageFile.name || 'image.png'));
  const safeFileName = sanitizeFileName(originalFileName);
  const processedFilename = `Processed_${safeFileName}.png`;
  const processedPath = path.join('./processed', processedFilename);

  try {
    if (!API_KEY || API_KEY === 'your_api_key_here') {
      throw new Error('API Key 未配置，请检查您的API密钥配置');
    }

    debugLog('使用AI生成专业产品照...');

    // 压缩图片以减少payload大小
    const compressedImagePath = path.join('./uploads', `compressed_${timestamp}.jpg`);
    await sharp(imageFile.filepath)
      .resize(1200, 900, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toFile(compressedImagePath);

    // 读取压缩后的图片
    const imageData = fs.readFileSync(compressedImagePath);
    const imageBase64 = imageData.toString('base64');
    const mimeType = 'image/jpeg';

    debugLog(`压缩后图片大小: ${Math.round(imageData.length / 1024)}KB`);

    const combinedPrompt = `请生成一张专业的商品产品照，要求如下：

核心任务：从商品页面截图中提取纯净的商品本体，生成专业产品照

具体处理步骤：
1. 精准识别商品的完整边界
   - 确保商品主体不被截断
   - 保持商品的完整轮廓和形状

2. 智能移除所有干扰元素：
   - 价格标签、促销文字、商品描述文本
   - 促销贴纸、标签、徽章
   - 包装上的非商品本身图案
   - 遮挡物（手指、展示工具等）
   - 网页界面元素、按钮

3. 完整保留商品固有特征：
   - 商品本身的logo和品牌标识
   - 原有的材质纹理、颜色、光泽
   - 商品的造型和设计细节
   - 自然的阴影和立体感

4. 生成专业产品照效果：
   - 纯白色背景（#FFFFFF）
   - 均匀的专业级打光
   - 清晰锐利的图像质量
   - 商品居中展示

输出要求：
- 直接返回处理完成的图片
- 图片格式：PNG，高质量
- 背景：纯白色，无杂质
- 效果：如同专业摄影棚拍摄的产品照

请直接生成符合以上要求的商品产品照，不要返回任何文字说明。`;

    // 调用 AI 进行一次性处理
    const apiResponse = await axios.post(API_URL, {
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content: "你是专业的商品图像处理AI，具备图片生成能力。你的任务是从商品页面截图中提取纯净的商品本体，生成高质量的专业产品照。请直接生成处理后的图片，确保背景纯白、商品居中、质量清晰。"
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: combinedPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      temperature: 0
    }, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 90000 // 90秒超时
    });

    // 清理压缩文件
    if (fs.existsSync(compressedImagePath)) {
      fs.unlinkSync(compressedImagePath);
    }

    debugLog('AI响应状态:', apiResponse.status);

    // 检查 AI 是否返回了处理后的图片
    const response = apiResponse.data.choices?.[0]?.message?.content || '';

    // 方式1: 检查是否返回了base64图片数据
    if (response.includes('data:image/') || response.includes('base64,')) {
      debugLog('AI返回了base64图片数据，正在保存...');

      // 提取base64图片数据
      let base64Data = '';
      if (response.includes('data:image/')) {
        // 提取 data:image/xxx;base64,xxxxx 格式的数据
        const match = response.match(/data:image\/[^;]+;base64,([^"')\s]+)/);
        if (match) {
          base64Data = match[1];
        }
      } else if (response.includes('base64,')) {
        // 提取 base64,xxxxx 格式的数据
        const match = response.match(/base64,([^"')\s]+)/);
        if (match) {
          base64Data = match[1];
        }
      }

      if (base64Data) {
        // 将base64数据保存为图片文件
        const imageBuffer = Buffer.from(base64Data, 'base64');
        await sharp(imageBuffer)
          .png({ quality: 95 })
          .toFile(processedPath);

        infoLog('AI生成专业产品照完成，已保存处理后的图片');
        return processedPath.replace('./processed/', '/processed/');
      }
    }

    // 方式2: 检查是否返回了图片URL链接 (Markdown格式)
    const urlMatch = response.match(/!\[.*?\]\((https?:\/\/[^\)]+\.(png|jpg|jpeg|gif|webp))\)/i);
    if (urlMatch) {
      const imageUrl = urlMatch[1];
      debugLog('AI返回了图片URL，正在下载:', imageUrl);

      // 下载远程图片
      const downloadedImagePath = await downloadImage(imageUrl, processedPath);
      if (downloadedImagePath) {
        infoLog('AI生成专业产品照完成，已下载并保存处理后的图片');
        return downloadedImagePath.replace('./processed/', '/processed/');
      }
    }

    // 方式3: 检查纯URL格式 (无Markdown)
    const directUrlMatch = response.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp))/i);
    if (directUrlMatch) {
      const imageUrl = directUrlMatch[1];
      debugLog('AI返回了直接图片URL，正在下载:', imageUrl);

      // 下载远程图片
      const downloadedImagePath = await downloadImage(imageUrl, processedPath);
      if (downloadedImagePath) {
        infoLog('AI生成专业产品照完成，已下载并保存处理后的图片');
        return downloadedImagePath.replace('./processed/', '/processed/');
      }
    }

    // 如果所有方式都失败，抛出详细错误
    debugLog('AI响应内容 (前200字符):', response.substring(0, 200));
    debugLog('AI响应完整内容:', response);
    throw new Error(`AI响应格式不支持。响应内容: ${response.substring(0, 100)}...`);

  } catch (error) {
    errorLog('AI生成处理失败:', error.message);

    // 根据错误类型返回具体的错误信息
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
      throw new Error('AI处理超时，请检查网络连接或稍后重试');
    } else if (error.response && error.response.status === 401) {
      throw new Error('API认证失败，请检查API密钥配置');
    } else if (error.response && error.response.status === 429) {
      throw new Error('API调用频率超限，请稍后重试');
    } else {
      throw new Error(`AI生成处理失败: ${error.message}`);
    }
  }
}

// 下载远程图片并保存到本地
async function downloadImage(imageUrl, localPath) {
  try {
    debugLog('开始下载图片:', imageUrl);

    // 下载图片
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30秒超时
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.status !== 200) {
      throw new Error(`下载失败，状态码: ${response.status}`);
    }

    // 将下载的数据转换为Buffer
    const imageBuffer = Buffer.from(response.data);

    // 使用sharp处理并保存图片
    await sharp(imageBuffer)
      .png({ quality: 95 })
      .toFile(localPath);

    debugLog('图片下载并保存成功:', localPath);
    return localPath;

  } catch (error) {
    errorLog('图片下载失败:', error.message);
    return null;
  }
}

// 文件名清理和安全检查函数
function sanitizeFileName(fileName) {
  // 移除或替换非法字符
  let safeName = fileName
    .replace(/[<>:"/\\|?*]/g, '_') // 替换非法字符为下划线
    .replace(/\s+/g, '_') // 替换空格为下划线
    .replace(/[^\w\u4e00-\u9fa5._-]/g, '_') // 只保留字母、数字、中文、点、下划线、短划线
    .replace(/_{2,}/g, '_') // 多个连续下划线替换为单个
    .replace(/^_+|_+$/g, ''); // 移除开头和结尾的下划线

  // 确保文件名不为空
  if (!safeName) {
    safeName = 'image';
  }

  // 限制文件名长度
  if (safeName.length > 100) {
    safeName = safeName.substring(0, 100);
  }

  return safeName;
}

// 处理批量打包下载请求
async function handlePackageResults(req, res) {
  infoLog('处理批量打包下载请求...');

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const requestData = JSON.parse(body);
      const { urls } = requestData;

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: '无效的文件URL列表' }));
        return;
      }

      // 创建ZIP文件
      const timestamp = Date.now();
      const zipFileName = `processed_batch_${timestamp}.zip`;
      const zipPath = path.join('./processed', zipFileName);

      const archive = archiver('zip', {
        zlib: { level: 9 } // 压缩级别
      });

      const output = fs.createWriteStream(zipPath);
      archive.pipe(output);

      debugLog('开始添加文件到ZIP，文件数量:', urls.length);

      // 添加文件到ZIP
      let addedCount = 0;
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        // 正确处理文件路径：移除开头的斜杠，然后加上相对路径前缀
        const relativePath = url.startsWith('/') ? url.substring(1) : url;
        const filePath = './' + relativePath;

        debugLog(`处理文件 ${i + 1}/${urls.length}: ${url} -> ${filePath}`);

        if (fs.existsSync(filePath)) {
          // 从文件路径中提取原始文件名
          const originalFileName = path.basename(filePath, path.extname(filePath));
          const safeFileName = sanitizeFileName(originalFileName);
          const fileName = `Processed_${safeFileName}.png`;
          archive.file(filePath, { name: fileName });
          addedCount++;
          debugLog(`文件添加成功: ${fileName} (源: ${filePath})`);
        } else {
          errorLog(`文件不存在: ${filePath}`);
          // 尝试其他可能的路径格式
          const altPath1 = url; // 直接使用原URL
          const altPath2 = '.' + url; // 添加点前缀
          debugLog(`尝试备用路径: ${altPath1}, ${altPath2}`);

          if (fs.existsSync(altPath1)) {
            const originalFileName = path.basename(altPath1, path.extname(altPath1));
            const safeFileName = sanitizeFileName(originalFileName);
            const fileName = `Processed_${safeFileName}.png`;
            archive.file(altPath1, { name: fileName });
            addedCount++;
            debugLog(`使用备用路径1成功: ${fileName} (源: ${altPath1})`);
          } else if (fs.existsSync(altPath2)) {
            const originalFileName = path.basename(altPath2, path.extname(altPath2));
            const safeFileName = sanitizeFileName(originalFileName);
            const fileName = `Processed_${safeFileName}.png`;
            archive.file(altPath2, { name: fileName });
            addedCount++;
            debugLog(`使用备用路径2成功: ${fileName} (源: ${altPath2})`);
          }
        }
      }

      if (addedCount === 0) {
        throw new Error('没有找到任何有效的处理文件');
      }

      infoLog(`成功添加 ${addedCount}/${urls.length} 个文件到ZIP`);

      // 完成归档
      await archive.finalize();

      // 等待文件写入完成
      await new Promise((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
      });

      infoLog(`ZIP文件创建完成: ${zipPath}, 大小: ${archive.pointer()} bytes`);

      // 返回下载链接
      const downloadUrl = `/processed/${zipFileName}`;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        downloadUrl: downloadUrl,
        fileCount: urls.length,
        zipSize: archive.pointer()
      }));

      // 清理旧的ZIP文件（保留最近的10个）
      setTimeout(() => {
        cleanupOldZipFiles();
      }, 5000);

    } catch (error) {
      errorLog('打包处理失败:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: '打包失败: ' + error.message,
        details: error.stack ? error.stack.split('\n').slice(0, 3).join('\n') : '无详细信息'
      }));
    }
  });
}

// 清理旧的ZIP文件
function cleanupOldZipFiles() {
  try {
    const processedDir = './processed';
    const files = fs.readdirSync(processedDir)
      .filter(file => file.startsWith('processed_batch_') && file.endsWith('.zip'))
      .map(file => ({
        name: file,
        path: path.join(processedDir, file),
        time: fs.statSync(path.join(processedDir, file)).mtime
      }))
      .sort((a, b) => b.time - a.time);

    // 保留最新的10个文件，删除其余的
    if (files.length > 10) {
      const filesToDelete = files.slice(10);
      filesToDelete.forEach(file => {
        try {
          fs.unlinkSync(file.path);
          infoLog(`已清理旧ZIP文件: ${file.name}`);
        } catch (error) {
          errorLog(`清理文件失败: ${file.name}`, error);
        }
      });
    }
  } catch (error) {
    errorLog('清理ZIP文件失败:', error);
  }
}

// 清理旧的图片文件
function cleanupOldFiles() {
  try {
    const now = Date.now();
    const maxAge = 2 * 60 * 60 * 1000; // 2小时（生产环境更频繁清理）

    // 清理上传目录
    const uploadsDir = './uploads';
    if (fs.existsSync(uploadsDir)) {
      const uploadFiles = fs.readdirSync(uploadsDir);
      let uploadCleaned = 0;
      uploadFiles.forEach(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          try {
            fs.unlinkSync(filePath);
            uploadCleaned++;
            debugLog(`已清理旧上传文件: ${file}`);
          } catch (error) {
            errorLog(`清理上传文件失败: ${file}`, error);
          }
        }
      });
      if (uploadCleaned > 0) {
        infoLog(`清理了 ${uploadCleaned} 个旧上传文件`);
      }
    }

    // 清理处理后的图片（保留ZIP文件）
    const processedDir = './processed';
    if (fs.existsSync(processedDir)) {
      const processedFiles = fs.readdirSync(processedDir)
        .filter(file => !file.endsWith('.zip')); // 不删除ZIP文件

      let processedCleaned = 0;
      processedFiles.forEach(file => {
        const filePath = path.join(processedDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtime.getTime() > maxAge) {
          try {
            fs.unlinkSync(filePath);
            processedCleaned++;
            debugLog(`已清理旧处理文件: ${file}`);
          } catch (error) {
            errorLog(`清理处理文件失败: ${file}`, error);
          }
        }
      });
      if (processedCleaned > 0) {
        infoLog(`清理了 ${processedCleaned} 个旧处理文件`);
      }
    }
  } catch (error) {
    errorLog('清理旧文件失败:', error);
  }
}

// 创建必要的目录
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}
if (!fs.existsSync('./processed')) {
  fs.mkdirSync('./processed');
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  infoLog(`🚀 Local server running at http://localhost:${PORT}`);
  infoLog('Press Ctrl+C to stop the server.');

  // 启动时清理一次旧文件
  cleanupOldFiles();

  // 每30分钟清理一次旧文件（更频繁的清理）
  setInterval(() => {
    infoLog('执行定期文件清理...');
    cleanupOldFiles();
  }, 30 * 60 * 1000); // 30分钟
});
