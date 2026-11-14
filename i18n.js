/* POOF2 i18n — dependency-free language loader.
 * - 20 languages, translations in i18n/<code>.json
 * - Language persisted in localStorage ("poof2-lang"), browser language detected.
 * - Fallback chain for a missing file or key: requested -> en -> fa.
 * - RTL for fa / ar / ur; numbers/dates via Intl with the language locale.
 * - Applies to [data-i18n] (text), [data-i18n-placeholder], [data-i18n-aria].
 * - Dispatches "poof2:language-changed" on document after applying.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "poof2-lang";
  var DEFAULT_LANG = "fa";

  var LANGUAGES = [
    { code: "fa", name: "فارسی", dir: "rtl", locale: "fa-IR" },
    { code: "en", name: "English", dir: "ltr", locale: "en-US" },
    { code: "de", name: "Deutsch", dir: "ltr", locale: "de-DE" },
    { code: "ar", name: "العربية", dir: "rtl", locale: "ar-EG" },
    { code: "tr", name: "Türkçe", dir: "ltr", locale: "tr-TR" },
    { code: "fr", name: "Français", dir: "ltr", locale: "fr-FR" },
    { code: "es", name: "Español", dir: "ltr", locale: "es-ES" },
    { code: "it", name: "Italiano", dir: "ltr", locale: "it-IT" },
    { code: "pt", name: "Português", dir: "ltr", locale: "pt-PT" },
    { code: "ru", name: "Русский", dir: "ltr", locale: "ru-RU" },
    { code: "zh", name: "中文", dir: "ltr", locale: "zh-CN" },
    { code: "ja", name: "日本語", dir: "ltr", locale: "ja-JP" },
    { code: "ko", name: "한국어", dir: "ltr", locale: "ko-KR" },
    { code: "hi", name: "हिन्दी", dir: "ltr", locale: "hi-IN" },
    { code: "ur", name: "اردو", dir: "rtl", locale: "ur-PK" },
    { code: "nl", name: "Nederlands", dir: "ltr", locale: "nl-NL" },
    { code: "sv", name: "Svenska", dir: "ltr", locale: "sv-SE" },
    { code: "pl", name: "Polski", dir: "ltr", locale: "pl-PL" },
    { code: "id", name: "Bahasa Indonesia", dir: "ltr", locale: "id-ID" },
    { code: "vi", name: "Tiếng Việt", dir: "ltr", locale: "vi-VN" }
  ];

  // Directory of this script (root of the site), so tool pages can use a
  // relative path and still fetch i18n/*.json from the site root.
  var BASE = "";
  try {
    var src = (document.currentScript && document.currentScript.src) || "";
    if (src) BASE = src.replace(/[^/]*$/, "");
  } catch (e) { BASE = ""; }

  function langMeta(code) {
    for (var i = 0; i < LANGUAGES.length; i++) {
      if (LANGUAGES[i].code === code) return LANGUAGES[i];
    }
    return LANGUAGES[0];
  }

  function detectLanguage() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && langMeta(stored).code === stored) return stored;
    } catch (e) { /* storage unavailable: fall through */ }
    var nav = (navigator.language || navigator.userLanguage || "").toLowerCase();
    if (nav) {
      var primary = nav.split("-")[0];
      if (primary === "zh") return "zh";
      for (var i = 0; i < LANGUAGES.length; i++) {
        if (LANGUAGES[i].code === primary) return primary;
      }
    }
    return DEFAULT_LANG;
  }

  var api = {
    languages: LANGUAGES,
    lang: detectLanguage(),
    ready: false,
    dict: null,
    fallbacks: [],
    promise: null
  };

  function lookup(dict, key) {
    if (!dict) return undefined;
    var parts = key.split(".");
    var cur = dict;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== "object") return undefined;
      cur = cur[parts[i]];
    }
    return typeof cur === "string" ? cur : undefined;
  }

  api.t = function (key, vars) {
    var s = lookup(api.dict, key);
    if (s === undefined) {
      for (var i = 0; i < api.fallbacks.length; i++) {
        s = lookup(api.fallbacks[i], key);
        if (s !== undefined) break;
      }
    }
    if (s === undefined) return key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] !== undefined ? vars[name] : m;
      });
    }
    return s;
  };

  api.has = function (key) {
    if (lookup(api.dict, key) !== undefined) return true;
    for (var i = 0; i < api.fallbacks.length; i++) {
      if (lookup(api.fallbacks[i], key) !== undefined) return true;
    }
    return false;
  };

  api.formatNumber = function (n) {
    try {
      return new Intl.NumberFormat(langMeta(api.lang).locale).format(n);
    } catch (e) {
      return String(n);
    }
  };

  api.formatDate = function (date, options) {
    try {
      return new Intl.DateTimeFormat(langMeta(api.lang).locale, options || { dateStyle: "medium" }).format(date);
    } catch (e) {
      return String(date);
    }
  };

  function fetchDict(code) {
    return fetch(BASE + "i18n/" + code + ".json").then(function (res) {
      if (!res.ok) throw new Error("i18n " + code + " HTTP " + res.status);
      return res.json();
    });
  }

  function loadLanguage(code) {
    var chain = [code];
    if (code !== "en") chain.push("en");
    if (code !== "fa") chain.push("fa");
    var primary = fetchDict(chain[0]).catch(function () { return null; });
    return primary.then(function (dict) {
      if (!dict) return fetchDict("en").catch(function () { return null; });
      return dict;
    }).then(function (dict) {
      if (!dict) return fetchDict("fa").catch(function () { return null; });
      return dict;
    }).then(function (dict) {
      api.dict = dict || {};
      api.lang = (dict && dict.meta && dict.meta.code) || code;
      api.fallbacks = [];
      var rest = chain.slice(1);
      var jobs = rest.map(function (c) {
        return fetchDict(c).then(function (d) { return d; }).catch(function () { return null; });
      });
      return Promise.all(jobs).then(function (dicts) {
        api.fallbacks = dicts.filter(function (d) { return !!d; });
        api.ready = true;
        return api.dict;
      });
    });
  }

  function buildSelector(select) {
    if (!select || select.options.length) return;
    LANGUAGES.forEach(function (l) {
      var opt = document.createElement("option");
      opt.value = l.code;
      opt.textContent = l.name;
      select.appendChild(opt);
    });
    select.value = api.lang;
    select.addEventListener("change", function () {
      api.setLanguage(select.value);
    });
  }

  function apply() {
    var meta = langMeta(api.lang);
    document.documentElement.lang = api.lang;
    document.documentElement.dir = meta.dir;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = api.t(el.getAttribute("data-i18n"));
      if (v) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      el.setAttribute("placeholder", api.t(el.getAttribute("data-i18n-placeholder")));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", api.t(el.getAttribute("data-i18n-aria")));
    });
    document.querySelectorAll("select.lang-select").forEach(function (sel) {
      sel.value = api.lang;
    });
    try {
      document.dispatchEvent(new CustomEvent("poof2:language-changed", { detail: { lang: api.lang } }));
    } catch (e) { /* old browsers: listeners just won't fire */ }
  }

  api.setLanguage = function (code) {
    if (!langMeta(code) || langMeta(code).code !== code) code = DEFAULT_LANG;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    api.lang = code;
    api.ready = false;
    return loadLanguage(code).then(function () {
      document.querySelectorAll("select.lang-select").forEach(function (sel) {
        sel.value = api.lang;
      });
      apply();
    });
  };

  api.promise = loadLanguage(api.lang).then(function () {
    document.querySelectorAll("select.lang-select").forEach(buildSelector);
    apply();
  }).catch(function () {
    api.ready = true;
    document.querySelectorAll("select.lang-select").forEach(buildSelector);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll("select.lang-select").forEach(buildSelector);
    });
  } else {
    document.querySelectorAll("select.lang-select").forEach(buildSelector);
  }

  window.POOF2I18N = api;
})();
