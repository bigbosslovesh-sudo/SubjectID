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

const http = require('http');
const fs = require('fs');
const path = require('path');
const { IncomingForm } = require('formidable');
const axios = require('axios');
const sharp = require('sharp');
const { Jimp } = require('jimp');
const archiver = require('archiver');

// 读取环境变量
require('dotenv').config();

// 初始化 302.ai API 配置
const API_KEY = process.env.API_KEY || 'your_api_key_here';
const API_URL = process.env.API_URL || 'https://api.302ai.cn/v1/chat/completions';
const MODEL_NAME = process.env.MODEL_NAME || 'gemini-2.5-pro';

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
  if (req.url === '/process-image' && req.method === 'POST') {
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
  if (req.url === '/package-results' && req.method === 'POST') {
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

// 处理图片上传和处理的函数
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

      // 处理上传的图片（目前模拟处理，后续集成 Gemini API）
      const processedImagePath = await processImageWithAI(imageFile[0] || imageFile);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        processedImageUrl: processedImagePath
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

// 使用 Gemini AI 处理图片
async function processImageWithAI(imageFile) {
  const timestamp = Date.now();
  const ext = path.extname(imageFile.originalFilename || imageFile.name || '.png');
  const processedFilename = `processed_${timestamp}.png`; // 统一输出为 PNG 格式
  const processedPath = path.join('./processed', processedFilename);

  try {
    if (API_KEY && API_KEY !== 'your_api_key_here') {
      // 使用 302.ai API 进行图片分析和处理
      debugLog('使用 302.ai API 分析图片...');

      // 先压缩图片以减少payload大小
      const compressedImagePath = path.join('./uploads', `compressed_${timestamp}.jpg`);
      await sharp(imageFile.filepath)
        .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 60 })
        .toFile(compressedImagePath);

      // 读取压缩后的图片
      const imageData = fs.readFileSync(compressedImagePath);
      const imageBase64 = imageData.toString('base64');
      const mimeType = 'image/jpeg';

      debugLog(`压缩后图片大小: ${Math.round(imageData.length / 1024)}KB`);

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
      const maxRetries = 3;

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
            timeout: 60000 // 60秒超时
          });

          debugLog('API响应状态:', apiResponse.status);
          if (isDevelopment) {
            debugLog('API响应结构:', JSON.stringify(apiResponse.data, null, 2));
          }

          const analysisText = apiResponse.data.choices?.[0]?.message?.content || '';
          debugLog('AI 分析结果:', analysisText);
          debugLog('响应内容长度:', analysisText.length);

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
            debugLog(`等待 ${retryCount * 2} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 2000));
          }
        }
      }

      // 清理压缩文件
      if (fs.existsSync(compressedImagePath)) {
        fs.unlinkSync(compressedImagePath);
      }

      // 如果有分析结果，进行精确的商品主体提取
      if (analysis && analysis.main_subject) {
        const newProcessedUrl = await extractProductSubject(imageFile.filepath, processedPath, analysis);
        return newProcessedUrl;
      } else {
        errorLog('AI分析失败，返回错误信息');
        if (!API_KEY || API_KEY === 'your_api_key_here') {
          throw new Error('API Key 未配置，请检查您的API密钥配置');
        } else {
          throw new Error('AI调用失败，请检查网络连接或稍后重试');
        }
      }
    } else {
      // 如果没有配置 API，返回错误信息
      errorLog('未配置API，返回错误信息');
      throw new Error('API Key 未配置，请检查您的API密钥配置');
    }

  } catch (error) {
    errorLog('AI processing failed:', error);
    // 直接传递原始错误信息，不要修改
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

    // 策略3: 递归查找最大完整JSON
    () => {
      let depth = 0;
      let start = -1;
      let end = -1;

      for (let i = 0; i < cleanText.length; i++) {
        if (cleanText[i] === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (cleanText[i] === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            end = i;
            break;
          }
        }
      }

      if (start !== -1 && end !== -1) {
        const jsonStr = cleanText.substring(start, end + 1);
        return JSON.parse(jsonStr);
      }
      throw new Error('No balanced JSON found');
    },

    // 策略4: 修复常见JSON错误
    () => {
      let fixedText = cleanText;

      // 修复常见的末尾问题
      if (!fixedText.endsWith('}')) {
        // 尝试自动补齐缺失的闭合标记
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

  // 检查基本信息（放宽要求）
  if (!subject.subject_type && !subject.filename_safe) {
    console.log('缺少商品类型或文件名信息');
    return false;
  }

  console.log('AI分析结果验证通过');
  return true;
}

// 精确提取商品主体 - 简化版本
async function extractProductSubject(inputPath, outputPath, analysis) {
  console.log('开始精确商品主体提取...', analysis.main_subject.subject_type);

  try {
    const { tight_bbox } = analysis.main_subject;

    // 获取原图信息
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;

    // 计算裁切区域（智能检测bbox格式）
    // 如果bbox值大于1，认为是像素格式；否则为比例格式
    const isPixelFormat = tight_bbox.x > 1 || tight_bbox.y > 1 || tight_bbox.width > 1 || tight_bbox.height > 1;

    let cropLeft, cropTop, cropWidth, cropHeight;

    if (isPixelFormat) {
      // 像素格式：直接使用数值，但要确保在图像范围内
      cropLeft = Math.max(0, Math.floor(tight_bbox.x));
      cropTop = Math.max(0, Math.floor(tight_bbox.y));
      cropWidth = Math.min(width - cropLeft, Math.floor(tight_bbox.width));
      cropHeight = Math.min(height - cropTop, Math.floor(tight_bbox.height));
      debugLog('检测到像素格式bbox');
    } else {
      // 比例格式：乘以图像尺寸
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

    // 步骤1: 简单裁切
    const croppedImageBuffer = await sharp(inputPath)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight
      })
      .toBuffer();

    // 步骤2: 尝试应用AI智能遮挡物消除，失败时使用裁切结果
    let processedBuffer;
    try {
      processedBuffer = await applyAIObstructionRemoval(croppedImageBuffer);
    } catch (error) {
      console.log('AI遮挡物消除失败，使用裁切结果:', error.message);
      processedBuffer = croppedImageBuffer; // 使用裁切后的图片
    }

    // 步骤3: 保存处理后的结果
    const filename = analysis.main_subject.filename_safe || `product_${Date.now()}`;
    const finalPath = outputPath.replace(/processed_\d+\.png$/, `${filename}.png`);

    await sharp(processedBuffer)
      .png({
        quality: 95,
        compressionLevel: 6,
        adaptiveFiltering: true
      })
      .toFile(finalPath);

    infoLog('商品主体提取完成，文件名:', filename);
    return finalPath.replace('./processed/', '/processed/');

  } catch (error) {
    errorLog('商品主体提取失败:', error);
    // 不再进行降级处理，直接抛出错误
    throw new Error('商品主体提取失败 - ' + error.message);
  }
}

// 智能遮挡物消除（替代简单背景移除）
// 真正的AI智能遮挡物消除
async function applyAIObstructionRemoval(croppedImageBuffer) {
  try {
    debugLog('应用AI智能遮挡物消除...');

    // 将裁切后的图片转换为base64发送给AI
    const imageBase64 = croppedImageBuffer.toString('base64');
    const mimeType = 'image/png';

    const prompt = `请帮助我智能消除这个商品图片上的文字、标签、图案等遮挡物，保持商品本体完整不变。请直接返回修复后的完整图片，而不是文字描述。如果可以，请以base64格式或直接作为图像输出处理后的结果。`;

    // 调用AI进行智能遮挡物消除
    const apiResponse = await axios.post(API_URL, {
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content: "你是专业的图像编辑AI。专门负责智能消除商品图片上的文字、标签、图案等遮挡物，同时完美保持商品本体的完整性和质感。"
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
      timeout: 60000
    });

    console.log('AI遮挡物消除API调用完成');

    // 检查AI是否返回了处理后的图片或图像内容
    if (apiResponse.data.choices && apiResponse.data.choices[0] && apiResponse.data.choices[0].message) {
      const response = apiResponse.data.choices[0].message.content;
      console.log('AI处理响应:', response.substring(0, 200));

      // 检查响应中是否包含图像数据或base64编码的图片
      if (response.includes('data:image/') || response.includes('base64,')) {
        console.log('检测到AI返回的图像数据');
        // TODO: 提取并返回图像数据
        // 暂时返回原始图片，等待进一步的图像提取逻辑
        return croppedImageBuffer;
      } else {
        // AI返回了文字描述但没有实际生成图片
        console.log('AI返回了处理描述但未生成实际图片');
        return croppedImageBuffer; // 返回裁切后的图片
      }
    }

    throw new Error('AI遮挡物消除 - API响应格式异常');

  } catch (error) {
    if (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED') {
      throw new Error('AI遮挡物消除失败 - 网络连接超时，请检查网络状态');
    } else if (error.response && error.response.status === 401) {
      throw new Error('AI遮挡物消除失败 - API认证错误，请检查API密钥配置');
    } else if (error.response && error.response.status === 429) {
      throw new Error('AI遮挡物消除失败 - API调用频率限制，请稍后重试');
    } else {
      throw new Error(`AI遮挡物消除失败 - ${error.message}`);
    }
  }
}

// 检测遮挡物（文字、图案等）
function detectObstructions(data, width, height, channels, dominantColors) {
  console.log('检测遮挡物...');

  const mask = new Uint8Array(width * height);
  const productColors = dominantColors.map(hex => hexToRgb(hex));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // 检测是否为商品主体颜色
      let isProductColor = false;
      for (const productColor of productColors) {
        const colorDiff = Math.abs(r - productColor.r) + Math.abs(g - productColor.g) + Math.abs(b - productColor.b);
        if (colorDiff < 60) {
          isProductColor = true;
          break;
        }
      }

      // 检测高对比度边缘（可能是文字）
      const isHighContrast = checkHighContrast(data, x, y, width, height, channels);

      // 检测异常颜色（非商品颜色且高对比度的区域标记为遮挡物）
      if (!isProductColor && isHighContrast) {
        mask[y * width + x] = 255; // 标记为遮挡物
      } else {
        mask[y * width + x] = 0;   // 保持原样
      }
    }
  }

  return mask;
}

// 检测高对比度边缘
function checkHighContrast(data, x, y, width, height, channels) {
  if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return false;

  const centerIdx = (y * width + x) * channels;
  const centerBrightness = (data[centerIdx] + data[centerIdx + 1] + data[centerIdx + 2]) / 3;

  // 检查周围8个像素
  let maxDiff = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const neighborIdx = ((y + dy) * width + (x + dx)) * channels;
      const neighborBrightness = (data[neighborIdx] + data[neighborIdx + 1] + data[neighborIdx + 2]) / 3;
      const diff = Math.abs(centerBrightness - neighborBrightness);
      maxDiff = Math.max(maxDiff, diff);
    }
  }

  return maxDiff > 80; // 高对比度阈值
}

// 智能修复遮挡区域
async function performIntelligentRepair(data, mask, width, height, channels, dominantColors) {
  console.log('执行智能修复...');

  const result = new Uint8Array(data);
  const productColors = dominantColors.map(hex => hexToRgb(hex));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;

      if (mask[y * width + x] > 0) {
        // 这是遮挡物区域，需要修复
        const repairedColor = getRepairedColor(x, y, width, height, data, mask, channels, productColors);

        result[idx] = repairedColor.r;
        result[idx + 1] = repairedColor.g;
        result[idx + 2] = repairedColor.b;
        result[idx + 3] = 255; // 保持不透明
      }
    }
  }

  return result;
}

// 获取修复颜色（基于周围非遮挡像素的插值）
function getRepairedColor(x, y, width, height, data, mask, channels, productColors) {
  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  // 搜索范围逐渐扩大，直到找到足够的非遮挡像素
  for (let radius = 1; radius <= 10 && count < 8; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (mask[ny * width + nx] === 0) { // 非遮挡像素
            const idx = (ny * width + nx) * channels;
            totalR += data[idx];
            totalG += data[idx + 1];
            totalB += data[idx + 2];
            count++;
          }
        }
      }
    }
  }

  if (count > 0) {
    return {
      r: Math.round(totalR / count),
      g: Math.round(totalG / count),
      b: Math.round(totalB / count)
    };
  } else {
    // 降级到使用主色调
    return productColors[0] || { r: 128, g: 128, b: 128 };
  }
}

// 边缘保护清理（保持清晰边缘）
async function applyEdgePreservingCleanup(data, width, height, channels) {
  console.log('应用边缘保护清理...');

  // 仅对内部区域进行轻微平滑，保持边缘清晰
  const result = new Uint8Array(data);
  const margin = Math.min(width, height) * 0.1; // 10% 边距保护

  for (let y = margin; y < height - margin; y++) {
    for (let x = margin; x < width - margin; x++) {
      const idx = (y * width + x) * channels;

      // 只对内部区域应用轻微平滑
      if (x > margin && x < width - margin && y > margin && y < height - margin) {
        // 3x3 轻微平滑（不影响边缘）
        let avgR = 0, avgG = 0, avgB = 0, count = 0;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nIdx = ((y + dy) * width + (x + dx)) * channels;
            avgR += data[nIdx];
            avgG += data[nIdx + 1];
            avgB += data[nIdx + 2];
            count++;
          }
        }

        // 轻微混合（保持70%原始，30%平滑）
        result[idx] = Math.round(data[idx] * 0.7 + (avgR / count) * 0.3);
        result[idx + 1] = Math.round(data[idx + 1] * 0.7 + (avgG / count) * 0.3);
        result[idx + 2] = Math.round(data[idx + 2] * 0.7 + (avgB / count) * 0.3);
      }
    }
  }

  return result;
}

// 基本清理降级方案
async function applyBasicCleanup(imageBuffer, width, height) {
  try {
    console.log('应用基本清理...');

    // 简单的降噪处理，不虚化边缘
    return await sharp(imageBuffer)
      .median(3) // 轻微降噪
      .toBuffer();

  } catch (error) {
    console.error('基本清理失败:', error);
    throw new Error('图像基本清理处理失败 - ' + error.message);
  }
}

// 简化的背景移除（避免复杂的composite操作）- 保留作为备用
async function applySimpleBackgroundRemoval(imageBuffer, width, height) {
  try {
    console.log('应用简化背景移除...');

    // 创建简单的径向渐变透明蒙版
    const maskSvg = `
      <svg width="${width}" height="${height}">
        <defs>
          <radialGradient id="simpleMask" cx="50%" cy="50%" r="60%">
            <stop offset="0%" style="stop-color:white;stop-opacity:1" />
            <stop offset="75%" style="stop-color:white;stop-opacity:0.9" />
            <stop offset="100%" style="stop-color:white;stop-opacity:0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#simpleMask)" />
      </svg>
    `;

    // 使用简单的blend操作
    const result = await sharp(imageBuffer)
      .composite([
        {
          input: Buffer.from(maskSvg),
          blend: 'dest-in'
        }
      ])
      .toBuffer();

    console.log('简化背景移除完成');
    return result;

  } catch (error) {
    console.error('简化背景移除失败:', error);
    throw new Error('背景移除处理失败 - ' + error.message);
  }
}

// 基本裁切降级处理
async function performBasicCrop(inputPath, outputPath, analysis) {
  try {
    console.log('执行基本裁切降级处理...');

    const { tight_bbox } = analysis.main_subject;
    const metadata = await sharp(inputPath).metadata();
    const { width, height } = metadata;

    // 添加10%的边距作为安全区域
    const padding = 0.1;
    const cropLeft = Math.max(0, Math.round(width * (tight_bbox.x - padding)));
    const cropTop = Math.max(0, Math.round(height * (tight_bbox.y - padding)));
    const cropWidth = Math.min(
      width - cropLeft,
      Math.round(width * (tight_bbox.width + padding * 2))
    );
    const cropHeight = Math.min(
      height - cropTop,
      Math.round(height * (tight_bbox.height + padding * 2))
    );

    await sharp(inputPath)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight
      })
      .png({ quality: 90 })
      .toFile(outputPath);

    console.log('基本裁切完成');
  } catch (error) {
    console.error('基本裁切失败:', error);
    throw new Error('图像裁切处理失败 - ' + error.message);
  }
}

// 通用商品分割算法 - 改进版
async function applyUniversalProductSegmentation(image, subjectInfo) {
  try {
    console.log('应用通用商品分割算法');

    const metadata = await image.metadata();
    const { width, height } = metadata;

    // 获取主色调信息
    const dominantColors = subjectInfo.dominant_colors || ['#888888'];
    const productColors = dominantColors.map(hex => hexToRgb(hex));

    // 方法1：基于主色调的精确分割
    if (dominantColors.length > 0 && dominantColors[0] !== '#888888') {
      return await applyColorBasedSegmentation(image, productColors, width, height);
    }

    // 方法2：边缘检测 + 中心保护
    return await applyEdgeBasedSegmentation(image, width, height);

  } catch (error) {
    console.error('通用分割算法失败:', error);
    return image;
  }
}

// 基于颜色的分割
async function applyColorBasedSegmentation(image, productColors, width, height) {
  try {
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { channels } = info;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 检查是否为商品主体颜色
      let isProductColor = false;
      for (const productColor of productColors) {
        const colorDiff = Math.abs(r - productColor.r) + Math.abs(g - productColor.g) + Math.abs(b - productColor.b);
        if (colorDiff < 100) { // 适中的容差
          isProductColor = true;
          break;
        }
      }

      // 位置权重：中心区域更重要
      const x = Math.floor((i / channels) % width);
      const y = Math.floor((i / channels) / width);
      const centerWeight = 1 - Math.sqrt(
        Math.pow((x - width/2) / (width/2), 2) +
        Math.pow((y - height/2) / (height/2), 2)
      );

      if (isProductColor || centerWeight > 0.6) {
        // 保持商品像素或中心区域
        data[i + 3] = 255;
      } else {
        // 边缘和背景区域渐变透明
        data[i + 3] = Math.max(0, centerWeight * 255);
      }
    }

    return sharp(data, { raw: { width, height, channels } });
  } catch (error) {
    console.error('颜色分割失败:', error);
    throw error;
  }
}

// 基于边缘检测的分割
async function applyEdgeBasedSegmentation(image, width, height) {
  try {
    // 创建一个更精确的径向蒙版
    const maskSvg = `
      <svg width="${width}" height="${height}">
        <defs>
          <radialGradient id="productMask" cx="50%" cy="50%" r="55%">
            <stop offset="0%" style="stop-color:white;stop-opacity:1" />
            <stop offset="40%" style="stop-color:white;stop-opacity:1" />
            <stop offset="80%" style="stop-color:white;stop-opacity:0.3" />
            <stop offset="100%" style="stop-color:white;stop-opacity:0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#productMask)" />
      </svg>
    `;

    return image.composite([
      {
        input: Buffer.from(maskSvg),
        blend: 'dest-in'
      }
    ]);
  } catch (error) {
    console.error('边缘分割失败:', error);
    throw error;
  }
}

// 颜色转换辅助函数
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 140, b: 0 }; // 默认橙色
}
async function processProductImageComplete(inputPath, outputPath, analysis) {
  console.log('开始完整的图片处理流程...', analysis.product_type);

  let currentPath = inputPath;
  let step = 1;

  try {
    // 第一步：智能裁切
    console.log(`步骤 ${step}: 开始智能裁切`);
    const tempCroppedPath = outputPath.replace('.png', '_cropped.png');
    try {
      await cropImageWithBoundingBox(currentPath, tempCroppedPath, analysis.bounding_box, analysis.processing_suggestions);
      currentPath = tempCroppedPath;
      console.log(`步骤 ${step}: 裁切成功`);
    } catch (error) {
      console.error(`步骤 ${step}: 裁切失败，跳过该步骤:`, error.message);
    }
    step++;

    // 第二步：背景移除
    console.log(`步骤 ${step}: 开始背景移除`);
    const tempNoBgPath = outputPath.replace('.png', '_nobg.png');
    try {
      await removeBackground(currentPath, tempNoBgPath, analysis.background_info);
      // 只有成功时才更新当前路径
      if (fs.existsSync(tempNoBgPath)) {
        if (currentPath !== inputPath) fs.unlinkSync(currentPath);
        currentPath = tempNoBgPath;
        console.log(`步骤 ${step}: 背景移除成功`);
      }
    } catch (error) {
      console.error(`步骤 ${step}: 背景移除失败，跳过该步骤:`, error.message);
    }
    step++;

    // 第三步：移除遮挡物
    if (analysis.obstructions && analysis.obstructions.length > 0) {
      console.log(`步骤 ${step}: 开始移除遮挡物`);
      const tempCleanPath = outputPath.replace('.png', '_clean.png');
      try {
        await removeObstructions(currentPath, tempCleanPath, analysis.obstructions);
        if (fs.existsSync(tempCleanPath)) {
          if (currentPath !== inputPath) fs.unlinkSync(currentPath);
          currentPath = tempCleanPath;
          console.log(`步骤 ${step}: 遮挡物移除成功`);
        }
      } catch (error) {
        console.error(`步骤 ${step}: 遮挡物移除失败，跳过该步骤:`, error.message);
      }
      step++;
    } else {
      console.log(`步骤 ${step}: 未检测到遮挡物，跳过移除步骤`);
    }

    // 第四步：最终优化
    console.log(`步骤 ${step}: 开始最终优化`);
    try {
      await optimizeProcessedImage(currentPath, outputPath, analysis.processing_suggestions);
      console.log(`步骤 ${step}: 最终优化成功`);
    } catch (error) {
      console.error(`步骤 ${step}: 最终优化失败，使用当前结果:`, error.message);
      // 如果最终优化失败，至少保存当前处理结果
      if (currentPath !== outputPath) {
        fs.copyFileSync(currentPath, outputPath);
      }
    }

    // 清理临时文件
    if (currentPath !== inputPath && currentPath !== outputPath && fs.existsSync(currentPath)) {
      fs.unlinkSync(currentPath);
    }

    console.log('图片处理完成:', analysis.product_type);
  } catch (error) {
    console.error('图片处理过程中出现严重错误:', error);
    // 不进行降级处理，直接抛出错误
    throw new Error('AI连接暂不可用，请检查您的网络连接');
  }
}

// 智能裁切图片 - 改进精度
async function cropImageWithBoundingBox(inputPath, outputPath, boundingBox, suggestions = {}) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();

    // 改进的边距计算，根据图片大小动态调整
    const basePadding = suggestions.crop_padding || 0.03;
    const dynamicPadding = Math.min(basePadding, 50 / Math.min(metadata.width, metadata.height));

    // 计算更精确的裁切区域
    const rawLeft = metadata.width * boundingBox.x;
    const rawTop = metadata.height * boundingBox.y;
    const rawWidth = metadata.width * boundingBox.width;
    const rawHeight = metadata.height * boundingBox.height;

    // 添加动态边距，但确保不超出图片边界
    const paddingPixelsX = metadata.width * dynamicPadding;
    const paddingPixelsY = metadata.height * dynamicPadding;

    const left = Math.max(0, Math.round(rawLeft - paddingPixelsX));
    const top = Math.max(0, Math.round(rawTop - paddingPixelsY));
    const right = Math.min(metadata.width, Math.round(rawLeft + rawWidth + paddingPixelsX));
    const bottom = Math.min(metadata.height, Math.round(rawTop + rawHeight + paddingPixelsY));

    const finalWidth = right - left;
    const finalHeight = bottom - top;

    // 确保最小尺寸
    if (finalWidth < 50 || finalHeight < 50) {
      console.warn('裁切区域太小，使用原图');
      await image.png({ quality: 90, compressionLevel: 6 }).toFile(outputPath);
      return;
    }

    await image
      .extract({ left, top, width: finalWidth, height: finalHeight })
      .png({ quality: 90, compressionLevel: 6 })
      .toFile(outputPath);

    console.log(`精确裁切完成: ${finalWidth}x${finalHeight} at (${left},${top})`);
    console.log(`原始边界框: x=${boundingBox.x}, y=${boundingBox.y}, w=${boundingBox.width}, h=${boundingBox.height}`);
  } catch (error) {
    console.error('裁切失败:', error);
    // 抛出错误而不是降级
    throw new Error('图像裁切处理失败 - ' + error.message);
  }
}

// 移除背景 - 使用 Sharp 实现
async function removeBackground(inputPath, outputPath, backgroundInfo = {}) {
  try {
    console.log('开始背景移除，背景类型:', backgroundInfo.type);

    const image = sharp(inputPath);
    const { width, height } = await image.metadata();

    // 基于背景类型选择不同的处理策略
    if (backgroundInfo.type === '纯色' || backgroundInfo.removal_difficulty === '简单') {
      // 对于纯色背景，使用颜色去除
      await removeUniformBackgroundSharp(image, outputPath, backgroundInfo.color);
    } else {
      // 对于复杂背景，使用边缘检测和渐变透明
      await removeComplexBackgroundSharp(image, outputPath, width, height);
    }

    console.log('背景移除完成');
  } catch (error) {
    console.error('背景移除失败:', error);
    // 抛出错误而不是降级
    throw new Error('背景移除处理失败 - ' + error.message);
  }
}

// 使用 Sharp 移除纯色背景
async function removeUniformBackgroundSharp(image, outputPath, backgroundColor) {
  try {
    // 获取图片的 RGBA 数据
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    // 采样边角像素来确定背景色
    const cornerSamples = [
      { r: data[0], g: data[1], b: data[2] },
      { r: data[(width - 1) * channels], g: data[(width - 1) * channels + 1], b: data[(width - 1) * channels + 2] },
      { r: data[(height - 1) * width * channels], g: data[(height - 1) * width * channels + 1], b: data[(height - 1) * width * channels + 2] },
      { r: data[((height - 1) * width + width - 1) * channels], g: data[((height - 1) * width + width - 1) * channels + 1], b: data[((height - 1) * width + width - 1) * channels + 2] }
    ];

    // 计算平均背景色
    const bgColor = cornerSamples.reduce((acc, sample) => ({
      r: acc.r + sample.r / cornerSamples.length,
      g: acc.g + sample.g / cornerSamples.length,
      b: acc.b + sample.b / cornerSamples.length
    }), { r: 0, g: 0, b: 0 });

    const tolerance = 40; // 颜色容差

    // 处理每个像素
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 计算与背景色的差异
      const diff = Math.abs(r - bgColor.r) + Math.abs(g - bgColor.g) + Math.abs(b - bgColor.b);

      if (diff < tolerance) {
        // 设置为透明
        data[i + 3] = 0;
      } else {
        // 保持不透明
        data[i + 3] = 255;
      }
    }

    // 创建新的图片并保存
    await sharp(data, { raw: { width, height, channels } })
      .png()
      .toFile(outputPath);

  } catch (error) {
    console.error('纯色背景移除失败:', error);
    // 降级处理
    await image.png().toFile(outputPath);
  }
}

// 使用 Sharp 移除复杂背景
async function removeComplexBackgroundSharp(image, outputPath, width, height) {
  try {
    // 创建一个径向渐变蒙版，中心保持不透明，边缘逐渐透明
    const centerX = Math.round(width / 2);
    const centerY = Math.round(height / 2);
    const maxRadius = Math.min(width, height) * 0.45; // 调整半径比例

    // 创建 SVG 径向渐变蒙版
    const maskSvg = `
      <svg width="${width}" height="${height}">
        <defs>
          <radialGradient id="grad" cx="50%" cy="50%" r="45%">
            <stop offset="0%" style="stop-color:white;stop-opacity:1" />
            <stop offset="70%" style="stop-color:white;stop-opacity:0.9" />
            <stop offset="100%" style="stop-color:white;stop-opacity:0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)" />
      </svg>
    `;

    // 应用蒙版
    await image
      .composite([
        {
          input: Buffer.from(maskSvg),
          blend: 'dest-in'
        }
      ])
      .png()
      .toFile(outputPath);

  } catch (error) {
    console.error('复杂背景移除失败:', error);
    // 降级处理 - 简单的边缘渐变
    await image
      .extend({
        top: 0, bottom: 0, left: 0, right: 0,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(outputPath);
  }
}

// 移除遮挡物（文字、标签等）- 使用 Sharp 实现
async function removeObstructions(inputPath, outputPath, obstructions) {
  try {
    console.log('开始移除遮挡物，数量:', obstructions.length);

    let image = sharp(inputPath);
    const { width, height } = await image.metadata();

    // 为每个遮挡物创建蒙版并应用修复
    for (const obstruction of obstructions) {
      const { location } = obstruction;
      const left = Math.round(width * location.x);
      const top = Math.round(height * location.y);
      const obsWidth = Math.round(width * location.width);
      const obsHeight = Math.round(height * location.height);

      console.log(`移除 ${obstruction.type}: (${left},${top}) ${obsWidth}x${obsHeight}`);

      // 使用修复算法填补遮挡物区域
      image = await inpaintRegionSharp(image, left, top, obsWidth, obsHeight, width, height);
    }

    await image.png().toFile(outputPath);
    console.log('遮挡物移除完成');
  } catch (error) {
    console.error('遮挡物移除失败:', error);
    throw new Error('遮挡物移除处理失败 - ' + error.message);
  }
}

// 使用 Sharp 进行图像修复
async function inpaintRegionSharp(image, x, y, width, height, imgWidth, imgHeight) {
  try {
    // 创建一个模糊并缩放的背景来填充遮挡区域
    const blurredImage = image.clone().blur(10);

    // 创建一个蒙版，只对指定区域进行处理
    const maskSvg = `
      <svg width="${imgWidth}" height="${imgHeight}">
        <defs>
          <radialGradient id="inpaint" cx="${(x + width/2) / imgWidth * 100}%" cy="${(y + height/2) / imgHeight * 100}%" r="${Math.max(width, height) / Math.min(imgWidth, imgHeight) * 50}%">
            <stop offset="0%" style="stop-color:white;stop-opacity:1" />
            <stop offset="50%" style="stop-color:white;stop-opacity:0.8" />
            <stop offset="100%" style="stop-color:white;stop-opacity:0" />
          </radialGradient>
        </defs>
        <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#inpaint)" />
      </svg>
    `;

    // 使用模糊后的图像来替换遮挡区域
    const result = await image
      .composite([
        {
          input: await blurredImage.toBuffer(),
          left: 0,
          top: 0,
          blend: 'over'
        },
        {
          input: Buffer.from(maskSvg),
          blend: 'dest-in'
        }
      ]);

    return result;
  } catch (error) {
    console.error('图像修复失败:', error);
    return image;
  }
}

// 最终图片优化
async function optimizeProcessedImage(inputPath, outputPath, suggestions = {}) {
  try {
    let image = sharp(inputPath);

    // 应用建议的优化
    if (suggestions.edge_softening) {
      image = image.blur(0.5);
    }

    if (suggestions.color_enhancement) {
      image = image.modulate({
        brightness: 1.1,
        saturation: 1.1
      });
    }

    await image
      .png({
        quality: 95,
        compressionLevel: 6,
        adaptiveFiltering: true
      })
      .toFile(outputPath);

    console.log('图片优化完成');
  } catch (error) {
    console.error('图片优化失败:', error);
    throw new Error('图片优化处理失败 - ' + error.message);
  }
}

// 智能降级处理 - 当AI不可用时的高级图片处理
async function intelligentFallbackProcessing(inputPath, outputPath) {
  try {
    console.log('开始智能降级处理...');

    const image = sharp(inputPath);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // 步骤1: 智能检测图片类型和背景
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const { channels } = info;

    // 分析图片特征
    const features = analyzeImageFeatures(data, width, height, channels);
    console.log('图片特征分析:', features);

    // 步骤2: 根据特征选择处理策略
    let processedImage;
    if (features.hasUniformBackground) {
      // 纯色背景，使用颜色分离
      console.log('检测到纯色背景，使用颜色分离算法');
      processedImage = await processUniformBackground(image, features.backgroundColor, width, height);
    } else {
      // 复杂背景，使用中心聚焦算法
      console.log('检测到复杂背景，使用中心聚焦算法');
      processedImage = await processCenterFocused(image, width, height);
    }

    // 步骤3: 应用智能裁切
    const croppedImage = await applyIntelligentCrop(processedImage, width, height);

    // 步骤4: 最终优化
    await croppedImage
      .png({
        quality: 95,
        compressionLevel: 6,
        adaptiveFiltering: true
      })
      .toFile(outputPath);

    console.log('智能降级处理完成');
  } catch (error) {
    console.error('智能降级处理失败:', error);
    // 不进行降级处理，直接抛出错误
    throw new Error('AI连接暂不可用，请检查您的网络连接');
  }
}

// 分析图片特征
function analyzeImageFeatures(data, width, height, channels) {
  const features = {
    hasUniformBackground: false,
    backgroundColor: null,
    centerWeight: 0,
    edgeVariance: 0
  };

  // 采样边角像素检测背景色
  const cornerSamples = [];
  const sampleSize = Math.min(50, Math.floor(width * 0.1)); // 取边角10%区域

  // 四个角落采样
  for (let corner = 0; corner < 4; corner++) {
    const samples = [];
    let startX, startY;

    switch (corner) {
      case 0: startX = 0; startY = 0; break; // 左上
      case 1: startX = width - sampleSize; startY = 0; break; // 右上
      case 2: startX = 0; startY = height - sampleSize; break; // 左下
      case 3: startX = width - sampleSize; startY = height - sampleSize; break; // 右下
    }

    for (let y = startY; y < startY + sampleSize; y++) {
      for (let x = startX; x < startX + sampleSize; x++) {
        const idx = (y * width + x) * channels;
        samples.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        });
      }
    }
    cornerSamples.push(samples);
  }

  // 计算各角落的平均颜色
  const cornerAvgs = cornerSamples.map(samples => {
    const total = samples.reduce((acc, sample) => ({
      r: acc.r + sample.r,
      g: acc.g + sample.g,
      b: acc.b + sample.b
    }), { r: 0, g: 0, b: 0 });

    return {
      r: Math.round(total.r / samples.length),
      g: Math.round(total.g / samples.length),
      b: Math.round(total.b / samples.length)
    };
  });

  // 检查四个角落颜色的一致性
  const colorDifferences = [];
  for (let i = 0; i < cornerAvgs.length; i++) {
    for (let j = i + 1; j < cornerAvgs.length; j++) {
      const diff = Math.abs(cornerAvgs[i].r - cornerAvgs[j].r) +
                   Math.abs(cornerAvgs[i].g - cornerAvgs[j].g) +
                   Math.abs(cornerAvgs[i].b - cornerAvgs[j].b);
      colorDifferences.push(diff);
    }
  }

  const avgColorDiff = colorDifferences.reduce((a, b) => a + b, 0) / colorDifferences.length;

  // 如果四个角落颜色相似（差异小于30），认为是纯色背景
  if (avgColorDiff < 30) {
    features.hasUniformBackground = true;
    // 使用四个角落的平均色作为背景色
    features.backgroundColor = {
      r: Math.round(cornerAvgs.reduce((sum, avg) => sum + avg.r, 0) / cornerAvgs.length),
      g: Math.round(cornerAvgs.reduce((sum, avg) => sum + avg.g, 0) / cornerAvgs.length),
      b: Math.round(cornerAvgs.reduce((sum, avg) => sum + avg.b, 0) / cornerAvgs.length)
    };
  }

  return features;
}

// 处理纯色背景图片
async function processUniformBackground(image, backgroundColor, width, height) {
  try {
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { channels } = info;

    const tolerance = 40; // 颜色容差

    // 处理每个像素
    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 计算与背景色的差异
      const diff = Math.abs(r - backgroundColor.r) +
                   Math.abs(g - backgroundColor.g) +
                   Math.abs(b - backgroundColor.b);

      // 计算像素到中心的距离权重
      const x = Math.floor((i / channels) % width);
      const y = Math.floor((i / channels) / width);
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
      const distance = Math.sqrt((x - centerX) * (x - centerX) + (y - centerY) * (y - centerY));
      const centerWeight = 1 - (distance / maxDistance);

      if (diff < tolerance || centerWeight < 0.3) {
        // 背景区域或边缘区域设为透明
        data[i + 3] = Math.max(0, centerWeight * 255);
      } else {
        // 前景区域保持不透明
        data[i + 3] = 255;
      }
    }

    return sharp(data, { raw: { width, height, channels } });
  } catch (error) {
    console.error('纯色背景处理失败:', error);
    throw error;
  }
}

// 处理复杂背景图片（中心聚焦）
async function processCenterFocused(image, width, height) {
  try {
    // 创建径向渐变蒙版，重点保护中心区域
    const maskSvg = `
      <svg width="${width}" height="${height}">
        <defs>
          <radialGradient id="centerFocus" cx="50%" cy="50%" r="60%">
            <stop offset="0%" style="stop-color:white;stop-opacity:1" />
            <stop offset="30%" style="stop-color:white;stop-opacity:1" />
            <stop offset="60%" style="stop-color:white;stop-opacity:0.8" />
            <stop offset="80%" style="stop-color:white;stop-opacity:0.3" />
            <stop offset="100%" style="stop-color:white;stop-opacity:0" />
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#centerFocus)" />
      </svg>
    `;

    return image.composite([
      {
        input: Buffer.from(maskSvg),
        blend: 'dest-in'
      }
    ]);
  } catch (error) {
    console.error('中心聚焦处理失败:', error);
    throw error;
  }
}

// 应用智能裁切
async function applyIntelligentCrop(image, originalWidth, originalHeight) {
  try {
    // 获取处理后图片的透明区域信息
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    // 找到非透明像素的边界
    let minX = width, maxX = 0, minY = height, maxY = 0;
    let hasContent = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * channels;
        const alpha = data[idx + 3];

        if (alpha > 50) { // 非透明像素
          hasContent = true;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (!hasContent) {
      // 如果没有找到内容，返回原图
      return image;
    }

    // 添加适当的边距
    const padding = Math.min(width, height) * 0.05; // 5% 边距
    const cropLeft = Math.max(0, minX - padding);
    const cropTop = Math.max(0, minY - padding);
    const cropWidth = Math.min(width - cropLeft, maxX - minX + padding * 2);
    const cropHeight = Math.min(height - cropTop, maxY - minY + padding * 2);

    // 确保裁切区域不会太小
    if (cropWidth < 100 || cropHeight < 100) {
      return image;
    }

    console.log(`智能裁切: ${Math.round(cropWidth)}x${Math.round(cropHeight)} at (${Math.round(cropLeft)},${Math.round(cropTop)})`);

    return image.extract({
      left: Math.round(cropLeft),
      top: Math.round(cropTop),
      width: Math.round(cropWidth),
      height: Math.round(cropHeight)
    });
  } catch (error) {
    console.error('智能裁切失败:', error);
    return image;
  }
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
          const fileName = `processed_image_${i + 1}.png`;
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
            const fileName = `processed_image_${i + 1}.png`;
            archive.file(altPath1, { name: fileName });
            addedCount++;
            debugLog(`使用备用路径1成功: ${fileName} (源: ${altPath1})`);
          } else if (fs.existsSync(altPath2)) {
            const fileName = `processed_image_${i + 1}.png`;
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
