// import browser from "webextension-polyfill";
var browser;
try {
  browser = require("webextension-polyfill");
} catch (error) {}

// load setting from chrome storage
// automatic setting update class===============================
var updateCallbackFn = [];
var defaultSettingList = {};
export class Setting {
  constructor() {}

  static async loadSetting(defaultList = {}, callbackFn) {
    defaultSettingList = defaultList;
    updateCallbackFn = callbackFn;
    const o = new Setting();
    await o.initialize();
    return o;
  }

  async initialize() {
    this.loadDefaultData();
    await this.loadStorageData();
    this.initSettingListener();
  }

  async loadDefaultData() {
    this.loadData(defaultSettingList);
  }

  async loadData(data) {
    for (let [key, value] of Object.entries(data)) {
      if (value != null) {
        this[key] = value;
      }
    }
  }

  async loadStorageData() {
    var settingData = this;
    var storage = await browser.storage.local.get(Object.keys(settingData));
    this.loadData(storage);
  }

  initSettingListener() {
    browser.storage.onChanged.addListener((changes, namespace) => {
      for (var key in changes) {
        this[key] = changes[key].newValue;
      }
      this.runSettingCallback(changes);
    });
  }

  runSettingCallback(changes) {
    var keys = Object.keys(changes).filter(
      (item) => !this.ignoreCallbackOptionList.includes(item)
    );
    if (keys.length == 0) {
      return;
    }

    if (updateCallbackFn) {
      updateCallbackFn(changes);
    }
  }

  save() {
    console.log("正在保存设置:", JSON.stringify(this));
    try {
      browser.storage.local.set(this)
        .then(() => console.log("设置保存成功"))
        .catch(err => console.error("设置保存失败:", err));
    } catch (error) {
      console.error("保存设置时发生错误:", error);
    }
  }
}
