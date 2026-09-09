/* 全タブ・全サブモードを renderToString で描画する。
   デモデータ／空データ／pending あり の3状態。React の警告（console.error）も失敗扱い。 */
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToString } = require("react-dom/server");
const { load } = require("./load.js");
const { fixtures } = require("./fixtures.js");

const m = load();
const F = fixtures(m);
const STATES = { デモ: F.demo, 空: F.empty, pending: F.pending };
const noop = () => {};

/* 画面の一覧。App は d を useEffect で読むので SSR では「読み込み中」になる。タブは直接描く。 */
const SCREENS = (d) => [
  ["App", m.App, {}],
  ["ホーム", m.HomeTab, { d, go: noop }],
  ["今日", m.TodayTab, { d, save: noop }],
  ["テスト/作る", m.WeekTab, { d, save: noop, initial: "make" }],
  ["テスト/撮る", m.WeekTab, { d, save: noop, initial: "grade" }],
  ["テスト/読解", m.WeekTab, { d, save: noop, initial: "read" }],
  ["テスト/記述", m.WeekTab, { d, save: noop, initial: "write" }],
  ["テスト/手入力", m.WeekTab, { d, save: noop, initial: "manual" }],
  ["テスト/既定", m.WeekTab, { d, save: noop, initial: null }],
  ["登録/単元", m.RegTab, { d, save: noop, initial: "unit" }],
  ["登録/項目", m.RegTab, { d, save: noop, initial: "item" }],
  ["登録/一覧", m.RegTab, { d, save: noop, initial: "list" }],
  ["登録/教材", m.RegTab, { d, save: noop, initial: "mat" }],
  ["登録/既定", m.RegTab, { d, save: noop, initial: null }],
  ["分析", m.AnaTab, { d }],
  ["定期", m.ExamTab, { d, save: noop }],
  ["依頼文", m.ExportTab, { d }],
  ["設定", m.Settings, { d, save: noop, setSync: noop }],
];

function render(Comp, props) {
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.map(String).join(" "));
  let html;
  try { html = renderToString(React.createElement(Comp, props)); } finally { console.error = orig; }
  // renderToString は式の境目に <!-- --> を挟むので、文字列で照合できるよう外す
  return { html: html.replace(/<!-- -->/g, ""), errors };
}

for (const [state, make] of Object.entries(STATES)) {
  for (const [name, Comp, props] of SCREENS(make())) {
    test(`描画: ${name}（${state}）`, () => {
      const { html, errors } = render(Comp, props);
      assert.equal(errors.length, 0, `React の警告:\n${errors.join("\n")}`);
      if (name === "App") { assert.ok(html.includes("読み込み中"), "App は SSR では読み込み中を出す"); return; }
      assert.ok(html.length > 50, "出力が短すぎる");
      for (const bad of ["undefined", "NaN", "[object Object]"]) assert.ok(!html.includes(bad), `「${bad}」が画面に出ている`);
    });
  }
}

/* 用紙のプレビュー（PDF ボタン込み）。資料ページあり／なし、読解の文章あり */
for (const [state, make] of Object.entries(STATES)) {
  const d = make();
  for (const p of d.papers) {
    test(`描画: 用紙 ${p.code}（${state}）`, () => {
      const { html, errors } = render(m.PrintSheet, { paper: p });
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.ok(html.includes("PDFにする"));
      assert.ok(html.includes(p.code));
    });
    test(`描画: 作ったテストの行 ${p.code}（${state}）`, () => {
      const { html, errors } = render(m.PaperRow, { p, d, save: noop });
      assert.equal(errors.length, 0, errors.join("\n"));
      assert.ok(html.includes(p.status === "graded" ? "採点済" : "未採点"));
    });
  }
}

/* 状態ごとに中身が正しく切り替わっていること */
test("空データ: ホームは単元登録を促す", () => {
  const { html } = render(m.HomeTab, { d: F.empty(), go: noop });
  assert.ok(html.includes("いまやること"));
  assert.ok(html.includes("単元"));
});
test("空データ: 今日は回収なし、分析は保持率なし", () => {
  assert.ok(render(m.TodayTab, { d: F.empty(), save: noop }).html.includes("今日の回収はありません"));
  assert.ok(render(m.AnaTab, { d: F.empty() }).html.includes("まだ30日以上あけた再出題がありません"));
});
test("デモ: 今日に期日の項目が出て、3回落ちた警告が出る", () => {
  const { html } = render(m.TodayTab, { d: F.demo(), save: noop });
  assert.ok(html.includes("負の数のかけ算"));
  assert.ok(html.includes("3回以上落ちている項目が 1 件"));
});
test("デモ: 分析に保持率が出る", () => {
  const { html } = render(m.AnaTab, { d: F.demo() });
  assert.ok(html.includes("保持率"));
  assert.ok(!html.includes("まだ30日以上あけた再出題がありません"));
});
test("pending: 今日に子どもの判定件数が出る", () => {
  const { html } = render(m.TodayTab, { d: F.pending(), save: noop });
  assert.ok(html.includes("子どもの判定が 3 件保存されています"));
});
test("デモ: テスト/撮る に未採点の用紙が選ばれる", () => {
  const { html } = render(m.WeekTab, { d: F.demo(), save: noop, initial: "grade" });
  assert.ok(html.includes("0909数"));
});
test("デモ: 定期に今後の試験と返却済みの試験が出る", () => {
  const { html } = render(m.ExamTab, { d: F.demo(), save: noop });
  assert.ok(html.includes("2学期中間"));
  assert.ok(html.includes("1学期期末"));
});
test("デモ: 登録/教材 に取り込み済みのページ範囲が出る。空データは「なし」", () => {
  const { html } = render(m.RegTab, { d: F.demo(), save: noop, initial: "mat" });
  assert.ok(html.includes("3ページ（p.10–12）"), "数学ワークの範囲");
  assert.ok(html.includes("1ページ（p.12）"), "数学教科書の範囲");
  assert.ok(html.includes("を全部削除"));
  const e = render(m.RegTab, { d: F.empty(), save: noop, initial: "mat" }).html;
  assert.ok(e.includes("なし") && !e.includes("を全部削除"));
});
