// inject translation tooltip based on user text hover event
//it gets translation and tts from background.js
//intercept pdf url

import $ from "jquery";
import tippy, { sticky, hideAll } from "tippy.js";
import matchUrl from "match-url-wildcard";
import delay from "delay";
import browser from "webextension-polyfill";
import TextUtil from "/src/util/text_util.js";
import SettingUtil from "/src/util/setting_util.js";
import { getRtlDir } from "/src/util/lang.js";
import { getSubtitleWithCache, getCache, getVideoId } from "/src/subtitle/youtube_cache.js";
import leven from 'leven';
import {
  enableSelectionEndEvent,
  getSelectionText,
} from "/src/event/selection";
import {
  enableMouseoverTextEvent,
  getNextExpand,
  getMouseoverText,
} from "/src/event/mouseover";
import * as util from "/src/util";
import * as dom_util from "/src/util/dom";

import * as ocrView from "/src/ocr/ocrView.js";
import subtitle from "/src/subtitle/subtitle.js";
import { langListOpposite } from "/src/util/lang.js";
import * as speech from "/src/speech";

//init environment var======================================================================\
var setting;
var tooltip;
var style;
var styleSubtitle;
var tooltipContainer;
var tooltipContainerEle;

var clientX = 0;
var clientY = 0;
var mouseTarget = null;
var mouseMoved = false;
var mouseMovedCount = 0;
var keyDownList = { always: true }; //use key down for enable translation partially
var mouseKeyMap = ["ClickLeft", "ClickMiddle", "ClickRight"];

var destructionEvent = "destructmyextension_MouseTooltipTranslator"; // + chrome.runtime.id;
const controller = new AbortController();
const { signal } = controller;

var selectedText = "";
var prevSelected = "";
var hoveredData = {};
var stagedText = null;
var prevTooltipText = "";
var isAutoReaderRunning = false;
var isStopAutoReaderOn = false;

var tooltipRemoveTimeoutId = "";
var tooltipRemoveTime = 3000;
var autoReaderScrollTime = 400;

var listenText = "";


var translatePromptTemplateList = {
  "punchline pro": "翻译成适合脱口秀的中文，注意以下四个维度：笑点保留度、文化适应度、流畅度、结构综合度",
  "正式风格": "翻译风格为:翻译成正式中文",
  "网络流行语风格": "翻译风格为:翻译成中文(使用流行网络用语)",
  "文言文风格": "翻译风格为:翻译成文言文",
  "幽默风格": "翻译风格为:翻译成幽默的中文",
  "简单直白": "翻译风格为:翻译成简单直白的中文",
  "Bill Burr Style" : `翻译风格为:保留层次性结构，先识别铺垫、核心讽刺和收尾，确保类比关系在翻译中清晰可见，适当保留粗暴直接的语气，但不失原有的精巧逻辑`,
  "Ali Wong Style" : `翻译风格为:保留夸张和讽刺的风格，确保虚构角色的特征在翻译中清晰可见，适当调整语言风格以适应目标语言的文化背景，同时保留原段子的荒谬逻辑`,
  "Hasan Minhaj Style" : `翻译风格为:保留原段子中的文化背景和身份差异元素，确保夸张的对话和场景描写在翻译中依然生动，同时适当调整语言风格以适应目标语言的文化背景，使观众能够理解其中的讽刺含义`,
  "Taylor Tomlinson Style" : `翻译风格为:保留比喻的连贯性和逻辑性，确保比喻中的情境细节在翻译中不丢失，维持轻松但不轻视问题的语气，保留原文的治愈性质和教育价值`,
  "Gabriel Iglesias Style" : `翻译风格为:保留原段子中的文化元素和误解情境，确保夸张的对话和场景描写在翻译中依然生动，同时适当调整语言风格以适应目标语言的文化背景，使观众能够理解其中的幽默`,
  "Fortune Feimster Style" : `翻译风格为:保留原段子中的夸张对比和自嘲元素，确保场景描写在翻译中依然生动，同时适当调整语言风格以适应目标语言的文化背景，增强与观众的共鸣`,
  "Mike Epps Style" : `翻译风格为:保留原文的直接粗犷风格，确保文化特定表达的恰当转换，维持街头语言的真实感，准确传达对社会现象的批评，注意保留黑人社区特有的语言节奏和表达方式`,
  "Neal Brennan Style" : `翻译风格为:保留原文的逻辑分析风格，确保政治立场的平衡表达，准确传达假设性场景的荒谬性，维持对话的生动性，注意保留对社会现象的深刻批判`,
  "Iliza Shlesinger Style" : `翻译风格为:保留原文对女性身体经验的直接描述风格，确保夸张比喻的生动效果，准确传达对社会双重标准的批评，维持共鸣感，注意保留表演者特有的自嘲与力量并存的语调`,
  "Chris Distafano Style" : `翻译风格为:保留原文对种族问题的直接讨论风格，确保自嘲元素的保留，适当调整文化参考以保持相关性，准确传达对种族身份的复杂态度，注意保留表演者特有的坦率不避讳的语调`,
  "Aziz Ansari Style" : `翻译风格为:保留原文的逻辑分析风格，确保医疗描述的准确性，适当调整流行文化参考以保持相关性，维持假设性场景的生动性，注意保留表演者特有的平静而有力的讽刺方式`,
  "Sheng Wang Style" : `翻译风格为:保留原文对日常物品的细致观察，确保对动作的生动描述，准确传达自我价值的哲学思考，维持平静而深刻的语调，注意保留表演者特有的从小事中引出大道理的风格`,
  "Cristela Alonzo Style" : `翻译风格为:保留原文的文化对比结构，确保不同语言表达方式的对比效果，准确传达社会阶层暗示，维持对话的自然流畅，注意保留表演者特有的多元文化视角`,
  "Jo Koy Style" : `翻译风格为:保留原文与观众互动的直接风格，确保菲律宾文化习俗的准确解释，准确传达文化误解的纠正，维持幽默但不伤人的语调，注意保留表演者特有的教育性与娱乐性并重的风格`,
  "Sebastian Maniscalco Style" : `翻译风格为:保留原文的夸张叙事风格，确保描述性别差异时的幽默感不失礼貌，准确传达对夫妻日常行为的观察，维持对话的生动性，注意保留表演者特有的困惑但宽容的语调`,
  "Ms. Pat Style" : `翻译风格为:保留原文的直接粗犷风格，确保种族相关表达的恰当处理，准确传达对庆祝活动表面性的批评，维持与观众的互动感，注意保留表演者特有的挑战性和直接性`,
  "David Spade Style" : `翻译风格为:保留原文的干巴语调和讽刺性，确保尴尬情境的准确传达，准确翻译对社会规范的批评，维持类比的清晰性，注意保留表演者特有的自我贬低但不失锋芒的风格`,
  "Chelsea Handler Style" : `翻译风格为:保留原文的自嘲风格，确保名人生活描述的讽刺性，准确传达事件发展的戏剧性，维持夸张描述的幽默效果，注意保留表演者特有的直率而不做作的语调`,
  "Trevor Noah Style" : `翻译风格为:保留文化特定的参考点，注意反转期望的时机，确保个人故事的叙事节奏，准确传达文化刻板印象的微妙讽刺，保持故事的流畅性和亲密感`,
  "Patton Oswalt Style" : `翻译风格为:保留原文的讽刺预测风格，确保政治批评的准确传达，准确翻译对意识形态极端化的批评，维持对话的生动性，注意保留表演者特有的悲观但幽默的语调`,
  "Ronny Chieng Style" : `翻译风格为:保留原文的挑衅性和直接风格，确保对取消文化的批评准确传达，准确翻译移民经历的描述，维持重复句式的强调效果，注意保留表演者特有的愤怒但不失理性的语调`,
  "Ricky Jervais Style" : `翻译风格为:保留原文的元喜剧风格，确保讽刺层次的准确传达，准确翻译对喜剧技巧的解释，维持与观众互动的感觉，注意保留表演者特有的自我意识和对观众智力的尊重`,
  "Deon Cole Style" : `翻译风格为:保留原文的直接热情风格，确保性内容的准确但不过度粗俗的表达，准确传达产品描述，维持重复强调的效果，注意保留表演者特有的销售式热情和与观众互动的感觉`,
  "Whitney Cummings Style" : `翻译风格为:保留与观众的直接互动感，确保性话题的坦率但不显得粗俗，准确传达代际对比，保持段子的随意感和连贯性，突出最后的结论性笑点`,
  "Sam Morril Style" : `翻译风格为:保留原文的讽刺平衡感，确保不偏向任何政治立场，准确传达对'取消文化'的批判态度，保持对敏感话题的轻松但不轻视的处理方式，注意对文化参考点的恰当本地化`,
  "Earthquake Style" : `翻译风格为:保留原文的节奏感和重复元素，确保夸张描述的逐步增强效果，适当调整文化特定表达以符合目标语言习惯，保持叙事的连贯性和流畅性，在翻译中传达出表演者特有的语调和讲故事风格`,
  "Tim Dillon Style" : `翻译风格为:保留原文的尖锐批判性，确保荒谬对话场景的讽刺效果，维持原作者直接大胆的语言风格，准确传达针对社会政策的批评，在翻译中保留模拟对话的生动性和戏剧性`,
  "Katt Williams Style" : `翻译风格为:保留原文的直接激进风格，确保重复元素和夸张表达的效果，保持街头语言风格的真实性，准确传达对政治人物的辩护态度，注意保留数字递增的喜剧技巧`,
  "Nick Kroll Style" : `翻译风格为:保留原文的自嘲风格和内心对话结构，确保英式俚语和文化参考的恰当转换，维持模仿的语调和节奏，准确传达自我批评的幽默感，在翻译中保持人物模仿的生动性`,
  "Norm Macdonald Style" : `翻译风格为:保留原文的平淡叙事风格，确保对话的自然流畅，准确传达对医疗系统的讽刺，维持普通人视角的困惑感，注意保留反传统笑点结构的特点`,
  "Christina P Style" : `翻译风格为:保留原文的坦率直接风格，确保心理健康话题的准确表达，适当调整文化特定参考以保持相关性，维持自嘲与性话题混合的独特风格，注意保留清单式叙述转向反转的结构`,
  "Paul Virzi Style" : `翻译风格为:保留原文的家庭互动真实感，确保父亲内外矛盾的清晰传达，准确翻译篮球相关术语，维持对话的生动性和紧张感，注意保留父亲视角的微妙情感变化`,
  "Joel Kim Booster Style" : `翻译风格为:保留原文关于性别和性的直接讨论风格，确保流行文化参考的恰当本地化，维持比喻的生动性和类比的清晰度，准确传达对异性恋关系的观察，注意保留表演者特有的自信但自嘲的语调`,
  "Catherine Cohen Style" : `翻译风格为:保留原文的内心独白风格，确保女性面对性别期望时的自我怀疑感得到准确传达，维持夸张但有真实基础的语调，准确翻译性暗示，注意保留表演者特有的自我意识和断片效果`,
  "Mo Gilligan Style" : `翻译风格为:保留原文的生活观察风格，确保贫困时的心理状态得到准确传达，保持对话的自然流畅，适当调整宗教参考以保持相关性，维持表演者特有的节奏和与观众的互动感`,
  "David A. Arnold Style" : `翻译风格为:保留强烈的对比元素，确保批判性观点的清晰传达，在翻译中维持讲述个人创伤故事时的情感真实性，保留原作者的黑色幽默色彩，注意不要在翻译中弱化社会批判的锋芒`,
  "Jeff Foxworthy Style" : `翻译风格为:保留原文的家庭互动风格，确保技术代沟的准确传达，维持误解的逐步升级效果，保持对老年人态度的温和性，注意保留幽默中的亲情色彩`,
};


//tooltip core======================================================================

(async function initMouseTooltipTranslator() {
  try {
    injectGoogleDocAnnotation(); //check google doc and add annotation env var
    loadDestructor(); //remove previous tooltip script
    await getSetting(); //load setting
    if (checkExcludeUrl()) {
      return;
    }
    await dom_util.waitJquery(); //wait jquery load
    detectPDF(); //check current page is pdf
    checkVideo(); // check  video  site for subtitle
    checkGoogleDocs(); // check google doc
    addElementEnv(); //add tooltip container
    applyStyleSetting(); //add tooltip style
    addMsgListener(); // get background listener for copy request
    loadEventListener(); //load event listener to detect mouse move
    loadSpeechRecognition();
    startMouseoverDetector(); // start current mouseover text detector
    startTextSelectDetector(); // start current text select detector
  } catch (error) {
    console.log(error);
  }
})();

//determineTooltipShowHide based on hover, check mouse over word on every 700ms
function startMouseoverDetector() {
  enableMouseoverTextEvent(window, setting["tooltipEventInterval"]);
  addEventHandler("mouseoverText", stageTooltipTextHover);
}

//determineTooltipShowHide based on selection
function startTextSelectDetector() {
  enableSelectionEndEvent(window, setting["tooltipEventInterval"]); //set mouse drag text selection event
  addEventHandler("selectionEnd", stageTooltipTextSelect);
}

function stageTooltipTextHover(event, useEvent = true) {
  hoveredData = useEvent ? event?.mouseoverText : hoveredData;
  // if mouseover detect setting is on and
  // if no selected text
  if (
    setting["translateWhen"].includes("mouseover") &&
    hoveredData &&
    !isOtherServiceActive()
  ) {
    var { mouseoverText, mouseoverRange } = extractMouseoverText(hoveredData);
    stageTooltipText(mouseoverText, "mouseover", mouseoverRange);
  }
}

function stageTooltipTextSelect(event, useEvent = true) {
  // if translate on selection is enabled
  if (
    setting["translateWhen"].includes("select") &&
    !isOtherServiceActive(true)
  ) {
    prevSelected = selectedText;
    selectedText = useEvent ? event?.selectedText : selectedText;
    stageTooltipText(selectedText, "select");
  }
}

function isOtherServiceActive(excludeSelect = false) {
  return listenText || isAutoReaderRunning || (!excludeSelect && selectedText);
}

//process detected word
async function stageTooltipText(text, actionType, range) {
  var isTtsOn =
    keyDownList[setting["TTSWhen"]] ||
    (setting["TTSWhen"] == "select" && actionType == "select");

  var isTooltipOn = keyDownList[setting["showTooltipWhen"]];
  var timestamp = Number(Date.now());
  // skip if mouse target is tooltip or no text, if no new word or  tab is not activated
  // hide tooltip, if  no text
  // if tooltip is off, hide tooltip
  if (
    !checkWindowFocus() ||
    checkMouseTargetIsTooltip() ||
    stagedText == text ||
    !util.isExtensionOnline() ||
    (selectedText == prevSelected && !text && actionType == "select") //prevent select flicker
  ) {
    return;
  } else if (!text) {
    stagedText = text;
    hideTooltip();
    return;
  } else if (!isTooltipOn && !isTtsOn) {
    hideTooltip();
    return;
  } else if (!isTooltipOn) {
    hideTooltip();
  }

  //stage current processing word
  stagedText = text;
  var translatedData = await util.requestTranslate(
    text,
    setting["translateSource"],
    setting["translateTarget"],
    setting["translateReverseTarget"]
  );
  var { targetText, sourceLang, targetLang } = translatedData;

  // if translation is not recent one, do not update
  //if translated text is empty, hide tooltip
  if (stagedText != text) {
    return;
  } else if (
    !targetText ||
    sourceLang == targetLang ||
    setting["langExcludeList"].includes(sourceLang)
  ) {
    hideTooltip();
    return;
  }

  //if tooltip is on or activation key is pressed, show tooltip
  if (isTooltipOn) {
    handleTooltip(text, translatedData, actionType, range);
  }
  //if use_tts is on or activation key is pressed, do tts
  if (isTtsOn) {
    util.requestKillAutoReaderTabs(true);
    await delay(50);
    util.requestTTS(text, sourceLang, targetText, targetLang, timestamp + 100);
  }
}

function extractMouseoverText(hoveredData) {
  var mouseoverType = getMouseoverType();
  var mouseoverText = hoveredData[mouseoverType];
  var mouseoverRange = hoveredData[mouseoverType + "_range"];
  return { mouseoverText, mouseoverRange };
}

function getMouseoverType() {
  //if swap key pressed, swap detect type
  //if mouse target is special web block, handle as block
  var detectType = setting["mouseoverTextType"];
  detectType = keyDownList[setting["keyDownMouseoverTextSwap"]]
    ? detectType == "word"
      ? "sentence"
      : "word"
    : detectType;

  detectType = checkMouseTargetIsSpecialWebBlock() ? "container" : detectType;
  return detectType;
}

function checkMouseTargetIsSpecialWebBlock() {
  // if mouse targeted web element contain particular class name, return true
  //mousetooltip ocr block
  var classList = mouseTarget?.classList;
  return ["ocr_text_div", "textFitted"].some((className) =>
    classList?.contains(className)
  );
}

function checkMouseTargetIsTooltip() {
  try {
    return $(tooltip?.popper)?.get(0)?.contains(mouseTarget);
  } catch (error) {
    return false;
  }
}

//tooltip show hide logic=========================================================
function showTooltip(text) {
  if (prevTooltipText != text) {
    hideTooltip(true);
  }
  prevTooltipText = text;
  cancelRemoveTooltipContainer();
  checkTooltipContainerInit();
  tooltip?.setContent(text);
  tooltip?.show();
}

function hideTooltip(resetAll = false) {
  if (resetAll) {
    hideAll({ duration: 0 }); //hide all tippy
  }
  tooltip?.hide();
  hideHighlight();
  removeTooltipContainer();
}

function removeTooltipContainer() {
  cancelRemoveTooltipContainer();
  tooltipRemoveTimeoutId = setTimeout(() => {
    $("#mttContainer").remove();
  }, tooltipRemoveTime);
}

function cancelRemoveTooltipContainer() {
  clearTimeout(tooltipRemoveTimeoutId);
}

function checkTooltipContainerInit() {
  checkTooltipContainer();
  checkStyleContainer();
}
function checkTooltipContainer() {
  if (!$("#mttContainer").get(0)) {
    tooltipContainer.appendTo(document.body);
  }
}

function checkStyleContainer() {
  if (!$("#mttstyle").get(0)) {
    style.appendTo("head");
  }
}

function hideHighlight(checkSkipCase) {
  if (checkSkipCase && isAutoReaderRunning) {
    return;
  }
  $(".mtt-highlight")?.remove();
}

function handleTooltip(text, translatedData, actionType, range) {
  var { targetText, sourceLang, targetLang, transliteration, dict, imageUrl } =
    translatedData;
  var isShowOriTextOn = setting["tooltipInfoSourceText"] == "true";
  var isShowLangOn = setting["tooltipInfoSourceLanguage"] == "true";
  var isTransliterationOn = setting["tooltipInfoTransliteration"] == "true";
  var tooltipTransliteration = isTransliterationOn ? transliteration : "";
  var tooltipLang = isShowLangOn ? langListOpposite[sourceLang] : "";
  var tooltipOriText = isShowOriTextOn ? text : "";
  var isDictOn = setting["tooltipWordDictionary"] == "true";
  var dictData = isDictOn ? wrapDict(dict, targetLang) : "";

  var tooltipMainText =
    wrapMainImage(imageUrl) || dictData || wrapMain(targetText, targetLang);
  var tooltipSubText =
    wrapInfoText(tooltipOriText, "i", sourceLang) +
    wrapInfoText(tooltipTransliteration, "b") +
    wrapInfoText(tooltipLang, "sup");
  var tooltipText = tooltipMainText + tooltipSubText;

  showTooltip(tooltipText);

  util.requestRecordTooltipText(
    text,
    sourceLang,
    targetText,
    targetLang,
    dict,
    actionType
  );
  highlightText(range);
}

function wrapMain(targetText, targetLang) {
  if (!targetText) {
    return "";
  }
  return $("<span/>", {
    dir: getRtlDir(targetLang),
    text: targetText,
  }).prop("outerHTML");
}

function wrapDict(dict, targetLang) {
  if (!dict) {
    return "";
  }
  var htmlText = wrapMain(dict, targetLang);
  // wrap first text as bold
  dict
    .split("\n")
    .map((line) => line.split(":")[0])
    .map(
      (text) =>
        (htmlText = htmlText.replace(
          text,
          $("<b/>", {
            text,
          }).prop("outerHTML")
        ))
    );
  return htmlText;
}

function wrapInfoText(text, type, dirLang = null) {
  if (!text) {
    return "";
  }
  return $(`<${type}/>`, {
    dir: getRtlDir(dirLang),
    text: "\n" + text,
  }).prop("outerHTML");
}

function wrapMainImage(imageUrl) {
  if (!imageUrl) {
    return "";
  }
  return $("<img/>", {
    src: imageUrl,
    class: "mtt-image",
  }).prop("outerHTML");
}

function highlightText(range, force = false) {
  if (!force && (!range || setting["mouseoverHighlightText"] == "false")) {
    return;
  }
  hideHighlight();
  var rects = range.getClientRects();
  rects = util.filterOverlappedRect(rects);
  var adjustX = window.scrollX;
  var adjustY = window.scrollY;
  if (util.isEbookReader()) {
    var ebookViewerRect = util.getEbookIframe()?.getBoundingClientRect();
    adjustX += ebookViewerRect?.left;
    adjustY += ebookViewerRect?.top;
  }

  for (var rect of rects) {
    $("<div/>", {
      class: "mtt-highlight",
      css: {
        position: "absolute",
        left: rect.left + adjustX,
        top: rect.top + adjustY,
        width: rect.width,
        height: rect.height,
      },
    }).appendTo("body");
  }
}

//Translate Writing feature==========================================================================================
async function translateWriting() {
  //check current focus is write box and hot key pressed
  // if is google doc do not check writing box
  if (!dom_util.getFocusedWritingBox() && !util.isGoogleDoc()) {
    return;
  }
  // get writing text
  var writingText = await getWritingText();
  if (!writingText) {
    return;
  }
  // translate
  var { targetText, isBroken } = await util.requestTranslate(
    writingText,
    "auto",
    setting["writingLanguage"],
    setting["translateTarget"]
  );
  //skip no translation or is too late to respond
  if (isBroken) {
    return;
  }
  insertText(targetText);
}

async function getWritingText() {
  // get current selected text,
  if (hasSelection() && getSelectionText()?.length > 1) {
    return getSelectionText();
  }
  // if no select, select all to get all
  document.execCommand("selectAll", false, null);
  var text = getSelectionText();
  await makeNonEnglishTypingFinish();
  return text;
}

function hasSelection() {
  return window.getSelection().type != "Caret";
}

async function makeNonEnglishTypingFinish() {
  // IME fix
  //refocus input text to prevent prev remain typing
  await delay(10);
  var ele = util.getActiveElement();
  window.getSelection().removeAllRanges();
  ele?.blur();
  await delay(10);
  ele?.focus();
  await delay(50);
  document.execCommand("selectAll", false, null);
  await delay(50);
}

async function insertText(text) {
  var writingBox = dom_util.getFocusedWritingBox();
  if (!text) {
    return;
  } else if (util.isGoogleDoc()) {
    pasteTextGoogleDoc(text);
  } else if ($(writingBox).is("[spellcheck='true']")) {
    //for discord twitch
    await pasteTextInputBox(text);
    await pasteTextExecCommand(text);
  } else {
    //for bard , butterflies.ai
    await pasteTextExecCommand(text);
    await pasteTextInputBox(text);
  }
}

async function pasteTextExecCommand(text) {
  if (!hasSelection()) {
    return;
  }
  document.execCommand("insertText", false, text);
  await delay(300);
}

async function pasteTextInputBox(text) {
  if (!hasSelection()) {
    return;
  }
  var ele = util.getActiveElement();
  pasteText(ele, text);
  await delay(300);
}

function pasteTextGoogleDoc(text) {
  // https://github.com/matthewsot/docs-plus
  var el = document.getElementsByClassName("docs-texteventtarget-iframe")?.[0];
  el = el.contentDocument.querySelector("[contenteditable=true]");
  pasteText(el, text);
}
function pasteText(ele, text) {
  var clipboardData = new DataTransfer();
  clipboardData.setData("text/plain", text);
  var paste = new ClipboardEvent("paste", {
    clipboardData,
    data: text,
    dataType: "text/plain",
    bubbles: true,
    cancelable: true,
  });
  paste.docs_plus_ = true;
  ele.dispatchEvent(paste);
  clipboardData.clearData();
}

// Listener - detect mouse move, key press, mouse press, tab switch==========================================================================================
function loadEventListener() {
  //use mouse position for tooltip position
  addEventHandler("mousemove", handleMousemove);
  addEventHandler("touchstart", handleTouchstart);

  addEventHandler("scroll", () => hideHighlight(true));
  //detect activation hold key pressed
  addEventHandler("keydown", handleKeydown);
  addEventHandler("keyup", handleKeyup);
  addEventHandler("mousedown", handleMouseKeyDown);
  addEventHandler("mouseup", handleMouseKeyUp);
  addEventHandler("mouseup", disableEdgeMiniMenu, false);

  //detect tab switching to reset env
  addEventHandler("blur", resetTooltipStatus);
  addEventHandler("beforeunload", killAutoReader);
}

function handleMousemove(e) {
  //if mouse moved far distance two times, check as mouse moved
  if (!checkMouseOnceMoved(e.clientX, e.clientY)) {
    setMouseStatus(e);
    return;
  }
  setMouseStatus(e);
  setTooltipPosition(e.clientX, e.clientY);
  ocrView.checkImage(mouseTarget, setting, keyDownList);
}

function handleTouchstart(e) {
  mouseMoved = true;
}

function handleKeydown(e) {
  //if user pressed ctrl+f  ctrl+a, hide tooltip
  if (/KeyA|KeyF/.test(e.code) && e.ctrlKey) {
    mouseMoved = false;
    hideTooltip();
  } else if (e.code == "Escape") {
    util.requestStopTTS();
    util.requestKillAutoReaderTabs(true);
  } else if (e.key == "HangulMode" || e.key == "Process") {
    return;
  } else if (e.key == "Alt") {
    e.preventDefault(); // prevent alt site unfocus
  }

  holdKeydownList(e.code);
}

function handleKeyup(e) {
  releaseKeydownList(e.code);
}

function handleMouseKeyDown(e) {
  holdKeydownList(mouseKeyMap[e.button]);
}
function handleMouseKeyUp(e) {
  releaseKeydownList(mouseKeyMap[e.button]);
}

function holdKeydownList(key) {
  if (key && !keyDownList[key] && !util.isCharKey(key)) {
    keyDownList[key] = true;

    restartWordProcess();
    if (keyDownList[setting["keyDownTranslateWriting"]]) {
      translateWriting();
    }
    if (keyDownList[setting["keySpeechRecognition"]]) {
      speech.startSpeechRecognition();
    }
    if (keyDownList[setting["keyDownAutoReader"]]) {
      startAutoReader();
    }
  }
  if (util.isCharKey(key)) {
    util.requestStopTTS(Date.now() + 500);
    killAutoReader();
  }
}

async function startAutoReader() {
  if (!keyDownList[setting["keyDownAutoReader"]]) {
    return;
  }
  util.clearSelection();
  util.requestKillAutoReaderTabs();
  await killAutoReader();
  var hoveredData = await getMouseoverText(clientX, clientY);
  var { mouseoverRange } = extractMouseoverText(hoveredData);
  processAutoReader(mouseoverRange);
}

async function processAutoReader(stagedRange) {
  if (!stagedRange || isStopAutoReaderOn) {
    hideTooltip();
    isStopAutoReaderOn = false;
    isAutoReaderRunning = false;
    return;
  }
  isAutoReaderRunning = true;

  var text = util.extractTextFromRange(stagedRange);
  var translatedData = await util.requestTranslate(
    text,
    setting["translateSource"],
    setting["translateTarget"],
    setting["translateReverseTarget"]
  );
  var { targetText, sourceLang, targetLang } = translatedData;

  scrollAutoReader(stagedRange);
  setTimeout(() => {
    highlightText(stagedRange, true);
  }, autoReaderScrollTime);
  showTooltip(targetText);
  await util.requestTTS(
    text,
    sourceLang,
    targetText,
    targetLang,
    Date.now(),
    true
  );
  stagedRange = getNextExpand(stagedRange, setting["mouseoverTextType"]);
  processAutoReader(stagedRange);
}

function scrollAutoReader(range) {
  var rect = range.getBoundingClientRect();
  const scrollContainer = util.isPDFViewer()
    ? $("#viewerContainer")
    : $("body,html");
  const scrollTopValue = util.isPDFViewer()
    ? $("#viewerContainer").scrollTop() +
      rect.top -
      $("#viewerContainer").height() / 2
    : window.scrollY + rect.top - window.innerHeight / 2;

  scrollContainer.animate({ scrollTop: scrollTopValue }, autoReaderScrollTime);
}

async function killAutoReader() {
  if (!isAutoReaderRunning || isStopAutoReaderOn) {
    return;
  }
  isStopAutoReaderOn = true;
  util.requestStopTTS(Date.now(), true);
  await util.waitUntilForever(() => !isAutoReaderRunning);
  isStopAutoReaderOn = false;
}

function disableEdgeMiniMenu(e) {
  //prevent mouse tooltip overlap with edge mini menu
  if (util.isEdge() && mouseKeyMap[e.button] == "ClickLeft") {
    e.preventDefault();
  }
}

async function releaseKeydownList(key) {
  await delay(20);
  keyDownList[key] = false;
  if (key == setting["keySpeechRecognition"]) {
    speech.stopSpeechRecognition();
  }
}

function resetTooltipStatus() {
  keyDownList = { always: true }; //reset key press
  mouseMoved = false;
  mouseMovedCount = 0;
  selectedText = "";
  stagedText = null;
  hideTooltip();
  ocrView.removeAllOcrEnv();
  listenText = "";
  speech.stopSpeechRecognition();
}

async function restartWordProcess() {
  //rerun staged text
  await delay(10); //wait for select changed by click
  var selectedText = getSelectionText();
  stagedText = null;
  if (selectedText) {
    stageTooltipTextSelect("", false);
  } else {
    stageTooltipTextHover("", false);
  }
}

function setMouseStatus(e) {
  clientX = e.clientX;
  clientY = e.clientY;
  mouseTarget = e.target;
}
function setTooltipPosition(x, y) {
  tooltipContainer?.css("transform", `translate(${x}px,${y}px)`);
}

function checkMouseOnceMoved(x, y) {
  if (
    mouseMoved == false &&
    Math.abs(x - clientX) + Math.abs(y - clientY) > 3 &&
    mouseMovedCount < 3
  ) {
    mouseMovedCount += 1;
  } else if (3 <= mouseMovedCount) {
    mouseMoved = true;
  }
  return mouseMoved;
}

function checkWindowFocus() {
  return mouseMoved && document.visibilityState == "visible";
}

function addMsgListener() {
  //handle copy
  util.addMessageListener("CopyRequest", (message) => {
    TextUtil.copyTextToClipboard(message.text);
  });
  util.addMessageListener("killAutoReaderTabs", killAutoReader);
}

function checkExcludeUrl() {
  var url = util.getCurrentUrl();
  return matchUrl(url, setting["websiteExcludeList"]);
}

// setting handling & container style===============================================================

async function getSetting() {
  console.log("开始加载设置...");
  setting = await SettingUtil.loadSetting(function settingCallbackFn() {
    console.log("设置更新回调被触发");
    resetTooltipStatus();
    applyStyleSetting();
    checkVideo();
    speech.initSpeechRecognitionLang(setting);
  });
  console.log("设置加载完成:", JSON.stringify(setting));
  // 检查翻译模板设置的值
  console.log("当前翻译模板:", setting.translatePromptTemplate);
}

async function addElementEnv() {
  tooltipContainer = $("<div/>", {
    id: "mttContainer",
    class: "notranslate",
  });
  tooltipContainerEle = tooltipContainer.get(0);

  style = $("<style/>", {
    id: "mttstyle",
  }).appendTo("head");
  styleSubtitle = $("<style/>", {
    id: "mttstyleSubtitle",
  }).appendTo("head");

  tooltip = tippy(tooltipContainerEle, {
    content: "",
    trigger: "manual",
    allowHTML: true,
    theme: "custom",
    zIndex: 100000200,
    hideOnClick: false,
    role: "mtttooltip",
    interactive: true,
    plugins: [sticky],
  });
}

function applyStyleSetting() {
  var isSticky = setting["tooltipPosition"] == "follow";
  tooltip.setProps({
    offset: [0, setting["tooltipDistance"]],
    sticky: isSticky ? "reference" : "popper",
    appendTo: isSticky ? tooltipContainerEle : document.body,
    animation: setting["tooltipAnimation"],
  });
  
  var rtlDirection=getRtlDir(setting["translateTarget"]);

  style.html(`
    #mttContainer {
      left: 0 !important;
      top: 0 !important;
      width: 1000px !important;
      margin: 0px !important;
      margin-left: -500px !important;
      position: fixed !important;
      z-index: 100000200 !important;
      background: none !important;
      pointer-events: none !important;
      display: inline-block !important;
      visibility: visible  !important;
      white-space: pre-line;
    }
    .tippy-box[data-theme~="custom"], .tippy-content *{
      font-size: ${setting["tooltipFontSize"]}px  !important;
      text-align: ${setting["tooltipTextAlign"]} !important;
      overflow-wrap: break-word !important;
      color: ${setting["tooltipFontColor"]} !important;
      font-family: 
        -apple-system, BlinkMacSystemFont,
        "Segoe UI", "Roboto", "Oxygen",
        "Ubuntu", "Cantarell", "Fira Sans",
        "Droid Sans", "Helvetica Neue", sans-serif  !important;
      white-space: pre-line;
    }
    .tippy-box[data-theme~="custom"]{
      max-width: ${setting["tooltipWidth"]}px  !important;
      backdrop-filter: blur(${setting["tooltipBackgroundBlur"]}px) !important;
      background-color: ${setting["tooltipBackgroundColor"]} !important;
      border: 1px solid ${setting["tooltipBorderColor"]}; 
      box-shadow: rgba(50, 50, 93, 0.25) 0px 2px 5px -1px, rgba(0, 0, 0, 0.3) 0px 1px 3px -1px;
    }
    [data-tippy-root] {
      display: inline-block !important;
      visibility: visible  !important;
      position: absolute !important;
    }
    .tippy-box[data-theme~='custom'][data-placement^='top'] > .tippy-arrow::before { 
      border-top-color: ${setting["tooltipBackgroundColor"]} !important;
    }
    .tippy-box[data-theme~='custom'][data-placement^='bottom'] > .tippy-arrow::before {
      border-bottom-color: ${setting["tooltipBackgroundColor"]} !important;
    }
    .tippy-box[data-theme~='custom'][data-placement^='left'] > .tippy-arrow::before {
      border-left-color: ${setting["tooltipBackgroundColor"]} !important;
    }
    .tippy-box[data-theme~='custom'][data-placement^='right'] > .tippy-arrow::before {
      border-right-color: ${setting["tooltipBackgroundColor"]} !important;
    }
    .mtt-highlight{
      background-color: ${setting["mouseoverTextHighlightColor"]}  !important;
      position: absolute !important;   
      z-index: 100000100 !important;
      pointer-events: none !important;
      display: inline !important;
      border-radius: 3px !important;
    }
    .mtt-image{
      width: ${Number(setting["tooltipWidth"]) - 20}px  !important;
      border-radius: 3px !important;
    }
    .ocr_text_div{
      position: absolute;
      opacity: 0.5;
      color: transparent !important;
      border: 2px solid CornflowerBlue;
      background: none !important;
      border-radius: 3px !important;
    }`);
  styleSubtitle
    .html(
      `
    #ytp-caption-window-container .ytp-caption-segment {
      cursor: text !important;
      user-select: text !important;
      font-family: 
      -apple-system, BlinkMacSystemFont,
      "Segoe UI", "Roboto", "Oxygen",
      "Ubuntu", "Cantarell", "Fira Sans",
      "Droid Sans", "Helvetica Neue", sans-serif  !important;
    }
    .caption-visual-line{
      display: flex  !important;
      align-items: stretch  !important;
      direction: ${rtlDirection}
    }
    .captions-text .caption-visual-line:first-of-type:after {
      content: '⣿⣿';
      border-radius: 3px !important;
      color: white !important;
      background: transparent !important;
      box-shadow: rgba(50, 50, 93, 0.25) 0px 30px 60px -12px inset, rgba(0, 0, 0, 0.3) 0px 18px 36px -18px inset;
      display: inline-block;
      vertical-align: top;
      opacity:0;
      transition: opacity 0.7s ease-in-out;
    }
    .ytp-caption-segment{
      color: white !important;
      text-shadow: 1px 1px 2px black !important;
      backdrop-filter: blur(3px) !important;
      background: rgba(8, 8, 8, 0.1)  !important;
    }
    .captions-text:hover .caption-visual-line:first-of-type:after {
      opacity:1;
    }
    .ytp-pause-overlay {
      display: none !important;
    }
    .ytp-expand-pause-overlay .caption-window {
      display: block !important;
    }
  `
    )
    .prop("disabled", setting["detectSubtitle"] == "null");
}

// url check and element env===============================================================

async function detectPDF() {
  if (setting["detectPDF"] == "true" && util.isPDF()) {
    util.addFrameListener("pdfErrorLoadDocument", openPdfIframeBlob);
    openPdfIframe(window.location.href);
  }
}

async function openPdfIframeBlob() {
  var url = window.location.href;
  var url = await util.getBlobUrl(url);
  openPdfIframe(url);
}

function openPdfIframe(url) {
  $("embed").remove();

  $("<embed/>", {
    id: "mttPdfIframe",
    src: util.getPDFUrl(url),
    css: {
      display: "block",
      border: "none",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
    },
  }).appendTo("body");
}

//check google docs=========================================================
function checkGoogleDocs() {
  if (!util.isGoogleDoc()) {
    return;
  }
  interceptGoogleDocKeyEvent();
}

async function interceptGoogleDocKeyEvent() {
  await util.waitUntilForever(() => $(".docs-texteventtarget-iframe")?.get(0));
  var iframe = $(".docs-texteventtarget-iframe")?.get(0);

  ["keydown", "keyup"].forEach((eventName) => {
    iframe?.contentWindow.addEventListener(eventName, (e) => {
      var evt = new CustomEvent(eventName, {
        bubbles: true,
        cancelable: false,
      });
      evt.key = e?.key;
      evt.code = e?.code;
      evt.ctrlKey = e?.ctrlKey;
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    });
  });
}

function injectGoogleDocAnnotation() {
  if (!util.isGoogleDoc()) {
    return;
  }
  var s = document.createElement("script");
  s.src = browser.runtime.getURL("googleDocInject.js"); //chrome.runtime.getURL("js/docs-canvas.js");
  document.documentElement.appendChild(s);
}

// youtube================================
function checkVideo() {
  for (var key in subtitle) {
    subtitle[key].handleVideo(setting);
  }
}

//destruction ===================================
function loadDestructor() {
  // Unload previous content script if needed
  window.dispatchEvent(new CustomEvent(destructionEvent)); //call destructor to remove script
  addEventHandler(destructionEvent, destructor); //add destructor listener for later remove
}

function destructor() {
  resetTooltipStatus();
  removePrevElement(); //remove element
  controller.abort(); //clear all event Listener by controller signal
}

function addEventHandler(eventName, callbackFunc, capture = true) {
  //record event for later event signal kill
  return window.addEventListener(eventName, callbackFunc, {
    capture: capture,
    signal,
  });
}

function removePrevElement() {
  $("#mttstyle").remove();
  $("#mttstyleSubtitle").remove();
  tooltip?.destroy();
}

// speech recognition ====================================================

function loadSpeechRecognition() {
  speech.initSpeechRecognition(
    (speechText, isFinal) => {
      if (isFinal) {
        listenText = speechText;
        stageTooltipText(listenText, "listen");
      }
    },
    () => {
      listenText = "";
    }
  );
  speech.initSpeechRecognitionLang(setting);
}

// 当内容脚本加载时打印日志
console.log("内容脚本已加载，版本: " + new Date().toISOString());

// 存储字幕数据的全局对象
var subtitleData = {
  current: null,
  history: []
};

// 添加通知显示函数
function showNotification(message, duration = 3000, type = 'info') {
  // 创建一个临时元素
  const notification = document.createElement('div');
  notification.textContent = message;
  
  // 根据类型设置不同的颜色
  let bgColor = '#3f51b5'; // 默认蓝色
  if (type === 'success') bgColor = '#4caf50'; // 绿色
  if (type === 'error') bgColor = '#f44336'; // 红色
  if (type === 'warning') bgColor = '#ff9800'; // 橙色
  
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: ${bgColor};
    color: white;
    padding: 16px;
    border-radius: 4px;
    z-index: 9999999;
    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
  `;
  
  // 添加到页面
  document.body.appendChild(notification);
  
  // 指定时间后删除
  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.5s';
    setTimeout(() => notification.remove(), 500);
  }, duration);
  
  return notification; // 返回通知元素以便需要时进行更新
}

// 原始的测试通知函数保留向后兼容性
function showTestNotification() {
  showNotification('测试消息已打印到控制台!');
}

// 添加翻译进度显示面板
function createProgressPanel() {
  // 移除已存在的面板
  $("#mtt-translation-progress").remove();
  
  const panel = $("<div/>", {
    id: "mtt-translation-progress",
    css: {
      position: "fixed",
      top: "120px",
      left: "50%",
      transform: "translateX(-50%)",
      backgroundColor: "#673ab7", // 紫色
      color: "white",
      padding: "12px 20px",
      borderRadius: "8px",
      boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
      zIndex: 9999999,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "80%",
      maxWidth: "600px"
    }
  });
  
  // 添加标题
  $("<div/>", {
    class: "mtt-progress-title",
    text: "LLM 字幕翻译进度",
    css: {
      fontWeight: "bold",
      fontSize: "18px",
      marginBottom: "8px"
    }
  }).appendTo(panel);
  
  // 添加进度文本
  $("<div/>", {
    class: "mtt-progress-text",
    text: "准备中...",
    css: {
      fontSize: "14px",
      marginBottom: "10px"
    }
  }).appendTo(panel);
  
  // 添加进度条容器
  const progressBarContainer = $("<div/>", {
    class: "mtt-progress-bar-container",
    css: {
      width: "100%",
      backgroundColor: "rgba(255,255,255,0.3)",
      borderRadius: "4px",
      height: "8px",
      overflow: "hidden"
    }
  }).appendTo(panel);
  
  // 添加进度条
  $("<div/>", {
    class: "mtt-progress-bar",
    css: {
      width: "0%",
      height: "100%",
      backgroundColor: "#fff",
      borderRadius: "4px",
      transition: "width 0.3s ease"
    }
  }).appendTo(progressBarContainer);
  
  // 添加取消按钮
  $("<button/>", {
    class: "mtt-cancel-button",
    text: "取消",
    css: {
      marginTop: "10px",
      padding: "5px 15px",
      border: "none",
      borderRadius: "4px",
      backgroundColor: "rgba(255,255,255,0.2)",
      color: "white",
      cursor: "pointer"
    },
    click: function() {
      $("#mtt-translation-progress").remove();
    }
  }).appendTo(panel);
  
  panel.appendTo("body");
  return panel;
}

// 更新进度面板
function updateProgressPanel(text, percent, statusInfo = "") {
  const progressText = $("#mtt-translation-progress .mtt-progress-text");
  const progressBar = $("#mtt-translation-progress .mtt-progress-bar");
  
  if (progressText.length && progressBar.length) {
    progressText.text(text);
    progressBar.css("width", `${percent}%`);
  }
}

// 移除进度面板
function removeProgressPanel() {
  $("#mtt-translation-progress").fadeOut(300, function() {
    $(this).remove();
  });
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("接收到消息:", message); // 添加调试日志
  
  if (message.action === "exportSubtitle") {
    for (var key in subtitle) {
      if (subtitle[key].sitePattern.test(window.location.href)) {
        subtitle[key].exportSubtitle();
        break;
      }
    }
  }
  else if (message.action === "printMessage") {//mock测试按钮部分
    (async function() { // 添加立即执行的异步函数
      console.log("=======printMessage=========")
      if (getStoredSubtitleData() != null) {
        console.log("=======aa=========");
        var sub1=getStoredSubtitleData().sub1
        console.log(sub1);
        var url=getStoredSubtitleData().url
        console.log("---------以下是翻译测试-----------")
        //console.log(getVideoId(request.url))
        //console.log(getCache(getVideoId(request.url)))
        const videoId = getVideoId(url);
        const CACHE_KEY = `youtube_sub_${videoId}`;
        console.log(CACHE_KEY)

        var queries=subtitle["baseVideo"].parseSubtitles_for_llms(sub1)//加载视频所有对话
        const result=await subtitle["baseVideo"].Group_Translator(queries,CACHE_KEY)//这个结果弄一个local cache如果有就加载不翻译，CACHE_KEY的话就视频id做区分我认为

        //console.log("异步-------")//这个上面的await会给你卡住所以没事？
        const translated_subtitle= await subtitle["baseVideo"].get_subtitle_from_cache(url,result);//local存储，实际要存llm翻译
        //上面要显示进度
        console.log(translated_subtitle)
        console.log("翻译完毕请刷新浏览器")
      }
    })(); // 立即执行
    return true; // 表示我们将异步发送响应
  }
  else if (message.action === "llmTranslation") {
    (async function() {
      try {
        // 检查是否有字幕数据
        if (!getStoredSubtitleData()) {
          showNotification('没有可用的字幕数据，请确保视频已加载字幕', 5000, 'error');
          return;
        }
        
        // 创建翻译进度面板
        createProgressPanel();
        updateProgressPanel("准备翻译字幕...", 5);
        
        // 获取字幕和视频信息
        const sub1 = getStoredSubtitleData().sub1;
        const url = getStoredSubtitleData().url;
        
        // 获取视频ID和缓存键
        const videoId = getVideoId(url);
        const CACHE_KEY = `youtube_sub_${videoId}`;
        
        // 解析字幕为LLM格式
        const queries = subtitle["baseVideo"].parseSubtitles_for_llms(sub1);
        
        // 更新进度面板
        updateProgressPanel(`正在翻译字幕，共 ${queries.length} 个片段...`, 15);
        
        // 获取用户选择的翻译提示模板
        const promptTemplate = setting["translatePromptTemplate"] || "翻译成中文(弱智吧风格)";
        console.log("设置对象:", JSON.stringify(setting)); // 添加完整设置对象的日志
        console.log("使用翻译模板:", promptTemplate, "是否为undefined:", promptTemplate === undefined); // 增强调试日志
        
        // 强制刷新浏览器存储中的设置
        try {
          const latestSettings = await browser.storage.local.get("translatePromptTemplate");
          console.log("从存储获取最新翻译模板:", latestSettings.translatePromptTemplate);
          // 如果存储中有更新的值，优先使用
          const finalTemplate = latestSettings.translatePromptTemplate || promptTemplate;
          console.log("最终使用的翻译模板:", finalTemplate);
          
          // 使用LLM翻译字幕，同时检查取消标志
          const result = await subtitle["baseVideo"].Group_Translator(
            queries, 
            CACHE_KEY,
            // 添加回调函数来更新进度
            ((function() {
              let maxProgressPercent = 15; // 初始进度起点
              let maxSegmentsCompleted = 0; // 跟踪最大完成片段数
              return (current, total, response) => {
                if (window.isTranslationCancelled) {
                  throw new Error("用户取消了翻译");
                }
                
                // 计算当前理论进度
                const currentPercent = Math.min(15 + Math.round((current / total) * 70), 85);
                
                // 确保进度只增不减
                maxProgressPercent = Math.max(maxProgressPercent, currentPercent);
                
                // 确保显示的片段数只增不减
                maxSegmentsCompleted = Math.max(maxSegmentsCompleted, current);
                
                let statusInfo = `收到响应状态码: ${response?.status || "未知"}`;
                
                updateProgressPanel(
                  `正在翻译字幕`, //: ${maxSegmentsCompleted}/${total} 片段`, 
                  maxProgressPercent, 
                  statusInfo
                );
              };
            })()),
            finalTemplate // 使用最终确定的模板
          );
          console.log("翻译完成，使用的模板是:", finalTemplate);
          
          // 更新进度
          updateProgressPanel('翻译完成，正在应用翻译结果...', 90);
          
          // 从缓存获取翻译后的字幕
          const translated_subtitle = await subtitle["baseVideo"].get_subtitle_from_cache(url, result);
          
          // 显示完成
          updateProgressPanel('字幕翻译完成！请刷新页面查看结果', 100);
          
          // 3秒后自动移除进度面板
          setTimeout(() => {
            removeProgressPanel();
            showNotification('字幕翻译完成，请刷新页面以查看翻译结果', 5000, 'success');
          }, 3000);
          
          console.log("LLM翻译完成:", translated_subtitle);
        } catch (error) {
          console.error("LLM翻译出错:", error);
          updateProgressPanel(`翻译出错: ${error.message}`, 0);
          
          setTimeout(() => {
            removeProgressPanel();
            showNotification(`翻译过程中出错: ${error.message}`, 5000, 'error');
          }, 3000);
        }
      } catch (error) {
        console.error("LLM翻译出错:", error);
        updateProgressPanel(`翻译出错: ${error.message}`, 0);
        
        setTimeout(() => {
          removeProgressPanel();
          showNotification(`翻译过程中出错: ${error.message}`, 5000, 'error');
        }, 3000);
      }
    })();
    return true; // 表示我们将异步发送响应
  }
  else if (message.action === "getVideoTitle") {
    (async function() {
      try {

        // 检查是否在YouTube页面
        if (!window.location.href.includes("youtube.com/watch")) {
          showNotification('当前不是YouTube视频页面', 3000, 'error');
          return;
        }

        // 调用BaseVideo中的方法获取视频标题
        const videoTitle = await subtitle["baseVideo"].getVideoTitle();
        
        if (videoTitle) {
          // 显示获取到的视频标题
          console.log("----------------")
          var title_result=fuzzyMatchAllDict(`${videoTitle}`, translatePromptTemplateList, 100)[0]
          console.log(title_result['value'])
          showNotification(`视频标题为: ${videoTitle} 选择翻译模板为:${title_result['key']} `, 5000, 'success');
          console.log("----------------")

          //-----------------------------------------
          try {
            // 检查是否有字幕数据
            if (!getStoredSubtitleData()) {
              showNotification('没有可用的字幕数据，请确保视频已加载字幕', 5000, 'error');
              return;
            }

            // 创建翻译进度面板
            createProgressPanel();
            updateProgressPanel("准备翻译字幕...", 5);

            // 获取字幕和视频信息
            const sub1 = getStoredSubtitleData().sub1;
            const url = getStoredSubtitleData().url;

            // 获取视频ID和缓存键
            const videoId = getVideoId(url);
            const CACHE_KEY = `youtube_sub_${videoId}`;

            // 解析字幕为LLM格式
            const queries = subtitle["baseVideo"].parseSubtitles_for_llms(sub1);

            // 更新进度面板
            updateProgressPanel(`正在翻译字幕，共 ${queries.length} 个片段...`, 15);


            // 强制刷新浏览器存储中的设置
            try {

              // 如果存储中有更新的值，优先使用
              const finalTemplate =title_result['value']
              console.log("最终使用的翻译模板:", finalTemplate);

              // 使用LLM翻译字幕，同时检查取消标志
              const result = await subtitle["baseVideo"].Group_Translator(
                  queries,
                  CACHE_KEY,
                  // 添加回调函数来更新进度
                  ((function() {
                    let maxProgressPercent = 15; // 初始进度起点
                    let maxSegmentsCompleted = 0; // 跟踪最大完成片段数
                    return (current, total, response) => {
                      if (window.isTranslationCancelled) {
                        throw new Error("用户取消了翻译");
                      }

                      // 计算当前理论进度
                      const currentPercent = Math.min(15 + Math.round((current / total) * 70), 85);
                      
                      // 确保进度只增不减
                      maxProgressPercent = Math.max(maxProgressPercent, currentPercent);
                      
                      // 确保显示的片段数只增不减
                      maxSegmentsCompleted = Math.max(maxSegmentsCompleted, current);
                      
                      let statusInfo = `收到响应状态码: ${response?.status || "未知"}`;

                      updateProgressPanel(
                          `正在翻译字幕: ${maxSegmentsCompleted}/${total} 片段`,
                          maxProgressPercent,
                          statusInfo
                      );
                    };
                  })()),
                  finalTemplate // 使用最终确定的模板
              );
              console.log("翻译完成，使用的模板是:", finalTemplate);

              // 更新进度
              updateProgressPanel('翻译完成，正在应用翻译结果...', 90);

              // 从缓存获取翻译后的字幕
              const translated_subtitle = await subtitle["baseVideo"].get_subtitle_from_cache(url, result);

              // 显示完成
              updateProgressPanel('字幕翻译完成！请刷新页面查看结果', 100);

              // 3秒后自动移除进度面板
              setTimeout(() => {
                removeProgressPanel();
                showNotification('字幕翻译完成，请刷新页面以查看翻译结果', 5000, 'success');
              }, 3000);

              console.log("LLM翻译完成:", translated_subtitle);
            } catch (error) {
              console.error("LLM翻译出错:", error);
              updateProgressPanel(`翻译出错: ${error.message}`, 0);

              setTimeout(() => {
                removeProgressPanel();
                showNotification(`翻译过程中出错: ${error.message}`, 5000, 'error');
              }, 3000);
            }
          } catch (error) {
            console.error("LLM翻译出错:", error);
            updateProgressPanel(`翻译出错: ${error.message}`, 0);

            setTimeout(() => {
              removeProgressPanel();
              showNotification(`翻译过程中出错: ${error.message}`, 5000, 'error');
            }, 3000);
          }
          // 复制到剪贴板
          try {
            await navigator.clipboard.writeText(videoTitle);
            showNotification('标题已复制到剪贴板', 3000, 'info');
          } catch (clipboardError) {
            console.error("复制到剪贴板失败:", clipboardError);
          }
          
          console.log("获取到YouTube视频标题:", videoTitle);
        } else {
          showNotification('无法获取视频标题', 3000, 'error');
        }
      } catch (error) {
        console.error("获取视频标题出错:", error);
        showNotification(`获取视频标题失败: ${error.message}`, 3000, 'error');
      }
    })();




    return true; // 表示我们将异步发送响应
  }
  else if (message.action === "reloadSubtitle") {
    // 检查消息中是否有字幕数据
    if (message.subtitleData) {
      // 存储从baseVideo.js接收的字幕数据
      subtitleData.current = message.subtitleData;

      // 将数据添加到历史记录，可选择限制历史记录大小
      subtitleData.history.push({
        timestamp: Date.now(),
        data: message.subtitleData
      });

      // 限制历史记录大小，只保留最近的10条
      if (subtitleData.history.length > 10) {
        subtitleData.history.shift();
      }

      console.log("字幕数据已存储:", subtitleData.current);
    }
  }
});

// 监听自定义事件，用于从window对象获取字幕数据
window.addEventListener('mttSubtitleDataReady', function(e) {
  console.log("从window事件接收到字幕数据");
  const subtitleDataFromEvent = e.detail;
  
  // 存储从window事件接收的字幕数据
  subtitleData.current = subtitleDataFromEvent;
  
  // 将数据添加到历史记录
  subtitleData.history.push({
    timestamp: Date.now(),
    data: subtitleDataFromEvent
  });
  
  // 限制历史记录大小，只保留最近的10条
  if (subtitleData.history.length > 10) {
    subtitleData.history.shift();
  }
  
  console.log("字幕数据已存储:", subtitleData.current);
});

// 定期检查window对象中是否有字幕数据（备用方法）
function checkWindowForSubtitleData() {
  if (window.mttSubtitleData) {
    console.log("从window对象获取字幕数据");
    
    // 存储从window对象中的字幕数据
    subtitleData.current = window.mttSubtitleData;
    
    // 将数据添加到历史记录
    subtitleData.history.push({
      timestamp: Date.now(),
      data: window.mttSubtitleData
    });
    
    // 限制历史记录大小，只保留最近的10条
    if (subtitleData.history.length > 10) {
      subtitleData.history.shift();
    }
    
    console.log("字幕数据已存储:", subtitleData.current);
    
    // 清除window对象中的数据，避免重复处理
    // window.mttSubtitleData = null;
  }
}

// 每2秒检查一次
setInterval(checkWindowForSubtitleData, 2000);

// 提供函数获取当前存储的字幕数据
function getStoredSubtitleData() {
  return subtitleData.current;
}

// 提供函数获取字幕历史记录
function getSubtitleHistory() {
  return subtitleData.history;
}

function fuzzyMatchAllDict(input, dict, threshold = 2) {
  const inputLower = input.toLowerCase();
  const results = [];

  for (const key of Object.keys(dict)) {
    const distance = leven(key.toLowerCase(), inputLower);
    if (distance <= threshold) {
      results.push({
        key,
        value: dict[key],
        distance // 可选：返回编辑距离
      });
    }
  }

  return results.sort((a, b) => a.distance - b.distance); // 按相似度排序
}

