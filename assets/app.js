// 简易前端聚合器：合并多个 RSS 源并展示（本地浏览器运行）
// 使用多代理服务，彻底解决网络访问限制问题

const FEEDS = [
  "https://patfang0105.github.io/my-rss-feeds/rss_www_csis_org.xml",
  "https://patfang0105.github.io/my-rss-feeds/rss_www_cfr_org.xml",
  "https://www.atlanticcouncil.org/feed/",
  "https://www.imf.org/en/publications/rss?language=eng",
  "http://project-syndicate.org/rss",
  "https://rhg.com/feed/",
  "https://www.aei.org/feed/",
  "https://www.wto.org/library/rss/latest_news_e.xml",
  "https://www.foreignaffairs.com/rss.xml",
  "https://www.piie.com/rss/update.xml",
  "https://amro-asia.org/feed/",
  "https://politepol.com/fd/X589A2bsRjn8.xml"
];

const state = {
  items: [],
  allItems: [], // 存储所有未过滤的文章
  isLoading: false,
  timeFilter: 'all', // 当前选择的时间筛选
};


async function fetchFeed(url) {
  // 使用多代理服务获取RSS内容
  const PROXY_SERVICES = [
    {
      name: 'rss2json',
      endpoint: (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
      parser: (data) => data.items.map(it => ({
        title: it.title || '无标题',
        link: it.link || '#',
        author: it.author || '',
        pubDate: it.pubDate || it.pubdate || it.date || '',
        description: it.description || '',
        source: data.feed && data.feed.title ? data.feed.title : url,
      }))
    },
    {
      name: 'allorigins',
      endpoint: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'corsproxy',
      endpoint: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'thingproxy',
      endpoint: (url) => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'cors-anywhere',
      endpoint: (url) => `https://cors-anywhere.herokuapp.com/${url}`,
      parser: (text) => parseRSSText(text, url)
    }
  ];

  // 尝试每个代理服务
  for (const proxy of PROXY_SERVICES) {
    try {
      const endpoint = proxy.endpoint(url);
      const res = await fetch(endpoint, { timeout: 10000 });
      
      if (!res.ok) {
        console.warn(`${proxy.name} 获取 ${url} 失败: ${res.status}`);
        continue; // 尝试下一个代理
      }
      
      const contentType = res.headers.get('content-type') || '';
      let data;
      
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      
      if (!data) {
        console.warn(`${proxy.name} 返回空数据`);
        continue;
      }
      
      const items = proxy.parser(data);
      if (items && items.length > 0) {
        console.log(`✓ 使用 ${proxy.name} 成功获取 ${url}`);
        return items;
      }
      
    } catch (e) {
      console.warn(`${proxy.name} 代理失败:`, e.message);
      continue; // 尝试下一个代理
    }
  }
  
  console.error(`所有代理都失败，无法获取 ${url}`);
  return [];
}

// 简单的 RSS XML 解析器（用于备用代理）
function parseRSSText(xmlText, sourceUrl) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // 检查是否有解析错误
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      console.warn('XML 解析错误:', parserError.textContent);
      return [];
    }
    
    const items = [];
    const channel = xmlDoc.querySelector('channel');
    const feedTitle = channel?.querySelector('title')?.textContent || sourceUrl;
    
    // 支持 RSS 2.0 和 Atom
    const entries = xmlDoc.querySelectorAll('item, entry');
    
    entries.forEach(entry => {
      const title = entry.querySelector('title')?.textContent || '无标题';
      const link = entry.querySelector('link')?.textContent || 
                   entry.querySelector('link')?.getAttribute('href') || '#';
      const author = entry.querySelector('author, creator, dc\\:creator')?.textContent || '';
      const pubDate = entry.querySelector('pubDate, published, updated')?.textContent || '';
      const description = entry.querySelector('description, summary, content')?.textContent || '';
      
      items.push({
        title: title.trim(),
        link: link.trim(),
        author: author.trim(),
        pubDate: pubDate.trim(),
        description: description.trim(),
        source: feedTitle
      });
    });
    
    return items;
  } catch (e) {
    console.error('解析 RSS 文本失败:', e);
    return [];
  }
}

// 根据时间筛选过滤文章
function filterItemsByTime() {
  const now = Date.now();
  const hour24 = 24 * 60 * 60 * 1000;
  const week = 7 * hour24;
  const month = 30 * hour24;

  let filtered = state.allItems;
  
  if (state.timeFilter === '24h') {
    filtered = state.allItems.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= hour24;
    });
  } else if (state.timeFilter === 'week') {
    filtered = state.allItems.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= week;
    });
  } else if (state.timeFilter === 'month') {
    filtered = state.allItems.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= month;
    });
  }
  
  state.items = filtered;
  
  // 更新统计信息
  const statsEl = document.getElementById('filterStats');
  if (statsEl) {
    if (state.timeFilter === 'all') {
      statsEl.textContent = `共 ${filtered.length} 篇文章`;
    } else {
      statsEl.textContent = `筛选后: ${filtered.length} 篇 / 总计: ${state.allItems.length} 篇`;
    }
  }
}

function renderItems() {
  const container = document.getElementById('items');
  if (!container) return;
  
  container.innerHTML = '';

  if (state.isLoading) {
    container.innerHTML = '<p>加载中...</p>';
    return;
  }

  if (state.items.length === 0) {
    if (state.allItems.length > 0) {
      container.innerHTML = '<p>当前时间范围内没有文章，请选择其他时间范围。</p>';
    } else {
      container.innerHTML = '<p>暂无内容，请添加订阅源或点击刷新。</p>';
    }
    return;
  }

  const list = document.createElement('div');
  state.items.forEach(item => {
    const card = document.createElement('div');
    card.style.margin = '12px 0';
    card.style.padding = '12px';
    card.style.border = '1px solid #eee';
    card.style.borderRadius = '8px';
    card.style.background = '#fff';

    const title = document.createElement('a');
    title.href = item.link;
    title.textContent = item.title || '无标题';
    title.target = '_blank';
    title.style.fontWeight = 'bold';
    title.style.textDecoration = 'none';
    title.style.color = '#333';
    title.title = '直接访问（可能需要 VPN）';

    const meta = document.createElement('div');
    meta.style.color = '#666';
    meta.style.fontSize = '12px';
    let metaText = item.source || '';
    if (item.author) metaText += ' · ' + item.author;
    if (item.pubDate) {
      try {
        metaText += ' · ' + new Date(item.pubDate).toLocaleString('zh-CN');
      } catch {
        metaText += ' · ' + item.pubDate;
      }
    }
    meta.textContent = metaText;

    const desc = document.createElement('div');
    desc.style.marginTop = '6px';
    desc.style.color = '#555';
    desc.style.fontSize = '14px';
    // 移除 HTML 标签，只保留纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = item.description || '';
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    desc.textContent = plainText.slice(0, 200) + (plainText.length > 200 ? '...' : '');

    // 添加阅读按钮
    const proxyContainer = document.createElement('div');
    proxyContainer.style.marginTop = '8px';
    proxyContainer.style.display = 'flex';
    proxyContainer.style.gap = '8px';
    proxyContainer.style.flexWrap = 'wrap';
    proxyContainer.style.alignItems = 'center';
    
    
    // 智能全文阅读按钮（显示选项菜单）
    const fullTextBtn = document.createElement('button');
    fullTextBtn.textContent = '📖 阅读全文';
    fullTextBtn.style.padding = '4px 12px';
    fullTextBtn.style.background = '#ff5722';
    fullTextBtn.style.color = 'white';
    fullTextBtn.style.border = 'none';
    fullTextBtn.style.borderRadius = '4px';
    fullTextBtn.style.fontSize = '12px';
    fullTextBtn.style.cursor = 'pointer';
    fullTextBtn.style.fontWeight = 'bold';
    fullTextBtn.title = '点击选择全文阅读方式';
    
    // 全文阅读选项菜单（默认隐藏）
    const fullTextMenu = document.createElement('div');
    fullTextMenu.style.display = 'none';
    fullTextMenu.style.position = 'absolute';
    fullTextMenu.style.background = 'white';
    fullTextMenu.style.border = '1px solid #ddd';
    fullTextMenu.style.borderRadius = '5px';
    fullTextMenu.style.padding = '10px';
    fullTextMenu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    fullTextMenu.style.zIndex = '1000';
    fullTextMenu.style.minWidth = '200px';
    fullTextMenu.innerHTML = `
      <div style="font-size: 13px; color: #333; margin-bottom: 8px; font-weight: bold;">智能全文阅读：</div>
      <a href="https://r.jina.ai/${encodeURIComponent(item.link)}" target="_blank" style="display: block; padding: 12px; margin: 4px 0; background: #4caf50; color: white; text-decoration: none; border-radius: 4px; text-align: center; font-weight: bold; font-size: 14px;">
        ✅ 使用 Jina AI 智能阅读
      </a>
      <div style="font-size: 11px; color: #666; margin-top: 8px; padding: 8px; background: #e8f5e9; border-radius: 3px; line-height: 1.4;">
        💡 <strong>智能全文阅读</strong>由 Jina AI 提供<br>
        • 无需 VPN，境内可用<br>
        • 自动提取正文内容<br>
        • 去除广告和干扰
      </div>
    `;
    
    // 点击按钮切换菜单
    fullTextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fullTextMenu.style.display === 'none') {
        fullTextMenu.style.display = 'block';
        fullTextBtn.textContent = '❌ 关闭菜单';
      } else {
        fullTextMenu.style.display = 'none';
        fullTextBtn.textContent = '📖 阅读全文';
      }
    });
    
    // 点击页面其他地方关闭菜单
    document.addEventListener('click', () => {
      if (fullTextMenu.style.display === 'block') {
        fullTextMenu.style.display = 'none';
        fullTextBtn.textContent = '📖 阅读全文';
      }
    });
    
    // 访问原文链接（简化版）
    const originalBtn = document.createElement('a');
    originalBtn.href = item.link;
    originalBtn.target = '_blank';
    originalBtn.textContent = '🔗 原文';
    originalBtn.style.display = 'inline-block';
    originalBtn.style.padding = '4px 12px';
    originalBtn.style.background = '#607d8b';
    originalBtn.style.color = 'white';
    originalBtn.style.textDecoration = 'none';
    originalBtn.style.borderRadius = '4px';
    originalBtn.style.fontSize = '12px';
    originalBtn.title = '直接访问原网站（可能需要 VPN）';
    
    // 容器需要relative定位以支持菜单
    card.style.position = 'relative';
    
    proxyContainer.appendChild(fullTextBtn);
    proxyContainer.appendChild(originalBtn);
    card.appendChild(fullTextMenu);

    card.appendChild(title);
    card.appendChild(meta);
    if (desc.textContent) {
      card.appendChild(desc);
    }
    card.appendChild(proxyContainer);
    list.appendChild(card);
  });

  container.appendChild(list);
}


async function refresh() {
  state.isLoading = true;
  renderItems();
  
  try {
    console.log('开始刷新 RSS 源...');
    
    const all = await Promise.allSettled(FEEDS.map(fetchFeed));
    const merged = [];
    
    for (const r of all) {
      if (r.status === 'fulfilled') {
        merged.push(...r.value);
      } else {
        console.warn('某个订阅源抓取失败:', r.reason);
      }
    }
    
    // 按时间排序
    merged.sort((a, b) => {
      const dateA = new Date(a.pubDate || 0);
      const dateB = new Date(b.pubDate || 0);
      return dateB - dateA;
    });
    
    state.allItems = merged; // 保存所有文章
    filterItemsByTime(); // 应用时间筛选
    console.log(`成功加载 ${merged.length} 篇文章`);
  } catch (e) {
    console.error('刷新时出错:', e);
    alert('刷新失败，请查看浏览器控制台了解详情');
  } finally {
    state.isLoading = false;
    renderItems();
  }
}

function bindUI() {
  const refreshBtn = document.getElementById('refreshBtn');

  if (!refreshBtn) {
    console.error('找不到刷新按钮');
    return;
  }

  refreshBtn.addEventListener('click', () => {
    refresh();
  });
  
  // 绑定时间筛选单选按钮
  const timeRadios = document.querySelectorAll('input[name="timeRange"]');
  timeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.timeFilter = e.target.value;
      filterItemsByTime();
      renderItems();
      console.log(`时间筛选已更改为: ${state.timeFilter}`);
    });
  });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('RSS 聚合器初始化中...');
  bindUI();
  refresh();
});
