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
  ["今日/既定", m.TodayTab, { d, save: noop, initial: null }],
  ["テスト/作る", m.WeekTab, { d, save: noop, initial: "make" }],
  ["テスト/読解", m.WeekTab, { d, save: noop, initial: "read" }],
  ["テスト/記述", m.WeekTab, { d, save: noop, initial: "write" }],
  ["テスト/手入力", m.WeekTab, { d, save: noop, initial: "manual" }],
  ["テスト/模試", m.WeekTab, { d, save: noop, initial: "mock" }],
  ["テスト/模試(教科指定)", m.WeekTab, { d, save: noop, initial: "mock:数学" }],
  ["テスト/既定", m.WeekTab, { d, save: noop, initial: null }],
  ["テスト/定期", m.WeekTab, { d, save: noop, initial: "exam" }],
  ["その他", m.MoreTab, { d, go: noop }],
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
  assert.ok(render(m.AnaTab, { d: F.empty() }).html.includes("まだ30日以上あけた再出題がありません"));
});
test("デモ: 今日/採点 に昨日印刷した項目が並び、既定は採点。今日/印刷 には未印刷の期日項目", () => {
  const g = render(m.TodayTab, { d: F.demo(), save: noop, initial: null }).html;
  assert.ok(g.includes("負の数のかけ算") && g.includes("まとめて確定") && g.includes("やっていない"));
  assert.ok(!g.includes("指示語の内容を答える"), "未印刷の項目は採点に出ない");
  const p = render(m.TodayTab, { d: F.demo(), save: noop, initial: "print" }).html;
  assert.ok(p.includes("指示語の内容を答える") && p.includes("六大陸の名前") && p.includes("この内容で作る（3件"), (p.match(/この内容で作る[^<]*/) || [])[0]);
  assert.ok(p.includes("チェック 3 件（9 問）、繰り越し 0 件") && p.includes('type="checkbox" checked=""'));
  assert.ok(!p.includes('ir-label">負の数のかけ算'), "印刷済みは印刷に出ない");
  assert.ok(p.includes("採点待ちの分をもう一度PDFにする"));
});
test("デモ: ホームは「夜の作業」が先頭で、その中身（採点・印刷・×登録）は別の行に並べない", () => {
  const { A } = m.nextActions(F.demo());
  const ks = A.map((a) => a.k);
  assert.equal(ks[0], "night");
  for (const k of ["mark", "print", "wb", "today", "confirm"]) assert.ok(!ks.includes(k), k + " は並べない");
  assert.ok(A[0].why.includes("採点 1 件") && A[0].why.includes("明日の分 3 件"));
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
  assert.ok(html.includes("×だった問題をタップすると印が付き") && html.includes("手で1つ追加"));
  assert.ok(html.includes("2倍") && html.includes("3倍"), "拡大の切り替え");
  assert.ok(!html.includes("答案の写真から"), "写真から候補を出す方式は無い");
  const e = render(m.RegTab, { d: F.empty(), save: noop, initial: "item" }).html;
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
  const { html } = render(m.RegTab, { d: F.demo(), save: noop, initial: "list" });
  assert.ok(html.includes("et-sel") && html.includes("ワーク p.11"));
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
test("バージョンは「その他」の更新ボタンに出る。形式は日時。設定には出さない", () => {
  assert.match(m.VERSION, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  assert.ok(render(m.MoreTab, { d: F.demo(), go: noop }).html.includes("v" + m.VERSION));
  assert.ok(!render(m.Settings, { d: F.demo(), save: noop, setSync: noop }).html.includes("v" + m.VERSION));
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
  const html = render(m.MakePapers, { d: F.demo(), save: noop, initialKind: "累積" }).html;
  assert.ok(/class="on">累積</.test(html) && !/class="on">週次</.test(html));
  assert.ok(/class="on">週次</.test(render(m.MakePapers, { d: F.demo(), save: noop }).html));
  assert.ok(/class="on">累積</.test(render(m.WeekTab, { d: F.demo(), save: noop, initial: "cum" }).html));
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
test("用紙の行: 模試の答案を撮る欄と、用紙の説明に「1回きり」が出る", () => {
  const d = F.demo(); const mk = { id: "mkx", kind: "模試", subject: "数学", date: F.T, code: "0910数模", examId: "e1", examName: "2学期中間", round: 14, minutes: 50, maxScore: 100, questions: [{ n: 1, q: "q", a: "a", fmt: "計算", pts: 100, label: "L", unitId: "u1", aim: "", svg: "", sec: "【1】用語" }], unitIds: ["u1"], imgs: [], status: "printed", updatedAt: F.ts(0) };
  d.papers.push(mk);
  const g = render(m.PaperGrade, { p: mk, d, save: noop }).html;
  assert.ok(g.includes("この用紙の答案を撮る（0910数模）"));
  const ps = render(m.PrintSheet, { paper: mk }).html;
  assert.ok(ps.includes("1回きり") && ps.includes("模試（2学期中間）"));
});
test("今日/採点: 「紙を撮る」があり、紙の順番が出る", () => {
  const html = render(m.TodayTab, { d: F.demo(), save: noop, initial: "grade" }).html;
  assert.ok(html.includes("紙を撮る（○×の欄を読み取る") && html.includes("紙の1番目"));
});
for (const [state, make] of Object.entries(STATES)) for (let st = 0; st < 4; st++) test(`描画: 夜の作業 ${st + 1}/4（${state}）`, () => {
  m.nightSave(st);
  try { const { html, errors } = render(m.NightFlow, { d: make(), save: noop, go: noop });
    assert.equal(errors.length, 0, errors.join(", "));
    assert.ok(!html.includes(`夜の作業 ${st + 1}/4`) && html.includes(`<strong>${m.NIGHT_STEPS[st][1]}</strong>`) && html.includes(st < 3 ? "次へ：" : "終わる"), "「夜の作業 N/4」の小さな表記は出さず、段階名を見出しに");
    assert.equal(html.includes("に戻る"), m.nightPrev(make(), st) >= 0, "戻る先はやることがある段階だけ");
    for (const bad of ["undefined", "NaN"]) assert.ok(!html.includes(bad));
  } finally { m.nightSave(null); }
});
test("最後のページ: 取り込んだ教科・教材ごとに1行。済みの数と最後のページ", () => {
  const html = render(m.LastPageStep, { d: F.demo(), save: noop }).html;
  assert.ok(html.includes("数学のワーク") && html.includes("済 1/3（p.10 まで）") && html.includes("数学の教科書") && html.includes("英語の教科書"));
  assert.ok(!html.includes("数学のテスト"));
  assert.ok(render(m.LastPageStep, { d: F.empty(), save: noop }).html.includes("取り込んだ教科がありません"));
});
test("ホーム: 採点待ちの類題があれば「今日の分を印刷する（PDFだけ）」が出る。無ければ出ない", () => {
  assert.ok(render(m.HomeTab, { d: F.demo(), go: noop }).html.includes("今日の分を印刷する（1件・PDFだけ）"));
  assert.ok(!render(m.HomeTab, { d: F.empty(), go: noop }).html.includes("PDFだけ"));
  assert.equal(render(m.MorningPrint, { d: F.empty() }).html, "");
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
  const w = render(m.WeekTab, { d, save: noop, initial: null }).html;
  assert.ok(!w.includes("採点した答案を撮る") && w.includes(">作る<"));
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
  const list = render(m.RegTab, { d, save: noop, initial: "list" }).html;
  assert.ok(list.includes(">説明不要<") && list.includes(">説明あり<") && list.includes('class="tag">説明不要'));
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
  const html = render(m.TodayTab, { d, save: noop, initial: "print" }).html;
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
  assert.ok(render(m.TodayTab, { d: F.demo(), save: noop, initial: "grade" }).html.includes(">問題が変<"));
  const ana = render(m.AnaTab, { d: { ...F.demo(), genCount: 20, badCount: 2 } }).html;
  assert.ok(ana.includes("問題が変") && ana.includes("生成 20 件（10%）"));
});
test("その他: 「最新版に更新（再読み込み）」が設定の下にある", () => {
  const h = render(m.MoreTab, { d: F.demo(), go: noop }).html;
  assert.ok(h.indexOf('<span class="nxt-t">設定</span>') < h.indexOf("最新版に更新（再読み込み）"));
});
test("今日/採点: 「全部を印刷に戻す」がある", () => {
  assert.ok(render(m.TodayTab, { d: F.demo(), save: noop, initial: "grade" }).html.includes("全部を印刷に戻す（判定しない）"));
});
test("今日/印刷: 今日作った類題がある項目に「作り直す」が出る", () => {
  const d = F.demo(); d.items = d.items.map((i) => (i.id === "i5" ? { ...i, gen: { problems: [{ q: "q", a: "a" }, { q: "q", a: "a" }], why: "w" }, genOn: F.T } : i));
  const html = render(m.TodayTab, { d, save: noop, initial: "print" }).html;
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
test("下のバーは3つ。週末に作る／定期／模試／読解・記述。手入力は作るの下。その他はメニュー", () => {
  const w = render(m.WeekTab, { d: F.demo(), save: noop, initial: null }).html;
  assert.ok(w.includes(">作る<") && w.includes(">定期<") && w.includes(">模試<") && w.includes(">読解・記述<") && w.includes("手入力（学校のワークや問題集の結果）"));
  assert.ok(!w.includes(">採点した答案を撮る<"));
  const ex = render(m.WeekTab, { d: F.demo(), save: noop, initial: "exam" }).html; assert.ok(ex.includes("2学期中間") && ex.includes("出題範囲"));
  const rd = render(m.WeekTab, { d: F.demo(), save: noop, initial: "read" }).html; assert.ok(rd.includes("読解問題を作る"));
  const wr = render(m.WeekTab, { d: F.demo(), save: noop, initial: "write" }).html; assert.ok(wr.includes("課題を作る"));
  const mn = render(m.WeekTab, { d: F.demo(), save: noop, initial: "manual" }).html; assert.ok(mn.includes("形式ごとの成績") && /<details class="det" open=""/.test(mn));
  const more = render(m.MoreTab, { d: F.demo(), go: noop }).html; for (const t of ["登録", "分析", "依頼文", "設定"]) assert.ok(more.includes(`<span class="nxt-t">${t}</span>`), t);
});
test("その他→登録: 落とした項目（タップ）が既定で開き、メニューにも書いてある", () => {
  assert.ok(render(m.MoreTab, { d: F.demo(), go: noop }).html.includes("落とした項目（ページをタップして登録"));
  const reg = render(m.RegTab, { d: F.demo(), save: noop, initial: null }).html;
  assert.ok(reg.includes('class="on">落とした項目（タップ）') && reg.includes("×だった問題をタップすると印が付き"));
});
test("夜の作業の進み具合は番号つきのステップ表示（ボタンではない）", () => {
  m.nightSave(1);
  try { const html = render(m.NightFlow, { d: F.demo(), save: noop, go: noop }).html;
    assert.ok(html.includes('<ol class="steps"') && html.includes('<li class="done">') && html.includes('<li class="on">') && html.includes("✓"));
    assert.ok(!html.includes("night-steps")); }
  finally { m.nightSave(null); }
});
test("ホーム/1週間の流れ: 7行で、いまの画面の呼び名（週末・その他）を使う", () => {
  const h = render(m.HomeTab, { d: F.demo(), go: noop }).html;
  for (const t of ["平日・子ども", "平日・親（夜5分）", "土曜", "日曜", "定期テスト前（14日前から）", "返却時", "週1"]) assert.ok(h.includes(`<b>${t}</b>`), t);
  assert.ok(h.includes("「週末→作る」") && h.includes("「週末→模試」") && h.includes("「その他→登録→教材」") && h.includes("「その他→依頼文」") && h.includes("「週末→定期」"));
  assert.ok(!h.includes("「定期」で実点") && !h.includes("「登録」で答案"));
});
test("夜の作業: やることが無い段階は飛ばす。空のデータなら最初から「明日の分」、次へは実際の行き先", () => {
  m.nightSave(null);
  const e = render(m.NightFlow, { d: F.empty(), save: noop, go: noop }).html;
  assert.ok(e.includes("<strong>明日の分</strong>") && e.includes("終わる") && !e.includes("に戻る"));
  assert.equal((e.match(/<li class="skip past">/g) || []).length, 3, "飛ばして通過した段階は線を緑にするため past を付ける");
  const d = F.demo(); const h = render(m.NightFlow, { d, save: noop, go: noop }).html;
  assert.ok(h.includes("<strong>採点</strong>") && h.includes("次へ：×の登録 →"));
  const noMat = { ...d, materials: [] }; const h2 = render(m.NightFlow, { d: noMat, save: noop, go: noop }).html;
  assert.ok(h2.includes("<strong>採点</strong>") && h2.includes("次へ：明日の分 →") && (h2.match(/<li class="skip">/g) || []).length === 2, "まだ通過していない飛ばす段階は skip だけ");
  m.nightSave(2);
  try { const h3 = render(m.NightFlow, { d: noMat, save: noop, go: noop }).html; assert.ok(h3.includes("<strong>最後のページ</strong>") && h3.includes("← 採点に戻る"), "途中保存は尊重し、戻る先は飛ばした段階を越える"); }
  finally { m.nightSave(null); }
});
test("今日/印刷: 候補は教科ごとに見出しで分かれ、行には教科名を繰り返さない", () => {
  const html = render(m.TodayTab, { d: F.demo(), save: noop, initial: "print" }).html;
  const subs = m.SUBJECTS.filter((sb) => m.printSet(F.demo()).some((i) => i.subject === sb));
  assert.ok(subs.length >= 2, "デモは2教科以上");
  let pos = -1; for (const sb of subs) { const k = html.indexOf(`<h4 class="sub-h">`, pos + 1); assert.ok(k > pos, sb); assert.ok(html.slice(k, k + 200).includes(sb + "<em"), sb); pos = k; }
  assert.ok(!/<div class="ir-meta">[^<]*<span[^>]*><.span>(数学|英語|社会|理科|国語)・/.test(html));
});
