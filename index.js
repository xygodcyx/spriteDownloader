#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

async function main() {
  fs.mkdirSync("out", { recursive: true });
  const inputUrl = process.argv[2];
  if (!inputUrl) {
    console.error('Usage: node script.js <resource_url>');
    process.exit(1);
  }

  // 解析平台和游戏名称
  const urlMatch = inputUrl.match(/resource\.com\/([\w-]+)\/([\w-]+)/);
  if (!urlMatch) {
    console.error('URL格式错误');
    process.exit(1);
  }
  const [, platform, game] = urlMatch;
  const baseDir = `${game}-${platform}`;

  try {
    // 创建基础目录
    fs.mkdirSync(baseDir, { recursive: true });

    // 下载资源页面
    console.log('正在获取资源页面...');
    const { data } = await axios.get(inputUrl);
    const $ = cheerio.load(data);

    // 遍历所有分类区块
    $('#icon-display > .section').each((i, section) => {
      const $section = $(section);
      // 获取分类名称
      const category =
        $section.find('.sect-name').attr('title') || 'Uncategorized';
      const categoryDir = path.join(baseDir, category);

      // 创建分类目录
      fs.mkdirSync(categoryDir, { recursive: true });

      // 获取关联的资源容器
      const $icons = $section
        .nextUntil('.section', '.updatesheeticons')
        .first();

      // 解析当前分类下的资源
      const sheets = $icons.find('a[href*="/sheet/"]');
      sheets.each((j, link) => {
        const $link = $(link);
        const href = $link.attr('href');
        const idMatch = href.match(/\/sheet\/(\d+)/);

        if (idMatch) {
          const resId = idMatch[1];
          // 提取文件名
          const filename = $link.find('.iconheadertext').text().trim();
          // 提取扩展名
          const imgSrc = $link.find('img').attr('src');
          const extMatch = imgSrc.match(/\.(\w+)(?=\?|$)/) || ['', 'png'];

          // 构建下载任务
          downloadResource({
            resId,
            filename: sanitizeFilename(filename),
            ext: process.argv[3] || 'png',
            categoryDir,
            cur: j,
            all: sheets.length,
          });
        }
      });
    });

    console.log('全部下载任务已开始，请等待完成...');
  } catch (error) {
    console.error('发生错误:', error.message);
    process.exit(1);
  }
}

// 清理非法文件名字符
function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_');
}

async function downloadResource({
  resId,
  filename,
  ext,
  categoryDir,
  cur,
  all,
}) {
  try {
    const url = `https://www.spriters-resource.com/download/${resId}/`;
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
    });

    // 构建完整路径
    const fullPath = path.join(categoryDir, `${filename}.${ext}`);
    const writer = fs.createWriteStream(fullPath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        console.log(`✅ 下载成功: ${path.relative(process.cwd(), fullPath)}`);
        resolve();
      });
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`❌ 下载失败 ${filename}:`, error.message);
  }
}

main();
