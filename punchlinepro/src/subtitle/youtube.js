import $ from "jquery";
import memoize from "memoizee";
import BaseVideo from "./baseVideo";
import * as util from "/src/util";
// import { isRtl, } from "/src/util/lang.js";

// https://terrillthompson.com/648
// https://developers.google.com/youtube/iframe_api_reference
// intercept youtube subtitle and concat dual sub
// flow
// 1. listen url change
// 2. get video lang from url   from inject script
// 3. turn on caption with given video lang  from inject script
// 4. intercept caption request  from inject script
// 5. modify request output as dual subtitle  from inject script
// other feature
// caption on off detect
// caption hover detect

export default class Youtube extends BaseVideo {
  static sitePattern = /^(https:\/\/)(www\.youtube\.com)/;
  static captionRequestPattern =
    /^(https:\/\/)(www\.youtube\.com)(\/api\/timedtext)/;
  static baseUrl = "https://www.youtube.com";
  static playerSelector = "#movie_player video";
  static playerApiSelector = ".html5-video-player";
  static captionContainerSelector =
    "#movie_player .ytp-caption-window-container";
  static captionWindowSelector = "#movie_player .caption-window";
  static captionBoxSelector = "#movie_player .ytp-caption-segment";
  static listenButtonSelector = ".ytp-subtitles-button";

  static isSubtitleRequestFailed = false;
  static useManualIntercept = true; //interceptor start manually

  static subtitle_1;

  // Add a getter method to ensure subtitle_1 always returns a value
  static getSubtitle1() {
    if (!this.subtitle_1) {
      return {
        events: [],
        pens: [{}],
        wireMagic: "pb3",
        wpWinPositions: [
          {},
          {
            apPoint: 6,
            ahHorPos: 20,
            avVerPos: 100,
            rcRows: 2,
            ccCols: 40,
          },
        ],
        wsWinStyles: [
          {},
          {
            mhModeHint: 2,
            juJustifCode: 0,
            sdScrollDir: 3,
          },
          {
            mhModeHint: 2,
            juJustifCode: 1,
            sdScrollDir: 3,
          },
        ],
      };
    }
    return this.subtitle_1;
  }

  // 添加setter方法来设置subtitle_1
  static setSubtitle1(subtitle) {
    this.subtitle_1 = subtitle;
    return this.subtitle_1;
  }

  // auto start message listener for inject script
  static #injectScriptConstructor = (() => {
    console.log('🚀 初始化字幕监听器');
    this.listenMessageFrameFromInject();
  })();

  static async handleUrlChange(url = window.location.href) {
    console.log('🔄 URL变化:', url);
    this.pausedByExtension = false;
    this.callMethodFromInject("activateCaption", url);
  }

  static async activateCaption(url) {
    console.log('⚡ 开始激活字幕功能, URL:', url);
    // skip if user caption off, is shorts skip
    if (
      this.setting["subtitleButtonToggle"] == "false" ||
      !this.isVideoUrl(url)
    ) {
      console.log('❌ 字幕功能已关闭或非视频URL');
      return;
    }
    //get video lang
    console.log('🔍 正在检测视频语言...');
    var { lang, tlang } = await this.guessVideoLang(url);
    console.log('✅ 检测到视频语言:', { 源语言: lang, 目标语言: tlang });
    
    //turn on caption
    console.log('⏳ 等待播放器就绪...');
    await this.waitPlayerReady(); //wait player load
    console.log('✅ 播放器已就绪');
    
    this.killInterceptDebounce(); // end caption intercept
    console.log('🎯 开始拦截字幕请求...');
    await this.interceptCaption(); // start caption intercept
    
    console.log('📥 加载字幕模块...');
    this.loadCaption(); // turn on caption for embed video
    
    console.log('⚙️ 设置字幕语言...');
    this.setPlayerCaption(lang, tlang); //turn on caption on specified lang
    
    console.log('🔄 重新加载字幕...');
    this.reloadCaption(); //reset previous caption immediately
    console.log('✅ 字幕功能激活完成!');
  }

  // player control advance================================
  static getPlayerApi() {
    return $(this.playerApiSelector);
  }
  static reloadCaption() {
    this.getPlayerApi().each((index, ele) => {
      ele.setOption("captions", "reload", true);
    });
  }
  static loadCaption() {
    this.getPlayerApi().each((index, ele) => {
      ele.loadModule("captions");
    });
  }
  static unloadCaption() {
    this.getPlayerApi().each((index, ele) => {
      ele.unloadModule("captions");
    });
  }
  static setPlayerCaption(lang, translationLanguage) {
    this.getPlayerApi().each((index, ele) => {
      ele.setOption("captions", "track", {
        languageCode: lang,
        translationLanguage,
      });
    });
  }

  // additional listen==============================
  static async handleButtonKey(e) {
    this.handleCaptionOnOff(e);
  }
  static async handleCaptionOnOff(e) {
    if (e?.code == "KeyC" || e?.button == 0) {
      this.setting["subtitleButtonToggle"] = $(this.listenButtonSelector).attr(
        "aria-pressed"
      );
      this.setting.save();
    }
  }

  //requestSubtitle=============================
  static async requestSubtitle(subUrl, lang, tlang, videoId) {
    console.log('📡 请求字幕:', { url: subUrl, 语言: lang, 目标语言: tlang });
    if (lang) {
      subUrl = await this.getTranslatedSubtitleUrl(subUrl, lang);
      console.log('🔄 翻译后的URL:', subUrl);
    }
    try {
      var res = await fetch(this.getTrafficSafeUrl(subUrl));
      console.log('📦 字幕响应状态:', res.status);
    } catch (error) {
      console.error('❌ 字幕请求失败:', error);
    }

    // if fail, change base url and try again
    if (res?.status != 200) {
      console.log('⚠️ 首次请求失败，尝试备用URL...');
      this.isSubtitleRequestFailed = !this.isSubtitleRequestFailed;
      res = await fetch(this.getTrafficSafeUrl(subUrl));
      console.log('📦 备用请求状态:', res.status);
    }
    return await res.json();
  }
  static getTrafficSafeUrl(url) {
    return this.isSubtitleRequestFailed
      ? url.replace(
          `${this.baseUrl}/api/timedtext`,
          "video.google.com/timedtext"
        )
      : url;
  }

  static async getTranslatedSubtitleUrl(subUrl, lang) {
    // get user generated sub url if exist
    var v = this.getVideoId(subUrl);
    var url = await this.getUserGeneratedSubUrl(v, lang);
    // get auto translated sub url
    if (!url) {
      var url = new URL(subUrl);
      url.searchParams.set("tlang", lang);
    }
    return url.toString();
  }

  static async getUserGeneratedSubUrl(v, lang) {
    var metaData = await this.getYoutubeMetaDataCached(v);
    var captionList =
      metaData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    //get one that is selected language sub, not auto generated
    var langUrl = captionList.filter(
      (caption) => !caption?.kind && caption.languageCode == lang
    )?.[0]?.baseUrl;
    return langUrl ? langUrl + "&fmt=json3" : "";
  }

  // concat sub=====================================
  static parseSubtitle(subtitle, lang) {
    //console.log('📝 开始解析字幕:', { 语言: lang });
    // var isRtl = util.isRtl(lang);
    var newEvents = [];
    for (var event of subtitle.events) {
      if (!event.segs || !event.dDurationMs) {
        continue;
      }
      var oneLineSub = event.segs
        .reduce((acc, cur) => (acc += cur.utf8), "")
        .replace(/\s+/g, " ")
        .trim();

      // if prev sub time overlapped current sub, concat
      if (
        newEvents.length == 0 ||
        // 5000 < newEvents[newEvents.length - 1].dDurationMs ||
        newEvents[newEvents.length - 1].tStartMs +
          newEvents[newEvents.length - 1].dDurationMs <=
          event.tStartMs
      ) {
        newEvents.push({
          tStartMs: event.tStartMs,
          dDurationMs: event.dDurationMs,
          // wsWinStyleId: isRtl ? 2 : 1,
          segs: [
            {
              utf8: oneLineSub,
            },
          ],
        });
      } else {
        newEvents[newEvents.length - 1].segs[0].utf8 += oneLineSub
          ? ` ${oneLineSub}`
          : "";
      }
    }

    console.log('✅ 字幕解析完成，事件数:', newEvents.length);
    return this.setSubtitle1({
      events: newEvents,
      pens: [{}],
      wireMagic: "pb3",
      wpWinPositions: [
        {},
        {
          apPoint: 6,
          ahHorPos: 20,
          avVerPos: 100,
          rcRows: 2,
          ccCols: 40,
        },
      ],
      wsWinStyles: [
        {},
        {
          mhModeHint: 2,
          juJustifCode: 0, //ltr
          sdScrollDir: 3,
        },
        {
          mhModeHint: 2,
          juJustifCode: 1, //rtl
          sdScrollDir: 3,
        },
      ],
    });
  }

  static mergeSubtitles(sub1, sub2) {
    console.log('🔄 开始合并字幕:', {
      原字幕数: sub1.events.length,
      翻译字幕数: sub2.events.length
    });
    // fix mismatch length between sub1 sub2
    for (let [i, event] of sub1.events.entries()) {
      var line1 = event.segs[0]["utf8"];
      var line2 = "";
      // get most overlapped sub
      sub2.events.forEach((line) => {
        line.overlap = Math.max(
          event.tStartMs + event.dDurationMs - line.tStartMs,
          line.tStartMs + line.dDurationMs - event.tStartMs
        );
      });
      sub2.events.sort((a, b) => a.overlap - b.overlap);
      if (sub2.events.length && 0 < sub2.events[0].overlap) {
        line2 = sub2.events[0];
        line2.segs[0]["utf8"] = "\n" + line2.segs[0]["utf8"];
      }
      if (line2) {
        event.segs.push(line2.segs[0]);
      }
    }
    console.log('✅ 字幕合并完成!');
    return sub1;
  }
  // metadata getter ===============================
  static isVideoUrl(url) {
    return this.isShorts(url) || this.isEmbed(url) || this.isMainVideoUrl(url);
  }
  static isMainVideoUrl(url) {
    return url.includes(`${this.baseUrl}/watch`);
  }
  static isShorts(url) {
    return url.includes(`${this.baseUrl}/shorts`);
  }
  static isEmbed(url) {
    return url.includes(`${this.baseUrl}/embed`);
  }
  static getVideoId(url) {
    return this.getUrlParam(url)?.["v"] || this.getUrlParam(url)?.[2]; //2 for shorts and embed
  }
  static guessSubtitleLang(url, subtitle) {
    return this.getUrlParam(url)?.["lang"];
  }

  static async guessVideoLang(url) {
    var tlang;
    var v = this.getVideoId(url);
    var metaData = await this.getYoutubeMetaDataCached(v);
    var captionMeta =
      metaData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    // get auto generated lang
    var captionAsr = captionMeta?.filter((sub) => sub.kind);
    var lang = captionAsr?.[0]?.languageCode;
    // get target lang if targetsinglesub setting
    if (this.setting["detectSubtitle"] == "targetsinglesub") {
      var caption = captionMeta?.filter(
        (sub) => sub.languageCode == this.setting["translateTarget"]
      );
      lang = caption?.[0]?.languageCode || lang;
      tlang =
        lang != this.setting["translateTarget"]
          ? { languageCode: this.setting["translateTarget"] }
          : "";
    }
    return {
      lang: lang || "en",
      tlang
    };
  }

  static getYoutubeMetaDataCached = memoize(this.getYoutubeMetaData);

  static async getYoutubeMetaData(videoId) {
    // use global variable
    if (window?.ytInitialPlayerResponse?.videoDetails?.videoId == videoId) {
      return window.ytInitialPlayerResponse;
    }
    var metadata = await this.getYoutubeMetaDataFromAPI(videoId);
    if (metadata?.captions) {
      return metadata;
    }
    var metadata = await this.getYoutubeMetaDataFromWatch(videoId);
    return metadata;
  }

  static async getYoutubeMetaDataFromWatch(videoId) {
    try {
      var res = await fetch(`${this.baseUrl}/watch?v=${videoId}`);
      var resText = await res.text();
      var matches = resText.match(
        /ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s+meta|<\/script|\n)/
      );
      var json = JSON.parse(matches[1]);
      return json;
    } catch (error) {
      return {};
    }
  }

  static async getYoutubeMetaDataFromAPI(videoId) {
    // https://github.com/timelens/timelens-youtube/issues/2
    try {
      let fetch_data = await fetch(
        `${this.baseUrl}/youtubei/v1/player?key=${window.yt.config_.INNERTUBE_API_KEY}`,
        {
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            videoId: videoId,
            context: {
              client: {
                clientName: window.yt.config_.INNERTUBE_CLIENT_NAME,
                clientVersion: window.yt.config_.INNERTUBE_CLIENT_VERSION,
              },
            },
          }),
          method: "POST",
        }
      );
      var json = await fetch_data.json();
      return json;
    } catch (error) {
      return {};
    }
  }

  static async handleVideo(setting) {
    if (!this.isVideoSite() || setting["detectSubtitle"] == "null") {
      return;
    }
    this.initVariable(setting);
    await this.initInjectScript(setting);
    await this.loadEventListener();
    this.handleUrlChange();
  }

  static async exportSubtitle() {
    console.log('📥 开始导出字幕...');
    try {
      const videoId = this.getVideoId(window.location.href);//returns the href (URL) of the current page
      const metaData = await this.getYoutubeMetaDataCached(videoId);
      const captionList = metaData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      
      if (!captionList || captionList.length === 0) {
        console.log('❌ 未找到可用的字幕');
        return;
      }
      console.log('🔍 找到可用的字幕:', captionList);

      // 获取当前视频标题
      const videoTitle = this.getVideoTitle();
      
      // 下载所有可用的字幕
      for (const caption of captionList) {
        console.log('🔍 处理字幕:', caption);
        if (!caption?.baseUrl) continue;
        
        const lang = caption.languageCode;
        const isAuto = caption.kind === 'asr';
        const fileName = `${videoTitle}_${lang}${isAuto ? '_auto' : ''}.txt`;
        
        try {
          // 获取SRT格式字幕
          const response = await fetch(this.getTrafficSafeUrl(caption.baseUrl + '&fmt=json3'));
          if (!response.ok) throw new Error(`Failed to fetch subtitle for ${lang}`);
          
          const subtitleData = await response.json();
          console.log('🔍 获取到的字幕数据:', subtitleData);
          let subtitleText = '';
          
          // 将字幕数据转换为易读的文本格式
          if (subtitleData.events) {
            subtitleData.events.forEach((event, index) => {
              if (event.segs && event.segs.length > 0) {
                const text = event.segs.map(seg => seg.utf8).join('').trim();
                if (text) {
                  // 添加时间戳和文本
                  console.log('🔍 当前文本:', text);
                  const startTime = this.formatTime(event.tStartMs);
                  subtitleText += `[${startTime}] ${text}\n`;
                }
              }
            });
          }
          
          // 创建Blob并下载
          const blob = new Blob([subtitleText], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          console.log(`✅ 已导出字幕: ${fileName}`);
        } catch (error) {
          console.error(`❌ 导出字幕失败 ${lang}:`, error);
        }
      }
      
      console.log('✅ 字幕导出完成');
    } catch (error) {
      console.error('❌ 导出字幕时发生错误:', error);
    }
  }

  // 格式化时间戳
  static formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  // 重写基类的getVideoTitle方法，提供YouTube特定的实现
  static getVideoTitle() {
    try {
      // 尝试从YouTube特定的DOM元素获取标题
      const titleElements = [
        // 主要的标题元素 - 新版UI
        document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer yt-formatted-string"),
        // 备用标题元素 - 旧版UI或其他变体
        document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer"),
        document.querySelector(".ytp-title-link"),
        document.querySelector("meta[name='title']")
      ];

      // 遍历所有可能的元素，找到第一个有效的
      for (const element of titleElements) {
        if (element) {
          // 检查元素是否有textContent属性
          if (element.textContent) {
            return element.textContent.trim();
          }
          // 检查是否是meta标签
          if (element.getAttribute("content")) {
            return element.getAttribute("content").trim();
          }
        }
      }

      // 回退到从页面标题中提取
      const pageTitle = document.title;
      if (pageTitle) {
        // YouTube页面标题格式通常是"视频标题 - YouTube"
        if (pageTitle.includes(" - YouTube")) {
          return pageTitle.split(" - YouTube")[0].trim();
        }
        return pageTitle;
      }

      // 尝试从视频数据中获取
      if (window.ytInitialPlayerResponse && 
          window.ytInitialPlayerResponse.videoDetails && 
          window.ytInitialPlayerResponse.videoDetails.title) {
        return window.ytInitialPlayerResponse.videoDetails.title;
      }

      // 最后回退到当前视频ID
      const videoId = this.getVideoId();
      return videoId ? `YouTube视频 (ID: ${videoId})` : "未知YouTube视频";
    } catch (error) {
      console.error("获取YouTube视频标题出错:", error);
      return "无法获取YouTube视频标题";
    }
  }
}
