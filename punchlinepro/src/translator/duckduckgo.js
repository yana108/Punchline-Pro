import ky from "ky";
import BaseTranslator from "./baseTranslator";

var apiUrl = "";

export default class duckduckgo extends BaseTranslator {
  static async requestTranslate(text, sourceLang, targetLang) {
    return await ky
      .post(apiUrl, {
        searchParams: {},
      })
      .json();
  }
  static async wrapResponse(res, text, sourceLang, targetLang) {
    return {
      targetText: "",
      detectedLang: "",
      transliteration: "",
    };
  }
}
