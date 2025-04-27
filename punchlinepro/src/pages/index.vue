<template>
  <popupWindow>
    <!-- top nav bar -->
    <v-toolbar color="blue" dark dense>
      <v-col cols="7">
        <v-toolbar-title Class="text-subtitle-1 ml-3 font-weight-bold">
        <div>{{ remainSettingDesc["appName"] }}</div>
        </v-toolbar-title>
      </v-col>

      <v-spacer></v-spacer>

      <!-- 
      <v-btn
        v-for="(iconData, iconId) in toolbarIcons"
        :key="iconId"
        :title="iconData.title"
        icon
        @click="$router.push(iconData.path)"
      >
        <v-icon>{{ iconData.icon }}</v-icon>
      </v-btn>
      -->

      <template v-slot:extension>
        <v-tabs
          v-model="currentTab"
          center-active
          show-arrows
          slider-color="red"
        >
          <v-tab v-for="(tabName, tabId) in tabs" :key="tabId">
            {{ tabName }}
          </v-tab>
        </v-tabs>
      </template>
    </v-toolbar>

    <!-- main page contents -->
    <v-lazy>
      <v-window v-model="currentTab" class="scroll-container">
        <v-window-item
          v-for="(tabName, tabId) in tabs"
          :key="tabId"
          :value="tabId"
          class="scrollList"
        >
          <!-- comment request banner -->
          <CommentBanner v-if="tabId == 'MAIN'"> </CommentBanner>

          <v-list-item
            v-for="(option, optionName) in tabItems[tabId]"
            :key="optionName"
            flat
          >
            <!-- single select (default null) and multiple select option -->
            <v-select
              v-if="!option.optionType || option.optionType == 'multipleSelect'"
              v-model="setting[optionName]"
              :items="wrapTitleValueJson(option.optionList, optionName)"
              :label="option.description"
              :multiple="option.optionType == 'multipleSelect'"
              :chips="option.optionType == 'multipleSelect'"
              :closable-chips="option.optionType == 'multipleSelect'"
              variant="underlined"
              @change="handleSettingChange(optionName, setting[optionName])"
            >
            </v-select>

            <!-- combo box option -->
            <v-combobox
              v-else-if="option.optionType == 'comboBox'"
              v-model="setting[optionName]"
              :items="wrapTitleValueJson(option.optionList, optionName)"
              :label="option.description"
              item-text="text"
              item-value="val"
              tabName
              chips
              multiple
              closable-chips
              variant="underlined"
            >
            </v-combobox>

            <!-- color picker option -->
            <v-text-field
              v-else-if="option.optionType == 'colorPicker'"
              v-model="setting[optionName]"
              :label="option.description"
              variant="underlined"
              v-maska:[options]
            >
              <template v-slot:append>
                <v-menu v-model="option.menu" :close-on-content-click="false">
                  <template v-slot:activator="{ props }">
                    <div
                      :style="swatchStyle(option, optionName)"
                      v-bind="props"
                      class="ma-1"
                    />
                  </template>
                  <v-card>
                    <v-color-picker
                      v-model="setting[optionName]"
                    ></v-color-picker>
                  </v-card>
                </v-menu>
              </template>
            </v-text-field>

            <!-- button option -->
            <v-btn
              v-else-if="option.optionType == 'button'"
              block
              color="primary"
              @click="handleOptionAction(option.action)"
            >
              {{ option.description }}
            </v-btn>
          </v-list-item>
        </v-window-item>
      </v-window>
    </v-lazy>
  </popupWindow>
</template>
<script>
import browser from "webextension-polyfill";
import { isProxy, toRaw } from "vue";
import _ from "lodash";
import TextUtil from "/src/util/text_util.js";
import SettingUtil from "/src/util/setting_util.js";

import { mapState } from "pinia";
import { useSettingStore } from "/src/stores/setting.js";

import {
  langList,
  langListOpposite,
  ocrLangList,
  listenLangList,
} from "/src/util/lang.js";
import _util from "/src/util/lodash_util.js";

var langListWithAuto = TextUtil.concatJson({ Auto: "auto" }, langList); //copy lang and add auto
var langListWithNone = TextUtil.concatJson({ None: "null" }, langList); //copy lang and add none
var langListWithDefault = TextUtil.concatJson({ Default: "default" }, langList); //copy lang

var toggleList = {
  On: "true",
  Off: "false",
};

var keyList = {
  None: "null",
  "Ctrl Left": "ControlLeft",
  "Ctrl Right": "ControlRight",
  "Alt Left": "AltLeft",
  "Alt Right": "AltRight",
  "Shift Left": "ShiftLeft",
  "Shift Right": "ShiftRight",
  "Meta Left": "MetaLeft",
  "Meta Right": "MetaRight",
  "Click Left": "ClickLeft",
  "Click Middle": "ClickMiddle",
  "Click Right": "ClickRight",
  "F2": "F2",
};

var translatorList = {
  google: "google",
  bing: "bing",
  "deepl (Experimental)": "deepl",
  "yandex (Experimental)": "yandex",
  "baidu (Experimental)": "baidu",
  "papago (Experimental)": "papago",
  "googleGTX (Experimental)": "googleGTX",
  "googleWeb (Experimental)": "googleWeb",
  "googleV2 (Experimental)": "googleV2",
  "googleWebImage (Experimental)": "googleWebImage",
  // chatgpt: "chatgpt",
  // "lingva (Experimental)": "lingva",
  // "libreTranslate (Experimental)": "libreTranslate",
  // "duckduckgo (Experimental)": "duckduckgo",
  // "myMemory (Experimental)": "myMemory",
  // "watson (Experimental)": "watson",
  // "pixabay (Experimental)": "pixabay",
  // "unsplash (Experimental)": "unsplash",
};

var translateActionList = {
  Select: "select",
  Mouseover: "mouseover",
  "Mouseover & Select": "mouseoverselect",
};

var tooltipFontSizeList = _util.getRangeOption(6, 41, 2, 0);
var tooltipWidth = _util.getRangeOption(100, 1001, 100, 0);
var voiceVolumeList = _util.getRangeOption(0, 1.1, 0.1, 1);
var voiceRateList = _util.getRangeOption(0.5, 2.1, 0.1, 1);
var voiceRepeatList = _util.getRangeOption(1, 11);
var tooltipBackgroundBlurList = _util.getRangeOption(0, 21);
var distanceList = _util.getRangeOption(0, 41);
var tooltipIntervalTimeList = _util.getRangeOption(0.1, 2.1, 0.1, 1);

var tooltipPositionList = {
  Follow: "follow",
  Fixed: "fixed",
};
var tooltipAnimationList = {
  Fade: "fade",
  Scale: "scale",
  "Shift-away": "shift-away",
  "Shift-toward": "shift-toward",
  Perspective: "perspective",
};

var detectTypeList = {
  Word: "word",
  Sentence: "sentence",
  Container: "container",
};

var keyListWithAlways = _.cloneDeep(keyList); //copy lang and add auto
keyListWithAlways["Always"] = "always";

var keyListWithAlwaysSelect = _.cloneDeep(keyList); //copy lang and add auto
keyListWithAlwaysSelect["Select"] = "select";
keyListWithAlwaysSelect["Always"] = "always";

var voiceTargetList = {
  "Source Text": "source",
  "Translated Text": "target",
  "Source & Translated": "sourcetarget",
  "Translated & Source": "targetsource",
};

var subtitleTypeList = {
  "Dual Subtitle": "dualsub",
  //"Target Single Subtitle": "targetsinglesub",
   "Source Single Subtitle": "sourcesinglesub",
  None: "null",
};

var textAlignList = {
  Center: "center",
  Left: "left",
  Right: "right",
  Justify: "justify",
};

var speechTextTargetList = {
  Source: "source",
  Translated: "target",
  "Source & Translated": "sourcetarget",
};

var translatePromptTemplateList = {
  "punchline pro": "翻译成适合脱口秀的中文，注意以下四个维度：笑点保留度、文化适应度、流畅度、结构综合度",
  "正式风格": "翻译成正式中文",
  "网络流行语风格": "翻译成中文(使用流行网络用语)",
  "文言文风格": "翻译成文言文",
  "幽默风格": "翻译成幽默的中文",
  "简单直白": "翻译成简单直白的中文",
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

var settingListData = {
  showTooltipWhen: {
    description: browser.i18n.getMessage("Show_Tooltip_When"), // public/_locales/en/messages.json is used
    optionList: keyListWithAlways,
  },
  TTSWhen: {
    description: browser.i18n.getMessage("Voice_When"),
    optionList: keyListWithAlwaysSelect,
  },
  translateWhen: {
    description: browser.i18n.getMessage("Translate_When"),
    optionList: translateActionList,
  },
  translateSource: {
    description: browser.i18n.getMessage("Translate_From"),
    optionList: langListWithAuto,
  },
  translateTarget: {
    description: browser.i18n.getMessage("Translate_Into"),
    optionList: langList,
  },
  translatorVendor: {
    description: browser.i18n.getMessage("Translator_Engine"),
    optionList: translatorList,
  },
  mouseoverTextType: {
    description: browser.i18n.getMessage("Mouseover_Text_Type"),
    optionList: detectTypeList,
  },
  writingLanguage: {
    description: browser.i18n.getMessage("Writing_Language"),
    optionList: langList,
  },
  ocrLang: {
    description: browser.i18n.getMessage("OCR_Language"),
    optionList: ocrLangList,
  },
  translateReverseTarget: {
    description: browser.i18n.getMessage("Reverse_Translate_Language"),
    optionList: langListWithNone,
  },
};

var graphicTabData = {
  tooltipFontSize: {
    description: browser.i18n.getMessage("Tooltip_Font_Size"),
    optionList: tooltipFontSizeList,
  },
  tooltipWidth: {
    description: browser.i18n.getMessage("Tooltip_Width"),
    optionList: tooltipWidth,
  },
  tooltipDistance: {
    description: browser.i18n.getMessage("Tooltip_Distance"),
    optionList: distanceList,
  },
  tooltipAnimation: {
    description: browser.i18n.getMessage("Tooltip_Animation"),
    optionList: tooltipAnimationList,
  },
  tooltipPosition: {
    description: browser.i18n.getMessage("Tooltip_Position"),
    optionList: tooltipPositionList,
  },
  tooltipTextAlign: {
    description: browser.i18n.getMessage("Tooltip_Text_Align"),
    optionList: textAlignList,
  },
  tooltipBackgroundBlur: {
    description: browser.i18n.getMessage("Tooltip_Background_Blur"),
    optionList: tooltipBackgroundBlurList,
  },
  mouseoverHighlightText: {
    description: browser.i18n.getMessage("Mouseover_Highlight_Text"),
    optionList: toggleList,
  },
  tooltipFontColor: {
    description: browser.i18n.getMessage("Tooltip_Font_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
  tooltipBackgroundColor: {
    description: browser.i18n.getMessage("Tooltip_Background_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
  tooltipBorderColor: {
    description: browser.i18n.getMessage("Tooltip_Border_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
  mouseoverTextHighlightColor: {
    description: browser.i18n.getMessage("Mouseover_Text_Highlight_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
};

var voiceTabData = {
  voiceVolume: {
    description: browser.i18n.getMessage("Voice_Volume"),
    optionList: voiceVolumeList,
  },
  voiceRate: {
    description: browser.i18n.getMessage("Voice_Speed"),
    optionList: voiceRateList,
  },
  voiceTarget: {
    description: browser.i18n.getMessage("Voice_Target"),
    optionList: voiceTargetList,
  },
  voiceRepeat: {
    description: browser.i18n.getMessage("Voice_Repeat"),
    optionList: voiceRepeatList,
  },
};

var speechTabData = {
  speechRecognitionLanguage: {
    description: browser.i18n.getMessage("Speech_Recognition_Language"),
    optionList: listenLangList,
  },
  keySpeechRecognition: {
    description: browser.i18n.getMessage("Speech_Recognition_When"),
    optionList: keyList,
  },
  voicePanelTranslateLanguage: {
    description: browser.i18n.getMessage("Voice_Panel_Translate_Language"),
    optionList: langListWithDefault,
  },
  voicePanelTextTarget: {
    description: browser.i18n.getMessage("Voice_Panel_Text_Target"),
    optionList: speechTextTargetList,
  },
  voicePanelPadding: {
    description: browser.i18n.getMessage("Voice_Panel_Padding"),
    optionList: distanceList,
  },
  voicePanelTextAlign: {
    description: browser.i18n.getMessage("Voice_Panel_Text_Align"),
    optionList: textAlignList,
  },
  voicePanelSourceFontSize: {
    description: browser.i18n.getMessage("Voice_Panel_Source_Font_Size"),
    optionList: tooltipFontSizeList,
  },
  voicePanelTargetFontSize: {
    description: browser.i18n.getMessage("Voice_Panel_Target_Font_Size"),
    optionList: tooltipFontSizeList,
  },
  voicePanelSourceFontColor: {
    description: browser.i18n.getMessage("Voice_Panel_Source_Font_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
  voicePanelTargetFontColor: {
    description: browser.i18n.getMessage("Voice_Panel_Target_Font_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
  voicePanelSourceBorderColor: {
    description: browser.i18n.getMessage("Voice_Panel_Source_Border_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
  voicePanelTargetBorderColor: {
    description: browser.i18n.getMessage("Voice_Panel_Target_Border_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
  voicePanelBackgroundColor: {
    description: browser.i18n.getMessage("Voice_Panel_Background_Color"),
    optionType: "colorPicker",
    menu: false,
    optionList: {},
  },
};

var advancedTabData = {
  detectSubtitle: {
    description: browser.i18n.getMessage("Detect_Subtitle"),
    optionList: subtitleTypeList,
  },
  mouseoverPauseSubtitle: {
    description: browser.i18n.getMessage("Mouseover_Pause_Subtitle"),
    optionList: toggleList,
  },
  translatePromptTemplate: {
    description: browser.i18n.getMessage("Translate_Prompt_Template") || "翻译提示模板",
    optionList: translatePromptTemplateList,
  },
  exportSubtitle: {
    description: browser.i18n.getMessage("Export_Subtitle"),
    optionType: "button",
    action: "exportSubtitle"
  },
  // 添加这个新按钮
 // printMessage: {
   // description: "打印测试消息", // 按钮文本
    //optionType: "button",      // 指定这是一个按钮
    //action: "printMessage"     // 点击时触发的动作名称
  //},
  // 添加AI翻译按钮
  llmTranslation: {
    description: browser.i18n.getMessage("LLM_Translation"), // 使用本地化文本
    optionType: "button",     // 指定这是一个按钮
    action: "llmTranslation"  // 点击时触发的动作名称
  },
  // 添加获取视频标题按钮
  getVideoTitle: {
    description: "AI自动翻译", // 按钮文本
    optionType: "button",      // 指定这是一个按钮
    action: "getVideoTitle"    // 点击时触发的动作名称
  }
};

var excludeTabData = {
  langExcludeList: {
    description: browser.i18n.getMessage("Exclude_Language"),
    optionList: langList,
    optionType: "multipleSelect",
  },
  websiteExcludeList: {
    description: browser.i18n.getMessage("Exclude_Website"),
    optionList: "",
    optionType: "comboBox",
  },
};

var tabItems = {
  ADVANCED: advancedTabData,
  EXCLUDE: excludeTabData,
};
var tabs = {
  ADVANCED: browser.i18n.getMessage("ADVANCED"),
  EXCLUDE: browser.i18n.getMessage("EXCLUDE"),
};

var remainSettingDesc = {
  appName: browser.i18n.getMessage("Mouse_Tooltip_Translator"),
};

var langPriorityOptionList = [
  "translateSource",
  "translateTarget",
  "writingLanguage",
  "translateReverseTarget",
];

var toolbarIcons = {
  about: {
    title: "about",
    icon: "mdi-menu",
    path: "/about",
  },
};

export default {
  name: "PopupView",
  data() {
    return {
      currentTab: "ADVANCED",
      tabs,
      tabItems,
      remainSettingDesc,
      options: {
        mask: "!#XXXXXXXX",
        tokens: {
          X: { pattern: /[0-9a-fA-F]/ },
        },
      },
      currentPage: "main",
      toolbarIcons,
    };
  },
  async mounted() {
    await this.waitSettingLoad();
  },
  computed: {
    ...mapState(useSettingStore, ["setting", "waitSettingLoad"]),
    settingWrapper() {
      return Object.assign({}, this.setting);
    },
  },
  methods: {
    wrapTitleValueJson(inputList, optionName) {
      // convert {key:item}  as {title:key, value:item}
      var textValList = [];
      for (const [key2, val2] of Object.entries(inputList)) {
        textValList.push({
          title: key2,
          value: val2,
        });
      }
      return textValList;
    },
    swatchStyle(value, name) {
      const color = this.setting[name];
      const menu = value.menu;
      return {
        "box-shadow": "rgba(0, 0, 0, 0.35) 0px 5px 15px",
        backgroundColor: color,
        cursor: "pointer",
        height: "30px",
        width: "30px",
        borderRadius: menu ? "50%" : "4px",
        transition: "border-radius 200ms ease-in-out",
      };
    },
    async handleOptionAction(action) {
      console.log("按钮被点击，动作:", action); // 添加调试日志
      
      if (action === "exportSubtitle") {
        // 发送消息给content script处理导出
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          browser.tabs.sendMessage(tab.id, { action: "exportSubtitle" });
        }
      }
      else if (action === "printMessage") {
        console.log("准备发送printMessage消息"); // 添加调试日志
        // 发送消息处理打印
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        console.log("获取到的标签页:", tab); // 添加调试日志
        
        if (tab) {
          try {
            await browser.tabs.sendMessage(tab.id, { action: "printMessage" });
            console.log("printMessage消息已发送成功"); // 添加调试日志
          } catch (error) {
            console.error("发送printMessage消息时出错:", error); // 添加错误日志
          }
        } else {
          console.error("未找到活动标签页");
        }
      }
      else if (action === "llmTranslation") {
        console.log("准备发送llmTranslation消息"); // 添加调试日志
        // 发送消息处理AI翻译
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        console.log("获取到的标签页:", tab); // 添加调试日志
        
        if (tab) {
          try {
            await browser.tabs.sendMessage(tab.id, { action: "llmTranslation" });
            console.log("llmTranslation消息已发送成功"); // 添加调试日志
          } catch (error) {
            console.error("发送llmTranslation消息时出错:", error); // 添加错误日志
          }
        } else {
          console.error("未找到活动标签页");
        }
      }
      else if (action === "getVideoTitle") {
        console.log("准备发送getVideoTitle消息"); // 添加调试日志
        // 发送消息处理获取视频标题
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        console.log("获取到的标签页:", tab); // 添加调试日志
        
        if (tab) {
          try {
            await browser.tabs.sendMessage(tab.id, { action: "getVideoTitle" });
            console.log("getVideoTitle消息已发送成功"); // 添加调试日志
          } catch (error) {
            console.error("发送getVideoTitle消息时出错:", error); // 添加错误日志
          }
        } else {
          console.error("未找到活动标签页");
        }
      }
    },
    // 添加新方法处理设置变更
    handleSettingChange(settingName, value) {
      console.log(`设置已变更: ${settingName} = ${value}`);
      // 确保立即保存到存储
      if (this.setting) {
        this.setting[settingName] = value;
        this.$nextTick(() => {
          this.setting.save();
          console.log(`设置已保存: ${settingName} = ${value}`);
        });
      }
    },
  },
  watch: {
    // 监听翻译模板设置的变化
    'setting.translatePromptTemplate': {
      handler(newValue) {
        console.log(`翻译模板已更改为: ${newValue}`);
        this.handleSettingChange('translatePromptTemplate', newValue);
      }
    }
  },
};
</script>
<style scoped>
.scroll-container {
  height: calc(100vh - 112px);
}
</style>
