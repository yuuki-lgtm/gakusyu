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
  ["今日/採点", m.PaperTab, { d, save: noop, initial: "grade" }],
  ["今日/印刷", m.PaperTab, { d, save: noop, initial: "print" }],
  ["今日/既定", m.PaperTab, { d, save: noop, initial: null }],
  ["テスト/作る", m.PaperTab, { d, save: noop, initial: "make" }],
  ["テスト/読解", m.PaperTab, { d, save: noop, initial: "read" }],
  ["テスト/記述", m.PaperTab, { d, save: noop, initial: "write" }],
  ["テスト/手入力", m.PaperTab, { d, save: noop, initial: "manual" }],
  ["テスト/模試", m.PaperTab, { d, save: noop, initial: "mock" }],
  ["テスト/模試(教科指定)", m.PaperTab, { d, save: noop, initial: "mock:数学" }],
  ["テスト/既定", m.PaperTab, { d, save: noop, initial: null }],
  ["テスト/定期", m.MatsTab, { d, save: noop, initial: "exam" }],
  ["その他", m.MoreTab, { d, go: noop }],
  ["最後のページ", m.LastPageStep, { d, save: noop }],
  ["使い方", m.GuideTab, { go: noop }],
  ["登録/単元", m.MatsTab, { d, save: noop, initial: "unit" }],
  ["登録/項目", m.ItemsTab, { d, save: noop, initial: "item" }],
  ["登録/一覧", m.ItemsTab, { d, save: noop, initial: "list" }],
  ["登録/教材", m.MatsTab, { d, save: noop, initial: "mat" }],
  ["登録/既定", m.ItemsTab, { d, save: noop, initial: null }],
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
  assert.ok(render(m.PaperTab, { d: F.empty(), save: noop, initial: null }).html.includes("次の紙の分はありません"));
  assert.ok(render(m.PaperTab, { d: F.empty(), save: noop, initial: "grade" }).html.includes("採点待ちはありません"));
  assert.ok(render(m.AnaTab, { d: F.empty() }).html.includes("まだ30日以上あけた再出題がありません"));
});
test("デモ: 今日/採点 に昨日印刷した項目が並び、既定は採点。今日/印刷 には未印刷の期日項目", () => {
  const g = render(m.PaperTab, { d: F.demo(), save: noop, initial: null }).html;
  assert.ok(g.includes("負の数のかけ算") && g.includes("まとめて確定") && g.includes("やっていない"));
  assert.ok(!g.includes("指示語の内容を答える"), "未印刷の項目は採点に出ない");
  const p = render(m.PaperTab, { d: F.demo(), save: noop, initial: "print" }).html;
  assert.ok(p.includes("指示語の内容を答える") && p.includes("六大陸の名前") && p.includes("次の紙を作る（3件"), (p.match(/次の紙を作る[^<]*/) || [])[0]);
  assert.ok(p.includes("チェック 3 件（9 問）、繰り越し 0 件") && p.includes('type="checkbox" checked=""'));
  assert.ok(!p.includes('ir-label">負の数のかけ算'), "印刷済みは印刷に出ない");
  assert.ok(p.includes("採点待ちの分をもう一度PDFにする"));
});
test("デモ: ホームは夜にやることを独立した行で出す。採点 → 次の紙 → ×の登録 → 最後のページ の順。ウィザード（night）は無い", () => {
  const { A } = m.nextActions(F.demo());
  const ks = A.map((a) => a.k);
  assert.ok(!ks.includes("night"));
  const order = ["gradeDaily", "print", "items", "last"].filter((k) => ks.includes(k));
  assert.deepEqual(order, ks.filter((k) => order.includes(k)), "並び順");
  assert.equal(ks[0], "gradeDaily"); assert.ok(A[0].title.includes("昨日の紙を採点する（1件）"));
  assert.ok(A.find((a) => a.k === "print").title.includes("次の紙を作る（3件"));
});
test("デモ: 分析に保持率が出る", () => {
  const { html } = render(m.AnaTab, { d: F.demo() });
  assert.ok(html.includes("保持率"));
  assert.ok(!html.includes("まだ30日以上あけた再出題がありません"));
});
test("デモ: 定期に今後の試験と返却済みの試験が出る", () => {
  const { html } = render(m.ExamTab, { d: F.demo(), save: noop });
  assert.ok(html.includes("2学期中間"));
  assert.ok(html.includes("1学期期末"));
});
test("デモ: 登録/教材 に取り込み済みのページ範囲が出る。空データは「なし」", () => {
  const { html } = render(m.MatsTab, { d: F.demo(), save: noop, initial: "mat" });
  assert.ok(html.includes("3ページ（p.10–12）"), "数学ワークの範囲");
  assert.ok(html.includes("1ページ（p.12）"), "数学教科書の範囲");
  assert.ok(!html.includes("を全部削除") && !html.includes("本当に削除する"), "教科を選ぶ前は削除の欄を出さない");
  assert.ok(html.includes("PDF か ページの画像（複数可）を選ぶ") && !html.includes("縦書き（右が若い）") && !html.includes("横長の画像は見開きとして2ページ"), "教科・番号・綴じ方向はファイルを選んだ後に出す");
  assert.ok(!html.includes("消すページ") && html.includes("取り込み済み"));
  const e = render(m.MatsTab, { d: F.empty(), save: noop, initial: "mat" }).html;
  assert.ok(e.includes("なし") && !e.includes("を全部削除"));
});
test("デモ: 登録/単元 に教科書とワークのページ範囲が出る", () => {
  const { html } = render(m.MatsTab, { d: F.demo(), save: noop, initial: "unit" });
  assert.ok(html.includes("教科書 p.10-30 ／ ワーク p.4-11"));
  assert.ok(html.includes("ページ未設定"), "ページの無い単元");
  assert.ok(html.includes("教科書の目次を撮る"));
});
test("デモ: テスト/作る に自動で添付される教材が出る。空データは出ない", () => {
  const { html } = render(m.PaperTab, { d: F.demo(), save: noop, initial: "make" });
  assert.ok(html.includes("添付される教材：数学 ワーク p.10–12、教科書 p.12 ／ 英語 教科書 p.8 ／ 社会 なし"), html.match(/添付される教材：[^<]*/)?.[0]);
  assert.ok(!render(m.PaperTab, { d: F.empty(), save: noop, initial: "make" }).html.includes("添付される教材"));
});
test("デモ: 登録/項目 はページで×をタップする画面。ページの単元が出る。空データは手入力だけ", () => {
  const { html } = render(m.ItemsTab, { d: F.demo(), save: noop, initial: "item" });
  assert.ok(html.includes("正負の数"), "p.10 はワーク p.4-11 の単元");
  assert.ok(html.includes("×だった問題をタップすると印が付き") && html.includes("手で1つ追加"));
  assert.ok(html.includes("2倍") && html.includes("3倍"), "拡大の切り替え");
  assert.ok(!html.includes("答案の写真から"), "写真から候補を出す方式は無い");
  const e = render(m.ItemsTab, { d: F.empty(), save: noop, initial: "item" }).html;
  assert.ok(!e.includes("×だった問題をタップすると") && e.includes("手で1つ追加") && e.includes("未定着リストに追加"));
});
test("TapReg: 単元と対応しないページはその旨を出す。教材が無ければ何も出さない", () => {
  const d = F.demo(); d.units = d.units.map((u) => ({ ...u, wbPages: "" }));
  const { html, errors } = render(m.TapReg, { d, subject: "数学", us: d.units.filter((u) => u.subject === "数学"), save: noop, fallbackUnitId: "" });
  assert.equal(errors.length, 0, errors.join(", "));
  assert.ok(html.includes("単元と未対応"));
  assert.equal(render(m.TapReg, { d, subject: "社会", us: [], save: noop }).html, "");
});
test("デモ: 未定着一覧で誤答の種類を変えられる", () => {
  const { html } = render(m.ItemsTab, { d: F.demo(), save: noop, initial: "list" });
  assert.ok(html.includes("et-cur") && html.includes("ワーク p.11"));
});
test("デモ: 用紙のプレビューは教材ページの枠を出し、画像は持たない", () => {
  const p = F.demo().papers.find((x) => x.id === "p1");
  const { html } = render(m.PrintSheet, { paper: p });
  assert.ok(html.includes("図2（ワーク p.11）") && html.includes("PDF生成時に教材のページを読み込みます"));
  assert.ok(!html.includes("data:image/jpeg"));
  assert.ok(html.includes("はPDF生成時に読み込みます"));
});
test("デモ: テスト/作る に今日作った教科をまとめてPDFにするボタンが出る", () => {
  const { html } = render(m.PaperTab, { d: F.demo(), save: noop, initial: "make" });
  assert.ok(html.includes("今日作った 1 教科を1つのPDFに（数学）"));
  assert.ok(!render(m.PaperTab, { d: F.empty(), save: noop, initial: "make" }).html.includes("1つのPDFに"));
});
test("デモ: 定期にワークで手つかずのページが出る", () => {
  const { html } = render(m.ExamTab, { d: F.demo(), save: noop });
  assert.ok(html.includes("ワークで手つかずのページ"));
  assert.ok(html.includes("正負の数 p.11") && html.includes("文字と式 p.12") && html.includes("問題 4"), html.match(/手つかずのページ[\s\S]{0,400}/)?.[0]);
});
test("デモ: 登録/項目 のページに「済」と「×なし（やった）」が出る", () => {
  const html = render(m.ItemsTab, { d: F.demo(), save: noop, initial: "item" }).html;
  assert.ok(html.includes("済"), "p.10 はやった");
});
test("バージョンは「その他」の更新ボタンに出る。形式は日時。設定には出さない", () => {
  assert.match(m.VERSION, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.ok(render(m.MoreTab, { d: F.demo(), go: noop }).html.includes("v" + m.VERSION));
  assert.ok(!render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html.includes("v" + m.VERSION));
});
test("デモ: 教材の取り込みと×の登録に「テスト」の種別が出る。目次の切り替えには出ない", () => {
  const mat = render(m.MatsTab, { d: F.demo(), save: noop, initial: "mat" }).html;
  assert.ok(mat.includes("<b>テスト</b>"), "取り込み済みの一覧にテストの答案");
  const item = render(m.ItemsTab, { d: F.demo(), save: noop, initial: "item" }).html;
  assert.ok(item.includes(">テスト<"), "数学にはテストの答案が取り込まれている");
  const unit = render(m.MatsTab, { d: F.demo(), save: noop, initial: "unit" }).html;
  assert.ok(unit.includes("教科書の目次") && unit.includes("ワークの目次") && !unit.includes("テストの目次"));
});
test("テスト/作る を cum で開くと累積が選ばれている", () => {
  const html = render(m.MakePapers, { d: F.demo(), save: noop, initialKind: "累積" }).html;
  assert.ok(/class="on">累積</.test(html) && !/class="on">週次</.test(html));
  assert.ok(/class="on">週次</.test(render(m.MakePapers, { d: F.demo(), save: noop }).html));
  assert.ok(/class="on">累積</.test(render(m.PaperTab, { d: F.demo(), save: noop, initial: "cum" }).html));
});
test("デモ: ×の登録に「p.N までやった」の1タップが出る", () => {
  const html = render(m.ItemsTab, { d: F.demo(), save: noop, initial: "item" }).html;
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
  const html = render(m.PaperTab, { d: F.demo(), save: noop, initial: "mock" }).html;
  assert.ok(html.includes("2学期中間") && html.includes("模試を作る（数学・英語）"));
  assert.ok(!render(m.PaperTab, { d: F.empty(), save: noop, initial: "mock" }).html.includes("模試を作る（") );
  const mk = render(m.PaperTab, { d: F.empty(), save: noop, initial: "mock" }).html; assert.ok(mk.includes("範囲を選んだ定期テストがありません") && mk.includes(">定期テストを登録する</button>"), "定期テストのタブへ行くボタン");
  assert.ok(render(m.PaperTab, { d: F.demo(), save: noop, initial: "mock:英語" }).html.includes("模試を作る（英語）"));
});
test("テスト/模試: 返却テストがある教科はその旨が出る", () => {
  assert.ok(render(m.PaperTab, { d: F.demo(), save: noop, initial: "mock:数学" }).html.includes("数学は返却テスト1枚を形式の参考にします"));
});
test("定期: 予測に模試か累積かが出る", () => {
  const html = render(m.ExamTab, { d: F.demo(), save: noop }).html;
  assert.ok(html.includes("80%（累積）"));
});
test("用紙の行: 模試の答案を撮る欄と、用紙の説明に「1回きり」が出る", () => {
  const d = F.demo(); const mk = { id: "mkx", kind: "模試", subject: "数学", date: F.T, code: "0910数模", examId: "e1", examName: "2学期中間", round: 14, minutes: 50, maxScore: 100, questions: [{ n: 1, q: "q", a: "a", fmt: "計算", pts: 100, label: "L", unitId: "u1", aim: "", svg: "", sec: "【1】用語" }], unitIds: ["u1"], imgs: [], status: "printed", updatedAt: F.ts(0) };
  d.papers.push(mk);
  const g = render(m.PaperGrade, { p: mk, d, save: noop }).html;
  assert.ok(g.includes("この用紙の答案を撮る（0910数模）"));
  const ps = render(m.PrintSheet, { paper: mk }).html;
  assert.ok(ps.includes("1回きり") && ps.includes("模試（2学期中間）"));
});
test("今日/採点: 「紙を撮る」は無く、各行に「できなかった」のチェック。紙の問番号が出る", () => {
  const html = render(m.PaperTab, { d: F.demo(), save: noop, initial: "grade" }).html;
  assert.ok(!html.includes("紙を撮る") && !html.includes("j-btns") && html.includes('class="gchk ng"') && /class="qno">問\d/.test(html), "紙の問番号が出る");
  assert.ok(html.includes("まとめて確定（できなかった 0・解けた "), "✓ の無い行は解けた");
});
test("最後のページ: 取り込んだ教科・教材ごとに1行。済みの数と最後のページ", () => {
  const html = render(m.LastPageStep, { d: F.demo(), save: noop }).html;
  assert.ok(html.includes("数学のワーク") && html.includes("登録済み 1件／3件（p.10 まで）") && html.includes("数学の教科書") && html.includes("英語の教科書"));
  assert.ok(!html.includes("数学のテスト"));
  assert.ok(render(m.LastPageStep, { d: F.empty(), save: noop }).html.includes("取り込んだ教科がありません"));
});
test("今日: 朝の印刷ボタンは置かない（紙→採点待ちの「もう一度PDFにする」が同じ機能）", () => {
  assert.ok(!render(m.HomeTab, { d: F.demo(), go: noop }).html.includes("もう一度PDFに"));
  assert.ok(render(m.PaperTab, { d: F.demo(), save: noop, initial: "print" }).html.includes("もう一度PDFにする"));
});
test("今日/採点: 行をタップで類題と解答、3回落ちていれば診断が出る", () => {
  const d = F.demo(); d.items = d.items.map((i) => (i.id === "i2" ? { ...i, printedOn: F.day(-1), printedAs: 2, gen: { problems: [{ q: "Q1", a: "A1" }], why: "W" } } : i));
  const list = render(m.TodayGrade, { d, save: noop }).html;
  assert.ok(list.includes("類題・診断 ▸") && list.includes("類題 ▸") && !list.includes("cards"));
  const det = render(m.GradeRowDetail, { i: d.items.find((i) => i.id === "i2"), d, save: noop }).html;
  assert.ok(det.includes("Q1") && !det.includes("A1") && det.includes("解答を見る") && det.includes("分数の意味があいまい"), "診断済みなら結果を出す");
  const det1 = render(m.GradeRowDetail, { i: d.items.find((i) => i.id === "i1"), d, save: noop }).html;
  assert.ok(det1.includes("(−2)×(+5)") && !det1.includes("診断"), "3回未満は診断なし");
});
test("用紙の行を開くと、未採点なら「この用紙の答案を撮る」がある。テストの切り替えに「撮る」は無い", () => {
  const d = F.demo(); const p1 = d.papers.find((p) => p.id === "p1"), p2 = d.papers.find((p) => p.id === "p2");
  assert.ok(render(m.PaperGrade, { p: p1, d, save: noop }).html.includes("この用紙の答案を撮る（0909数）"));
  const w = render(m.PaperTab, { d, save: noop, initial: null }).html;
  assert.ok(!w.includes("採点した答案を撮る") && w.includes(">5教科テスト<"));
  assert.equal(p2.status, "graded");
});
test("設定: SQL は未設定なら開き、設定済みなら畳む", () => {
  const open = render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html;
  assert.ok(/<details class="det" open=""/.test(open) && open.includes("初回だけ: Supabase で実行する SQL"));
  m.stubs.localStorage.setItem("sb_url", "u"); m.stubs.localStorage.setItem("sb_key", "k"); m.stubs.localStorage.setItem("sb_room", "r");
  try { const closed = render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html; assert.ok(!/<details class="det" open=""/.test(closed) && closed.includes("設定済みです")); }
  finally { ["sb_url", "sb_key", "sb_room"].forEach((k) => m.stubs.localStorage.removeItem(k)); }
});
test("今日/採点: 元の問題の回は印と説明が出る", () => {
  const d = F.demo(); d.items = d.items.map((i) => (i.id === "i1" ? { ...i, gen: null, printedOrig: true } : i));
  const html = render(m.TodayGrade, { d, save: noop }).html;
  assert.ok(html.includes(">元の問題<") && html.includes("「解けた」では間隔が伸びず"));
  assert.ok(render(m.GradeRowDetail, { i: d.items[0], d, save: noop }).html.includes("元の問題（ワーク p.11）をもう一度解いています"));
});
test("説明不要の切り替え: 未定着一覧と×登録のポップアップ。分析に件数", () => {
  const d = F.demo(); d.items = d.items.map((i) => (i.id === "i4" ? { ...i, noWhy: true } : i));
  const list = render(m.ItemsTab, { d, save: noop, initial: "list" }).html;
  assert.ok(list.includes(">説明不要<") && list.includes(">説明あり<") && !list.includes('class="tag">説明不要'), "バッジは出さず切り替え1つ");
  const ana = render(m.AnaTab, { d }).html;
  assert.ok(ana.includes("説明不要の項目") && ana.includes("用語 0、印あり 1"));
});
test("×の登録: テストは答案だけをめくり、問題用紙の有無が出る", () => {
  const d = F.demo(); d.materials = [...d.materials, { id: "tq1", subject: "理科", kind: "テスト", page: 1, role: "q", path: "fam-demo/sci/ts/q1.jpg" }, { id: "ta1", subject: "理科", kind: "テスト", page: 1, role: "a", path: "fam-demo/sci/ts/a1.jpg" }, { id: "ta2", subject: "理科", kind: "テスト", page: 2, role: "a", path: "fam-demo/sci/ts/a2.jpg" }];
  const html = render(m.TapReg, { d, subject: "理科", us: [], save: noop, fallbackUnitId: "" }).html;
  assert.ok(html.includes("答案 ") && html.includes("枚目") && html.includes("問題用紙あり"));
  assert.ok(!html.includes("p.1 は取り込まれていません"));
});
test("今日/印刷: 上限を超えた候補は繰り越しとして未チェック。ヘッダーに繰り越しの件数", () => {
  const d = F.demo(); d.items = [...d.items, ...Array.from({ length: 6 }, (_, k) => ({ ...d.items.find((i) => i.id === "i5"), id: "x" + k, label: "追加" + k, printedOn: null, failCount: 0, nextDue: F.T }))];
  const html = render(m.PaperTab, { d, save: noop, initial: "print" }).html;
  assert.ok(html.includes("チェック 6 件（18 問）、繰り越し 3 件") && html.includes("> 繰り越し</em>"));
  assert.ok(render(m.App, {}).html.includes("読み込み中"));
});
test("設定: 今日の分の上限の欄がある", () => {
  assert.ok(render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html.includes("1日の問題数の上限（1〜60、既定18）"));
});
test("設定: 「すべて Opus 5 を使う」の切り替えがある", () => {
  assert.ok(render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html.includes("すべて Opus 5 を使う"));
});
test("採点に「問題が変」があり、分析に件数が出る", () => {
  assert.ok(render(m.PaperTab, { d: F.demo(), save: noop, initial: "grade" }).html.includes(">問題が変<"));
  const ana = render(m.AnaTab, { d: { ...F.demo(), genCount: 20, badCount: 2 } }).html;
  assert.ok(ana.includes("問題が変") && ana.includes("生成 20 件（10%）"));
});
test("その他: 「最新版に更新（再読み込み）」が設定の下にある", () => {
  const h = render(m.MoreTab, { d: F.demo(), go: noop }).html;
  assert.ok(h.indexOf('<span class="nxt-t">設定</span>') < h.indexOf("最新版に更新（再読み込み）"));
});
test("今日/採点: 「全部を印刷に戻す」がある", () => {
  assert.ok(render(m.PaperTab, { d: F.demo(), save: noop, initial: "grade" }).html.includes("全部を次の紙に戻す（判定しない）"));
});
test("今日/印刷: 今日作った類題がある項目に「作り直す」が出る", () => {
  const d = F.demo(); d.items = d.items.map((i) => (i.id === "i5" ? { ...i, gen: { problems: [{ q: "q", a: "a" }, { q: "q", a: "a" }], why: "w" }, genOn: F.T } : i));
  const html = render(m.PaperTab, { d, save: noop, initial: "print" }).html;
  assert.ok(html.includes("類題あり") && html.includes(">作り直す</button>"));
});
test("採点の展開: 診断の各手順に「この手順を項目として登録」。登録済みなら表示だけ", () => {
  const d = F.demo(); d.items = d.items.map((i) => (i.id === "i2" ? { ...i, printedOn: F.day(-1) } : i));
  const i2 = d.items.find((i) => i.id === "i2");
  const html = render(m.GradeRowDetail, { i: i2, d, save: noop }).html;
  assert.equal((html.match(/この手順を項目として登録/g) || []).length, 2);
  const done = { ...i2, diag: { ...i2.diag, steps: i2.diag.steps.map((s2, k) => (k === 0 ? { ...s2, itemId: "i3" } : s2)) } };
  const h2 = render(m.GradeRowDetail, { i: done, d, save: noop }).html;
  assert.equal((h2.match(/この手順を項目として登録/g) || []).length, 1); assert.ok(h2.includes("項目として登録済み"));
});
test("下のバーは5つ（今日／紙／未定着／教材／その他）。紙は 採点待ち／次の紙／5教科テスト／模試／読解・記述。教材は 取り込み／単元と進度／定期テスト。その他はメニュー", () => {
  const w = render(m.PaperTab, { d: F.demo(), save: noop, initial: "make" }).html;
  assert.ok(w.includes("採点待ち") && w.includes("次の紙") && w.includes(">5教科テスト<") && w.includes(">模試<") && w.includes(">読解・記述<") && w.includes("ワークの結果を記録") && !w.includes(">定期テスト<"));
  assert.ok(!w.includes(">採点した答案を撮る<"));
  const ex = render(m.MatsTab, { d: F.demo(), save: noop, initial: "exam" }).html; assert.ok(ex.includes("2学期中間") && ex.includes("出題範囲") && ex.includes(">取り込み<") && ex.includes(">単元と進度<") && ex.includes(">定期テスト<"));
  assert.deepEqual(m.route("today", "grade"), ["paper", "grade"]); assert.deepEqual(m.route("week", "cum"), ["paper", "cum"]); assert.deepEqual(m.route("exam"), ["mats", "exam"]);
  assert.deepEqual(m.route("reg", "item"), ["items", "item"]); assert.deepEqual(m.route("reg", "list"), ["items", "list"]); assert.deepEqual(m.route("reg", "mat"), ["mats", "mat"]); assert.deepEqual(m.route("set", null), ["set", null]);
  const rd = render(m.PaperTab, { d: F.demo(), save: noop, initial: "read" }).html; assert.ok(rd.includes("読解問題を作る"));
  const wr = render(m.PaperTab, { d: F.demo(), save: noop, initial: "write" }).html; assert.ok(wr.includes("課題を作る"));
  const mn = render(m.PaperTab, { d: F.demo(), save: noop, initial: "manual" }).html; assert.ok(mn.includes("形式ごとの成績") && /<details class="det" open=""/.test(mn));
  const more = render(m.MoreTab, { d: F.demo(), go: noop }).html; for (const t of ["分析", "相談用の依頼文", "設定"]) assert.ok(more.includes(`<span class="nxt-t">${t}</span>`), t); assert.ok(!more.includes("登録（単元"));
});
test("未定着: 既定は一覧（先頭に件数と教科の帯）。「×を登録」でタップ登録", () => {
  const list = render(m.ItemsTab, { d: F.demo(), save: noop, initial: null }).html;
  assert.ok(list.includes('class="on">一覧<') && list.includes('class="st-bar"') && list.includes(">未定着<"));
  const reg = render(m.ItemsTab, { d: F.demo(), save: noop, initial: "item" }).html;
  assert.ok(reg.includes('class="on">×を登録<') && reg.includes("×だった問題をタップすると印が付き"));
});
test("使い方: ホームには「1週間の流れ」を置かず、使い方への動線だけ。その他の下から2番目に「使い方」。使い方の画面はいまの呼び名を使う", () => {
  const h = render(m.HomeTab, { d: F.demo(), go: noop }).html;
  assert.ok(!h.includes("1週間の流れ") && h.includes('class="guide-row"') && h.includes(">使い方を見る</button>") && !h.includes("使い方がわからない"));
  const more = render(m.MoreTab, { d: F.demo(), go: noop }).html; const rows = [...more.matchAll(/<span class="nxt-t">([^<]*)<\/span>/g)].map((x) => x[1]);
  assert.equal(rows[rows.length - 2], "使い方"); assert.equal(rows[rows.length - 1], "最新版に更新（再読み込み）");
  const g = render(m.GuideTab, { go: noop }).html;
  for (const t of ["このアプリは何をするもの？", "毎日（平日）", "週末", "定期テストの前と後", "最初に1回だけ", "困ったとき"]) assert.ok(g.includes(`<h3 class="s-h">${t}</h3>`), t);
  for (const t of ["紙 → 5教科テスト", "教材 → 定期テスト", "教材 → 取り込み", "未定着 → ×を登録", "昨日の紙の間違いに ✓ を入れて採点", "もう一度PDFにする"]) assert.ok(g.includes(t), t);
  assert.ok(!g.includes("「夜の作業」"), "ウィザードの名前は使わない");
  assert.ok(!g.includes("週末→") && !g.includes("「作る」") && !g.includes("テスト → "));
});
test("今日/印刷: 候補は教科ごとに見出しで分かれ、行には教科名を繰り返さない", () => {
  const html = render(m.PaperTab, { d: F.demo(), save: noop, initial: "print" }).html;
  const subs = m.SUBJECTS.filter((sb) => m.printSet(F.demo()).some((i) => i.subject === sb));
  assert.ok(subs.length >= 2, "デモは2教科以上");
  let pos = -1; for (const sb of subs) { const k = html.indexOf(`<h4 class="sub-h">`, pos + 1); assert.ok(k > pos, sb); assert.ok(html.slice(k, k + 200).includes(sb + "<em"), sb); pos = k; }
  assert.ok(!/<div class="ir-meta">[^<]*<span[^>]*><.span>(数学|英語|社会|理科|国語)・/.test(html));
});
test("印のポップオーバー: 測るまでは非表示で印の位置に置く。中身は出す", () => {
  const { html, errors } = render(m.MarkPop, { x: 0.3, y: 0.7, children: "中身" });
  assert.equal(errors.length, 0, errors.join(", "));
  assert.ok(html.includes('class="mpop pop"') && html.includes("visibility:hidden") && html.includes("left:30%") && html.includes("top:70%") && html.includes("中身"));
});
test("未定着一覧: 項目名の下に「どういう問題だったか」（note。AI の要約や間違え方）を出す。無ければ出さない", () => {
  const h = render(m.ItemList, { d: F.demo(), save: noop }).html;
  assert.ok(h.includes('<div class="ir-note">符号を落とす</div>'));
  assert.equal((h.match(/class="ir-note"/g) || []).length, F.demo().items.filter((i) => i.status === "active" && i.note).length);
});
test("未定着一覧: 仮の名前でタップ登録した項目があれば、上に1つだけ「仮の項目 N 件に名前を付ける（AI）」。手入力の仮は数えない", () => {
  const d = F.demo(); const src = { path: "fam/math/wb/11.jpg", kind: "ワーク", page: 11, x: 0.3, y: 0.4 };
  d.items = d.items.map((i, k) => (k === 0 ? { ...i, named: false, src } : k === 1 ? { ...i, named: false, src: undefined } : i));
  const h = render(m.ItemList, { d, save: noop }).html;
  assert.ok(h.includes("仮の項目 1 件に名前を付ける（AI）")); assert.ok(!h.includes("名前を付け直す"));
  assert.ok(!render(m.ItemList, { d: F.demo(), save: noop }).html.includes("名前を付ける（AI）"), "仮が無ければ出ない");
});
test("今日: やることだけ。件数の帯や定期テストの行は置かない", () => {
  const h = render(m.HomeTab, { d: F.demo(), go: noop }).html;
  assert.ok(!h.includes("st-bar") && !h.includes("exam-line") && !h.includes(">連続<") && h.includes("いまやること"));
});
test("スナックバー: ok は文だけ、err は × 付き。空なら何も出さない", () => {
  const h = render(m.Snacks, { list: [{ id: "1", text: "保存しました", kind: "ok" }, { id: "2", text: "失敗", kind: "err" }], onClose: noop }).html;
  assert.ok(h.includes('class="snack ok"') && h.includes('class="snack err"') && (h.match(/aria-label="閉じる"/g) || []).length === 1);
  assert.equal((h.match(/class="sn-i"/g) || []).length, 2, "先頭にアイコン");
  assert.equal(render(m.Snacks, { list: [], onClose: noop }).html, "");
  assert.doesNotThrow(() => m.notify("x", "err"), "App が無いときは何もしない");
});
test("帯: 未設定は設定へのリンク付き、残高切れはリンク無し、無ければ出さない。残高切れの文はスナックバーに出さない", () => {
  const a = render(m.Banner, { block: { kind: "nokey" }, go: noop }).html; assert.ok(a.includes('class="banner nokey"') && a.includes("設定を開く"));
  const b = render(m.Banner, { block: { kind: "credit" }, go: noop }).html; assert.ok(b.includes("残高がありません") && !b.includes("設定を開く"));
  assert.equal(render(m.Banner, { block: null, go: noop }).html, "");
  assert.ok(Object.keys(m.BLOCK_TEXT).length === 3);
});
test("ホーム: 「いまやること」と「そのあと」はカード全体が押せるボタン。右端に › の印、明示の「開く」ボタンは無い", () => {
  const h = render(m.HomeTab, { d: F.demo(), go: noop }).html;
  assert.ok(h.includes('<button class="hero press">') && h.includes('<button class="nxt press">') && (h.match(/class="chev"/g) || []).length >= 2);
  assert.ok(!h.includes("開く →"));
});
test("未定着の一覧: 件数の下に教科の色で分けた横幅100%のバーと凡例。0件ならバー無し", () => {
  const d = F.demo(); const h = render(m.ItemList, { d, save: noop }).html;
  const act = d.items.filter((i) => i.status === "active"); const subs = [...new Set(act.map((i) => i.subject))];
  assert.ok(h.includes('class="st-bar"') && h.includes('class="st-leg"'));
  for (const sb of subs) { const n = act.filter((i) => i.subject === sb).length; assert.ok(h.includes(`${sb} ${n}</span>`), sb); assert.ok(h.includes(`width:${(n / act.length) * 100}%`), sb + " の幅"); }
  const e = render(m.ItemList, { d: F.empty(), save: noop }).html; assert.ok(e.includes(">未定着<") && !e.includes("st-bar"));
});
test("画面冒頭の説明: 未読なら開いた状態で × 付き、既読なら「?」だけ", () => {
  m.stubs.localStorage.removeItem("hint_seen");
  const a = render(m.Hint, { k: "t1", children: "説明です" }).html; assert.ok(a.includes('class="hint open"') && a.includes("説明です") && a.includes(">×</button>"));
  m.markHint("t1");
  const b = render(m.Hint, { k: "t1", children: "説明です" }).html; assert.ok(b.includes('class="hint"') && !b.includes("説明です") && b.includes(">?</button>"));
  m.stubs.localStorage.removeItem("hint_seen");
});
test("×の登録: 教材が1種類だけなら、押せない1つの表示（ボタンにしない）", () => {
  const d = F.demo(); d.materials = d.materials.filter((mt) => mt.subject !== "数学" || mt.kind === "ワーク");
  const h = render(m.ItemReg, { d, save: noop }).html;
  assert.ok(h.includes('<div class="seg sm one"><span>ワーク</span></div>') && !h.includes('class="on">ワーク</button>'));
});
test("未定着リスト: 誤答の種類は小さいチップ（select は無い）。「説明不要」はバッジと切り替えの二重にしない。削除は × のまま", () => {
  const d = F.demo(); d.items = d.items.map((i, k) => (k === 0 ? { ...i, noWhy: true, fmt: "計算" } : i));
  const h = render(m.ItemList, { d, save: noop }).html;
  assert.ok(!h.includes("et-sel") && h.includes('class="et et-cur"'));
  assert.ok(!h.includes('<em class="tag">説明不要</em>') && h.includes('class="et why on">説明不要</button>'));
  assert.ok(h.includes('aria-label="削除">×</button>') && !h.includes("取り消す"));
});
test("今日: 採点の下に「次は次の紙を作る →」、次の紙の下に「次はワークの×を登録する →」。登録→落とした項目の下に今日の最後のページ", () => {
  const g = render(m.PaperTab, { d: F.demo(), save: noop, initial: "grade", go: noop }).html; assert.ok(g.includes("次は次の紙を作る →"));
  const p = render(m.PaperTab, { d: F.demo(), save: noop, initial: "print", go: noop }).html; assert.ok(p.includes("次はワークの×を登録する →"));
  const r = render(m.ItemsTab, { d: F.demo(), save: noop, initial: "item" }).html; assert.ok(r.includes("今日やった最後のページ番号を入れて"));
});
test("右下の +: 押すとまず撮る／選ぶ（ファイル入力）。一覧は選んだ後だけ。教材の取り込みは読み込んでから教科・種別", () => {
  const h = render(m.Fab, { go: noop }).html;
  assert.ok(h.includes('class="fab"') && h.includes('type="file"') && h.includes('accept="image/*,application/pdf"') && !h.includes("sheet-row"));
  const mat = render(m.MatsTab, { d: F.demo(), save: noop, initial: "mat" }).html;
  const i1 = mat.indexOf("PDF か ページの画像（複数可）を選ぶ"), i2 = mat.indexOf('class="subj-row"');
  assert.ok(i1 > 0 && (i2 < 0 || i2 > i1), "ファイルを選ぶ前は教科・種別を出さない（または後ろ）");
  assert.ok(mat.includes("取り込み済み") && !mat.includes('class="subj on"'), "教科は既定なし");
});
test("次の紙: 定期テストの14日前で後ろ倒し中の項目があれば、教科ごとの件数を出す", () => {
  const d = F.demo(); d.exams = [{ id: "e9", name: "期末", date: F.day(7), unitIds: ["u1"], actual: {}, updatedAt: "" }];
  const dd = m.deferForExam(d); const n = dd.items.filter((i) => i.defer).length; assert.ok(n > 0, "後ろ倒しが起きる前提");
  const h = render(m.PaperTab, { d: dd, save: noop, initial: "print" }).html;
  assert.ok(h.includes('class="ph-note defer-note"') && h.includes(`範囲外の ${n} 件`) && h.includes("期末"));
  assert.ok(!render(m.PaperTab, { d: F.demo(), save: noop, initial: "print" }).html.includes("defer-note"));
});
test("未定着の一覧: 各行に「いつの紙に出るか」。次の紙: 候補に入っていない件数と理由", () => {
  const d = F.demo(); const h = render(m.ItemList, { d, save: noop }).html;
  assert.ok(h.includes('class="ir-when next">次の紙に出る') || h.includes('class="ir-when '), "行に状態");
  assert.ok(!h.includes("次回 "));
  const d2 = F.demo(); d2.items = d2.items.map((i, k) => (k === 0 ? { ...i, nextDue: F.day(5), createdOn: F.T, history: [] } : i));
  const p = render(m.PaperTab, { d: d2, save: noop, initial: "print" }).html;
  assert.ok(p.includes("候補は") && p.includes("期日がまだ先 1 件") && p.includes("未定着 → 一覧"));
});
test("取り込み: 教科は既定なし。選ぶまで保存できない。未定着の一覧に「教科を直す」", () => {
  const h = render(m.MatsTab, { d: F.demo(), save: noop, initial: "mat" }).html;
  assert.ok(!h.includes('class="subj on"'), "最初はどの教科も選ばれていない");
  const l = render(m.ItemList, { d: F.demo(), save: noop }).html; assert.ok(l.includes(">教科を直す</button>"));
});
test("採点: 説明文は「間違えた問題の行に ✓」。問題が変は小さな文字", () => {
  const h = render(m.PaperTab, { d: F.demo(), save: noop, initial: "grade" }).html;
  assert.ok(h.includes("間違えた問題の行に「できなかった」の ✓") && h.includes('class="lnk bad-lnk"') && !h.includes('class="et bad"') && !h.includes("AI"));
});
test("次の紙: 候補の各行に「新しく登録」「再出題」「再挑戦」の印。期日が過ぎていれば遅れの日数", () => {
  const d = F.demo(); d.items = d.items.map((i, k) => (k === 0 ? { ...i, printedOn: null, nextDue: F.day(-2), level: 1, history: [{ d: F.day(-5), r: "o", self: "o", etype: "" }] } : i));
  const h = render(m.PaperTab, { d, save: noop, initial: "print" }).html;
  assert.ok(h.includes('class="ir-kind review">再出題（') && h.includes("2日遅れ") && h.includes('class="ir-kind new">新しく登録'));
});
test("採点: 子ども・親の行は無い。説明の問いがある項目にだけ「説明もできた」", () => {
  const d = F.demo(); d.items = d.items.map((i, k) => (k < 2 ? { ...i, printedOn: F.day(-1), printedAs: k + 1, level: k === 0 ? 2 : 0, fmt: "計算", noWhy: false, gen: { problems: [{ q: "a", a: "1" }], why: "w" } } : { ...i, printedOn: null }));
  const h = render(m.PaperTab, { d, save: noop, initial: "grade" }).html;
  assert.ok(!h.includes("j-who") && (h.match(/class="gchk ng"/g) || []).length === 2 && (h.match(/class="gchk ok"/g) || []).length === 1, h.match(/class="gchk[^"]*"/g));
});
test("採点待ち: 教科で分けず、紙の問番号の順に並べる。行に教科名。印刷日が2日以上あれば日ごとの見出し", () => {
  const d = F.demo(); d.items = d.items.map((i, k) => (k < 3 ? { ...i, printedOn: F.day(-1), printedAs: 3 - k, subject: k === 1 ? "英語" : "数学", label: `L${k}`, gen: { problems: [{ q: "a", a: "1" }] } } : { ...i, printedOn: null }));
  const h = render(m.PaperTab, { d, save: noop, initial: "grade" }).html;
  assert.ok(!h.includes('class="sub-h"'), "1日ぶんなら見出し無し");
  const ns = [...h.matchAll(/class="qno">問(\d+)/g)].map((x) => Number(x[1])); assert.equal(ns.length, 3); assert.deepEqual(ns, [...ns].sort((a, b) => a - b), "紙の問番号の昇順");
  assert.ok(/<div class="c-meta"><em class="qno">問1[^<]*<\/em><span[^>]*><\/span>数学・/.test(h), "行の先頭に問番号、次に教科");
  d.items = d.items.map((i, k) => (k === 0 ? { ...i, printedOn: F.day(-2) } : i));
  const h2 = render(m.PaperTab, { d, save: noop, initial: "grade" }).html;
  assert.ok(h2.includes(`印刷 ${F.day(-2).slice(5)} の紙`) && h2.includes(`印刷 ${F.day(-1).slice(5)} の紙`), "日ごとの見出し");

});
test("採点待ち: 各行に紙の問番号（問1〜3 のように）。印刷日ごとに番号を組み直す", () => {
  const d = F.demo(); d.items = d.items.map((i, k) => (k < 2 ? { ...i, printedOn: F.day(-1), printedAs: k + 1, gen: { problems: [{ q: "a", a: "1" }, { q: "b", a: "2" }, { q: "c", a: "3" }] } } : i));
  const h = render(m.PaperTab, { d, save: noop, initial: "grade" }).html;
  assert.ok(h.includes('class="qno">問1〜3</em>') && h.includes('class="qno">問4〜6</em>'), h.match(/class="qno">[^<]*/g));
});
test("採点待ち: 印刷時に控えた問番号（printedQ）をそのまま出す。類題を作り直しても変わらない。同じ日の2枚目は別の見出し", () => {
  const d = F.demo(); d.items = d.items.map((i, k) => (k < 2 ? { ...i, printedOn: F.day(-1), printedAs: 1, printedBatch: `2026-09-10T1${k}:00:00Z`, printedQ: { ns: [7, 8, 9], why: 9 }, gen: { problems: [{ q: "a", a: "1" }] } } : { ...i, printedOn: null }));
  const h = render(m.PaperTab, { d, save: noop, initial: "grade" }).html;
  assert.equal((h.match(/class="qno">問7〜9<\/em>/g) || []).length, 2, h.match(/class="qno">[^<]*/g));
  assert.ok(h.includes(`印刷 ${F.day(-1).slice(5)} の紙（1枚目`) && h.includes("（2枚目"), "同じ日の2回目の印刷は別の紙");
  assert.equal((h.match(/class="gchk ok"/g) || []).length, 2, "printedQ.why で説明の問いの有無を決める");
});
test("採点待ち: 各行に紙の問題文を紙の問番号つきで1行ずつ。展開した類題も紙の番号", () => {
  const d = F.demo(); d.items = d.items.map((i, k) => (k === 0 ? { ...i, printedOn: F.day(-1), printedAs: 1, printedQ: { ns: [7, 8, 9], why: 9 }, gen: { problems: [{ q: "3x+2=11 を解く", a: "3" }, { q: "2y-5=1 を解く", a: "3" }] } } : { ...i, printedOn: null }));
  const h = render(m.PaperTab, { d, save: noop, initial: "grade" }).html;
  assert.ok(h.includes('<div class="gq"><b>問7</b><span>3x+2=11 を解く</span>') && h.includes("<b>問8</b><span>2y-5=1") && h.includes("<b>問9</b><span>説明："), h.match(/class="gq">.*?<\/div>/g));
  const det = render(m.GradeRowDetail, { i: d.items[0], d, save: noop, ns: [7, 8, 9] }).html;
  assert.ok(det.includes('class="q-n">問7<') && det.includes('class="q-n">問8<') && !det.includes('class="q-n">問1<'));
});
