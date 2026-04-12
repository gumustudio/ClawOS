import { Router } from 'express';
import { logger } from '../utils/logger';

const router = Router();

// Define our reliable built-in CMS video sources
const VIDEO_SOURCES = [
    { id: 'ffzy', name: '非凡资源', url: 'http://cj.ffzyapi.com/api.php/provide/vod/' },
    { id: 'hnzy', name: '红牛资源', url: 'https://hongniuzy2.com/api.php/provide/vod/' },
    { id: 'wjzy', name: '无尽资源', url: 'https://api.wujinapi.com/api.php/provide/vod/' },
    { id: 'jszy', name: '极速资源', url: 'https://jszyapi.com/api.php/provide/vod/' },
    { id: 'uku', name: 'U酷资源', url: 'https://api.ukuapi.com/api.php/provide/vod/' },
    { id: 'bdzy', name: '百度资源', url: 'https://api.apibdzy.com/api.php/provide/vod/' },
    { id: 'ikun', name: 'iKun资源', url: 'https://ikunzyapi.com/api.php/provide/vod/' },
    { id: 'zuid', name: '最大资源', url: 'https://api.zuidapi.com/api.php/provide/vod/' }
];

router.get('/sources', (req, res) => {
    res.json({ success: true, data: VIDEO_SOURCES.map(s => ({ id: s.id, name: s.name })) });
});

router.get('/latest', async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    // We'll pick a single reliable fast source (like 非凡 or 极速) to get a quick feed, 
    // or round-robin them. Let's just use the first source (非凡) for the main feed to avoid duplicate/messy home feeds.
    const source = VIDEO_SOURCES[0]; 

    try {
        const url = `${source.url}?ac=detail&pg=${page}`;
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data: any = await response.json();
        
        if (data && data.list && Array.isArray(data.list)) {
            const results = data.list.map((item: any) => ({
                id: item.vod_id,
                sourceId: source.id,
                sourceName: source.name,
                name: item.vod_name,
                pic: item.vod_pic,
                year: item.vod_year,
                area: item.vod_area,
                remarks: item.vod_remarks || item.vod_version,
                type: item.type_name,
                blurb: item.vod_blurb,
                content: item.vod_content,
                urls: item.vod_play_url
            }));
            res.json({ success: true, data: results });
        } else {
            res.json({ success: true, data: [] });
        }
    } catch (err: any) {
        logger.error(`Video latest error from ${source.name}: ${err.message}`, { module: 'Video' });
        res.status(500).json({ success: false, error: 'Failed to fetch latest videos' });
    }
});

router.get('/search', async (req, res) => {
    const keyword = req.query.keyword as string;
    const sourceId = req.query.source as string;

    if (!keyword) {
        return res.status(400).json({ success: false, error: 'Keyword is required' });
    }

    let sourcesToSearch = VIDEO_SOURCES;
    if (sourceId) {
        sourcesToSearch = VIDEO_SOURCES.filter(s => s.id === sourceId);
    }

    if (sourcesToSearch.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid source' });
    }

    try {
        const results: any[] = [];
        
        // Fetch concurrently from selected sources
        const promises = sourcesToSearch.map(async (src) => {
            try {
                const url = `${src.url}?ac=detail&wd=${encodeURIComponent(keyword)}`;
                const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
                const data: any = await response.json();
                
                if (data && data.list && Array.isArray(data.list)) {
                    return data.list.map((item: any) => ({
                        id: item.vod_id,
                        sourceId: src.id,
                        sourceName: src.name,
                        name: item.vod_name,
                        pic: item.vod_pic,
                        year: item.vod_year,
                        area: item.vod_area,
                        remarks: item.vod_remarks || item.vod_version,
                        type: item.type_name,
                        blurb: item.vod_blurb,
                        content: item.vod_content,
                        urls: item.vod_play_url
                    }));
                }
                return [];
            } catch (err: any) {
                logger.error(`Video search error from ${src.name}: ${err.message}`, { module: 'Video' });
                return [];
            }
        });

        const allResults = await Promise.all(promises);
        allResults.forEach(resArray => results.push(...resArray));

        res.json({ success: true, data: results });

    } catch (e: any) {
        logger.error(`Video global search error: ${e.message}`, { module: 'Video' });
        res.status(500).json({ success: false, error: 'Failed to fetch video results' });
    }
});

export default router;
