import { XMLHttpRequestInterceptor } from "@mswjs/interceptors/XMLHttpRequest";
import { debounce } from "throttle-debounce";
import $ from "jquery";
import memoize from "memoizee";
import { waitUntil, WAIT_FOREVER } from "async-wait-until";
var browser;
try {
  browser = require("webextension-polyfill");
} catch (error) {}
import TextUtil from "/src/util/text_util.js";
import { getDirectResponse } from "./llm-client.js";
import {getSubtitleWithCache,getCache,getVideoId} from "./youtube_cache";

export default class BaseVideo {
  static sitePattern = /^(https:\/\/)(example\.com)/;
  static captionRequestPattern = /^(https:\/\/)(example\.com)/;
  static baseUrl = "https://example.com";
  static playerSelector = "video";
  static captionContainerSelector = "";
  static captionWindowSelector = "";
  static captionBoxSelector = "";
  static listenButtonSelector = "";

  static isPaused = false;
  static pausedByExtension = false;
  static isEventListenerLoaded = false;
  static interceptorLoaded = false;
  static scriptUrl = "subtitle.js";
  static interceptKillTime = 1 * 60 * 1000; //1min
  static interceptor = new XMLHttpRequestInterceptor();
  static setting = {};
  static useManualIntercept = false;


  static translated_subtitle=[]//下面拦截器会刷好几次导致翻译没了

  static translate_setter=false//这个是给新的


  //自定义开关
  static is_translating= false;


  static async handleVideo(setting) {
    if (!this.isVideoSite() || setting["detectSubtitle"] == "null") {
      return;
    }
    this.initVariable(setting);
    await this.initInjectScript(setting);
    await this.loadEventListener();
    this.handleUrlChange();
  }
  static initVariable(setting) {
    this.setting = setting;
  }
  static async loadEventListener() {
    if (this.isEventListenerLoaded) {
      return;
    }
    this.isEventListenerLoaded = true;
    this.listenUrl();
    await this.waitPlayer();
    this.listenPlay();
    this.listenPause();
    this.listenCaptionHover();
    this.listenButton();
    this.listenKey();
  }
  static isVideoSite(url = window.location.href) {
    return this.sitePattern.test(url);
  }
  static getVideoId(url = window.location.href) {
    throw new Error("Not implemented");
  }
  static guessVideoLang(videoId) {
    throw new Error("Not implemented");
  }
  static guessSubtitleLang(url, subtitle) {
    throw new Error("Not implemented");
  }
  static requestSubtitle(subUrl, lang, tlang, videoId) {
    throw new Error("Not implemented");
  }
  static parseSubtitle(sub, lang) {
    throw new Error("Not implemented");
  }
  static mergeSubtitles(sub1, sub2) {
    throw new Error("Not implemented");
  }

  // player control by extension================================
  static play() {
    //play only when paused by extension
    if (this.pausedByExtension == false) {
      return;
    }
    this.pausedByExtension = false;
    this.playPlayer();
  }
  static pause() {
    //if already paused skip
    if (
      this.isPaused == true ||
      this.setting["mouseoverPauseSubtitle"] == "false"
    ) {
      return;
    }
    this.pausedByExtension = true;
    this.pausePlayer();
  }
  static handleUrlChange(url = window.location.href) {
    this.pausedByExtension = false;
  }

  // player control================================
  // html5 video control
  static getPlayer() {
    return $(this.playerSelector)?.get(0);
  }
  static playPlayer() {
    this.getPlayer()?.play();
  }
  static pausePlayer() {
    this.getPlayer()?.pause();
  }
  static checkPlayerReady() {
    return this.getPlayer()?.readyState >= 3;
  }

  // listen=========================================
  static async listenCaptionHover() {
    if (!this.captionContainerSelector) {
      return;
    }
    await this.waitUntilForever(() => $(this.captionContainerSelector).get(0));

    //inject action for hover play stop
    const observer = new MutationObserver((mutations) => {
      // make subtitle selectable
      $(this.captionBoxSelector)
        .off()
        .on("contextmenu", (e) => {
          e.stopPropagation();
        })
        .on("mousedown", (e) => {
          e.stopPropagation();
        });

      // add auto pause when mouseover
      $(this.captionWindowSelector)
        .off()
        .on("mouseenter", (e) => {
          this.pause();
        })
        .on("mouseleave", (e) => {
          this.play();
        })
        .attr("draggable", "false");
    });

    //check subtitle change
    observer.observe($(this.captionContainerSelector).get(0), {
      subtree: true,
      childList: true,
    });
  }

  static listenUrl() {
    navigation.addEventListener("navigate", (e) => {
      this.handleUrlChange(e.destination.url);
    });
  }
  static listenPlay() {
    this.getPlayer()?.addEventListener("play", (e) => {
      this.isPaused = false;
    });
  }
  static listenPause() {
    this.getPlayer()?.addEventListener("pause", (e) => {
      this.isPaused = true;
    });
  }

  static listenButton() {
    $(this.listenButtonSelector).on("click", (e) => {
      this.handleButtonKey(e);
    });
  }
  static listenKey() {
    $(document).on("keydown", (e) => {
      this.handleButtonKey(e);
    });
  }
  static handleButtonKey(e) {}

  //handle dual caption =============================
  static async interceptCaption() {
    if (this.interceptorLoaded) {
      return;
    }
    this.interceptorLoaded = true;
    this.interceptor.apply();
    this.interceptor.on("request", async ({ request, requestId }) => {
      try {
       // console.log("-----------以下是请求---------------")
        //console.log(JSON.stringify(requestId)); 每次id都不一样？
        //console.log("-----------以下是设置---------------")
        //console.log(JSON.stringify(this.setting));

       // console.log("-----------------------------------")
        if (this.captionRequestPattern.test(request.url)) {
          // 保存拦截到的字幕URL

          //get source lang sub 单语字幕可能就 判断是否有zh-CH什么的
          var response = await this.requestSubtitleCached(request.url);
           //console.log("-----------以下是请求---------------")
          //console.log(request);
          //上面的url会根据那个页面 双语 目标语 原始语 进行切换 可能按钮是有做什么绑定？？

          console.log("-----------url-------------")
          console.log(request.url)
          //console.log("------------------------")
          //console.log( "------这个获得的是翻译后的json文件------"+JSON.stringify(response))

          var targetLang = this.setting["translateTarget"];
          var sourceLang = this.guessSubtitleLang(request.url);
          //console.log("------------------------")
          //console.log(sourceLang)
          var sub1 = this.parseSubtitle(response, sourceLang);

          // Send the parsed subtitle data to contentScript using printMessage
          try {
            console.log("----------发送数据到contentScript----------")
            // Store subtitle data in window object if browser.runtime is not available
            if (typeof browser !== 'undefined' && browser.runtime) {
              browser.runtime.sendMessage({
                action: "reloadSubtitle",
                subtitleData: {
                  sub1: sub1,
                  url: request.url,
                  sourceLang: sourceLang
                }
              });
            } else {
              // Fallback: store in window object for access from contentScript
              window.mttSubtitleData = {
                sub1: sub1,
                url: request.url,
                sourceLang: sourceLang
              };
              // Send custom event that contentScript can listen for
              window.dispatchEvent(new CustomEvent('mttSubtitleDataReady', {
                detail: window.mttSubtitleData
              }));
              console.log("Stored subtitle data in window.mttSubtitleData");
            }
          } catch (error) {
            console.log("Error sending subtitle data:", error);
            // Fallback storage
            window.mttSubtitleData = {
              sub1: sub1,
              url: request.url,
              sourceLang: sourceLang
            };
            console.log("Fallback: Stored subtitle data in window.mttSubtitleData");
          }

          console.log("----------sub1----------")
          console.log(sub1)
          console.log("----------window_sub_data----------")

         /* if (this.is_translating===false){

            console.log("---------以下是翻译测试-----------")
            //console.log(getVideoId(request.url))
            //console.log(getCache(getVideoId(request.url)))
            const url=request.url//不确定为什么 id后面给变了 我觉得后面写成function调用得了 稳定点
            const videoId = getVideoId(url);
            const CACHE_KEY = `youtube_sub_${videoId}`;
            console.log(CACHE_KEY)

            var queries=this.parseSubtitles_for_llms(sub1)//加载视频所有对话
            const result=await this.Group_Translator(queries,CACHE_KEY)//这个结果弄一个local cache如果有就加载不翻译，CACHE_KEY的话就视频id做区分我认为

            console.log("异步-------")//这个上面的await会给你卡住所以没事？
            this.translated_subtitle=await this.get_subtitle_from_cache(request.url,result);//local存储，实际要存llm翻译
            console.log(translated_subtitle)

//测试 https://www.youtube.com/watch?v=MAlSjtxy5ak
// https://www.youtube.com/watch?v=pZbdeuAibSg
            //https://www.youtube.com/results?search_query=1min+tutoiral
            //有时候会有bug啊
            //var queries=this.parseSubtitles_for_llms(sub1)//加载视频所有对话
            //const result=await this.Group_Translator(queries)//这个结果弄一个local cache如果有就加载不翻译，CACHE_KEY的话就视频id做区分我认为
            //this.get_subtitle_from_cache(request.url,result);//local存储，实际要存llm翻译的
          }
          */
          if (this.translate_setter === false){
            //防止被覆盖掉 我觉得。。。。。。。。。
            this.true_the_setter();
            const url=request.url//不确定为什么 id后面给变了 我觉得后面写成function调用得了 稳定点
            const videoId = getVideoId(url);
            const CACHE_KEY = `youtube_sub_${videoId}`;
            console.log("---------------")
            console.log(CACHE_KEY)
            this.translated_subtitle=getCache(CACHE_KEY).data//需要.data
            console.log(this.translated_subtitle)
            console.log("---------------")
          }




          //console.log( "------这个是原始字幕的json文件------"+JSON.stringify(sub1))
          var responseSub = sub1;//z这里没进去双语的话就是都英文了 我弄的
          //get target lang sub, if not same lang
          if (
            sourceLang != targetLang &&
            this.setting["detectSubtitle"] == "dualsub"
          ) {
            /* 这里是之前他们的 获取youtube翻译的部分
            var sub2 = await this.requestSubtitleCached(
              request.url,
              targetLang
            );
            var sub2 = this.parseSubtitle(sub2, targetLang);//我这里改成source

             */
            var sub2_parsed=JSON.parse(JSON.stringify(sub1));//复制sub1的模板
            var sub2=this.replaceUtf8Sequentially(sub2_parsed,this.translated_subtitle)//替换
            //console.log( "------这个获得的是翻译后的json文件2_event的------"+JSON.stringify(sub2))
            var mergedSub = this.mergeSubtitles(sub1, sub2);
            //双语字幕的时候从这里出发修改。。。。。。。。。。。。
            console.log( "------这个是合并后的json文件------"+JSON.stringify(mergedSub))
            responseSub = mergedSub;
          }

          request.respondWith(
            new Response(JSON.stringify(responseSub), response)
          );
          // Add debug logs
          //console.log("Response content:", JSON.stringify(responseSub));
          //console.log("Response headers:", response.headers);
          //console.log("Response status:", response.status);
        }
      } catch (error) {
        console.log(error);
      }
    });
  }


  static killIntercept() {
    this.interceptor.dispose();
    this.interceptorLoaded = false;
  }
  static killInterceptDebounce = debounce(
    this.interceptKillTime,
    this.killIntercept
  );

  static requestSubtitleCached = memoize(async function (
    subUrl,
    lang,
    tlang,
    videoId
  ) {
    return await this.requestSubtitle(...arguments);
  });

  static true_the_setter(){
    this.translate_setter=true;
  }
  //util =======================
  static async waitPlayer() {
    await this.waitUntilForever(() => this.getPlayer());
  }
  static async waitPlayerReady() {
    await this.waitUntilForever(() => this.checkPlayerReady());
  }

  static async waitUntilForever(fn) {
    await waitUntil(fn, {
      timeout: WAIT_FOREVER,
    });
  }
  static getUrlParam(url) {
    //get paths
    var pathJson = {};
    var paths = new URL(url).pathname.split("/");
    for (var [index, value] of paths.entries()) {
      pathJson[index] = value;
    }
    //get params
    let params = new URL(url).searchParams;
    var paramsJson = Object.fromEntries(params);
    return TextUtil.concatJson(pathJson, paramsJson);
  }
  static filterSpecialText(word) {
    return word.replace(/[^a-zA-Z ]/g, "");
  }

  //inject script for handle local function===============================

  static async initInjectScript(setting) {
    if (this.checkIsInjectedScript()) {
      return;
    }
    await this.injectScript();
    this.resetInjectScript(setting);
  }

  static async resetInject(data) {
    this.initVariable(data);
    if (!this.useManualIntercept) {
      this.interceptCaption();
    }
  }
  static checkIsInjectedScript() {
    return browser?.runtime?.id == null;
  }

  static injectScript(scriptUrl = this.scriptUrl) {
    return new Promise((resolve) => {
      var url = browser.runtime.getURL(scriptUrl);
      var id = this.filterSpecialText(url);
      if (!scriptUrl || $(`#${id}`)?.get(0)) {
        resolve();
        return;
      }

      $("<script>", { id })
        .on("load", () => resolve())
        .appendTo("head")
        .attr("src", url);
    });
  }
  //message between inject script==========================================
  static listenMessageFrameFromInject() {
    if (!this.isVideoSite() || !this.checkIsInjectedScript()) {
      return;
    }
    window.addEventListener("message", ({ data }) => {
      if (data?.type == "resetInjectScript") {
        this?.resetInject(data?.setting);
      } else if (data?.type == "callMethod") {
        this?.[data?.name]?.(...data?.args);
      }
    });
  }
  // handle local function by injecting and call

  static callMethodFromInject(name, ...args) {
    this.sendMessageFrame({ type: "callMethod", name, args });
  }
  static resetInjectScript(setting) {
    this.sendMessageFrame({ type: "resetInjectScript", setting });
  }
  static sendMessageFrame(message) {
    window.postMessage(message, "*");
  }

  static async Group_Translator(queries, CACHE_KEY, progressCallback = null, promptTemplate = "测试") {
    this.is_translating = true;

    try {
      // 确保 promptTemplate 有效
      if (!promptTemplate || typeof promptTemplate !== 'string') {
        console.log("警告: promptTemplate 无效，使用默认值", promptTemplate);
        promptTemplate = "翻译成中文(弱智吧风格)";
      }
      
      console.log(`使用翻译模板: "${promptTemplate}", 类型: ${typeof promptTemplate}`);

      if (getCache(CACHE_KEY)){
        console.log(`此视频有缓存: ${CACHE_KEY}`);
        return null;
      }
      else{
        console.log(`此视频: 暂无缓存 (键: ${CACHE_KEY}), 因此调用llm翻译`);
        console.log("批量翻译中.........");
        
        const total = queries.length;
        console.log(`创建 ${total} 个并行翻译请求`);
        
        // 创建中止控制器
        const abortController = new AbortController();
        const signal = abortController.signal;
        
        // 定期检查用户是否取消
        const cancelChecker = setInterval(() => {
          if (window.isTranslationCancelled) {
            console.log("翻译被用户取消，中止所有请求");
            abortController.abort();
            clearInterval(cancelChecker);
            throw new Error("用户取消了翻译");
          }
        }, 500);

        // 创建一个数组来保存结果，初始值都是null
        const results = new Array(total).fill(null);
        // 跟踪已完成的翻译数量
        let completedCount = 0;
        
        // 进度更新变量
        let isProgressUpdateScheduled = false;
        let lastReportedCount = 0;
        
        // 使用requestAnimationFrame进行平滑的进度更新
        const updateProgressSmoothly = () => {
          if (completedCount > lastReportedCount && typeof progressCallback === 'function') {
            progressCallback(completedCount, total, { status: "success" });
            lastReportedCount = completedCount;
          }
          
          if (completedCount < total) {
            isProgressUpdateScheduled = true;
            requestAnimationFrame(updateProgressSmoothly);
          } else {
            isProgressUpdateScheduled = false;
          }
        };
        
        // 启动平滑进度更新
        if (typeof progressCallback === 'function' && !isProgressUpdateScheduled) {
          isProgressUpdateScheduled = true;
          requestAnimationFrame(updateProgressSmoothly);
        }
        
        // 创建所有翻译请求的Promise数组
        const translationPromises = queries.map((query, index) => {
          // 检查是否已经取消
          if (signal.aborted) {
            return Promise.reject(new Error("翻译已取消"));
          }
          
          return getDirectResponse(query, promptTemplate)
            .then(result => {
              // 处理新的返回格式，提取文本内容
              const translatedText = typeof result === 'object' && result.text ? result.text : result;
              
              // 存储结果到对应位置
              results[index] = translatedText;
              
              // 增加已完成计数
              completedCount++;
              
              // 不再直接调用progressCallback，而是通过动画帧更新
              return translatedText;
            })
            .catch(error => {
              console.error(`翻译第${index+1}个片段时出错:`, error);
              
              // 检查是否是取消操作
              if (signal.aborted) {
                throw new Error("翻译已取消");
              }
              
              // 存储错误结果
              results[index] = `[翻译出错: ${error.message}]`;
              
              // 增加已完成计数
              completedCount++;
              
              // 不需要抛出错误，这样Promise.all不会中断
              return results[index];
            });
        });
        
        try {
          // 等待所有请求完成
          console.log("等待所有翻译请求完成...");
          await Promise.all(translationPromises);
          
          // 确保最终进度为100%
          if (typeof progressCallback === 'function') {
            // 使用setTimeout确保UI有时间更新最终进度
            setTimeout(() => {
              progressCallback(total, total, { status: "success" });
            }, 100);
          }
          
          clearInterval(cancelChecker); // 清除检查定时器
          
          console.log("😀批量翻译结果");
          console.log(JSON.stringify(results));
          return results;
        } catch (error) {
          console.error("批量翻译过程中出错:", error);
          clearInterval(cancelChecker); // 清除检查定时器
          throw error; // 重新抛出错误
        }
      }
    } finally {
      this.is_translating = false;
    }
  }


  //翻译单个句子
  static async Single_Translator(query, promptTemplate = "翻译成中文(弱智吧风格)") {
    //console.log("翻译中.........");
    if (!promptTemplate || typeof promptTemplate !== 'string') {
      promptTemplate = "翻译成中文(弱智吧风格)";
    }
    const test = await getDirectResponse(query, promptTemplate);
    //console.log("翻译结果");
    //console.log(JSON.stringify(test));
    return test;
  }

  static parseSubtitles_for_llms(data, count  = Infinity) {
    const result = [];

    // 顺序遍历所有事件和字幕片段
    for (const event of data.events) {
      for (const seg of event.segs) {
        // 当收集到指定数量时立即停止
        if (result.length >= count) break;

        // 过滤空字符串并存入列表
        if (seg.utf8?.trim()) {
          result.push(seg.utf8);
        }
      }

      // 再次检查防止外层循环继续
      if (result.length >= count) break;
    }

    const finalResult = result.slice(0, count);
    console.log(`获取字幕数量：${finalResult.length}`); // 打印结果长度
    return finalResult;
  }

  static async get_subtitle_from_cache(url, data) {
    //传入 url 和翻译后的字母列表然后储存
    const videoId = getVideoId(url);
    const CACHE_KEY = `youtube_sub_${videoId}`;
    console.log(`[Cache] 正在存储字幕翻译, URL: ${url}`);
    console.log(`[Cache] 缓存键: ${CACHE_KEY}, 数据大小: ${data?.length || 0} 项`);
    
    try {
      const result = await getSubtitleWithCache(url, data);
      console.log(`[Cache] 获取到的结果类型: ${typeof result}, 是否为数组: ${Array.isArray(result)}, 值:`, result);
      
      // 添加检查，确保result不为null且为数组
      if (!result || !Array.isArray(result)) {
        console.log(`[Cache] 获取到的结果为空或非数组`);
        return [];
      }

      // Clean each element by removing newlines
      const cleanedResult = result.map(item =>
          typeof item === 'string' ? item.replace(/\n/g, '') : item
      );

      console.log(`[Cache] 存储完成`);
      return cleanedResult;
    } catch (error) {
      console.error(`[Cache] 获取字幕缓存时出错:`, error);
      return [];
    }
  }

  static replaceUtf8Sequentially(eventsData, newTexts) {
    // 创建深拷贝以避免修改原始数据（可选）
    const events = JSON.parse(JSON.stringify(eventsData));

    events.events.forEach((event, index) => {
      if (event.segs && Array.isArray(event.segs)) {
        event.segs.forEach(seg => {
          if (seg.hasOwnProperty('utf8') && index < newTexts.length) {
            seg.utf8 = newTexts[index];
          }
        });
      }
    });

    return events;
  }

  // 添加获取最近字幕URL的方法
  static getLastCaptionUrl() {
    return this.lastCaptionUrl;
  }

  // 添加获取YouTube视频标题的方法
  static getVideoTitle() {
    try {
      // 从页面标题中获取视频标题
      // YouTube页面标题格式通常是"视频标题 - YouTube"
      const pageTitle = document.title;
      let videoTitle = pageTitle;
      
      // 移除" - YouTube"后缀
      if (pageTitle.endsWith(" - YouTube")) {
        videoTitle = pageTitle.substring(0, pageTitle.length - 10);
      }
      
      // 尝试直接从DOM获取更准确的标题
      const titleElement = document.querySelector("h1.title.style-scope.ytd-video-primary-info-renderer");
      if (titleElement) {
        videoTitle = titleElement.textContent.trim();
      }
      
      console.log("获取到视频标题:", videoTitle);
      return videoTitle;
    } catch (error) {
      console.error("获取视频标题出错:", error);
      return "无法获取视频标题";
    }
  }

}
