/* テスト用データ。デモ／空／pending あり の3状態。日付は今日を基準に相対で作る。 */
"use strict";

// 1x1 の JPEG（資料ページの描画確認用）
const TINY_JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

function fixtures(m) {
  const T = m.today();
  const day = (n) => m.addDays(T, n);
  const ts = (n) => new Date(day(n) + "T09:00:00Z").toISOString();

  const empty = () => m.blank();

  const demo = () => ({
    v: 3, updatedAt: ts(0),
    units: [
      { id: "u1", subject: "数学", name: "正負の数", pages: "p.10-30", wbPages: "p.4-11", learnedOn: day(-30), lastTestedOn: day(-10), updatedAt: ts(-10) },
      { id: "u2", subject: "数学", name: "文字と式", pages: "p.31-50", wbPages: "p.12-19", learnedOn: day(-7), lastTestedOn: null, updatedAt: ts(-7) },
      { id: "u3", subject: "数学", name: "方程式", pages: "", learnedOn: null, lastTestedOn: null, updatedAt: ts(-7) },
      { id: "u4", subject: "英語", name: "be動詞", pages: "p.8-20", learnedOn: day(-50), lastTestedOn: day(-40), updatedAt: ts(-40) },
      { id: "u5", subject: "社会", name: "世界の姿", pages: "p.6-25", learnedOn: day(-20), lastTestedOn: day(-3), updatedAt: ts(-3) },
      { id: "u6", subject: "理科", name: "植物のつくり", pages: "p.12-40", learnedOn: day(-20), lastTestedOn: null, updatedAt: ts(-20) },
      { id: "u7", subject: "国語", name: "説明文の読み方", pages: "p.20-35", learnedOn: day(-14), lastTestedOn: day(-7), updatedAt: ts(-7) },
    ],
    items: [
      { id: "i1", subject: "数学", unitId: "u1", label: "負の数のかけ算", note: "符号を落とす", fmt: "計算", etype: "分かっていたが間違えた", createdOn: day(-8),
        history: [{ d: day(-8), r: "x", self: "x", etype: "分かっていたが間違えた", etypeSelf: "知らなかった" }, { d: day(-7), r: "o", self: "o", etype: "", etypeSelf: "" }, { d: day(-1), r: "x", self: "o", etype: "分かっていたが間違えた", etypeSelf: "" }],
        level: 0, failCount: 2, nextDue: T, status: "active", pending: null,
        gen: { problems: [{ q: "(−2)×(+5) を計算しなさい。", a: "−10" }, { q: "(−3)×(−4) を計算しなさい。", a: "12" }, { q: "(−6)÷(+2) を計算しなさい。", a: "−3" }], why: "負×負が正になる理由", passage: "" },
        diag: null, src: { path: "fam-demo/math/wb/11.jpg", kind: "ワーク", page: 11, x: 0.3, y: 0.42 }, genOn: day(-1), printedOn: day(-1), updatedAt: ts(-1) },
      { id: "i2", subject: "数学", unitId: "u2", label: "文字式の表し方（÷）", note: "", fmt: "図・作図・グラフ", etype: "知らなかった", createdOn: day(-20),
        history: [{ d: day(-20), r: "x", self: "x", etype: "知らなかった", etypeSelf: "知らなかった" }, { d: day(-15), r: "x", self: "o", etype: "知らなかった", etypeSelf: "" }, { d: day(-3), r: "x", self: "x", etype: "読み間違えた", etypeSelf: "読み間違えた" }],
        level: 0, failCount: 3, nextDue: day(-2), status: "active", pending: null, gen: null,
        diag: { cause: "分数の意味があいまい", prereq: "小6 分数のわり算", steps: [{ do: "分数のわり算を5問", check: "全問正解" }, { do: "a÷b を分数で表す練習", check: "3問連続正解" }] }, updatedAt: ts(-3) },
      { id: "i3", subject: "数学", unitId: "u1", label: "絶対値", note: "", fmt: "知識・用語", etype: "", createdOn: day(-60),
        history: [{ d: day(-60), r: "x", self: "x", etype: "知らなかった", etypeSelf: "知らなかった" }, { d: day(-45), r: "o", self: "o", etype: "", etypeSelf: "" }, { d: day(-10), r: "o", self: "o", etype: "", etypeSelf: "" }],
        level: 4, failCount: 1, nextDue: day(20), status: "stable", pending: null, gen: null, diag: null, updatedAt: ts(-10) },
      { id: "i4", subject: "英語", unitId: "u4", label: "三人称単数の be動詞", note: "is と are", fmt: "英作文", etype: "分かっていたが間違えた", createdOn: day(-40),
        history: [{ d: day(-40), r: "o", self: "o", etype: "", etypeSelf: "" }, { d: day(-5), r: "x", self: "o", etype: "分かっていたが間違えた", etypeSelf: "" }],
        level: 1, failCount: 1, nextDue: day(2), status: "active", pending: null, gen: null, diag: null, updatedAt: ts(-5) },
      { id: "i5", subject: "国語", unitId: "u7", label: "指示語の内容を答える", note: "", fmt: "長文読解", etype: "", createdOn: day(-2),
        history: [], level: 0, failCount: 1, nextDue: T, status: "active", pending: null, gen: null, diag: null, updatedAt: ts(-2) },
      { id: "i6", subject: "社会", unitId: "u5", label: "六大陸の名前", note: "", fmt: "資料・地図の読み取り", etype: "", createdOn: day(-3),
        history: [{ d: day(-3), r: "oo", self: "oo", etype: "", etypeSelf: "" }], level: 1, failCount: 0, nextDue: T, status: "active", pending: null, gen: null, diag: null, updatedAt: ts(-3) },
    ],
    tests: [
      { id: "t1", subject: "数学", date: day(-10), kind: "週次", source: "", rows: [{ fmt: "計算", total: 6, correct: 4 }, { fmt: "図・作図・グラフ", total: 4, correct: 1 }], total: 10, correct: 5, unitIds: ["u1"], paperId: "p2", updatedAt: ts(-10) },
      { id: "t2", subject: "英語", date: day(-40), kind: "累積", source: "", rows: [{ fmt: "英作文", total: 5, correct: 3 }, { fmt: "知識・用語", total: 5, correct: 5 }], total: 10, correct: 8, unitIds: ["u4"], updatedAt: ts(-40) },
      { id: "t3", subject: "英語", date: day(-12), kind: "累積", source: "", rows: [{ fmt: "英作文", total: 5, correct: 4 }], total: 5, correct: 4, unitIds: ["u4"], updatedAt: ts(-12) },
      { id: "t4", subject: "社会", date: day(-60), kind: "定期", source: "1学期期末", rows: [{ fmt: "知識・用語", total: 30, correct: 24 }, { fmt: "資料・地図の読み取り", total: 10, correct: 5 }, { fmt: "記述・作文", total: 5, correct: 2 }], total: 45, correct: 31, unitIds: ["u5"], updatedAt: ts(-60) },
      { id: "t5", subject: "国語", date: day(-7), kind: "読解", source: "", rows: [{ fmt: "長文読解", total: 6, correct: 4 }], total: 6, correct: 4, unitIds: ["u7"], updatedAt: ts(-7) },
    ],
    papers: [
      { id: "p1", code: "0909数", subject: "数学", date: T, kind: "週次", title: "", passage: "", unitIds: ["u1", "u2"], status: "printed", model: "Opus 5", updatedAt: ts(0), imgs: [], refs: [{ n: 2, kind: "ワーク", page: 11, path: "fam-demo/math/wb/11.jpg" }],
        questions: [
          { n: 1, q: "次の計算をしなさい。途中式も書くこと。\n(−3) × (+4) − (−8) ÷ (−2)", a: "−12 − 4 = −16", unitId: "u1", fmt: "計算", aim: "乗除の符号", label: "負の数のかけ算", svg: "" },
          { n: 2, q: "図2の数直線を見て、−2.5 の位置に点を打ちなさい。", a: "0 から左へ 2.5", unitId: "u1", fmt: "図・作図・グラフ", aim: "数直線", label: "数直線上の小数", fig: 2,
            svg: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 60' width='400'><line x1='20' y1='30' x2='380' y2='30' stroke='#111'/><text x='300' y='54' font-size='14'>0</text></svg>" },
          { n: 3, q: "「x を 3 倍して 5 を引いた数」を文字式で表しなさい。", a: "3x − 5", unitId: "u2", fmt: "知識・用語", aim: "文字式", label: "ことばを文字式にする", svg: "" },
        ] },
      { id: "p2", code: "0830英", subject: "英語", date: day(-10), kind: "累積", title: "My Morning", passage: "I get up at six. I eat toast and drink milk.\nMy dog Max is small.", unitIds: ["u4"], status: "graded", model: "Sonnet 4.6", updatedAt: ts(-10), imgs: [TINY_JPEG],
        questions: [
          { n: 1, q: "What does the writer drink? 英語で答えなさい。", a: "Milk. / He drinks milk.", unitId: "u4", fmt: "長文読解", aim: "本文の情報を拾う", label: "本文の情報を拾う", svg: "" },
          { n: 2, q: "「私の犬は小さい」を英語にしなさい。", a: "My dog is small.", unitId: "u4", fmt: "英作文", aim: "be動詞", label: "三人称単数の be動詞", svg: "" },
        ] },
    ],
    exams: [
      { id: "e1", name: "2学期中間", date: day(20), unitIds: ["u1", "u2", "u4"], actual: {}, updatedAt: ts(-1) },
      { id: "e2", name: "1学期期末", date: day(-60), unitIds: ["u5"], actual: { 数学: 72, 英語: 65, 社会: 58 }, updatedAt: ts(-50) },
    ],
    writing: [
      { id: "w1", date: day(-7), subject: "国語", len: 2, structure: 1, surface: 0, note: "主語と述語のねじれ", updatedAt: ts(-7) },
      { id: "w2", date: day(-14), subject: "国語", len: 1, structure: 1, surface: 1, note: "", updatedAt: ts(-14) },
      { id: "w3", date: day(-7), subject: "英語", len: 2, structure: 2, surface: 1, note: "三単現の s", updatedAt: ts(-7) },
    ],
    materials: [
      { id: "m1", subject: "数学", kind: "ワーク", page: 10, path: "fam-demo/math/wb/10.jpg", updatedAt: ts(-30) },
      { id: "m2", subject: "数学", kind: "ワーク", page: 11, path: "fam-demo/math/wb/11.jpg", updatedAt: ts(-30) },
      { id: "m3", subject: "数学", kind: "ワーク", page: 12, path: "fam-demo/math/wb/12.jpg", updatedAt: ts(-30) },
      { id: "m4", subject: "数学", kind: "教科書", page: 12, path: "fam-demo/math/tb/12.jpg", updatedAt: ts(-30) },
      { id: "m5", subject: "英語", kind: "教科書", page: 8, path: "fam-demo/eng/tb/8.jpg", updatedAt: ts(-30) },
    ],
    log: { [T]: true, [day(-1)]: true, [day(-2)]: true, [day(-4)]: true },
    deleted: ["old-item-1"],
  });

  /* 子どもが判定済みで、親の確定待ちの項目がある状態 */
  const pending = () => {
    const d = demo();
    d.items = d.items.map((i) => {
      if (i.id === "i1") return { ...i, pending: { d: T, self: "o", selfE: "", pm: { 0: "o", 1: "o", 2: "x" } } };
      if (i.id === "i5") return { ...i, pending: { d: T, self: "x", selfE: "知らなかった", pm: {} } };
      if (i.id === "i6") return { ...i, pending: { d: T, self: "oo", selfE: "", pm: {} } };
      return i;
    });
    return d;
  };

  return { empty, demo, pending, T, day, ts, TINY_JPEG };
}

module.exports = { fixtures, TINY_JPEG };
