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

describe("教材画像（Supabase Storage）", () => {
  const withFetch = async (status, body, fn) => {
    const orig = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body), arrayBuffer: async () => Uint8Array.from(Buffer.from(body, "latin1")).buffer }; };
    m.stubs.localStorage.setItem("sb_url", "https://example.supabase.co/");
    m.stubs.localStorage.setItem("sb_key", "anon-key");
    m.stubs.localStorage.setItem("sb_room", "fam-x");
    try { return await fn(calls); } finally { globalThis.fetch = orig; ["sb_url", "sb_key", "sb_room"].forEach((k) => m.stubs.localStorage.removeItem(k)); }
  };
  test("パスは 共有ID/教科/教材/ページ.jpg", async () => {
    await withFetch(200, "", async () => {
      assert.equal(m.matPath("数学", "ワーク", 12), "fam-x/math/wb/12.jpg");
      assert.equal(m.matPath("国語", "教科書", 3), "fam-x/jpn/tb/3.jpg");
    });
  });
  test("アップロードは非公開バケットへ x-upsert 付きの POST", async () => {
    await withFetch(200, '{"Key":"materials/fam-x/math/wb/12.jpg"}', async (calls) => {
      await m.stUpload("fam-x/math/wb/12.jpg", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }));
      assert.equal(calls[0].url, "https://example.supabase.co/storage/v1/object/materials/fam-x/math/wb/12.jpg");
      assert.equal(calls[0].opts.method, "POST");
      assert.equal(calls[0].opts.headers["x-upsert"], "true");
      assert.equal(calls[0].opts.headers.apikey, "anon-key");
      assert.equal(calls[0].opts.headers.Authorization, "Bearer anon-key");
      assert.equal(calls[0].opts.headers["Content-Type"], "image/jpeg");
    });
  });
  test("読み出しは authenticated 経由で base64 を返し、2回目はメモリのキャッシュ", async () => {
    await withFetch(200, "abc", async (calls) => {
      const b64 = await m.stGet("fam-x/math/wb/99.jpg");
      assert.equal(b64, Buffer.from("abc").toString("base64"));
      assert.equal(calls[0].url, "https://example.supabase.co/storage/v1/object/authenticated/materials/fam-x/math/wb/99.jpg");
      assert.equal(await m.stGet("fam-x/math/wb/99.jpg"), b64);
      assert.equal(calls.length, 1);
    });
  });
  test("削除はまとめて DELETE。空なら呼ばない", async () => {
    await withFetch(200, "[]", async (calls) => {
      await m.stRemove([]);
      assert.equal(calls.length, 0);
      await m.stRemove(["a.jpg", "b.jpg"]);
      assert.equal(calls[0].opts.method, "DELETE");
      assert.deepEqual(JSON.parse(calls[0].opts.body), { prefixes: ["a.jpg", "b.jpg"] });
    });
  });
  test("失敗はステータス付きのエラー", async () => {
    await withFetch(403, "", async () => {
      await assert.rejects(() => m.stUpload("x", new Blob([])), /教材の保存エラー \(403\)/);
      await assert.rejects(() => m.stGet("y"), /教材の読み出しエラー \(403\)/);
      await assert.rejects(() => m.stRemove(["z"]), /教材の削除エラー \(403\)/);
    });
  });
  test("base64 と Blob の往復", async () => {
    const b64 = Buffer.from([0, 1, 2, 250, 255]).toString("base64");
    const blob = m.b64ToBlob(b64);
    assert.equal(blob.type, "image/jpeg");
    assert.equal(m.bufToB64(await blob.arrayBuffer()), b64);
    assert.equal(m.bufToB64(new Uint8Array(70000).buffer).length, Math.ceil(70000 / 3) * 4);
  });
  test("pagesToRanges は連続をまとめる。重複・非整数は無視", () => {
    assert.equal(m.pagesToRanges([12, 10, 11, 15, 15, 17, 18]), "10–12, 15, 17–18");
    assert.equal(m.pagesToRanges([]), "");
    assert.equal(m.pagesToRanges([3, "x", 3.5, undefined]), "3");
  });
  test("matsOf は教科×教材でページ順。materials が無くても落ちない", () => {
    assert.deepEqual(m.matsOf(F.demo(), "数学", "ワーク").map((x) => x.page), [10, 11, 12]);
    assert.deepEqual(m.matsOf({ v: 3 }, "数学", "ワーク"), []);
  });
  test("mergeData は materials も id 単位で統合し、墓標で消える", () => {
    const a = { ...m.blank(), materials: [{ id: "m1", page: 1, updatedAt: "2026-01-01T00:00:00Z" }, { id: "m2", page: 2 }] };
    const b = { ...m.blank(), materials: [{ id: "m1", page: 9, updatedAt: "2026-02-01T00:00:00Z" }], deleted: ["m2"] };
    const r = m.mergeData(a, b);
    assert.deepEqual(r.materials.map((x) => [x.id, x.page]), [["m1", 9]]);
    assert.deepEqual(m.mergeData({ v: 3 }, { v: 3 }).materials, []);
  });
  test("migrate は materials を補う", () => {
    assert.deepEqual(m.migrate({ v: 3, units: [], items: [] }).materials, []);
    assert.deepEqual(m.migrate(null).materials, []);
    assert.deepEqual(m.migrate({ v: 2 }).materials, []);
  });
});

describe("単元とページの紐づけ", () => {
  test("parsePages は範囲と単発を展開し、p. や 〜 や 全角も読む", () => {
    assert.deepEqual(m.parsePages("p.12-15, 30"), [12, 13, 14, 15, 30]);
    assert.deepEqual(m.parsePages("P.4〜6／p.9"), [4, 5, 6, 9]);
    assert.deepEqual(m.parsePages("20–21、p.3"), [3, 20, 21]);
    assert.deepEqual(m.parsePages(""), []); assert.deepEqual(m.parsePages(undefined), []);
  });
  test("逆順や巨大な範囲は展開せず両端だけ", () => {
    assert.deepEqual(m.parsePages("9-5"), [5, 9]);
    assert.deepEqual(m.parsePages("1-10000"), [1, 10000]);
  });
  test("unitPages は教材ごとに別の欄を読み、unitForPage で逆引きできる", () => {
    const u = { pages: "p.10-12", wbPages: "p.4-5" };
    assert.deepEqual(m.unitPages(u, "教科書"), [10, 11, 12]);
    assert.deepEqual(m.unitPages(u, "ワーク"), [4, 5]);
    assert.deepEqual(m.unitPages({ pages: "p.1" }, "ワーク"), []);
    const units = F.demo().units;
    assert.equal(m.unitForPage(units, "ワーク", 13).id, "u2");
    assert.equal(m.unitForPage(units, "教科書", 13).id, "u1");
    assert.equal(m.unitForPage(units, "ワーク", 99), null);
  });
  test("applyTOC: 一致する単元にはページを足し、無ければ新規。名前が空は無視", () => {
    const units = [{ id: "a", subject: "数学", name: "正負の数", pages: "p.10-30", wbPages: "", updatedAt: "" }, { id: "b", subject: "英語", name: "正負の数", pages: "", updatedAt: "" }];
    const r = m.applyTOC(units, "数学", "ワーク", [{ name: "正の数・負の数", pages: "p.4-11", match: "正負の数" }, { name: "文字と式", pages: "p.12-19", match: "" }, { name: "", pages: "p.1" }]);
    assert.equal(r.length, 3);
    assert.equal(r[0].wbPages, "p.4-11"); assert.equal(r[0].pages, "p.10-30");
    assert.equal(r[1].pages, "", "他教科の同名は触らない");
    assert.deepEqual([r[2].subject, r[2].name, r[2].pages, r[2].wbPages, r[2].lastTestedOn], ["数学", "文字と式", "", "p.12-19", null]);
    assert.ok(r[2].id && r[2].updatedAt);
  });
  test("applyTOC: 教科書の目次は pages に入り、既にあれば追記、同じなら重複しない", () => {
    const units = [{ id: "a", subject: "数学", name: "正負の数", pages: "p.10-30", updatedAt: "" }];
    assert.equal(m.applyTOC(units, "数学", "教科書", [{ name: "正負の数", pages: "p.31-33" }])[0].pages, "p.10-30, p.31-33");
    assert.equal(m.applyTOC(units, "数学", "教科書", [{ name: "正負の数", pages: "p.10-30" }])[0].pages, "p.10-30");
    assert.equal(m.applyTOC(units, "数学", "教科書", [{ name: "正負の数", pages: "" }])[0].pages, "p.10-30");
  });
  test("unitPageLabel", () => {
    assert.equal(m.unitPageLabel({ pages: "p.1", wbPages: "p.2" }), "教科書 p.1 ／ ワーク p.2");
    assert.equal(m.unitPageLabel({ pages: "", wbPages: "p.2" }), "ワーク p.2");
    assert.equal(m.unitPageLabel({}), "");
  });
});

describe("作問に添付する教材ページ", () => {
  test("単元のページ範囲に入る教材だけを教材ごとに集める", () => {
    const d = F.demo();
    const r = m.materialsForUnits(d, "数学", d.units.filter((u) => u.id === "u1"));
    assert.deepEqual(r.map((x) => [x.kind, x.page]), [["ワーク", 10], ["ワーク", 11], ["教科書", 12]]);
    assert.deepEqual(m.materialsForUnits(d, "数学", d.units.filter((u) => u.id === "u2")).map((x) => x.page), [12], "u2 はワーク p.12-19 のみ");
    assert.deepEqual(m.materialsForUnits(d, "社会", d.units.filter((u) => u.subject === "社会")), []);
    assert.deepEqual(m.materialsForUnits({ v: 3 }, "数学", [{ pages: "p.1" }]), []);
  });
  test("上限を超えたら教材ごとに均等に間引く。片方しか無ければ全部そちらに", () => {
    const mats = (kind, n) => Array.from({ length: n }, (_, k) => ({ id: kind + k, subject: "理科", kind, page: k + 1, path: "" }));
    const d = { ...m.blank(), materials: [...mats("ワーク", 20), ...mats("教科書", 20)] };
    const units = [{ pages: "p.1-20", wbPages: "p.1-20" }];
    const r = m.materialsForUnits(d, "理科", units, 8);
    assert.equal(r.length, 8);
    assert.deepEqual(r.map((x) => x.kind), ["ワーク", "ワーク", "ワーク", "ワーク", "教科書", "教科書", "教科書", "教科書"]);
    assert.deepEqual(r.filter((x) => x.kind === "ワーク").map((x) => x.page), [1, 6, 11, 16]);
    const one = m.materialsForUnits({ ...d, materials: mats("教科書", 20) }, "理科", units, 8);
    assert.equal(one.length, 8); assert.ok(one.every((x) => x.kind === "教科書"));
  });
  test("matsLabel は教材ごとのページ範囲", () => {
    assert.equal(m.matsLabel([{ kind: "教科書", page: 3 }, { kind: "ワーク", page: 5 }, { kind: "ワーク", page: 4 }]), "ワーク p.4–5、教科書 p.3");
    assert.equal(m.matsLabel([]), "");
  });
});

describe("類題生成に元の問題を渡す", () => {
  const src = { path: "fam/math/wb/11.jpg", kind: "ワーク", page: 11, q: "3" };
  test("src と画像があれば、見出し・画像・本文の順の配列", () => {
    const c = m.genContent({ src }, "AAAA", "本文");
    assert.equal(c.length, 3);
    assert.ok(c[0].type === "text" && c[0].text.includes("ワーク p.11 「3」") && c[0].text.includes("そのまま写さない"));
    assert.deepEqual(c[1], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
    assert.deepEqual(c[2], { type: "text", text: "本文" });
  });
  test("画像が読めなかった・src が無いときは本文だけ", () => {
    assert.equal(m.genContent({ src }, null, "本文"), "本文");
    assert.equal(m.genContent({}, "AAAA", "本文"), "本文");
  });
  test("srcLabel", () => {
    assert.equal(m.srcLabel(src), "ワーク p.11 「3」");
    assert.equal(m.srcLabel(null), ""); assert.equal(m.srcLabel({}), "");
  });
});

describe("用紙の資料ページ（教材ページへの参照）", () => {
  const paper = (o = {}) => ({ id: "p", code: "0909数", subject: "数学", date: T, kind: "週次", title: "", passage: "", unitIds: [], imgs: [], status: "printed",
    questions: [{ n: 1, q: "図1の地図を見て答えなさい。", a: "a", label: "l", aim: "", fmt: "資料・地図の読み取り", svg: "", fig: 1 }], ...o });
  const refs = [{ n: 1, kind: "教科書", page: 12, path: "fam/math/tb/12.jpg" }, { n: 3, kind: "ワーク", page: 5, path: "fam/math/wb/5.jpg" }];
  const count = (s, re) => (s.match(re) || []).length;
  test("usedFigs は問題文の「図N」と fig 欄を集める", () => {
    const s = m.usedFigs([{ q: "図1と図 3 を見て", fig: 0 }, { q: "なし", fig: 2 }, { q: "図12" }, {}]);
    assert.deepEqual([...s].sort((a, b) => a - b), [1, 2, 3, 12]);
    assert.equal(m.usedFigs([]).size, 0);
  });
  test("refs があれば資料ページが先頭に付き、読み込み前は枠だけ", () => {
    const h = m.paperHTML(paper({ refs }));
    assert.equal(count(h, /class="sheet"/g), 3);
    assert.ok(h.indexOf("数学　資料") < h.indexOf("数学　週次テスト"));
    assert.ok(h.includes("図1（教科書 p.12）") && h.includes("図3（ワーク p.5）"));
    assert.equal(count(h, /class="ref-wait"/g), 2);
    assert.ok(!h.includes("data:image/jpeg"), "画像は用紙に持たない");
  });
  test("読み込んだ画像を渡すと描画。読めなかったページは枠のまま", () => {
    const h = m.paperHTML(paper({ refs }), { "fam/math/tb/12.jpg": TINY_JPEG });
    assert.equal(count(h, /data:image\/jpeg;base64,/g), 1);
    assert.equal(count(h, /class="ref-wait"/g), 1);
    assert.ok(h.indexOf("図1（教科書 p.12）") < h.indexOf("data:image"));
  });
  test("旧データの写真（imgs）は refs の後に番号が続く。両方なければ資料ページなし", () => {
    const figs = m.paperFigs({ refs: [refs[0]], imgs: [TINY_JPEG] });
    assert.deepEqual(figs.map((f) => [f.cap, !!f.b64, f.pending]), [["図1（教科書 p.12）", false, true], ["図2", true, false]]);
    assert.equal(count(m.paperHTML(paper()), /class="sheet"/g), 2);
    assert.deepEqual(m.paperFigs({}), []);
  });
  test("fileHTML も読み込んだ画像を入れる。paperText は資料の一覧を出す", () => {
    assert.ok(m.fileHTML(paper({ refs }), { "fam/math/wb/5.jpg": TINY_JPEG }).includes("data:image/jpeg;base64,"));
    assert.ok(m.paperText(paper({ refs })).includes("資料: 図1: 教科書 p.12、図3: ワーク p.5"));
    assert.ok(!m.paperText(paper()).includes("資料:"));
  });
  test("resolveRefs は共有先から読み、失敗したページは飛ばす", async () => {
    const orig = globalThis.fetch;
    m.stubs.localStorage.setItem("sb_url", "https://x.supabase.co"); m.stubs.localStorage.setItem("sb_key", "k");
    globalThis.fetch = async (url) => (url.includes("/tb/12.jpg") ? { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1, 2]).buffer } : { ok: false, status: 404 });
    try {
      const steps = [];
      const res = await m.resolveRefs(paper({ refs }), (s) => steps.push(s));
      assert.deepEqual(Object.keys(res), ["fam/math/tb/12.jpg"]);
      assert.equal(res["fam/math/tb/12.jpg"], Buffer.from([1, 2]).toString("base64"));
      assert.deepEqual(steps, ["資料 1/2", "資料 2/2"]);
      assert.deepEqual(await m.resolveRefs(paper()), {});
    } finally { globalThis.fetch = orig; ["sb_url", "sb_key"].forEach((k) => m.stubs.localStorage.removeItem(k)); }
  });
});

describe("設定を別の端末へ渡すリンク", () => {
  const ls = m.stubs.localStorage;
  const clear = () => ["sb_url", "sb_key", "sb_room", "anthropic_api_key"].forEach((k) => ls.removeItem(k));
  test("同期の3つとAPIキーを #cfg= に入れる。無いものは入れない", () => {
    clear(); ls.setItem("sb_url", "https://x.supabase.co"); ls.setItem("sb_key", "anon"); ls.setItem("sb_room", "fam-あ"); ls.setItem("anthropic_api_key", "sk-1");
    const link = m.cfgLink("https://ex.github.io/g/index.html#old");
    assert.ok(link.startsWith("https://ex.github.io/g/index.html#cfg="));
    clear();
    assert.equal(m.importCfg(link), 4);
    assert.deepEqual([ls.getItem("sb_url"), ls.getItem("sb_key"), ls.getItem("sb_room"), ls.getItem("anthropic_api_key")], ["https://x.supabase.co", "anon", "fam-あ", "sk-1"]);
    ls.removeItem("anthropic_api_key");
    const link2 = m.cfgLink("https://ex.github.io/"); clear();
    assert.equal(m.importCfg(link2), 3); assert.equal(ls.getItem("anthropic_api_key"), null);
    clear();
  });
  test("リンク全体でも、cfg= の中身だけでも、空白付きでも取り込める。壊れていれば 0", () => {
    clear(); ls.setItem("sb_url", "u"); ls.setItem("sb_key", "k"); ls.setItem("sb_room", "r");
    const link = m.cfgLink("https://a/"); const token = link.split("#cfg=")[1]; clear();
    assert.equal(m.importCfg("  " + token + "\n"), 3); clear();
    assert.equal(m.importCfg("#cfg=" + token), 3); clear();
    assert.equal(m.importCfg("https://a/?x=1#cfg=" + token), 3); clear();
    assert.equal(m.importCfg("こんにちは"), 0); assert.equal(m.importCfg(""), 0); assert.equal(m.importCfg(null), 0);
    assert.equal(ls.getItem("sb_url"), null);
  });
  test("設定が空ならリンクは空の設定、取り込みは 0", () => {
    clear();
    assert.equal(m.importCfg(m.cfgLink("https://a/")), 0);
  });
});

describe("紙で回す（印刷セット・採点セット・一括確定）", () => {
  const it = (o) => item({ history: [], ...o });
  test("printSet: 明日までに期日が来る未印刷の項目。判定中と印刷済みは除く。落とした回数順", () => {
    const d = { ...m.blank(), items: [
      it({ id: "a", nextDue: day(1), failCount: 0 }), it({ id: "b", nextDue: T, failCount: 2 }), it({ id: "c", nextDue: day(2) }),
      it({ id: "p", nextDue: T, printedOn: day(-1) }), it({ id: "q", nextDue: T, pending: { d: T, self: "o" } }), it({ id: "o", nextDue: day(-3), failCount: 2 })] };
    assert.deepEqual(m.printSet(d).map((i) => i.id), ["o", "b", "a"]);
  });
  test("gradeSet: 印刷済みだけ、古い順", () => {
    const d = { ...m.blank(), items: [it({ id: "a", printedOn: T }), it({ id: "b", printedOn: day(-2) }), it({ id: "c" }), it({ id: "d", printedOn: day(-2), failCount: 3 })] };
    assert.deepEqual(m.gradeSet(d).map((i) => i.id), ["d", "b", "a"]);
  });
  test("judgeAll: 判定した項目だけ applyJudgment と履歴、印刷を解除。skip は印刷前に戻す。未判定はそのまま", () => {
    const d = { ...m.blank(), items: [it({ id: "a", level: 1, printedOn: day(-1), etype: "知らなかった" }), it({ id: "b", level: 2, printedOn: day(-1) }), it({ id: "c", printedOn: day(-1) }), it({ id: "s", printedOn: day(-1) })] };
    const { d: nd, n } = m.judgeAll(d, { a: { r: "x", self: "o", etype: "読み間違えた" }, b: { r: "oo", self: "oo" }, s: { skip: true } });
    assert.equal(n, 2);
    const [a, b, c, s] = nd.items;
    assert.deepEqual([a.level, a.failCount, a.printedOn, a.etype, a.nextDue], [0, 1, null, "読み間違えた", day(1)]);
    assert.deepEqual(a.history[0], { d: T, r: "x", self: "o", etype: "読み間違えた", etypeSelf: "" });
    assert.deepEqual([b.level, b.printedOn, b.history[0].r, b.history[0].etype], [3, null, "oo", ""]);
    assert.equal(c.printedOn, day(-1)); assert.equal(c.history.length, 0);
    assert.equal(s.printedOn, null); assert.equal(s.history.length, 0);
    assert.equal(nd.log[T], true);
    assert.equal(m.judgeAll(d, {}).n, 0); assert.equal(m.judgeAll(d, {}).d.log[T], undefined);
  });
  test("genToPaper: 項目ごとに見出し、説明の問いを最後に足し、自分の判定の欄を付ける。用語は説明なし", () => {
    const u = { id: "u", name: "正負の数" };
    const items = [
      { id: "1", subject: "数学", unitId: "u", label: "A", fmt: "計算", gen: { problems: [{ q: "q1", a: "a1" }, { q: "q2", a: "a2" }], why: "なぜ符号が変わるか" } },
      { id: "2", subject: "社会", unitId: "u", label: "B", fmt: "知識・用語", gen: { problems: [{ q: "t1", a: "b1" }], why: "無視される" } },
      { id: "3", subject: "国語", unitId: "u", label: "C", fmt: "計算", gen: null }];
    const p = m.genToPaper(items, () => u);
    assert.equal(p.questions.length, 4);
    assert.ok(p.questions[0].q.startsWith("【数学・正負の数】q1") && !p.questions[0].q.includes(m.SELF_LINE));
    assert.equal(p.questions[1].q, "q2");
    assert.ok(p.questions[2].q.startsWith("説明：なぜ符号が変わるか") && p.questions[2].q.endsWith(m.SELF_LINE) && p.questions[2].a.includes("説明もできた"));
    assert.ok(p.questions[3].q.startsWith("【社会・正負の数】t1") && p.questions[3].q.endsWith(m.SELF_LINE), "用語は最後の問題に判定欄");
    assert.equal(p.questions[3].n, 4); assert.equal(p.subject, "回収");
    assert.ok(m.paperHTML(p).includes("自分の判定"));
  });
  test("ctxFor / itemContext", () => {
    const d = F.demo(); const i = d.items.find((x) => x.id === "i1");
    const c = m.ctxFor(d, i);
    assert.deepEqual(c.siblings, d.items.filter((x) => x.unitId === "u1" && x.status === "active" && x.id !== "i1").map((x) => x.label));
    assert.ok(c.stable.includes("絶対値") && c.units.includes("正負の数"));
    const t = m.itemContext(i, d.units[0], c);
    assert.ok(t.includes("教科: 数学") && t.includes("未定着項目: 負の数のかけ算") && t.includes("落とした回数: 2"));
  });
});

describe("PDF の組み方（問題を先に、解答は最後、両面印刷で別の紙）", () => {
  test("paperHTML は資料と問題のシートに q、解答に a の印を付ける", () => {
    const p = { id: "p", code: "c", subject: "数学", date: T, kind: "週次", title: "", passage: "", unitIds: [], imgs: [TINY_JPEG], status: "printed", questions: [{ n: 1, q: "q", a: "a", label: "l", aim: "", fmt: "計算", svg: "" }] };
    const parts = [...m.paperHTML(p).matchAll(/class="sheet" data-part="(q|a)"/g)].map((x) => x[1]);
    assert.deepEqual(parts, ["q", "q", "a"]);
    assert.deepEqual([...m.paperHTML({ ...p, imgs: [] }).matchAll(/data-part="(q|a)"/g)].map((x) => x[1]), ["q", "a"]);
  });
  test("needBlank は奇数ページのときだけ", () => {
    assert.equal(m.needBlank(1), true); assert.equal(m.needBlank(2), false); assert.equal(m.needBlank(3), true); assert.equal(m.needBlank(0), false);
  });
  test("pdfName は1枚なら教科とコード、複数なら確認テスト", () => {
    assert.equal(m.pdfName([{ subject: "数学", code: "0909数" }]), "数学_0909数.pdf");
    assert.equal(m.pdfName([{ subject: "数学" }, { subject: "英語" }]), `確認テスト_${T}_2教科.pdf`);
  });
});

describe("×のタップ登録（座標だけ保存）", () => {
  test("tapHit: 表示上 22px 以内で最も近い印。無ければ -1", () => {
    const marks = [{ x: 0.5, y: 0.5 }, { x: 0.52, y: 0.5 }];
    assert.equal(m.tapHit(marks, 0.5, 0.5, 400, 600), 0);
    assert.equal(m.tapHit(marks, 0.525, 0.5, 400, 600), 1);
    assert.equal(m.tapHit(marks, 0.5, 0.55, 400, 600), -1, "縦 30px 離れている");
    assert.equal(m.tapHit([], 0.5, 0.5, 400, 600), -1);
  });
  test("marksOn: そのページに登録済みで座標のある項目だけ", () => {
    const d = F.demo();
    assert.deepEqual(m.marksOn(d, "fam-demo/math/wb/11.jpg").map((i) => i.id), ["i1"]);
    assert.deepEqual(m.marksOn(d, "fam-demo/math/wb/10.jpg"), []);
    assert.deepEqual(m.marksOn({ items: [{ src: { path: "p", q: "3" } }] }, "p"), [], "番号だけの旧データは印にしない");
  });
  test("tapsToItems: 仮の名前・「知らなかった」・翌日・座標つき src。単元はページから、無ければ指定の単元", () => {
    const d = F.demo(); const us = d.units.filter((u) => u.subject === "数学");
    const taps = [{ path: "fam-demo/math/wb/10.jpg", kind: "ワーク", page: 10, x: 0.2, y: 0.3 }, { path: "fam-demo/math/wb/10.jpg", kind: "ワーク", page: 10, x: 0.6, y: 0.3 }, { path: "fam-demo/math/wb/99.jpg", kind: "ワーク", page: 99, x: 0.1, y: 0.1 }];
    const its = m.tapsToItems(taps, "数学", us, "u3");
    assert.equal(its.length, 3);
    assert.deepEqual(its.map((i) => i.label), ["ワーク p.10 の×（1）", "ワーク p.10 の×（2）", "ワーク p.99 の×（1）"]);
    assert.deepEqual(its.map((i) => i.unitId), ["u1", "u1", "u3"]);
    const i = its[0];
    assert.deepEqual([i.subject, i.etype, i.named, i.fmt, i.level, i.failCount, i.status, i.nextDue], ["数学", "知らなかった", false, "", 0, 1, "active", day(1)]);
    assert.deepEqual(i.src, { path: "fam-demo/math/wb/10.jpg", kind: "ワーク", page: 10, x: 0.2, y: 0.3 });
    assert.deepEqual(i.history, [{ d: T, r: "x", etype: "知らなかった" }]);
    assert.ok(i.id && i.updatedAt && i.createdOn === T);
    assert.ok(m.tapsToItems([], "数学", us).length === 0);
  });
  test("座標つき src の項目は applyJudgment・printSet・genToPaper を通る", () => {
    const [i] = m.tapsToItems([{ path: "p", kind: "ワーク", page: 1, x: 0.5, y: 0.5 }], "数学", []);
    const j = m.applyJudgment(i, "o"); assert.equal(j.level, 1);
    assert.equal(m.printSet({ ...m.blank(), items: [i] }).length, 1);
    const paper = m.genToPaper([{ ...i, gen: { problems: [{ q: "q", a: "a" }], why: "w" } }], () => null);
    assert.equal(paper.questions.length, 2);
    assert.equal(m.srcLabel(i.src), "ワーク p.1");
    assert.equal(m.srcLabel({ path: "p", kind: "ワーク", page: 2, q: "3" }), "ワーク p.2 「3」");
  });
});

describe("印の位置を AI に渡す（項目名・類題）", () => {
  const src = { path: "fam/math/wb/11.jpg", kind: "ワーク", page: 11, x: 0.3, y: 0.4 };
  test("hasPos / markDesc", () => {
    assert.equal(m.hasPos(src), true); assert.equal(m.hasPos({ path: "p", q: "3" }), false); assert.equal(m.hasPos(null), false);
    assert.equal(m.markDesc(src), "赤い○印の位置にある問題（ワーク p.11）");
    assert.equal(m.markDesc(src, "②"), "赤い②の印の位置にある問題（ワーク p.11）");
    assert.equal(m.markDesc({ path: "p", kind: "ワーク", page: 2, q: "3" }), "ワーク p.2 「3」");
  });
  test("annotateB64 は canvas が無ければそのまま返す。印が無ければそのまま", async () => {
    assert.equal(await m.annotateB64("AAAA", [{ x: 0.1, y: 0.1 }]), "AAAA");
    assert.equal(await m.annotateB64("AAAA", []), "AAAA");
  });
  test("genContent: 座標つきなら印の位置を指し、名前が仮なら label/fmt も求める", () => {
    const c = m.genContent({ src, named: false }, "IMG", "本文");
    assert.ok(c[0].text.includes("赤い○印の位置にある問題（ワーク p.11）") && c[0].text.includes("label に"));
    const c2 = m.genContent({ src, named: true }, "IMG", "本文");
    assert.ok(!c2[0].text.includes("label に"));
  });
  test("applyGen: 仮の名前なら AI の label/fmt を採用、付いていれば類題だけ", () => {
    const g = { problems: [], label: "係数が分数の一次方程式", fmt: "計算" };
    const p = m.applyGen({ named: false, src, fmt: "" }, g);
    assert.deepEqual([p.label, p.fmt, p.named, p.genOn], ["係数が分数の一次方程式", "計算", true, T]);
    assert.equal(p.gen, g);
    const p2 = m.applyGen({ named: true, src, label: "既存" }, g);
    assert.equal(p2.label, undefined); assert.equal(p2.gen, g);
    const p3 = m.applyGen({ named: false, src, fmt: "計算" }, { problems: [], label: "x", fmt: "変な形式" });
    assert.equal(p3.fmt, "計算", "不明な形式は元のまま");
    assert.equal(m.applyGen({ label: "手入力" }, g).label, undefined, "座標の無い項目は名前を触らない");
  });
  test("nameItems: ページごとに1回 AI を呼び、印の番号順に名前を付ける。失敗したページは仮のまま", async () => {
    const orig = globalThis.fetch; const calls = [];
    m.stubs.localStorage.setItem("sb_url", "https://x.supabase.co"); m.stubs.localStorage.setItem("sb_key", "k"); m.stubs.localStorage.setItem("anthropic_api_key", "sk");
    globalThis.fetch = async (url, opts) => {
      calls.push(url);
      if (url.includes("/storage/")) return url.includes("bad.jpg") ? { ok: false, status: 404 } : { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1]).buffer };
      const body = JSON.parse(opts.body); const txt = body.messages[0].content.map((c) => c.text || "").join("");
      return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify({ items: txt.includes("①〜2") ? [{ n: 2, label: "二番", fmt: "計算", summary: "s2" }, { n: 1, label: "一番", fmt: "知識・用語", summary: "s1" }] : [{ n: 1, label: "単独", fmt: "謎" }] }) }] }) };
    };
    try {
      const items = [
        { id: "a", subject: "数学", unitId: "u", named: false, src: { ...src, x: 0.1 } }, { id: "b", subject: "数学", unitId: "u", named: false, src: { ...src, x: 0.6 } },
        { id: "c", subject: "数学", unitId: "u", named: false, src: { ...src, path: "fam/math/wb/12.jpg", page: 12 } },
        { id: "d", subject: "数学", unitId: "u", named: false, src: { ...src, path: "bad.jpg" } },
        { id: "e", subject: "数学", unitId: "u", named: true, src }, { id: "f", subject: "数学", unitId: "u", named: false }];
      const r = await m.nameItems(items, () => ({ name: "正負の数" }));
      assert.deepEqual(r.a, { label: "一番", fmt: "知識・用語", note: "s1", named: true });
      assert.deepEqual(r.b, { label: "二番", fmt: "計算", note: "s2", named: true });
      assert.deepEqual(r.c, { label: "単独", fmt: "", note: "", named: true });
      assert.equal(r.d, undefined); assert.equal(r.e, undefined); assert.equal(r.f, undefined);
      assert.equal(calls.filter((u) => u.includes("anthropic")).length, 2, "ページごとに1回");
    } finally { globalThis.fetch = orig; ["sb_url", "sb_key", "anthropic_api_key"].forEach((k) => m.stubs.localStorage.removeItem(k)); }
  });
});

describe("索引と進度（裏で持つ）", () => {
  test("markDone: 指定のページを「やった」にする。既にあれば最初の日を残す。無いパスは無視", () => {
    const d = F.demo();
    const r = m.markDone(d, ["fam-demo/math/wb/11.jpg", "fam-demo/math/wb/10.jpg", "nope"]);
    const by = Object.fromEntries(r.materials.map((x) => [x.path, x.doneOn]));
    assert.equal(by["fam-demo/math/wb/11.jpg"], T);
    assert.equal(by["fam-demo/math/wb/10.jpg"], day(-3), "既にやったページは最初の日のまま");
    assert.equal(by["fam-demo/math/wb/12.jpg"], undefined);
    assert.equal(m.markDone({ v: 3 }, ["x"]).materials.length, 0);
  });
  test("applyAutoProgress: やったページを含む単元は習った扱い（最初の日）。手動で習った単元は触らない", () => {
    const d = F.demo(); d.units = d.units.map((u) => (u.id === "u1" || u.id === "u2" ? { ...u, learnedOn: null } : u));
    const r = m.applyAutoProgress(d);
    const u1 = r.units.find((u) => u.id === "u1"), u2 = r.units.find((u) => u.id === "u2"), u4 = r.units.find((u) => u.id === "u4");
    assert.equal(u1.learnedOn, day(-3)); assert.equal(u1.learnedBy, "auto");
    assert.equal(u2.learnedOn, null, "p.12-19 はまだやっていない");
    assert.equal(u4.learnedOn, day(-50), "手動のまま");
    const r2 = m.applyAutoProgress(m.markDone(d, ["fam-demo/math/wb/12.jpg"]));
    assert.equal(r2.units.find((u) => u.id === "u2").learnedOn, T);
    const e = m.empty ? null : m.blank(); assert.equal(m.applyAutoProgress(e), e, "やったページが無ければそのまま");
  });
  test("untouchedPages: 範囲の単元で、取り込み済みなのに やっていない ワークのページ。索引があれば問題数", () => {
    const d = F.demo();
    const r = m.untouchedPages(d, ["u1", "u2", "u4"]);
    assert.deepEqual(r.map((x) => [x.unit.id, x.pages, x.problems, x.noIdx]), [["u1", [11], 0, 1], ["u2", [12], 4, 0]]);
    assert.deepEqual(m.untouchedPages(d, ["u4"]), [], "英語はワークを取り込んでいない");
    assert.deepEqual(m.untouchedPages(m.markDone(d, ["fam-demo/math/wb/11.jpg", "fam-demo/math/wb/12.jpg"]), ["u1", "u2"]), []);
  });
  test("buildIndex: AI に番号を書き出させる。無ければ空", async () => {
    const orig = globalThis.fetch;
    m.stubs.localStorage.setItem("sb_url", "https://x.supabase.co"); m.stubs.localStorage.setItem("sb_key", "k"); m.stubs.localStorage.setItem("anthropic_api_key", "sk");
    globalThis.fetch = async (url) => (url.includes("/storage/") ? { ok: true, status: 200, arrayBuffer: async () => Uint8Array.from([1]).buffer } : { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"ns":["1","2(1)",3,""]}' }] }) });
    try { const r = await m.buildIndex({ path: "p", subject: "数学", kind: "ワーク", page: 5 }); assert.deepEqual(r, { ns: ["1", "2(1)", "3"], at: T }); }
    finally { globalThis.fetch = orig; ["sb_url", "sb_key", "anthropic_api_key"].forEach((k) => m.stubs.localStorage.removeItem(k)); }
  });
});

describe("日付（ローカル日付。UTC 変換で1日ずれない）", () => {
  test("addDays は文字列で見て正しく進む・戻る（タイムゾーンに依らない）", () => {
    assert.equal(m.addDays("2026-09-10", 1), "2026-09-11");
    assert.equal(m.addDays("2026-09-10", 3), "2026-09-13");
    assert.equal(m.addDays("2026-09-30", 1), "2026-10-01");
    assert.equal(m.addDays("2026-01-01", -1), "2025-12-31");
    assert.equal(m.addDays("2026-02-28", 1), "2026-03-01");
  });
  test("today は YYYY-MM-DD で、その日の 0 時からの差が 0", () => {
    const t = m.today(); assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
    const n = new Date(); assert.equal(t, `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`);
    assert.equal(m.diffDays(t, m.addDays(t, 1)), 1);
  });
});

describe("見開きの取り込み", () => {
  test("isSpreadShape: 横長なら見開き、縦長や正方形に近ければ片ページ", () => {
    assert.equal(m.isSpreadShape(1400, 1000), true);
    assert.equal(m.isSpreadShape(1000, 1400), false);
    assert.equal(m.isSpreadShape(1000, 1000), false);
    assert.equal(m.isSpreadShape(1160, 1000), true); assert.equal(m.isSpreadShape(1140, 1000), false);
  });
  test("assignPages: 見開きは2ページ、片ページは1ページを順に振る", () => {
    assert.deepEqual(m.assignPages(1, ["single", "spread", "spread", "single"]), [[1], [2, 3], [4, 5], [6]]);
    assert.deepEqual(m.assignPages(12, []), []);
  });
  test("splitSpread は canvas が無ければそのまま1つ返す", async () => {
    assert.deepEqual(await m.splitSpread("AAAA", false), ["AAAA"]);
  });
});

describe("見開きの綴じ目の推定", () => {
  /* 白地の画像を作り、列の範囲に色を塗る。fn(x, y) が [r,g,b] を返す */
  const img = (w, h, fn) => { const px = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y) || [255, 255, 255]; const i = (y * w + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255; } return px; };
  const text = (x, y) => (x % 3 === 0 && y % 4 === 0 ? [0, 0, 0] : null); // 文字っぽい、まばらな点
  test("綴じ目の影（暗い帯）があればその中心。ずれていても追う", () => {
    const w = 200, h = 50;
    const px = img(w, h, (x, y) => (x >= 108 && x <= 113 ? [40, 40, 40] : text(x, y)));
    const g = m.findGutter(px, w, h);
    assert.ok(Math.abs(g - 111 / w) < 0.01, `g=${g}`);
  });
  test("影が無ければ、余白が合わさった白い帯の中心。中央に最も近い帯を選ぶ", () => {
    const w = 200, h = 50;
    const px = img(w, h, (x, y) => (x < 80 || x > 130 ? text(x, y) : null)); // 80〜130 が空白（中心 105）
    const g = m.findGutter(px, w, h);
    assert.ok(Math.abs(g - 105.5 / w) < 0.01, `g=${g}`);
    const px2 = img(w, h, (x, y) => ((x >= 76 && x <= 84) || (x >= 100 && x <= 104) ? null : text(x, y))); // 2つの空白帯（幅 9 と 5）。中央に近い 100〜104
    const g2 = m.findGutter(px2, w, h);
    assert.ok(Math.abs(g2 - 102.5 / w) < 0.01, `g2=${g2}`);
  });
  test("手がかりが無ければ真ん中", () => {
    const w = 200, h = 50;
    assert.equal(m.findGutter(img(w, h, text), w, h), 0.5, "全面に文字");
    assert.equal(m.findGutter(img(w, h, () => null), w, h) > 0.4 && m.findGutter(img(w, h, () => null), w, h) < 0.6, true, "全面が白なら中央付近の帯の中心");
  });
});

describe("共通処理（整理で切り出したもの）", () => {
  test("removeRec: 指定の配列から消し、墓標に足す。複数 id も", () => {
    const d = { ...m.blank(), items: [{ id: "a" }, { id: "b" }, { id: "c" }], deleted: ["z"] };
    const r = m.removeRec(d, "items", "b");
    assert.deepEqual(r.items.map((x) => x.id), ["a", "c"]); assert.deepEqual(r.deleted, ["z", "b"]);
    const r2 = m.removeRec(d, "items", ["a", "c"]);
    assert.deepEqual(r2.items.map((x) => x.id), ["b"]); assert.deepEqual(r2.deleted, ["z", "a", "c"]);
    assert.deepEqual(d.items.length, 3, "元は触らない");
  });
  test("newItem: 今日 × で登録、明日に出る。渡した値で上書き", () => {
    const i = m.newItem({ subject: "数学", unitId: "u", label: "L", etype: "知らなかった" });
    assert.deepEqual([i.subject, i.unitId, i.label, i.note, i.fmt, i.level, i.failCount, i.status, i.nextDue, i.createdOn], ["数学", "u", "L", "", "", 0, 1, "active", day(1), T]);
    assert.deepEqual(i.history, [{ d: T, r: "x", etype: "知らなかった" }]);
    assert.ok(i.id && i.updatedAt);
    assert.equal(m.newItem({ label: "x" }).history[0].etype, "");
    assert.equal(m.newItem({ label: "x", fmt: "計算", named: false }).named, false);
  });
  test("unitById", () => {
    const d = F.demo(); assert.equal(m.unitById(d, "u2").name, "文字と式"); assert.equal(m.unitById(d, "nope"), undefined);
  });
});

describe("教材種別「テスト」", () => {
  test("定数とパス", () => {
    assert.deepEqual(m.MKINDS, ["ワーク", "教科書", "テスト"]); assert.deepEqual(m.BOOK_KINDS, ["教科書", "ワーク"]);
    m.stubs.localStorage.setItem("sb_room", "fam-x");
    try { assert.equal(m.matPath("数学", "テスト", 2), "fam-x/math/ts/2.jpg"); } finally { m.stubs.localStorage.removeItem("sb_room"); }
  });
  test("テストのページは単元のページ範囲と結びつかない（作問の添付・進度の自動判定に混ざらない）", () => {
    const u = { pages: "p.10-12", wbPages: "p.4-5" };
    assert.deepEqual(m.unitPages(u, "テスト"), []);
    const d = F.demo();
    assert.ok(m.materialsForUnits(d, "数学", d.units).every((x) => x.kind !== "テスト"));
    assert.equal(m.unitForPage(d.units, "テスト", 1), null);
  });
  test("タップ登録はテストの答案にも使える（単元は指定のものに）", () => {
    const its = m.tapsToItems([{ path: "fam-demo/math/ts/1.jpg", kind: "テスト", page: 1, x: 0.5, y: 0.5 }], "数学", F.demo().units, "u1");
    assert.equal(its[0].unitId, "u1"); assert.equal(its[0].label, "テスト p.1 の×（1）"); assert.equal(its[0].src.kind, "テスト");
  });
});

describe("累積テストの間隔（30日）", () => {
  test("lastCumOn: 用紙と結果の新しい方。無ければ null", () => {
    assert.equal(m.lastCumOn(F.demo()), day(-10), "p2 の用紙は今日に変えていない。t3 が -12、p2 が -10");
    assert.equal(m.lastCumOn(m.blank()), null);
    assert.equal(m.lastCumOn({ tests: [{ kind: "累積", date: "2026-01-05" }, { kind: "週次", date: "2026-02-01" }] }), "2026-01-05");
  });
  test("ホーム: 30日以上あいたら「累積テストを作る」。29日なら出ない。習った単元と項目が無ければ出ない", () => {
    const d = F.demo();
    const with30 = { ...d, papers: d.papers.filter((p) => p.kind !== "累積"), tests: d.tests.map((x) => (x.kind === "累積" ? { ...x, date: day(-30) } : x)) };
    const a = m.nextActions(with30).A.find((x) => x.k === "cum");
    assert.ok(a && a.title.includes("30 日") && a.mode === "cum" && a.tab === "week");
    const with29 = { ...with30, tests: with30.tests.map((x) => (x.kind === "累積" ? { ...x, date: day(-29) } : x)) };
    assert.equal(m.nextActions(with29).A.find((x) => x.k === "cum"), undefined);
    const never = { ...d, papers: d.papers.filter((p) => p.kind !== "累積"), tests: d.tests.filter((x) => x.kind !== "累積") };
    assert.equal(m.nextActions(never).A.find((x) => x.k === "cum").title, "累積テストを作る");
    assert.equal(m.nextActions({ ...never, items: [] }).A.find((x) => x.k === "cum"), undefined);
  });
});

describe("今日やった最後のページ", () => {
  test("markDoneUpTo: そのページまでの取り込み済みページを「やった」に。済みのものは触らず、後のページは触らない", () => {
    const d = F.demo();
    const r = m.markDoneUpTo(d, "数学", "ワーク", 11);
    const by = Object.fromEntries(r.materials.map((x) => [x.path, x.doneOn || null]));
    assert.equal(by["fam-demo/math/wb/10.jpg"], day(-3)); assert.equal(by["fam-demo/math/wb/11.jpg"], T); assert.equal(by["fam-demo/math/wb/12.jpg"], null);
    assert.equal(by["fam-demo/math/tb/12.jpg"], null, "教科書は触らない");
    assert.equal(m.markDoneUpTo(d, "数学", "ワーク", 5).materials.filter((x) => x.doneOn).length, 1, "手前なら変化なし");
    assert.equal(m.applyAutoProgress(m.markDoneUpTo({ ...d, units: d.units.map((u) => ({ ...u, learnedOn: null })) }, "数学", "ワーク", 12)).units.find((u) => u.id === "u2").learnedOn, T, "進度も進む");
  });
});

describe("バックアップの間隔（30日）", () => {
  test("blank/migrate に backupOn があり、mergeData は新しい日を採用", () => {
    assert.equal(m.blank().backupOn, null); assert.equal(m.migrate({ v: 3, items: [], units: [] }).backupOn, null);
    assert.equal(m.mergeData({ ...m.blank(), backupOn: "2026-09-01" }, { ...m.blank(), backupOn: "2026-08-01" }).backupOn, "2026-09-01");
    assert.equal(m.mergeData({ ...m.blank() }, { ...m.blank(), backupOn: "2026-08-01" }).backupOn, "2026-08-01");
    assert.equal(m.mergeData({ v: 3 }, { v: 3 }).backupOn, null);
  });
  test("ホーム: 書き出していない、または30日以上たてば「バックアップを書き出す」。項目が無ければ出ない", () => {
    const d = F.demo();
    assert.equal(m.nextActions(d).A.find((x) => x.k === "backup").title, "バックアップを書き出す");
    assert.equal(m.nextActions({ ...d, backupOn: day(-5) }).A.find((x) => x.k === "backup"), undefined);
    assert.ok(m.nextActions({ ...d, backupOn: day(-31) }).A.find((x) => x.k === "backup").title.includes("31 日"));
    assert.equal(m.nextActions({ ...d, items: [] }).A.find((x) => x.k === "backup"), undefined);
    assert.equal(m.nextActions(d).A.slice(-1)[0].k, "backup", "優先度は最後");
  });
});

describe("定期テスト前の後ろ倒し", () => {
  const it = (o) => item({ history: [], ...o });
  const base = (left) => ({ ...m.blank(), exams: [{ id: "e", name: "中間", date: day(left), unitIds: ["in"], actual: {}, updatedAt: "" }],
    items: [it({ id: "a", unitId: "out", nextDue: day(2), level: 2 }), it({ id: "b", unitId: "in", nextDue: day(1) }), it({ id: "c", unitId: "", nextDue: day(2) }),
      it({ id: "p", unitId: "out", nextDue: day(1), printedOn: day(-1) }), it({ id: "q", unitId: "out", nextDue: T, pending: { d: T, self: "o" } }), it({ id: "f", unitId: "out", nextDue: day(40) })] });
  test("14日前から、範囲外で期日が来る項目だけをテスト翌日に。level は変えない", () => {
    const r = m.deferForExam(base(10));
    const a = r.items.find((x) => x.id === "a");
    assert.equal(a.nextDue, day(11)); assert.deepEqual(a.defer, { examId: "e", from: day(2) }); assert.equal(a.level, 2);
    for (const id of ["b", "c", "p", "q"]) assert.equal(r.items.find((x) => x.id === id).nextDue, base(10).items.find((x) => x.id === id).nextDue, id + " は触らない");
    assert.equal(r.items.find((x) => x.id === "f").nextDue, day(40), "テスト後の期日はそのまま");
    assert.equal(m.printSet(r).length, 1, "印刷対象は範囲内だけ");
    const r2 = m.deferForExam(r); assert.deepEqual(r2, r, "何度呼んでも同じ");
  });
  test("15日前・範囲なし・テストなし・過ぎたテストでは何もしない", () => {
    assert.equal(m.deferForExam(base(15)).items.find((x) => x.id === "a").nextDue, day(2));
    const noRange = base(10); noRange.exams[0].unitIds = []; assert.equal(m.deferForExam(noRange).items.find((x) => x.id === "a").nextDue, day(2));
    assert.equal(m.deferForExam(m.blank()).items.length, 0);
    assert.equal(m.deferForExam(base(-1)).items.find((x) => x.id === "a").nextDue, day(2));
  });
  test("テスト後: 判定すると元の間隔で進み、後ろ倒しの印が消える", () => {
    const a = m.deferForExam(base(10)).items.find((x) => x.id === "a");
    const j = m.applyJudgment(a, "o"); assert.equal(j.level, 3); assert.equal(j.nextDue, day(14)); assert.equal(j.defer, null);
  });
  test("deferredFor: そのテストで後ろ倒し中の項目", () => {
    const r = m.deferForExam(base(10));
    assert.deepEqual(m.deferredFor(r, r.exams[0]).map((x) => x.id), ["a"]);
    assert.deepEqual(m.deferredFor(F.demo(), F.demo().exams[0]), []);
  });
});

describe("模試（段階1: 種別と範囲）", () => {
  const withAI = async (reply, fn) => {
    const orig = globalThis.fetch; const calls = [];
    m.stubs.localStorage.setItem("anthropic_api_key", "sk");
    globalThis.fetch = async (url, opts) => { calls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null }); if (url.includes("/storage/")) return { ok: false, status: 404 }; return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: JSON.stringify(reply) }] }) }; };
    try { return await fn(calls); } finally { globalThis.fetch = orig; m.stubs.localStorage.removeItem("anthropic_api_key"); }
  };
  test("upcomingExams / examSubjects / mocksFor / mockRound", () => {
    const d = F.demo();
    assert.deepEqual(m.upcomingExams(d).map((e) => e.id), ["e1"]);
    assert.deepEqual(m.examSubjects(d, d.exams[0]), ["数学", "英語"]);
    assert.deepEqual(m.mocksFor(d, d.exams[0]), []);
    assert.deepEqual([14, 10, 7, 5, 3, 1, 0, 15, -1, null].map(m.mockRound), [14, 14, 7, 7, 3, 3, 3, null, null, null]);
  });
  test("genPaper: 週次と同じ経路で、模試は kind・examId・50分・100点を持つ", async () => {
    const d = F.demo(); const ex = d.exams[0]; const units = d.units.filter((u) => u.subject === "数学" && ex.unitIds.includes(u.id));
    await withAI({ questions: [{ q: "q1", a: "a1", unit: "正負の数", fmt: "計算", aim: "x", label: "l1" }, { q: "q2", a: "a2", unit: "文字と式", fmt: "知識・用語", aim: "y", label: "l2" }] }, async (calls) => {
      const { paper } = await m.genPaper(d, "数学", units, { kind: "模試", fields: { examId: ex.id, examName: "2学期中間", left: 10, round: 14 } });
      assert.deepEqual([paper.kind, paper.subject, paper.examId, paper.examName, paper.minutes, paper.maxScore, paper.round, paper.status], ["模試", "数学", "e1", "2学期中間", 50, 100, 14, "printed"]);
      assert.equal(paper.questions.length, 2); assert.equal(paper.questions[1].unitId, "u2"); assert.ok(paper.code.endsWith("模"));
      const w = await m.genPaper(d, "数学", units, { kind: "週次", n: "5" });
      assert.equal(w.paper.kind, "週次"); assert.equal(w.paper.minutes, undefined);
      assert.ok(calls.some((c) => c.body && JSON.stringify(c.body).includes("模試")));
    });
    await assert.rejects(() => m.genPaper(d, "社会", [], { kind: "週次" }), /出題範囲の単元がありません/);
  });
  test("paperTitle", () => {
    assert.equal(m.paperTitle({ kind: "模試", examName: "中間" }), "模試（中間）"); assert.equal(m.paperTitle({ kind: "週次" }), "週次テスト"); assert.equal(m.paperTitle({ kind: "類題" }), "類題");
  });
  test("模試は週次の判断と「今日作った教科をまとめてPDF」に混ざらない", () => {
    const d = F.demo(); d.papers.push({ id: "mk", kind: "模試", subject: "数学", date: T, examId: "e1", questions: [], unitIds: [], status: "printed", updatedAt: "" });
    assert.equal(m.lastCumOn(d), day(-10));
  });
});

describe("模試（段階2: 本番の形式）", () => {
  test("flattenSections: 大問ごとの問題を1列にし、sec に大問名", () => {
    const qs = m.flattenSections({ sections: [{ title: "【1】用語", questions: [{ q: "a" }, { q: "b" }] }, { title: "【2】計算", questions: [{ q: "c" }] }] });
    assert.deepEqual(qs.map((x) => [x.q, x.sec]), [["a", "【1】用語"], ["b", "【1】用語"], ["c", "【2】計算"]]);
    assert.deepEqual(m.flattenSections({ questions: [{ q: "z" }] }).map((x) => x.sec), [""]);
    assert.deepEqual(m.flattenSections({}), []);
  });
  test("normalizePts: 合計をちょうど100に。欠けは1点扱い、端数は最後で調整", () => {
    const qs = [{ pts: 3 }, { pts: 3 }, { pts: 3 }]; m.normalizePts(qs, 100);
    assert.equal(qs.reduce((a, q) => a + q.pts, 0), 100); assert.deepEqual(qs.map((q) => q.pts), [33, 33, 34]);
    const q2 = [{ pts: 0 }, { pts: "x" }, { pts: 8 }]; m.normalizePts(q2, 100);
    assert.equal(q2.reduce((a, q) => a + q.pts, 0), 100); assert.ok(q2[2].pts > q2[0].pts);
    assert.deepEqual(m.normalizePts([], 100), []);
  });
  test("用紙: 大問の見出し・配点・50分・100点満点が出る", () => {
    const p = { id: "p", code: "c", subject: "数学", date: T, kind: "模試", examName: "中間", minutes: 50, maxScore: 100, title: "", passage: "", unitIds: [], imgs: [], status: "printed",
      questions: [{ n: 1, q: "q1", a: "a1", label: "l", aim: "", fmt: "計算", svg: "", sec: "【1】用語", pts: 40 }, { n: 2, q: "q2", a: "a2", label: "l", aim: "", fmt: "計算", svg: "", sec: "【1】用語", pts: 30 }, { n: 3, q: "q3", a: "a3", label: "l", aim: "", fmt: "記述・作文", svg: "", sec: "【4】記述", pts: 30 }] };
    const h = m.paperHTML(p);
    assert.equal((h.match(/class="sech"/g) || []).length, 2, "同じ大問の見出しは1回");
    assert.ok(h.includes("【1】用語") && h.includes("【4】記述") && h.includes("（40点）") && h.includes("50分") && h.includes("／100") && h.includes("模試（中間）"));
    assert.ok(!m.paperHTML({ ...p, kind: "週次", minutes: undefined, maxScore: undefined, questions: p.questions.map((q) => ({ ...q, sec: "", pts: 0 })) }).includes("sech"));
  });
  test("mockPromptFor は教科ごとの大問構成と、参考答案があればその指示を含む", () => {
    assert.ok(m.MOCK_SECTIONS && Object.keys(m.MOCK_SECTIONS).length === 5);
    assert.ok(m.mockPromptFor("数学", 0).includes("50分・100点満点") && m.mockPromptFor("数学", 0).includes("【2】計算") && !m.mockPromptFor("数学", 0).includes("参考"));
    assert.ok(m.mockPromptFor("英語", 2).includes("参考") && m.mockPromptFor("英語", 2).includes("英作文"));
  });
});
