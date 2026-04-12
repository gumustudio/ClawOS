import type { ReaderFeed } from './types';

function createPresetFeed(id: string, name: string, url: string, category: ReaderFeed['category']): ReaderFeed {
  return {
    id,
    name,
    url,
    category,
    updateFrequency: 60,
    enabled: true,
    source: 'preset',
    lastFetchedAt: null,
    createdAt: '2026-04-01T00:00:00.000Z'
  };
}

export const READER_PRESET_FEEDS: ReaderFeed[] = [
  createPresetFeed('preset-openai-blog', 'OpenAI Blog', 'https://openai.com/news/rss.xml', 'AI'),
  createPresetFeed('preset-deepmind-blog', 'Google DeepMind Blog', 'https://deepmind.google/blog/rss.xml', 'AI'),
  createPresetFeed('preset-google-ai-blog', 'Google AI Blog', 'https://blog.google/technology/ai/rss/', 'AI'),
  createPresetFeed('preset-qbitai', '量子位', 'https://www.qbitai.com/feed', 'AI'),
  createPresetFeed('preset-huggingface-blog', 'Hugging Face Blog', 'https://huggingface.co/blog/feed.xml', 'AI'),
  createPresetFeed('preset-techcrunch-ai', 'TechCrunch', 'https://techcrunch.com/feed/', '科技'),
  createPresetFeed('preset-the-verge', 'The Verge', 'https://www.theverge.com/rss/index.xml', '科技'),
  createPresetFeed('preset-ifanr', '爱范儿', 'https://www.ifanr.com/feed', '科技'),
  createPresetFeed('preset-ithome', 'IT之家', 'https://www.ithome.com/rss/', '科技'),
  createPresetFeed('preset-sspai', '少数派', 'https://sspai.com/feed', '科技'),
  createPresetFeed('preset-marketwatch-topstories', 'MarketWatch Top Stories', 'https://feeds.content.dowjones.io/public/rss/mw_topstories', '财经'),
  createPresetFeed('preset-36kr', '36氪', 'https://36kr.com/feed', '财经'),
  createPresetFeed('preset-ftchinese', 'FT中文网', 'https://www.ftchinese.com/rss/feed', '财经'),
  createPresetFeed('preset-bloomberg-markets', 'Bloomberg Markets', 'https://feeds.bloomberg.com/markets/news.rss', '财经'),
  createPresetFeed('preset-bbc-news', 'BBC News', 'https://feeds.bbci.co.uk/news/rss.xml', '新闻'),
  createPresetFeed('preset-nytimes-cn', '纽约时报中文网', 'https://cn.nytimes.com/rss/', '新闻'),
  createPresetFeed('preset-rfi-cn', 'RFI 中文', 'https://www.rfi.fr/cn/%E4%B8%AD%E5%9B%BD/rss', '新闻'),
  createPresetFeed('preset-nytimes-world', 'NYTimes World', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', '新闻'),
  createPresetFeed('preset-ign', 'IGN', 'https://feeds.ign.com/ign/games-all', '游戏'),
  createPresetFeed('preset-youxichaguan', '游戏茶馆', 'https://youxichaguan.com/feed', '游戏'),
  createPresetFeed('preset-youxituoluo', '游戏陀螺', 'https://www.youxituoluo.com/feed', '游戏')
];
