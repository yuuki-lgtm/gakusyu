# 学習ループ — 開発の引き継ぎ

中学1年生の定期テスト対策を、親が1日5分＋土曜1時間で回すためのWebアプリ。
`index.html` 1ファイルで完結（React 18 + Babel standalone をCDNから読む）。GitHub Pages に置き、iPhoneのホーム画面から使う。

## 依頼者について
- 勇樹さん。UIデザイナー。コードは書かない。日本語のみ。返答は簡潔に、忖度なし、結論から。
- 「便利」より「続くか」を最優先する。機能追加の提案は原則しない。削る提案は歓迎される。

## 絶対に変えない設計思想
1. **未定着リストが軸。** 点数ではなく「まだ身についていない項目」を管理する。
2. **定着の判定は白紙再生のみ。** ノートが埋まった、ワークを解いた、は証拠にならない。
3. **初見と再テストを区別。** 学力の推移は初見だけで測る。再テストの点は実力ではない。
4. **項目は消えない。** 正解で間隔が伸びる（1→3→7→14→30→60日）。落とせば1日に戻る。30日以上あけて正解した状態を「安定」と呼ぶ。
5. **「解けた」だけでは7日から先に進まない。** 「説明もできた」で初めて長い間隔へ（用語は除く）。
6. **3回落ちたら反復をやめて診断。** 前提の単元に戻る。
7. **親は開始の声かけ・採点・夜の確定だけ。** 横で見張らない、教えない。監査は翌日の白紙テスト。
8. **子どもが先に判定し、親が確定。** 一致率が「採点を子どもに渡す時期」の目安。
9. **紙でやらせる。** 画面を見せながら解かせない。問題はPDFで印刷。
10. **作れない形式（図・資料・長文・記述）も測る。** 学校ワークの結果を形式別に入れれば弱点として見える。

## データ構造（v3）
```
{ v:3, updatedAt,
  units:[{id, subject, name, pages, learnedOn(習った日|null), lastTestedOn, updatedAt}],
  items:[{id, subject, unitId, label, note, fmt, etype, createdOn,
          history:[{d, r:'x'|'o'|'oo', self, etype, etypeSelf}],
          level(0-5), failCount, nextDue, status:'active'|'stable',
          pending:{d, self, selfE, pm}|null, gen, diag, updatedAt}],
  tests:[{id, subject, date, kind:'週次'|'累積'|'定期'|'読解', source, rows:[{fmt,total,correct}], total, correct, unitIds, paperId, updatedAt}],
  papers:[{id, code, subject, date, kind, title, passage, unitIds, questions:[{n,q,a,unitId,fmt,aim,label,svg}], imgs:[b64], status:'printed'|'graded', model, updatedAt}],
  log:{'YYYY-MM-DD':true}, exams:[{id,name,date,unitIds,actual:{教科:点},updatedAt}],
  writing:[{id,date,subject,len,structure,surface,note,updatedAt}],
  materials:[{id, subject, kind, page, path, updatedAt}], deleted:[id] }
```
- 定数: `FORMATS`（出題形式8種）、`ETYPES`（誤答の種類4種）、`INT=[1,3,7,14,30,60]`、`STABLE_LEVEL=4`
- `applyJudgment(item, r)` が間隔反復の核。変えるときは必ずテストを通す。
- `migrate()` で旧データ（v2）を引き継ぐ。壊さない。
- 同期は Supabase の1行に全体をJSONで保存。`mergeData()` で項目単位に新しい方を採用。`deleted` は墓標。

## 教材画像（ワーク・教科書）
- 教材画像は Supabase Storage（非公開バケット `materials`）に置き、端末には索引だけ持つ。家庭内の私的使用に限る。
- 単位は「教科 × 教材種別（ワーク／教科書）× ページ」。パスは `共有ID/math/wb/12.jpg`（`SUBJ_CODE`・`KIND_CODE`）。共有IDがアクセスの鍵。
- 索引 `materials:[{id, subject, kind:'ワーク'|'教科書', page, path, updatedAt}]`。同じページの再取り込みは同じ id を上書き。画像の base64 は localStorage に入れない（5MB制限）。
- 単元は教科書のページ範囲 `pages` とワークのページ範囲 `wbPages` を別々に持つ。`parsePages()` で数値の配列にする。
- 作問は選んだ単元の教科書・ワークのページを自動で添付する（参考資料。用紙には印刷しない）。どちらか片方だけでも、なくても動く。
- ×の登録は「教科→教材→ページ→問題番号」の選択式。AIが該当問題を読んで項目名を作る。項目は `src:{path, kind, page, q}` を持ち、類題生成でその画像を渡す。

## 画面
ホーム（いまやること1つ）／今日（回収）／テスト（作る・撮る・読解・記述・手入力）／登録（単元・項目・一覧・教材）／分析／定期／依頼文／設定

## AI
- Anthropic API を直接呼ぶ（`anthropic-dangerous-direct-browser-access`）。キーは localStorage。
- モデルは `claude-opus-5`、失敗時 `claude-sonnet-4-6`。
- 出力は必ず JSON 指定、`parseJSON()` で取り出す。
- 用途: 類題生成／診断／採点済み答案の○×読み取り／目次から単元抽出／答案から項目抽出／作問／読解の文章と設問／記述の添削。
- 教科書・既存作品の文章は複製しない。文章は新規に書く。

## 印刷
- `paperHTML()` で用紙HTMLを組み、`buildPDF()` で html2canvas + jsPDF によりA4に詰める（ブロックごとに画像化、境目で切らない）。
- 既知の問題: html2canvas は oklab/oklch を読めない。対策として独立 iframe 内で描画している。Claude.ai のアーティファクト内ではまだ再現する可能性あり。**実ブラウザで確認すること。**
- iOS Safari では `navigator.share` でPDFを共有シートへ。

## テスト
`npm test` で全部走る（`npm install` を一度だけ。node の組み込みテストランナー、追加の枠組みなし）。**修正したら必ず通す。**
- `test/load.js` — index.html の `<script type="text/babel">` を取り出し、Babel で JSX を変換して node で評価する。localStorage / document / window / navigator は最小のスタブ。関数やコンポーネントを足したら `EXPORTS` に名前を追加する。
- `test/fixtures.js` — デモ／空／pending あり の3状態のデータ。日付は今日基準の相対。スキーマを変えたらここも直す。
- `test/render.test.js` — `react-dom/server` の `renderToString` で全タブ・全サブモード（テスト5種、登録3種）と用紙プレビューを3状態で描画。React の警告（console.error）、画面に出る `undefined` / `NaN` も失敗にする。
- `test/core.test.js` — applyJudgment, retention, migrate, mergeData, paperHTML, pickUnits の単体テスト。
- 実機（iPhone Safari と Mac Chrome）で PDF 生成・写真読み取り・ホーム画面追加を確認する。

## やらないこと
- 通知、ゲーミフィケーション、子ども向けダッシュボード、画面上での出題。
- 機能を足す前に「続くか」を問う。迷ったら足さない。

## 次の作業
1. iPhone Safari で PDF 生成（共有シート）を確認。Windows Chrome での生成・保存は 2026-09-09 に確認済み。
2. iPhone Safari で写真読み取り（採点済み答案、目次、ワークの×）を確認。
3. Supabase 同期を2端末で確認。
4. コードを整理（1ファイルのままでよいが、関数の順序と重複を直す）。
