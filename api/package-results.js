// Vercel serverless function for batch packaging
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
    await handlePackageResults(req, res);
  } catch (error) {
    console.error('Error packaging results:', error);
    res.status(500).json({ success: false, error: '打包失败' });
  }
}

// 处理批量打包下载请求
async function handlePackageResults(req, res) {
  console.log('处理批量打包下载请求...');

  try {
    const { urls } = req.body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      res.status(400).json({ success: false, error: '无效的文件URL列表' });
      return;
    }

    // 在Vercel环境中，我们需要直接返回base64编码的zip文件
    // 而不是创建文件系统中的文件
    const zipBuffer = await createZipBuffer(urls);

    // 返回base64编码的zip文件
    const zipBase64 = zipBuffer.toString('base64');

    res.status(200).json({
      success: true,
      downloadUrl: `data:application/zip;base64,${zipBase64}`,
      fileCount: urls.length,
      zipSize: zipBuffer.length
    });

  } catch (error) {
    console.error('打包处理失败:', error);
    res.status(500).json({
      success: false,
      error: '打包失败: ' + error.message
    });
  }
}

// 创建ZIP文件缓冲区
async function createZipBuffer(urls) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', {
      zlib: { level: 9 } // 压缩级别
    });

    const buffers = [];

    archive.on('data', (chunk) => {
      buffers.push(chunk);
    });

    archive.on('end', () => {
      const zipBuffer = Buffer.concat(buffers);
      console.log(`ZIP文件创建完成, 大小: ${zipBuffer.length} bytes`);
      resolve(zipBuffer);
    });

    archive.on('error', (err) => {
      console.error('ZIP创建失败:', err);
      reject(err);
    });

    console.log('开始添加文件到ZIP，文件数量:', urls.length);

    let addedCount = 0;

    // 处理base64编码的图片数据
    urls.forEach((url, index) => {
      try {
        if (url.startsWith('data:image/')) {
          // 解析base64数据
          const base64Data = url.split(',')[1];
          const imageBuffer = Buffer.from(base64Data, 'base64');

          const fileName = `processed_image_${index + 1}.png`;
          archive.append(imageBuffer, { name: fileName });
          addedCount++;
          console.log(`文件添加成功: ${fileName}`);
        } else {
          console.log(`跳过非base64图片: ${url.substring(0, 50)}...`);
        }
      } catch (error) {
        console.error(`处理文件 ${index + 1} 失败:`, error.message);
      }
    });

    if (addedCount === 0) {
      reject(new Error('没有找到任何有效的处理文件'));
      return;
    }

    console.log(`成功添加 ${addedCount}/${urls.length} 个文件到ZIP`);

    // 完成归档
    archive.finalize();
  });
}