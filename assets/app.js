// 简易前端聚合器：合并多个 RSS 源并展示（本地浏览器运行）
// 使用多代理服务，彻底解决网络访问限制问题

// ========== 在这里配置您想要 AI 关注的智库名称列表 ==========
// AI 只会分析下面这些来源的文章，其他来源的文章不会被 AI 推荐
const TARGET_SOURCES = [
    "World Bank",
    "OECD",
    "IMF",
    "Rhodium Group",
    "Brookings Institution",
    "CSIS",
    "UNCTAD"
];
// 注意：这些名称需要与 RSS 中 item.source 字段匹配（不区分大小写）
// 如果某个来源的 RSS 中显示的名称不同，请根据实际显示的名称修改
// ========================================================

const FEEDS = [
  "https://www.atlanticcouncil.org/feed/",
  "http://project-syndicate.org/rss",
  "https://rhg.com/feed/",
  "https://www.aei.org/feed/",
  "http://www.wto.org/library/rss/latest_news_e.xml",
  "https://www.foreignaffairs.com/rss.xml",
  "https://www.piie.com/rss/update.xml",
  "https://amro-asia.org/feed/",
  "https://politepol.com/fd/X589A2bsRjn8.xml",
  "https://cepr.org/rss/vox-content",
  "https://www.bu.edu/gdp/feed/",
  "https://think.ing.com/rss/",
  "https://www.economist.com/finance-and-economics/rss.xml"
];

const state = {
  items: [],
  allItems: [],
  isLoading: false,
  timeFilter: 'all',
};

let currentSource = 'all';

// ========== RSS 抓取部分（保持不变）==========
async function fetchFeed(url) {
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

  for (const proxy of PROXY_SERVICES) {
    try {
      const endpoint = proxy.endpoint(url);
      const res = await fetch(endpoint, { timeout: 10000 });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      if (!data) continue;
      const items = proxy.parser(data);
      if (items && items.length > 0) {
        console.log(`✓ 使用 ${proxy.name} 成功获取 ${url}`);
        return items;
      }
    } catch (e) {
      console.warn(`${proxy.name} 代理失败:`, e.message);
      continue;
    }
  }
  console.error(`所有代理都失败，无法获取 ${url}`);
  return [];
}

function parseRSSText(xmlText, sourceUrl) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) return [];
    const items = [];
    const channel = xmlDoc.querySelector('channel');
    const feedTitle = channel?.querySelector('title')?.textContent || sourceUrl;
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

// ========== 筛选与渲染核心 ==========
function applyFilters() {
  let filtered = state.allItems;
  const now = Date.now();
  const hour24 = 24 * 60 * 60 * 1000;
  const week = 7 * hour24;
  const month = 30 * hour24;

  if (state.timeFilter === '24h') {
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= hour24;
    });
  } else if (state.timeFilter === 'week') {
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= week;
    });
  } else if (state.timeFilter === 'month') {
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= month;
    });
  }

  if (currentSource !== 'all') {
    filtered = filtered.filter(item => (item.source || '未知来源') === currentSource);
  }

  state.items = filtered;

  const statsEl = document.getElementById('filterStats');
  if (statsEl) {
    if (state.timeFilter === 'all' && currentSource === 'all') {
      statsEl.textContent = `共 ${filtered.length} 篇文章`;
    } else {
      let msg = `筛选后: ${filtered.length} 篇 / 总计: ${state.allItems.length} 篇`;
      if (currentSource !== 'all') msg += ` · 来源: ${currentSource}`;
      statsEl.textContent = msg;
    }
  }
}

function getSourceStats() {
  const stats = new Map();
  state.allItems.forEach(item => {
    const source = item.source || '未知来源';
    stats.set(source, (stats.get(source) || 0) + 1);
  });
  return Array.from(stats.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function renderSourceList() {
  const container = document.getElementById('sourceListItems');
  if (!container) return;
  if (state.allItems.length === 0) {
    container.innerHTML = '<p>暂无数据</p>';
    return;
  }
  const sources = getSourceStats();
  let html = `<div style="margin-bottom: 8px;">
    <a href="#" data-source="all" class="source-filter-link" style="display: block; padding: 6px 10px; background: ${currentSource === 'all' ? '#007acc' : 'transparent'}; color: ${currentSource === 'all' ? 'white' : '#333'}; text-decoration: none; border-radius: 6px; margin-bottom: 4px; font-weight: ${currentSource === 'all' ? 'bold' : 'normal'};">
      📋 全部 <span style="float: right; opacity: 0.8;">${state.allItems.length}</span>
    </a>
  </div>`;
  sources.forEach(source => {
    const isActive = (currentSource === source.name);
    html += `<div style="margin-bottom: 4px;">
      <a href="#" data-source="${escapeHtml(source.name)}" class="source-filter-link" style="display: block; padding: 6px 10px; background: ${isActive ? '#007acc' : 'transparent'}; color: ${isActive ? 'white' : '#333'}; text-decoration: none; border-radius: 6px; font-size: 13px;">
        📄 ${escapeHtml(source.name)} <span style="float: right; opacity: 0.8;">${source.count}</span>
      </a>
    </div>`;
  });
  container.innerHTML = html;
  document.querySelectorAll('.source-filter-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const source = link.getAttribute('data-source');
      currentSource = source === 'all' ? 'all' : source;
      applyFilters();
      renderSourceList();
      renderItems();
    });
  });
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
      container.innerHTML = '<p>当前筛选条件下没有文章，请调整筛选条件。</p>';
    } else {
      container.innerHTML = '<p>暂无内容，请点击刷新按钮加载文章。</p>';
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
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = item.description || '';
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    desc.textContent = plainText.slice(0, 200) + (plainText.length > 200 ? '...' : '');

    const proxyContainer = document.createElement('div');
    proxyContainer.style.marginTop = '8px';
    proxyContainer.style.display = 'flex';
    proxyContainer.style.gap = '8px';
    proxyContainer.style.flexWrap = 'wrap';
    proxyContainer.style.alignItems = 'center';

    // Textise 代理阅读按钮（正确双重编码）
    const fullTextBtn = document.createElement('a');
    fullTextBtn.href = `https://www.textise.net/showText.aspx?strURL=${encodeURIComponent(encodeURIComponent(item.link))}`;
    fullTextBtn.target = '_blank';
    fullTextBtn.textContent = '📖 阅读全文（Textise）';
    fullTextBtn.style.display = 'inline-block';
    fullTextBtn.style.padding = '4px 12px';
    fullTextBtn.style.background = '#ff5722';
    fullTextBtn.style.color = 'white';
    fullTextBtn.style.textDecoration = 'none';
    fullTextBtn.style.borderRadius = '4px';
    fullTextBtn.style.fontSize = '12px';
    fullTextBtn.style.fontWeight = 'bold';
    fullTextBtn.style.cursor = 'pointer';
    fullTextBtn.title = '通过 Textise 代理阅读全文（免VPN）';

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
    originalBtn.title = '直接访问原网站（可能需要VPN）';

    proxyContainer.appendChild(fullTextBtn);
    proxyContainer.appendChild(originalBtn);

    card.appendChild(title);
    card.appendChild(meta);
    if (desc.textContent) card.appendChild(desc);
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
      if (r.status === 'fulfilled') merged.push(...r.value);
      else console.warn('某个订阅源抓取失败:', r.reason);
    }
    merged.sort((a, b) => {
      const dateA = new Date(a.pubDate || 0);
      const dateB = new Date(b.pubDate || 0);
      return dateB - dateA;
    });
    state.allItems = merged;
    currentSource = 'all';
    applyFilters();
    renderSourceList();
    renderItems();
    console.log(`成功加载 ${merged.length} 篇文章`);
  } catch (e) {
    console.error('刷新时出错:', e);
    alert('刷新失败，请查看浏览器控制台了解详情');
  } finally {
    state.isLoading = false;
    renderItems();
  }
}

// ========== AI 智能梳理（只关注 TARGET_SOURCES 中的来源）==========
// 请到 https://cloud.siliconflow.cn/ 注册，获取 API Key，替换下面的字符串
const AI_API_KEY = 'sk-ahfjemfxrpxpgjozrzwmnmncxyuyhonqlepfllikksnwrand';   // 例如：sk-xxxxxxxxxxxxx
const AI_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

async function getAISummary(articles) {
    // 只保留来源在 TARGET_SOURCES 中的文章（不区分大小写，去除首尾空格）
    const targetSet = new Set(TARGET_SOURCES.map(s => s.trim().toLowerCase()));
    const filteredArticles = articles.filter(article => {
        const sourceName = (article.source || '').trim().toLowerCase();
        return targetSet.has(sourceName);
    });
    
    if (filteredArticles.length === 0) {
        return '当前没有来自指定智库（世界银行、OECD、IMF、荣鼎集团、布鲁金斯学会、CSIS、UNCTAD）的新文章。';
    }
    
    // 取最新的 15 篇（已按时间排序）
    const latest = filteredArticles.slice(0, 15);
    const articleList = latest.map((item, idx) => 
        `${idx+1}. 标题：${item.title}\n   来源：${item.source}\n   链接：${item.link}`
    ).join('\n');
    
    const systemPrompt = `你是一位专业的经济与国际关系研究助手。你的任务是：从用户提供的文章列表中，筛选出3-5篇最有价值的文章进行推荐。
请严格遵守以下筛选标准：
1. 文章内容必须至少涉及以下一个领域：
   - 国际贸易（如：贸易协定、关税政策、供应链重构、WTO改革）
   - 多边机构治理（如：IMF、世界银行、G20等机构的政策与改革）
   - 宏观经济形势（如：全球及主要经济体的增长、通胀、就业趋势）
   - 产业政策（如：各国的产业扶持、补贴、技术竞争策略）
2. 优先推荐来自顶尖智库（如 Brookings, IMF, PIIE）或权威机构的深度分析。
3. 优先关注时效性强、对未来走势有前瞻性判断的文章。
4. 为每篇推荐的文章，用一两句话清晰说明推荐理由（直接点出其与以上话题的关联和价值）。

最后，请以结构化的中文格式输出，示例如下：
【推荐一】
文章：标题
理由：...
链接：直接输出完整URL
每篇之间空一行。不要输出额外解释。`;
    
    const userPrompt = `请分析以下文章，并严格遵循“研究助手”的指令进行推荐。\n${articleList}`;
    
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen3.5-4B',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 800
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API 请求失败: ${response.status} - ${errText}`);
        }
        const data = await response.json();
        let aiText = data.choices[0].message.content;
        aiText = aiText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
        aiText = aiText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
        aiText = aiText.replace(/\n/g, '<br>');
        return aiText;
    } catch (error) {
        console.error('AI 摘要失败:', error);
        return `AI 服务暂时不可用：${error.message}`;
    }
}

function bindAIButton() {
    const btn = document.getElementById('aiSummaryBtn');
    const contentDiv = document.getElementById('aiSummaryContent');
    if (!btn || !contentDiv) return;
    btn.addEventListener('click', async () => {
        if (state.allItems.length === 0) {
            contentDiv.innerHTML = '⚠️ 暂无文章，请先点击“刷新内容”加载文章。';
            return;
        }
        contentDiv.innerHTML = '🤔 AI 正在分析指定智库的最新文章，请稍候...';
        const summary = await getAISummary(state.allItems);
        contentDiv.innerHTML = summary;
    });
}

// ========== 加载推荐文章 ==========
async function loadRecommendations() {
    const container = document.getElementById('recommendationsList');
    if (!container) return;
    try {
        const response = await fetch('recommendations.json');
        if (!response.ok) throw new Error('推荐文章文件不存在');
        const recs = await response.json();
        if (recs.length === 0) {
            container.innerHTML = '<p>暂无推荐，敬请期待。</p>';
            return;
        }
        let html = '<div style="max-height: 400px; overflow-y: auto;">';
        recs.forEach(rec => {
            const proxyLink = `https://www.textise.net/showText.aspx?strURL=${encodeURIComponent(encodeURIComponent(rec.link))}`;
            html += `
                <div style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px solid #eee;">
                    <div style="font-weight: bold; margin-bottom: 4px;">
                        <a href="${proxyLink}" target="_blank" style="text-decoration: none; color: #d35400;">📌 ${escapeHtml(rec.title)}</a>
                    </div>
                    <div style="font-size: 11px; color: #888; margin-bottom: 6px;">
                        ${escapeHtml(rec.source)} · ${rec.date || ''}
                        ${rec.tags ? ' · ' + rec.tags.map(t => '#' + escapeHtml(t)).join(' ') : ''}
                    </div>
                    <div style="font-size: 13px; color: #444; line-height: 1.4;">
                        ${escapeHtml(rec.summary)}
                    </div>
                    <div style="margin-top: 6px;">
                        <a href="${proxyLink}" target="_blank" style="font-size: 12px; color: #ff9800;">📖 通过代理阅读全文 →</a>
                        &nbsp;|&nbsp;
                        <a href="${escapeHtml(rec.link)}" target="_blank" style="font-size: 12px; color: #999;">🔗 原文（可能需VPN）</a>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    } catch (error) {
        console.error('加载推荐文章失败:', error);
        container.innerHTML = '<p>推荐文章加载失败，请检查 recommendations.json 是否存在。</p>';
    }
}

// ========== UI 绑定与初始化 ==========
function bindUI() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refresh());
    else console.error('找不到刷新按钮');

    const timeRadios = document.querySelectorAll('input[name="timeRange"]');
    timeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.timeFilter = e.target.value;
            applyFilters();
            renderSourceList();
            renderItems();
            console.log(`时间筛选已更改为: ${state.timeFilter}`);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('RSS 聚合器初始化中...');
    bindUI();
    bindAIButton();   // 如果不想用 AI，可以注释掉这一行
    refresh();
    loadRecommendations();
});
