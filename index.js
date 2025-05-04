const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
async function main() {
  const inputUrl = process.argv[2];
  if (!inputUrl) {
    console.error('Usage: node script.js <resource_url>');
    process.exit(1);
  }

  // 解析平台和游戏名称
  const urlMatch = inputUrl.match(/\w+-resource\.com\/([\w-]+)\/([\w-]+)/);
  if (!urlMatch) {
    console.error('URL格式错误');
    process.exit(1);
  }
  const [base, platform, game] = urlMatch;
  const type2AssetType = {
    spriters: 'sheet',
    models: 'model',
    textures: 'texture',
    sounds: 'sound',
  };
  const type = base.split('/')[0].split('.')[0].split('-')[0] || 'spriters';
  const baseDir = path.join('out', type, `${game}-${platform}`);
  const allDownload = [];
  try {
    // 创建基础目录
    fs.mkdirSync(baseDir, { recursive: true });

    // 下载资源页面
    console.log('正在获取资源页面...');
    const { data } = await axios.get(inputUrl);
    const $ = cheerio.load(data);
    console.log('全部下载任务已开始，请等待完成...');
    const type2AssestSelector = {
      spriters: 'section',
      models: 'section',
      textures: 'section',
      sounds: 'section',
    };
    console.log(`#icon-display > .${type2AssestSelector[type]}`);
    // 遍历所有分类区块
    $(`#icon-display > .${type2AssestSelector[type]}`).each((i, section) => {
      const $section = $(section);
      // 获取分类名称
      let category = null;
      switch (type) {
        case 'spriters':
        case 'models':
        case 'textures':
        case 'sounds': {
          category = $section.find('.sect-name').text() || 'Uncategorized';
          break;
        }
      }
      const categoryDir = path.join(baseDir, category);

      // 创建分类目录
      fs.mkdirSync(categoryDir, { recursive: true });

      // 获取关联的资源容器
      let $icons = null;
      switch (type) {
        case 'spriters':
        case 'models':
        case 'textures': {
          $icons = $section.nextUntil('.section', '.updatesheeticons').first();
          break;
        }
        case 'sounds': {
          $icons = $section
            .nextUntil('.section', '.altrow')
            .first()
            .find('tbody');
          break;
        }
      }
      // 解析当前分类下的资源
      const sheets = $icons.find(`a[href*="/${type2AssetType[type]}/"]`);
      console.log(`${category} category count :${sheets.length}`);
      sheets.each((j, link) => {
        const $link = $(link);

        const href = $link.attr('href');
        let regexp = null;
        switch (type) {
          case 'spriters': {
            regexp = /\/sheet\/(\d+)/;
            break;
          }
          case 'models': {
            regexp = /\/model\/(\d+)/;
            break;
          }
          case 'textures': {
            regexp = /\/texture\/(\d+)/;
            break;
          }
          case 'sounds': {
            regexp = /\/sound\/(\d+)/;
            break;
          }
        }
        const idMatch = href.match(regexp);

        if (idMatch) {
          const resId = idMatch[1];
          // 提取文件名
          let filename = null;
          switch (type) {
            case 'spriters':
            case 'models':
            case 'textures': {
              filename = $link.find('.iconheadertext').text().trim();
              break;
            }
            case 'sounds': {
              filename = $link.text().trim();
              break;
            }
          }

          // 构建下载任务
          const res = downloadResource({
            resId,
            filename: sanitizeFilename(filename),
            categoryDir,
            type,
          });
          allDownload.push(res);
        }
      });
    });

    await Promise.all(allDownload);
    console.log('全部下载完成！');
  } catch (error) {
    console.error('发生错误:', error);
    process.exit(1);
  }
}

// 清理非法文件名字符
function sanitizeFilename(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '_');
}

async function downloadResource({ resId, filename, categoryDir, type }) {
  try {
    const url = `https://www.${type}-resource.com/download/${resId}/`;
    const response = await axios({
      method: 'get',
      url,
      responseType: 'stream',
    });
    const ext = response.headers['content-disposition']
      .trim()
      .split(';')
      .filter(item => item.includes('='))
      .map(item => {
        const [key, val] = item.split('=');
        return {
          key: key.trim(),
          val: val.trim(),
        };
      })
      .find(item => item.key === 'filename')
      .val.replace(/"/g, '')
      .split('.')
      .pop();

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
    console.error(`❌ 下载失败 ${filename}:`, error);
  }
}

main();
