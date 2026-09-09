/* 中核ロジックの単体テスト: applyJudgment, retention, migrate, mergeData, paperHTML, pickUnits */
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./load.js");
const { fixtures, TINY_JPEG } = require("./fixtures.js");

const m = load();
const F = fixtures(m);
const T = F.T, day = F.day;
const item = (o = {}) => ({ id: "x", subject: "数学", unitId: "u1", label: "テスト項目", fmt: "計算", level: 0, failCount: 0, nextDue: T, status: "active", history: [], gen: null, pending: null, updatedAt: "", ...o });

describe("applyJudgment（間隔反復の核）", () => {
  test("× は level 0 に戻り、failCount が増え、翌日に再出題、類題は捨てる", () => {
    const r = m.applyJudgment(item({ level: 3, failCount: 1, gen: { problems: [] } }), "x");
    assert.equal(r.level, 0); assert.equal(r.failCount, 2); assert.equal(r.nextDue, day(1)); assert.equal(r.status, "active"); assert.equal(r.gen, null);
  });
  test("○ は 1→3→7→14 と伸びる", () => {
    let i = item(); const due = [];
    for (let k = 0; k < 3; k++) { i = m.applyJudgment(i, "o"); due.push(i.nextDue); }
    assert.deepEqual([i.level, due], [3, [day(3), day(7), day(14)]]);
  });
  test("「解けた」だけでは level 3（14日）から先に進まない", () => {
    const r = m.applyJudgment(item({ level: 3 }), "o");
    assert.equal(r.level, 3); assert.equal(r.nextDue, day(14)); assert.equal(r.status, "active");
  });
  test("「説明もできた」で level 4（30日）へ進み、安定になる", () => {
    const r = m.applyJudgment(item({ level: 3 }), "oo");
    assert.equal(r.level, 4); assert.equal(r.nextDue, day(30)); assert.equal(r.status, "stable");
  });
  test("用語は ○ だけで先へ進める", () => {
    const r = m.applyJudgment(item({ level: 3, fmt: "知識・用語" }), "o");
    assert.equal(r.level, 4); assert.equal(r.status, "stable");
  });
  test("上限は 60日（level 5）で止まる", () => {
    const r = m.applyJudgment(item({ level: 5, status: "stable" }), "oo");
    assert.equal(r.level, 5); assert.equal(r.nextDue, day(60));
  });
  test("安定していても × で 1日に戻り、項目は消えない", () => {
    const r = m.applyJudgment(item({ level: 5, status: "stable", failCount: 0 }), "x");
    assert.equal(r.status, "active"); assert.equal(r.level, 0); assert.equal(r.nextDue, day(1)); assert.equal(r.id, "x");
  });
  test("○ のとき類題は残る", () => {
    const g = { problems: [{ q: "q", a: "a" }] };
    assert.equal(m.applyJudgment(item({ gen: g }), "o").gen, g);
  });
  test("level/failCount が無い旧項目でも動く", () => {
    const r = m.applyJudgment({ id: "y", fmt: "計算" }, "o");
    assert.equal(r.level, 1); assert.equal(r.failCount, 0);
  });
});

describe("retention（30日以上あけた再出題の正答率）", () => {
  const h = (pairs) => ({ history: pairs.map(([n, r]) => ({ d: day(n), r })) });
  test("何もなければ 0/0、rate は null", () => assert.deepEqual(m.retention([]), { c: 0, t: 0, rate: null }));
  test("30日未満の間隔は数えない", () => assert.deepEqual(m.retention([h([[-40, "x"], [-20, "o"], [-1, "o"]])]), { c: 0, t: 0, rate: null }));
  test("30日ちょうどは数える", () => assert.deepEqual(m.retention([h([[-31, "x"], [-1, "o"]])]), { c: 1, t: 1, rate: 100 }));
  test("× は失敗、oo は正解として数える", () => {
    assert.deepEqual(m.retention([h([[-70, "o"], [-35, "x"], [-1, "oo"]])]), { c: 1, t: 2, rate: 50 });
  });
  test("複数項目を合算する。history が無い項目も落ちない", () => {
    const r = m.retention([h([[-40, "x"], [-5, "o"]]), h([[-40, "o"], [-5, "x"]]), h([[-40, "o"], [-5, "o"]]), { history: undefined }]);
    assert.deepEqual(r, { c: 2, t: 3, rate: 67 });
  });
});

describe("migrate（v2 → v3）", () => {
  test("null は空の v3", () => {
    const d = m.migrate(null);
    assert.equal(d.v, 3);
    for (const k of ["units", "items", "tests", "papers", "exams", "writing", "deleted"]) assert.deepEqual(d[k], []);
    assert.deepEqual(d.log, {});
  });
  test("v3 はそのまま。足りない配列だけ補う", () => {
    const d = m.migrate({ v: 3, units: [{ id: "u" }], items: [] });
    assert.deepEqual(d.units, [{ id: "u" }]); assert.deepEqual(d.papers, []); assert.deepEqual(d.writing, []); assert.deepEqual(d.deleted, []);
  });
  test("v2: streak → level（上限3）、mastered → 安定、履歴の r を正規化、exam を配列に", () => {
    const v2 = { v: 2, units: [{ id: "u1", subject: "数学", name: "正負の数" }],
      items: [
        { id: "a", streak: 5, status: "active", history: [{ d: "2026-01-01", r: "o" }, { d: "2026-01-02", r: "ng" }] },
        { id: "b", streak: 1, status: "mastered", history: [] },
        { id: "c" },
      ],
      tests: [{ id: "t", subject: "数学", date: "2026-01-05" }],
      exam: { name: "中間", date: "2026-10-01", unitIds: ["u1"] } };
    const d = m.migrate(v2);
    assert.equal(d.v, 3);
    const [a, b, c] = d.items;
    assert.equal(a.level, 3); assert.equal(a.status, "active"); assert.deepEqual(a.history, [{ d: "2026-01-01", r: "o" }, { d: "2026-01-02", r: "x" }]); assert.equal(a.etype, "");
    assert.equal(b.level, m.STABLE_LEVEL); assert.equal(b.status, "stable");
    assert.equal(c.level, 0); assert.deepEqual(c.history, []);
    assert.ok(d.units[0].updatedAt && d.tests[0].updatedAt && a.updatedAt);
    assert.equal(d.exams.length, 1); assert.equal(d.exams[0].name, "中間"); assert.deepEqual(d.exams[0].unitIds, ["u1"]); assert.deepEqual(d.exams[0].actual, {});
    assert.deepEqual(d.papers, []); assert.deepEqual(d.writing, []);
  });
  test("v2 で exam に日付が無ければ exams は空", () => {
    assert.deepEqual(m.migrate({ v: 2, exam: { name: "x" } }).exams, []);
    assert.deepEqual(m.migrate({ v: 2 }).exams, []);
  });
});

describe("mergeData（2端末の統合）", () => {
  const base = () => ({ ...m.blank(), updatedAt: "" });
  test("同じ id は updatedAt が新しい方を採用する", () => {
    const a = { ...base(), items: [{ id: "i", label: "古い", updatedAt: "2026-01-01T00:00:00Z" }] };
    const b = { ...base(), items: [{ id: "i", label: "新しい", updatedAt: "2026-02-01T00:00:00Z" }] };
    assert.equal(m.mergeData(a, b).items[0].label, "新しい");
    assert.equal(m.mergeData(b, a).items[0].label, "新しい");
  });
  test("片方にしかないものは残る（units/items/tests/papers/exams/writing）", () => {
    const a = { ...base(), units: [{ id: "u1" }], items: [{ id: "i1" }], papers: [{ id: "p1" }] };
    const b = { ...base(), tests: [{ id: "t1" }], exams: [{ id: "e1" }], writing: [{ id: "w1" }] };
    const r = m.mergeData(a, b);
    assert.deepEqual([r.units.length, r.items.length, r.tests.length, r.papers.length, r.exams.length, r.writing.length], [1, 1, 1, 1, 1, 1]);
    assert.equal(r.v, 3);
  });
  test("deleted の墓標は両側から消し、墓標は合算する", () => {
    const a = { ...base(), items: [{ id: "i1", updatedAt: "2026-03-01T00:00:00Z" }, { id: "i2" }], deleted: ["i2"] };
    const b = { ...base(), items: [{ id: "i1", updatedAt: "2026-01-01T00:00:00Z" }], deleted: ["i1"] };
    const r = m.mergeData(a, b);
    assert.deepEqual(r.items, []);
    assert.deepEqual([...r.deleted].sort(), ["i1", "i2"]);
  });
  test("log は和集合", () => {
    const r = m.mergeData({ ...base(), log: { "2026-09-01": true } }, { ...base(), log: { "2026-09-02": true } });
    assert.deepEqual(r.log, { "2026-09-01": true, "2026-09-02": true });
  });
  test("updatedAt が無いものは、ある方に負ける", () => {
    const r = m.mergeData({ ...base(), items: [{ id: "i", label: "なし" }] }, { ...base(), items: [{ id: "i", label: "あり", updatedAt: "2026-01-01T00:00:00Z" }] });
    assert.equal(r.items[0].label, "あり");
  });
  test("deleted や配列が欠けたデータでも落ちない", () => {
    const r = m.mergeData({ v: 3 }, { v: 3, items: [{ id: "i" }] });
    assert.equal(r.items.length, 1); assert.deepEqual(r.deleted, []);
  });
});

describe("paperHTML（用紙）", () => {
  const paper = (o = {}) => ({ id: "p", code: "0909数", subject: "数学", date: T, kind: "週次", title: "", passage: "", unitIds: [], imgs: [], status: "printed",
    questions: [{ n: 1, q: "1問目", a: "答え1", label: "項目A", aim: "ねらいA", fmt: "計算", svg: "" }, { n: 2, q: "2問目", a: "答え2", label: "項目B", aim: "項目B", fmt: "計算", svg: "" }], ...o });
  const count = (s, re) => (s.match(re) || []).length;
  test("問題用紙と解答の2枚。見出し・コード・問題・解答・ねらいが入る", () => {
    const h = m.paperHTML(paper());
    assert.equal(count(h, /class="sheet"/g), 2);
    assert.ok(h.includes("数学　週次テスト") && h.includes("0909数") && h.includes("数学　解答"));
    assert.ok(h.includes("1問目") && h.includes("答え2") && h.includes("出題のねらい"));
    assert.ok(h.includes("項目A — ねらいA"), "項目名とねらいが違うときは両方");
    assert.ok(!h.includes("項目B — 項目B"), "同じなら1回だけ");
    assert.ok(h.includes("／2"), "満点は問題数");
  });
  test("解答欄の行数は教科で変わる（数学4、英語2、社会1、未知は2）", () => {
    assert.equal(count(m.paperHTML(paper()), /class="rule"/g), 8);
    assert.equal(count(m.paperHTML(paper({ subject: "英語" })), /class="rule"/g), 4);
    assert.equal(count(m.paperHTML(paper({ subject: "社会" })), /class="rule"/g), 2);
    assert.equal(count(m.paperHTML(paper({ subject: "不明" })), /class="rule"/g), 4);
  });
  test("HTML はエスケープされる", () => {
    const h = m.paperHTML(paper({ code: "<b>", questions: [{ n: 1, q: "<script>alert(1)</script> a & b", a: "<i>", label: "<l>", aim: "" }] }));
    assert.ok(!h.includes("<script>") && h.includes("&lt;script&gt;") && h.includes("a &amp; b") && h.includes("&lt;i&gt;") && h.includes("&lt;b&gt;") && h.includes("&lt;l&gt;"));
  });
  test("SVG の図は入り、図ありは罫線が1本減る（最低2本）", () => {
    const svg = "<svg viewBox='0 0 10 10'><line x1='0' y1='0' x2='9' y2='9'/></svg>";
    const h = m.paperHTML(paper({ questions: [{ n: 1, q: "q", a: "a", label: "l", aim: "", svg }] }));
    assert.ok(h.includes('class="fig"') && h.includes("<line"));
    assert.equal(count(h, /class="rule"/g), 3);
    const h2 = m.paperHTML(paper({ subject: "社会", questions: [{ n: 1, q: "q", a: "a", label: "l", aim: "", svg }] }));
    assert.equal(count(h2, /class="rule"/g), 2);
  });
  test("危険な SVG は無害化する。SVG でない文字列は捨てる", () => {
    const bad = "<svg viewBox='0 0 10 10' onload=\"alert(1)\"><script>alert(2)</script><a href=\"javascript:alert(3)\"><text>t</text></a></svg>";
    const h = m.paperHTML(paper({ questions: [{ n: 1, q: "q", a: "a", label: "l", aim: "", svg: bad }] }));
    assert.ok(h.includes('class="fig"'));
    assert.ok(!/onload=/.test(h) && !/<script/.test(h) && !/javascript:/.test(h));
    const h2 = m.paperHTML(paper({ questions: [{ n: 1, q: "q", a: "a", label: "l", aim: "", svg: "<img src=x onerror=alert(1)>" }] }));
    assert.ok(!h2.includes('class="fig"') && !h2.includes("<img"));
  });
  test("資料（写真）があれば先頭に資料ページが付き、3枚になる", () => {
    const h = m.paperHTML(paper({ imgs: [TINY_JPEG, TINY_JPEG] }));
    assert.equal(count(h, /class="sheet"/g), 3);
    assert.ok(h.indexOf("数学　資料") < h.indexOf("数学　週次テスト"));
    assert.ok(h.includes("図1") && h.includes("図2") && count(h, /data:image\/jpeg;base64,/g) === 2);
  });
  test("読解の文章と題名は問題の前に入り、改行は <br> になる", () => {
    const h = m.paperHTML(paper({ subject: "国語", kind: "読解", title: "朝の光", passage: "一行目\n二行目" }));
    assert.ok(h.includes('class="psg"') && h.includes("朝の光<br><br>一行目<br>二行目"));
    assert.ok(h.indexOf('class="psg"') < h.indexOf("1問目"));
    assert.ok(!m.paperHTML(paper()).includes('class="psg"'));
  });
  test("fileHTML は印刷ボタン付きの完全な HTML、paperText は問題と解答を含む", () => {
    const f = m.fileHTML(paper());
    assert.ok(f.startsWith("<!DOCTYPE html>") && f.includes("window.print()") && f.includes("1問目"));
    const t = m.paperText(paper());
    assert.ok(t.includes("数学　週次テスト（0909数）") && t.includes("1. 1問目") && t.includes("解答") && t.includes("2. 答え2"));
  });
});

describe("pickUnits（テストに出す単元の選び方）", () => {
  const unit = (id, subject, learnedOn, lastTestedOn) => ({ id, subject, name: id, learnedOn, lastTestedOn, updatedAt: "" });
  const D = (units, items = []) => ({ ...m.blank(), units, items: items.map((i) => ({ ...item(i) })) });
  test("習っていない単元は出さない。他教科も出さない", () => {
    const d = D([unit("a", "数学", null, null), unit("b", "数学", day(-1), null), unit("c", "英語", day(-1), null)]);
    assert.deepEqual(m.pickUnits(d, "数学").map((u) => u.id), ["b"]);
  });
  test("未定着がある単元が最優先、次に最後に出してから長い単元、未出題は10日前より上", () => {
    const d = D([unit("recent", "数学", day(-30), day(-2)), unit("old", "数学", day(-30), day(-20)), unit("never", "数学", day(-30), null), unit("stuck", "数学", day(-30), day(-1))],
      [{ id: "i", unitId: "stuck", status: "active" }]);
    assert.deepEqual(m.pickUnits(d, "数学", 4).map((u) => u.id), ["stuck", "never", "old", "recent"]);
  });
  test("安定した項目しか無い単元は優先しない", () => {
    const d = D([unit("a", "数学", day(-30), day(-1)), unit("b", "数学", day(-30), day(-9))], [{ id: "i", unitId: "a", status: "stable" }]);
    assert.deepEqual(m.pickUnits(d, "数学").map((u) => u.id), ["b", "a"]);
  });
  test("既定で最大3つ。max で変えられる", () => {
    const d = D(Array.from({ length: 5 }, (_, k) => unit("u" + k, "理科", day(-30), day(-k))));
    assert.equal(m.pickUnits(d, "理科").length, 3);
    assert.equal(m.pickUnits(d, "理科", 5).length, 5);
    assert.deepEqual(m.pickUnits(d, "理科", 2).map((u) => u.id), ["u4", "u3"]);
  });
  test("該当がなければ空配列", () => {
    assert.deepEqual(m.pickUnits(m.blank(), "国語"), []);
  });
  test("デモデータで数学を選ぶと、習っていない単元は入らない", () => {
    const ids = m.pickUnits(F.demo(), "数学").map((u) => u.id);
    assert.equal(ids.length, 2);
    assert.ok(ids.includes("u1") && ids.includes("u2"));
  });
});

describe("sbFetch（Supabase への読み書き）", () => {
  const withFetch = async (status, body, fn) => {
    const orig = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) }; };
    m.stubs.localStorage.setItem("sb_url", "https://example.supabase.co/");
    m.stubs.localStorage.setItem("sb_key", "anon-key");
    try { return await fn(calls); } finally { globalThis.fetch = orig; m.stubs.localStorage.removeItem("sb_url"); m.stubs.localStorage.removeItem("sb_key"); }
  };
  test("書き込み成功（201、本文なし）は null を返して落ちない", async () => {
    await withFetch(201, "", async () => assert.equal(await m.sbFetch("state", { method: "POST", body: "{}" }), null));
  });
  test("204 も null", async () => {
    await withFetch(204, "", async () => assert.equal(await m.sbFetch("state"), null));
  });
  test("読み取りは JSON を返し、URL とヘッダが正しい", async () => {
    await withFetch(200, '[{"id":"fam-1","data":{"v":3}}]', async (calls) => {
      const r = await m.sbFetch("state?id=eq.fam-1&select=data");
      assert.deepEqual(r, [{ id: "fam-1", data: { v: 3 } }]);
      assert.equal(calls[0].url, "https://example.supabase.co/rest/v1/state?id=eq.fam-1&select=data");
      assert.equal(calls[0].opts.headers.apikey, "anon-key");
      assert.equal(calls[0].opts.headers.Authorization, "Bearer anon-key");
    });
  });
  test("失敗はステータス付きの同期エラー", async () => {
    await withFetch(401, '{"message":"x"}', async () => await assert.rejects(() => m.sbFetch("state"), /同期エラー \(401\)/));
  });
});
