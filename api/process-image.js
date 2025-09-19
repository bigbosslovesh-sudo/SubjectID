// Vercel serverless function for image processing
const { IncomingForm } = require('formidable');
const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-2.5-flash';

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
    maxFileSize: 10 * 1024 * 1024, // 10MB
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

      // 处理上传的图片
      const processedImageData = await processImageWithAI(imageFile[0] || imageFile);

      // 返回base64编码的图片数据而不是文件路径
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

// 使用 Gemini AI 处理图片
async function processImageWithAI(imageFile) {
  try {
    if (!API_KEY || API_KEY === 'your_api_key_here') {
      throw new Error('API Key 未配置，请检查您的API密钥配置');
    }

    debugLog('使用 302.ai API 分析图片...');

    // 压缩图片以减少payload大小 - 适配Vercel限制
    const compressedImageBuffer = await sharp(imageFile.filepath)
      .resize(600, 450, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 50 })
      .toBuffer();

    const imageBase64 = compressedImageBuffer.toString('base64');
    const mimeType = 'image/jpeg';

    debugLog(`压缩后图片大小: ${Math.round(compressedImageBuffer.length / 1024)}KB`);

    const prompt = `Return ONLY valid JSON, no explanations:
{
  "product_detected": true,
  "main_subject": {
    "tight_bbox": {"x": 0.3, "y": 0.2, "width": 0.4, "height": 0.6},
    "subject_type": "商品名称",
    "subject_type_en": "product_name",
    "filename_safe": "product-file-name",
    "dominant_colors": ["#color1", "#color2"]
  }
}`;

    // 重试逻辑
    let analysis = null;
    let retryCount = 0;
    const maxRetries = 2; // 减少重试次数适配Vercel超时

    while (retryCount < maxRetries && !analysis) {
      try {
        debugLog(`API调用尝试 ${retryCount + 1}/${maxRetries}...`);

        // 使用 302.ai API 进行分析
        const apiResponse = await axios.post(API_URL, {
          model: MODEL_NAME,
          messages: [
            {
              role: "system",
              content: "You are a JSON response bot. Return only valid JSON, no explanations, no reasoning, no markdown. Analyze the product image and return the JSON structure requested."
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: prompt
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
          timeout: 25000 // 减少到25秒适配Vercel
        });

        debugLog('API响应状态:', apiResponse.status);

        const analysisText = apiResponse.data.choices?.[0]?.message?.content || '';
        debugLog('AI 分析结果:', analysisText);

        // 尝试解析 AI 返回的 JSON
        try {
          analysis = parseAIResponse(analysisText);
          if (analysis && analysis.main_subject) {
            debugLog('AI 分析成功解析');
          } else {
            console.warn('AI 返回的分析结果格式不正确');
          }
        } catch (parseError) {
          console.warn('Failed to parse AI response as JSON:', parseError.message);
        }

        break; // 成功则跳出循环

      } catch (apiError) {
        retryCount++;
        errorLog(`API调用失败 (尝试 ${retryCount}/${maxRetries}):`, apiError.message);

        if (retryCount < maxRetries) {
          debugLog(`等待 ${retryCount} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
        }
      }
    }

    // 如果有分析结果，进行精确的商品主体提取
    if (analysis && analysis.main_subject) {
      const processedImageBuffer = await extractProductSubject(imageFile.filepath, analysis);
      return processedImageBuffer.toString('base64');
    } else {
      errorLog('AI分析失败，返回错误信息');
      throw new Error('AI调用失败，请检查网络连接或稍后重试');
    }

  } catch (error) {
    errorLog('AI processing failed:', error);
    throw error;
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