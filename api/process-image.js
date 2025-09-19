// Vercel serverless function for image processing
import { IncomingForm } from 'formidable';
import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 智能日志函数
function debugLog(...args) {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
}

function errorLog(...args) {
  console.error(...args);
}

// 初始化 302.ai API 配置
const API_KEY = process.env.API_KEY;
const API_URL = process.env.API_URL || 'https://api.302ai.cn/v1/chat/completions';
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-2.5-flash-image-preview';

// Vercel serverless function handler
export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  try {
    await handleImageProcess(req, res);
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
}

// 处理图片上传和处理的函数
async function handleImageProcess(req, res) {
  // 创建临时目录
  const tempDir = path.join(os.tmpdir(), 'image-processing');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const form = new IncomingForm({
    uploadDir: tempDir,
    keepExtensions: true,
    maxFileSize: 5 * 1024 * 1024, // 5MB - 减少以适配Vercel请求限制
    filter: ({ mimetype }) => {
      return mimetype && mimetype.startsWith('image/');
    }
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Parse error:', err);
      res.status(400).json({ success: false, error: '文件上传失败' });
      return;
    }

    try {
      const imageFile = files.image;
      if (!imageFile) {
        res.status(400).json({ success: false, error: '未找到图片文件' });
        return;
      }

      // Vercel环境下的文件大小预检查
      const fileSize = (imageFile[0] || imageFile).size;
      if (fileSize > 5 * 1024 * 1024) { // 5MB
        res.status(413).json({
          success: false,
          error: '文件过大，请上传小于5MB的图片文件'
        });
        return;
      }

      // 处理上传的图片
      const processedImageData = await generateProductImage(imageFile[0] || imageFile);

      // 优化响应：避免大型base64数据导致413错误
      if (processedImageData && processedImageData.length > 0) {
        // 检查base64数据大小，避免超出Vercel 4.5MB响应限制
        const estimatedResponseSize = Buffer.byteLength(JSON.stringify({
          success: true,
          processedImageUrl: `data:image/png;base64,${processedImageData}`
        }));

        if (estimatedResponseSize > 4 * 1024 * 1024) { // 4MB安全阈值
          res.status(200).json({
            success: false,
            error: '处理后的图片过大，请尝试上传较小的图片或联系技术支持'
          });
          return;
        }
      }

      // 返回处理结果
      res.status(200).json({
        success: true,
        processedImageUrl: `data:image/png;base64,${processedImageData}`
      });

    } catch (error) {
      console.error('Processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message || '图片处理失败'
      });
    }
  });
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

// 下载远程图片并保存到临时目录
async function downloadImage(imageUrl, outputBuffer = false) {
  try {
    debugLog('开始下载图片:', imageUrl);

    // 下载图片
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 25000, // 25秒超时适配Vercel
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (response.status !== 200) {
      throw new Error(`下载失败，状态码: ${response.status}`);
    }

    // 将下载的数据转换为Buffer
    const imageBuffer = Buffer.from(response.data);

    // 使用sharp处理图片
    const processedBuffer = await sharp(imageBuffer)
      .png({ quality: 95 })
      .toBuffer();

    debugLog('图片下载并处理成功');
    return processedBuffer;

  } catch (error) {
    console.error('图片下载失败:', error.message);
    throw error;
  }
}

// AI生成专业产品照函数 - Vercel版本
async function generateProductImage(imageFile) {
  // 添加timestamp用于临时文件命名
  const timestamp = Date.now();

  // 获取原文件名（不含扩展名）
  const originalFileName = path.basename(imageFile.originalFilename || imageFile.name || 'image', path.extname(imageFile.originalFilename || imageFile.name || 'image.png'));
  const safeFileName = sanitizeFileName(originalFileName);
  const processedFilename = `Processed_${safeFileName}.png`;

  try {
    if (!API_KEY || API_KEY === 'your_api_key_here') {
      throw new Error('API Key 未配置，请检查您的API密钥配置');
    }

    debugLog('使用AI生成专业产品照...');

    // 更激进压缩图片以适配Vercel严格限制
    const compressedImageBuffer = await sharp(imageFile.filepath)
      .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 35 })
      .toBuffer();

    const imageBase64 = compressedImageBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    debugLog(`压缩后图片大小: ${Math.round(compressedImageBuffer.length / 1024)}KB`);

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

    // 调用 AI 进行图片生成
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
      timeout: 58000 // 58秒超时最大化Vercel限额（60秒-2秒缓冲）
    });

    debugLog('AI响应状态:', apiResponse.status);

    // 检查 AI 是否返回了处理后的图片
    const response = apiResponse.data.choices?.[0]?.message?.content || '';

    // 方式1: 检查是否返回了base64图片数据
    if (response.includes('data:image/') || response.includes('base64,')) {
      debugLog('AI返回了base64图片数据，正在处理...');

      // 提取base64图片数据
      let base64Data = '';
      if (response.includes('data:image/')) {
        const match = response.match(/data:image\/[^;]+;base64,([^"')\s]+)/);
        if (match) {
          base64Data = match[1];
        }
      } else if (response.includes('base64,')) {
        const match = response.match(/base64,([^"')\s]+)/);
        if (match) {
          base64Data = match[1];
        }
      }

      if (base64Data) {
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const processedBuffer = await sharp(imageBuffer)
          .png({ quality: 95 })
          .toBuffer();
        return processedBuffer.toString('base64');
      }
    }

    // 方式2: 检查是否返回了图片URL链接 (Markdown格式)
    const urlMatch = response.match(/!\[.*?\]\((https?:\/\/[^\)]+\.(png|jpg|jpeg|gif|webp))\)/i);
    if (urlMatch) {
      const imageUrl = urlMatch[1];
      debugLog('AI返回了图片URL，正在下载:', imageUrl);
      const downloadedBuffer = await downloadImage(imageUrl);
      return downloadedBuffer.toString('base64');
    }

    // 方式3: 检查纯URL格式 (无Markdown)
    const directUrlMatch = response.match(/(https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp))/i);
    if (directUrlMatch) {
      const imageUrl = directUrlMatch[1];
      debugLog('AI返回了直接图片URL，正在下载:', imageUrl);
      const downloadedBuffer = await downloadImage(imageUrl);
      return downloadedBuffer.toString('base64');
    }

    // 如果所有方式都失败，抛出详细错误
    debugLog('AI响应内容 (前200字符):', response.substring(0, 200));
    throw new Error(`AI响应格式不支持。响应内容: ${response.substring(0, 100)}...`);

  } catch (error) {
    console.error('AI生成处理失败:', error.message);

    // 根据错误类型返回具体的错误信息 - 增强Vercel错误处理
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
      throw new Error('AI处理超时，请检查网络连接或稍后重试');
    } else if (error.response && error.response.status === 401) {
      throw new Error('API认证失败，请检查API密钥配置');
    } else if (error.response && error.response.status === 429) {
      throw new Error('API调用频率超限，请稍后重试');
    } else if (error.response && error.response.status === 413) {
      throw new Error('请求数据过大，请尝试上传较小的图片文件');
    } else if (error.message && error.message.includes('timeout')) {
      throw new Error('处理超时，Vercel环境下请稍后重试或联系技术支持');
    } else {
      throw new Error(`AI生成处理失败: ${error.message}`);
    }
  }
}

// 强化的AI响应解析函数
function parseAIResponse(responseText) {
  debugLog('开始解析AI响应...');

  // 步骤1: 清理响应文本
  let cleanText = responseText.trim();

  // 移除markdown代码块标记
  cleanText = cleanText.replace(/```json\s*/g, '');
  cleanText = cleanText.replace(/```\s*/g, '');

  // 移除其他可能的前缀文本
  cleanText = cleanText.replace(/^[^{]*/, '');
  cleanText = cleanText.replace(/[^}]*$/, '');

  debugLog('清理后的文本长度:', cleanText.length);

  // 步骤2: 尝试多种JSON提取策略
  const strategies = [
    // 策略1: 直接解析
    () => JSON.parse(cleanText),

    // 策略2: 查找第一个完整的JSON对象
    () => {
      const jsonMatch = cleanText.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No valid JSON found');
    },

    // 策略3: 修复常见JSON错误
    () => {
      let fixedText = cleanText;

      // 修复常见的末尾问题
      if (!fixedText.endsWith('}')) {
        const openBraces = (fixedText.match(/\{/g) || []).length;
        const closeBraces = (fixedText.match(/\}/g) || []).length;
        const missing = openBraces - closeBraces;

        for (let i = 0; i < missing; i++) {
          fixedText += '}';
        }
      }

      // 修复数组末尾的逗号问题
      fixedText = fixedText.replace(/,\s*]/g, ']');
      fixedText = fixedText.replace(/,\s*}/g, '}');

      return JSON.parse(fixedText);
    }
  ];

  // 步骤3: 逐一尝试解析策略
  for (let i = 0; i < strategies.length; i++) {
    try {
      debugLog(`尝试解析策略 ${i + 1}...`);
      const result = strategies[i]();

      // 验证解析结果
      if (validateAnalysisResult(result)) {
        debugLog(`策略 ${i + 1} 解析成功`);
        return result;
      } else {
        debugLog(`策略 ${i + 1} 解析的JSON格式不符合要求`);
      }
    } catch (error) {
      debugLog(`策略 ${i + 1} 失败:`, error.message);
    }
  }

  throw new Error('所有JSON解析策略都失败');
}

// 验证AI分析结果的完整性
function validateAnalysisResult(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    return false;
  }

  // 检查必需的字段
  if (!analysis.main_subject) {
    console.log('缺少 main_subject 字段');
    return false;
  }

  const subject = analysis.main_subject;

  // 检查边界框
  if (!subject.tight_bbox ||
      typeof subject.tight_bbox.x !== 'number' ||
      typeof subject.tight_bbox.y !== 'number' ||
      typeof subject.tight_bbox.width !== 'number' ||
      typeof subject.tight_bbox.height !== 'number') {
    console.log('tight_bbox 字段格式不正确');
    return false;
  }

  console.log('AI分析结果验证通过');
  return true;
}

// 精确提取商品主体 - 优化版本
async function extractProductSubject(inputPath, analysis) {
  console.log('开始精确商品主体提取...', analysis.main_subject.subject_type);

  try {
    const { tight_bbox } = analysis.main_subject;

    // 获取原图信息
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;

    // 计算裁切区域（智能检测bbox格式）
    const isPixelFormat = tight_bbox.x > 1 || tight_bbox.y > 1 || tight_bbox.width > 1 || tight_bbox.height > 1;

    let cropLeft, cropTop, cropWidth, cropHeight;

    if (isPixelFormat) {
      // 像素格式
      cropLeft = Math.max(0, Math.floor(tight_bbox.x));
      cropTop = Math.max(0, Math.floor(tight_bbox.y));
      cropWidth = Math.min(width - cropLeft, Math.floor(tight_bbox.width));
      cropHeight = Math.min(height - cropTop, Math.floor(tight_bbox.height));
      debugLog('检测到像素格式bbox');
    } else {
      // 比例格式
      cropLeft = Math.max(0, Math.round(width * tight_bbox.x));
      cropTop = Math.max(0, Math.round(height * tight_bbox.y));
      cropWidth = Math.min(width - cropLeft, Math.round(width * tight_bbox.width));
      cropHeight = Math.min(height - cropTop, Math.round(height * tight_bbox.height));
      debugLog('检测到比例格式bbox');
    }

    // 确保裁切区域有效
    if (cropWidth <= 0 || cropHeight <= 0) {
      console.warn('裁切区域无效，使用原图');
      throw new Error('Invalid crop area');
    }

    console.log(`精确裁切商品主体: ${cropWidth}x${cropHeight} at (${cropLeft},${cropTop})`);

    // 裁切并优化输出
    const processedImageBuffer = await sharp(inputPath)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight
      })
      .png({
        quality: 95,
        compressionLevel: 6,
        adaptiveFiltering: true
      })
      .toBuffer();

    console.log('商品主体提取完成');
    return processedImageBuffer;

  } catch (error) {
    errorLog('商品主体提取失败:', error);
    throw new Error('商品主体提取失败 - ' + error.message);
  }
}