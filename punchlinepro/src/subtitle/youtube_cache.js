// ======== 视频ID提取函数 ========
function getVideoId(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.searchParams.get('v') || 'unknown_video';
    } catch {
        return 'invalid_url';
    }
}

// ======== 缓存配置 ========
const CACHE_PREFIX = 'youtube_sub_';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24小时

// ======== 缓存核心逻辑 ======== 存翻译完成的字幕罢了
async function getSubtitleWithCache(url,data) {
    //有缓存则读否则存
    const videoId = getVideoId(url);
    const CACHE_KEY = `${CACHE_PREFIX}${videoId}`;

    // 尝试获取缓存
    const cached = getCache(CACHE_KEY);
    if (cached?.isValid) {
        console.log(`✅ [${videoId}] 使用缓存字幕`);
        return cached.data;
    }

    // 请求新数据
    try {
        const newData = data;
        console.log(`🔄 [${videoId}] 获取到新数据`);
        setCache(CACHE_KEY, newData);
        return newData;
    } catch (error) {
        console.error(`❌ [${videoId}] 请求失败: ${error.message}`);
        return cached?.data || null;
    }
}

function getCache(key) {
    const raw = localStorage.getItem(key);
    //console.log("------------raw---------")//命名有缓存为什么null？？？
    //console.log(raw)
    if (!raw) return null;

    try {
        const { data, timestamp } = JSON.parse(raw);
        return {
            data,
            isValid: Date.now() - timestamp <= CACHE_DURATION
        };
    } catch {
        return null;
    }
}

function setCache(key, data) {
    const cache = {
        data,
        timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(cache));
}


const url="https://www.youtube.com/api/timedtext?v=2NSa1UlG_1U&ei=0-PwZ5f8H5yx2roPz_3L-Qo&caps=asr&opi=112496729&xoaf=5&hl=zh-CN&ip=0.0.0.0&ipbits=0&expire=1743865411&sparams=ip%2Cipbits%2Cexpire%2Cv%2Cei%2Ccaps%2Copi%2Cxoaf&signature=77D96378CD24A6A0DE4EF3658469EAD9193DC163.3081DF034C32268454DF336C8DF5083E6F109086&key=yt8&kind=asr&lang=en&fmt=json3&xorb=2&xobt=3&xovt=3&cbr=Chrome&cbrver=134.0.0.0&c=WEB&cver=2.20250403.01.00&cplayer=UNIPLAYER&cos=Windows&cosver=10.0&cplatform=DESKTOP"

// ======== 测试用例 ========
async function runTests() {
    // 测试正常流程
    console.log('\n=== 测试1: 正常视频 ===');
    let data1 = await getSubtitleWithCache(url);
    console.log('首次结果:', data1);

    data1 = await getSubtitleWithCache(url);
    console.log('缓存结果:', data1);
    console.log('缓存结果:', data1[0]);

}

// 执行测试
function init() {
    localStorage.clear(); // 清空缓存
    console.log('🧪 启动测试套件');
    runTests();
}

export { getSubtitleWithCache,getCache,getVideoId };