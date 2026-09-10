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
  ["今日/採点", m.TodayTab, { d, save: noop, initial: "grade" }],
  ["今日/印刷", m.TodayTab, { d, save: noop, initial: "print" }],
  ["今日/カード", m.TodayTab, { d, save: noop, initial: "cards" }],
  ["今日/既定", m.TodayTab, { d, save: noop, initial: null }],
  ["テスト/作る", m.WeekTab, { d, save: noop, initial: "make" }],
  ["テスト/撮る", m.WeekTab, { d, save: noop, initial: "grade" }],
  ["テスト/読解", m.WeekTab, { d, save: noop, initial: "read" }],
  ["テスト/記述", m.WeekTab, { d, save: noop, initial: "write" }],
  ["テスト/手入力", m.WeekTab, { d, save: noop, initial: "manual" }],
  ["テスト/模試", m.WeekTab, { d, save: noop, initial: "mock" }],
  ["テスト/模試(教科指定)", m.WeekTab, { d, save: noop, initial: "mock:数学" }],
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
test("空データ: 今日は採点待ちも印刷待ちもなし、分析は保持率なし", () => {
  assert.ok(render(m.TodayTab, { d: F.empty(), save: noop, initial: null }).html.includes("明日の分はありません"));
  assert.ok(render(m.TodayTab, { d: F.empty(), save: noop, initial: "grade" }).html.includes("採点待ちはありません"));
  assert.ok(render(m.TodayTab, { d: F.empty(), save: noop, initial: "cards" }).html.includes("今日の回収はありません"));
  assert.ok(render(m.AnaTab, { d: F.empty() }).html.includes("まだ30日以上あけた再出題がありません"));
});
test("デモ: 今日/カード に期日の項目が出て、3回落ちた警告が出る", () => {
  const { html } = render(m.TodayTab, { d: F.demo(), save: noop, initial: "cards" });
  assert.ok(html.includes("負の数のかけ算"));
  assert.ok(html.includes("3回以上落ちている項目が 1 件"));
});
test("デモ: 今日/採点 に昨日印刷した項目が並び、既定は採点。今日/印刷 には未印刷の期日項目", () => {
  const g = render(m.TodayTab, { d: F.demo(), save: noop, initial: null }).html;
  assert.ok(g.includes("負の数のかけ算") && g.includes("まとめて確定") && g.includes("やっていない"));
  assert.ok(!g.includes("指示語の内容を答える"), "未印刷の項目は採点に出ない");
  const p = render(m.TodayTab, { d: F.demo(), save: noop, initial: "print" }).html;
  assert.ok(p.includes("指示語の内容を答える") && p.includes("六大陸の名前") && p.includes("今日の分を作る（3件"), (p.match(/今日の分を作る[^<]*/) || [])[0]);
  assert.ok(!p.includes('ir-label">負の数のかけ算'), "印刷済みは印刷に出ない");
  assert.ok(p.includes("採点待ちの分をもう一度PDFにする"));
});
test("デモ: ホームは「昨日の分を採点 → 今日の分を印刷」の順", () => {
  const { A } = m.nextActions(F.demo());
  const ks = A.map((a) => a.k);
  assert.ok(ks.indexOf("mark") >= 0 && ks.indexOf("print") > ks.indexOf("mark"), ks.join(","));
  assert.ok(A.find((a) => a.k === "mark").title.includes("1件") && A.find((a) => a.k === "print").title.includes("3件"));
  assert.equal(A.find((a) => a.k === "mark").mode, "grade"); assert.equal(A.find((a) => a.k === "print").mode, "print");
  assert.ok(!ks.includes("today"));
});
test("デモ: 分析に保持率が出る", () => {
  const { html } = render(m.AnaTab, { d: F.demo() });
  assert.ok(html.includes("保持率"));
  assert.ok(!html.includes("まだ30日以上あけた再出題がありません"));
});
test("pending: 今日/カード に子どもの判定件数が出る", () => {
  const { html } = render(m.TodayTab, { d: F.pending(), save: noop, initial: "cards" });
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
  assert.ok(html.includes("を全部削除") && !html.includes("本当に削除する"), "確認は押すまで出ない");
  assert.ok(html.includes("横長の画像は見開きとして2ページ") && html.includes("右ページが若い番号"));
  assert.ok(html.includes("消すページ"));
  const e = render(m.RegTab, { d: F.empty(), save: noop, initial: "mat" }).html;
  assert.ok(e.includes("なし") && !e.includes("を全部削除"));
});
test("デモ: 登録/単元 に教科書とワークのページ範囲が出る", () => {
  const { html } = render(m.RegTab, { d: F.demo(), save: noop, initial: "unit" });
  assert.ok(html.includes("教科書 p.10-30 ／ ワーク p.4-11"));
  assert.ok(html.includes("ページ未設定"), "ページの無い単元");
  assert.ok(html.includes("教科書の目次を撮る"));
});
test("デモ: テスト/作る に自動で添付される教材が出る。空データは出ない", () => {
  const { html } = render(m.WeekTab, { d: F.demo(), save: noop, initial: "make" });
  assert.ok(html.includes("添付される教材：数学 ワーク p.10–12、教科書 p.12 ／ 英語 教科書 p.8 ／ 社会 なし"), html.match(/添付される教材：[^<]*/)?.[0]);
  assert.ok(!render(m.WeekTab, { d: F.empty(), save: noop, initial: "make" }).html.includes("添付される教材"));
});
test("デモ: 登録/項目 はページで×をタップする画面。ページの単元が出る。空データは手入力だけ", () => {
  const { html } = render(m.RegTab, { d: F.demo(), save: noop, initial: "item" });
  assert.ok(html.includes("正負の数"), "p.10 はワーク p.4-11 の単元");
  assert.ok(html.includes("×だった問題をタップ") && html.includes("手で1つ追加"));
  assert.ok(html.includes("2倍") && html.includes("3倍"), "拡大の切り替え");
  assert.ok(!html.includes("答案の写真から"), "写真から候補を出す方式は無い");
  const e = render(m.RegTab, { d: F.empty(), save: noop, initial: "item" }).html;
  assert.ok(!e.includes("×だった問題をタップ") && e.includes("手で1つ追加") && e.includes("未定着リストに追加"));
});
test("TapReg: 単元と対応しないページはその旨を出す。教材が無ければ何も出さない", () => {
  const d = F.demo(); d.units = d.units.map((u) => ({ ...u, wbPages: "" }));
  const { html, errors } = render(m.TapReg, { d, subject: "数学", us: d.units.filter((u) => u.subject === "数学"), save: noop, fallbackUnitId: "" });
  assert.equal(errors.length, 0, errors.join(", "));
  assert.ok(html.includes("単元と未対応"));
  assert.equal(render(m.TapReg, { d, subject: "社会", us: [], save: noop }).html, "");
});
test("デモ: 未定着一覧で誤答の種類を変えられる", () => {
  const { html } = render(m.RegTab, { d: F.demo(), save: noop, initial: "list" });
  assert.ok(html.includes("et-sel") && html.includes("ワーク p.11"));
});
test("デモ: 今日のカードに元の問題（教材のページと番号）が出る", () => {
  const { html } = render(m.TodayTab, { d: F.demo(), save: noop, initial: "cards" });
  assert.ok(html.includes("元 ワーク p.11"));
});
test("デモ: 用紙のプレビューは教材ページの枠を出し、画像は持たない", () => {
  const p = F.demo().papers.find((x) => x.id === "p1");
  const { html } = render(m.PrintSheet, { paper: p });
  assert.ok(html.includes("図2（ワーク p.11）") && html.includes("PDF生成時に教材のページを読み込みます"));
  assert.ok(!html.includes("data:image/jpeg"));
  assert.ok(html.includes("はPDF生成時に読み込みます"));
});
test("デモ: テスト/作る に今日作った教科をまとめてPDFにするボタンが出る", () => {
  const { html } = render(m.WeekTab, { d: F.demo(), save: noop, initial: "make" });
  assert.ok(html.includes("今日作った 1 教科を1つのPDFに（数学）"));
  assert.ok(!render(m.WeekTab, { d: F.empty(), save: noop, initial: "make" }).html.includes("1つのPDFに"));
});
test("デモ: 定期にワークで手つかずのページが出る", () => {
  const { html } = render(m.ExamTab, { d: F.demo(), save: noop });
  assert.ok(html.includes("ワークで手つかずのページ"));
  assert.ok(html.includes("正負の数 p.11") && html.includes("文字と式 p.12") && html.includes("問題 4"), html.match(/手つかずのページ[\s\S]{0,400}/)?.[0]);
});
test("デモ: 登録/項目 のページに「済」と「×なし（やった）」が出る", () => {
  const html = render(m.RegTab, { d: F.demo(), save: noop, initial: "item" }).html;
  assert.ok(html.includes("済"), "p.10 はやった");
});
test("設定にバージョンが出る。形式は日時", () => {
  assert.match(m.VERSION, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.ok(render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html.includes("v" + m.VERSION));
});
test("デモ: 教材の取り込みと×の登録に「テスト」の種別が出る。目次の切り替えには出ない", () => {
  const mat = render(m.RegTab, { d: F.demo(), save: noop, initial: "mat" }).html;
  assert.ok(mat.includes(">テスト<") && mat.includes("<b>テスト</b>"));
  const item = render(m.RegTab, { d: F.demo(), save: noop, initial: "item" }).html;
  assert.ok(item.includes(">テスト<"), "数学にはテストの答案が取り込まれている");
  const unit = render(m.RegTab, { d: F.demo(), save: noop, initial: "unit" }).html;
  assert.ok(unit.includes("教科書の目次") && unit.includes("ワークの目次") && !unit.includes("テストの目次"));
});
test("テスト/作る を cum で開くと累積が選ばれている", () => {
  const html = render(m.WeekTab, { d: F.demo(), save: noop, initial: "cum" }).html;
  assert.ok(/class="on">累積</.test(html) && !/class="on">週次</.test(html));
  assert.ok(/class="on">週次</.test(render(m.WeekTab, { d: F.demo(), save: noop, initial: "make" }).html));
});
test("デモ: ×の登録に「p.N までやった」の1タップが出る", () => {
  const html = render(m.RegTab, { d: F.demo(), save: noop, initial: "item" }).html;
  assert.ok(html.includes("までやった") && html.includes("今日やった最後のページ"));
  assert.ok(!html.includes("×なし（やった）"));
});
test("設定: バックアップの前回日が出る", () => {
  assert.ok(render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html.includes("まだ書き出していません"));
  assert.ok(render(m.Settings, { d: { ...F.demo(), backupOn: "2026-09-01" }, save: noop, setSync: noop }).html.includes("前回 2026-09-01"));
});
test("定期: 14日前は範囲外の後ろ倒し件数が出る", () => {
  const d = F.demo(); d.exams = d.exams.map((e) => (e.id === "e1" ? { ...e, date: F.day(10), unitIds: ["u1"] } : e));
  const r = m.deferForExam(d);
  const html = render(m.ExamTab, { d: r, save: noop }).html;
  assert.ok(html.includes("まで後ろ倒し"), (html.match(/範囲内の未定着[^<]*/) || [])[0]);
});
test("テスト/模試: 定期テストの範囲の教科が出る。空データは登録を促す", () => {
  const html = render(m.WeekTab, { d: F.demo(), save: noop, initial: "mock" }).html;
  assert.ok(html.includes("2学期中間") && html.includes("模試を作る（数学・英語）"));
  assert.ok(!render(m.WeekTab, { d: F.empty(), save: noop, initial: "mock" }).html.includes("模試を作る（") );
  assert.ok(render(m.WeekTab, { d: F.empty(), save: noop, initial: "mock" }).html.includes("範囲を選んだ定期テストがありません"));
  assert.ok(render(m.WeekTab, { d: F.demo(), save: noop, initial: "mock:英語" }).html.includes("模試を作る（英語）"));
});
test("テスト/模試: 返却テストがある教科はその旨が出る", () => {
  assert.ok(render(m.WeekTab, { d: F.demo(), save: noop, initial: "mock:数学" }).html.includes("数学は返却テスト1枚を形式の参考にします"));
});
test("定期: 予測に模試か累積かが出る", () => {
  const html = render(m.ExamTab, { d: F.demo(), save: noop }).html;
  assert.ok(html.includes("80%（累積）"));
});
test("テスト/撮る: 模試の用紙が選べて、用紙の説明に「1回きり」が出る", () => {
  const d = F.demo(); const mk = { id: "mkx", kind: "模試", subject: "数学", date: F.T, code: "0910数模", examId: "e1", examName: "2学期中間", round: 14, minutes: 50, maxScore: 100, questions: [{ n: 1, q: "q", a: "a", fmt: "計算", pts: 100, label: "L", unitId: "u1", aim: "", svg: "", sec: "【1】用語" }], unitIds: ["u1"], imgs: [], status: "printed", updatedAt: F.ts(0) };
  d.papers.push(mk);
  const g = render(m.WeekTab, { d, save: noop, initial: "grade" }).html;
  assert.ok(g.includes("0910数模"));
  const ps = render(m.PrintSheet, { paper: mk }).html;
  assert.ok(ps.includes("1回きり") && ps.includes("模試（2学期中間）"));
});
test("今日/採点: 「紙を撮る」があり、紙の順番が出る", () => {
  const html = render(m.TodayTab, { d: F.demo(), save: noop, initial: "grade" }).html;
  assert.ok(html.includes("紙を撮る（判定欄を読み取る") && html.includes("紙の1番目"));
});
for (const [state, make] of Object.entries(STATES)) for (let st = 0; st < 4; st++) test(`描画: 夜の作業 ${st + 1}/4（${state}）`, () => {
  m.nightSave(st);
  try { const { html, errors } = render(m.NightFlow, { d: make(), save: noop, go: noop });
    assert.equal(errors.length, 0, errors.join(", "));
    assert.ok(html.includes(`夜の作業 ${st + 1}/4`) && html.includes(st < 3 ? "次へ →" : "終わる"));
    for (const bad of ["undefined", "NaN"]) assert.ok(!html.includes(bad));
  } finally { m.nightSave(null); }
});
test("最後のページ: 取り込んだ教科・教材ごとに1行。済みの数と最後のページ", () => {
  const html = render(m.LastPageStep, { d: F.demo(), save: noop }).html;
  assert.ok(html.includes("数学のワーク") && html.includes("済 1/3（p.10 まで）") && html.includes("数学の教科書") && html.includes("英語の教科書"));
  assert.ok(!html.includes("数学のテスト"));
  assert.ok(render(m.LastPageStep, { d: F.empty(), save: noop }).html.includes("取り込んだ教科がありません"));
});
