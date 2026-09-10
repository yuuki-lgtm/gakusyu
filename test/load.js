/* index.html の <script type="text/babel"> を取り出し、node で評価して中身の関数・コンポーネントを返す。
   ブラウザ専用のもの（localStorage, document, window, navigator）は最小限のスタブで置き換える。 */
"use strict";
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const React = require("react");

const OPEN = '<script type="text/babel" data-presets="react">';
const EXPORTS = [
  // 定数
  "VERSION", "KEY", "SUBJECTS", "HUE", "FORMATS", "ETYPES", "INT", "STABLE_LEVEL", "MKINDS", "SUBJ_CODE", "KIND_CODE",
  // 日付など
  "today", "addDays", "diffDays", "pct", "blank",
  // 中核ロジック
  "migrate", "mergeData", "removeRec", "newItem", "unitById", "sbFetch", "cfgLink", "importCfg", "matPath", "stUpload", "stGet", "stRemove", "pagesToRanges", "isSpreadShape", "assignPages", "splitSpread", "findGutter", "parsePages", "unitPages", "unitForPage", "applyTOC", "unitPageLabel", "materialsForUnits", "matsLabel", "b64ToBlob", "bufToB64", "matsOf", "applyJudgment", "retention", "streakDays", "pickUnits", "taught", "nextActions", "parseJSON", "genContent", "srcLabel", "annotateB64", "hasPos", "markDesc", "nameItems", "applyGen", "printSet", "gradeSet", "judgeAll", "ctxFor", "itemContext", "SELF_LINE",
  // 印刷
  "escHTML", "safeSvg", "paperHTML", "needBlank", "pdfName", "paperFigs", "usedFigs", "resolveRefs", "fileHTML", "paperText", "genToPaper", "isIOS",
  // 画面
  "App", "HomeTab", "TodayTab", "TodayMake", "TodayGrade", "TodayCards", "ItemCard", "WeekTab", "MakePapers", "PaperRow", "GradeFlow", "ReadingMaker", "WritingFlow", "ManualTest",
  "PrintSheet", "RegTab", "UnitReg", "ItemReg", "ItemList", "MaterialReg", "TapReg", "tapHit", "marksOn", "tapsToItems", "markDone", "applyAutoProgress", "untouchedPages", "buildIndex", "AnaTab", "FormatBlock", "ExamTab", "ExamCard", "ExportTab", "Settings",
];

function extractSource() {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const s = html.indexOf(OPEN);
  const e = html.lastIndexOf("</script>");
  if (s < 0 || e < 0) throw new Error("index.html に text/babel スクリプトが見つかりません");
  let code = html.slice(s + OPEN.length, e);
  // 画面へのマウントだけ外す（node には DOM がない）
  const mount = /ReactDOM\.createRoot\([^\n]*\n?/;
  if (!mount.test(code)) throw new Error("ReactDOM.createRoot の行が見つかりません");
  code = code.replace(mount, "");
  return code;
}

function makeStubs() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, remove() {}, click() {}, getContext: () => ({ drawImage() {} }), toDataURL: () => "data:," });
  const document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: el, head: el(), body: el() };
  const window = { print() {} };
  const navigator = { userAgent: "node", platform: "node", maxTouchPoints: 0, share: undefined, canShare: undefined, clipboard: undefined };
  return { localStorage, document, window, navigator };
}

let cached = null;
function load() {
  if (cached) return cached;
  // Babel は最上位の return を許さないので、JSX 変換後に付け足す
  const { code: js } = babel.transformSync(extractSource(), {
    filename: "index.html.jsx",
    babelrc: false, configFile: false, sourceType: "script",
    presets: [["@babel/preset-react", { runtime: "classic" }]],
  });
  const code = js + "\nreturn { " + EXPORTS.join(", ") + " };\n";
  const stubs = makeStubs();
  const ReactDOM = { createRoot: () => ({ render() {} }) };
  const fn = new Function("React", "ReactDOM", "localStorage", "document", "window", "navigator", code);
  cached = { ...fn(React, ReactDOM, stubs.localStorage, stubs.document, stubs.window, stubs.navigator), stubs };
  return cached;
}

module.exports = { load, EXPORTS };
