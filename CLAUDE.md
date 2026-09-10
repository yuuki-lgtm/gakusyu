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
  units:[{id, subject, name, pages(教科書), wbPages(ワーク), learnedOn(習った日|null), learnedBy('auto'|undefined), lastTestedOn, updatedAt}],
  items:[{id, subject, unitId, label, note, fmt, etype, createdOn,
          history:[{d, r:'x'|'o'|'oo', self, etype, etypeSelf}],
          level(0-5), failCount, nextDue, status:'active'|'stable',
          pending:{d, self, selfE, pm}|null, gen, genOn(類題を作った日), printedOn(紙に印刷した日|null), diag,
          src:{path, kind, page, x, y}|undefined(教材のページとタップ位置), named(false なら仮の名前), updatedAt}],
  tests:[{id, subject, date, kind:'週次'|'累積'|'定期'|'読解', source, rows:[{fmt,total,correct}], total, correct, unitIds, paperId, updatedAt}],
  papers:[{id, code, subject, date, kind, title, passage, unitIds, questions:[{n,q,a,unitId,fmt,aim,label,svg,fig}],
          refs:[{n, kind, page, path}](資料にする教材ページの参照), imgs:[b64](旧データの写真), status:'printed'|'graded', model, updatedAt}],
  log:{'YYYY-MM-DD':true}, exams:[{id,name,date,unitIds,actual:{教科:点},updatedAt}],
  writing:[{id,date,subject,len,structure,surface,note,updatedAt}],
  materials:[{id, subject, kind, page, path, doneOn(やった日|null), idx:{ns:[問題番号], at}|undefined, updatedAt}], deleted:[id] }
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
- 作問は選んだ単元の教科書・ワークのページを「図1〜図N」として自動で添付する。どちらか片方だけでも、なくても動く。手で写真を撮る欄はない。
- 問題文が参照した図（「図3」または `fig`）のページだけを用紙の `refs` に参照として持ち、資料ページに印刷する。画像は用紙に持たず、`resolveRefs()` が PDF 生成時・HTML 保存時に Storage から読む。プレビューは枠だけ。
- ×の登録は「教科→教材→ページを開く→×の問題を指でタップ」。保存するのはタップ位置だけ（`src:{path, kind, page, x, y}`、0〜1の割合）。仮の名前 `named:false` で登録し、`nameItems()` が登録直後にページごとに1回 AI を呼んで名前と形式を付ける。失敗しても仮の名前のまま動き、類題生成のとき `applyGen()` でもう一度付ける。誤答の種類は「知らなかった」が初期値で、一覧と印のポップアップで変えられる。
- AI に問題を指すときは `annotateB64()` でページ画像に赤い印（複数なら番号つき）を描き込んで渡す。索引や番号の一致は使わない。読み間違いは「別の問題」で作り直す。
- 索引は裏で持つ。`materials[].doneOn`（×を登録した、または「×なし（やった）」を押した日）と `materials[].idx:{ns:[問題番号], at}`（ページを開いたときに `buildIndex()` が裏で作る。1ページ1回だけで、保存して同期に乗せる。失敗はセッション内で再試行しない。入れ直しで索引は捨て、`doneOn` は引き継ぐ）。用途は `applyAutoProgress()`（やったページを含む単元を自動で「習った」に。手動の「ここまで」は補助）と、定期テスト画面の `untouchedPages()`（範囲内で取り込み済みなのにやっていないページと問題数）だけ。索引が外れていても登録と類題には影響しない。
- 「答案の写真から候補を出す」方式と「問題番号の入力」方式は廃止。手入力の1件追加は残す。

## 画面
ホーム（いまやること1つ）／今日（採点・印刷・カード）／テスト（作る・撮る・読解・記述・手入力）／登録（単元・項目・一覧・教材）／分析／定期／依頼文／設定

## 「今日」の運用（紙で回す）
- 夜の2ステップ。ホームの「いまやること」は「昨日の分を採点 → 今日の分を印刷」の順。
- 印刷: `printSet(d)`（明日までに期日が来る未印刷の項目）の類題を `genForItem()` で自動生成し（1項目3問、用語は「〜を書きなさい」の記述形式、その他は説明の問いを1問足す）、`genToPaper()` で教科・単元の見出し付き1枚のPDFに。解答は別ページ。各項目の最後に「自分の判定」の欄。生成後に `printedOn` を付ける。
- 採点: `gradeSet(d)`（`printedOn` のある項目）を一覧にし、子どもの判定（紙の印）→親の判定を押して `judgeAll()` でまとめて確定。「やっていない」は印刷前に戻す。判定の中身は `applyJudgment` のまま。
- カード: 従来の1件ずつの画面（類題を画面で見る、診断）。子どもが画面で判定する運用もここに残る。

## AI
- Anthropic API を直接呼ぶ（`anthropic-dangerous-direct-browser-access`）。キーは localStorage。
- モデルは `claude-opus-5`、失敗時 `claude-sonnet-4-6`。
- 出力は必ず JSON 指定、`parseJSON()` で取り出す。
- 用途: 類題生成／診断／採点済み答案の○×読み取り（自作テスト）／目次から単元抽出／タップした問題の項目名付け／ページの問題番号の索引／作問／読解の文章と設問／記述の添削。
- 教科書・既存作品の文章は複製しない。文章は新規に書く。

## 印刷
- `paperHTML(p, res)` で用紙HTMLを組み（`res` は `resolveRefs()` が読んだ教材ページの base64）、`buildPDF()` で html2canvas + jsPDF によりA4に詰める（ブロックごとに画像化、境目で切らない）。
- `buildPDF(papers)` は用紙の配列も受ける。各用紙の「資料＋問題」（`data-part="q"`）を先に並べ、用紙ごとにページ数が奇数なら白紙を足して偶数にし、解答（`data-part="a"`）は全用紙ぶんを最後に、教科で改ページせず1つの流れで詰める。両面印刷1回で解答が別の紙になるため。今日の類題PDFも「今日作った教科をまとめてPDF」も同じ経路。2026-09-10 に Windows Chrome で6ページ（2教科）と3ページ（類題）を確認済み。
- 既知の問題: html2canvas は oklab/oklch を読めない。対策として独立 iframe 内で描画している。Claude.ai のアーティファクト内ではまだ再現する可能性あり。**実ブラウザで確認すること。**
- iOS Safari では `navigator.share` でPDFを共有シートへ。

## バージョン
`index.html` の `VERSION`（ヘッダー右端と設定タブに表示）は、git の pre-commit フック `tools/pre-commit` がコミット日時で自動更新する。別の環境で作業するときは一度 `sh tools/install-hooks.sh` を実行する。

## テスト
`npm test` で全部走る（`npm install` を一度だけ。node の組み込みテストランナー、追加の枠組みなし）。**修正したら必ず通す。**
- `test/load.js` — index.html の `<script type="text/babel">` を取り出し、Babel で JSX を変換して node で評価する。localStorage / document / window / navigator は最小のスタブ。関数やコンポーネントを足したら `EXPORTS` に名前を追加する。
- `test/fixtures.js` — デモ／空／pending あり の3状態のデータ。日付は今日基準の相対。スキーマを変えたらここも直す。
- `test/render.test.js` — `react-dom/server` の `renderToString` で全タブ・全サブモード（テスト5種、登録4種）と用紙プレビューを3状態で描画。React の警告（console.error）、画面に出る `undefined` / `NaN` も失敗にする。
- `test/core.test.js` — applyJudgment, retention, migrate, mergeData, paperHTML, pickUnits, Storage の読み書き, parsePages / applyTOC / materialsForUnits / genContent の単体テスト。
- 実機（iPhone Safari と Mac Chrome）で PDF 生成・写真読み取り・ホーム画面追加を確認する。

## やらないこと
- 通知、ゲーミフィケーション、子ども向けダッシュボード、画面上での出題。
- 機能を足す前に「続くか」を問う。迷ったら足さない。

## 次の作業
1. 教材画像（2026-09-10 実装、5段階すべてコミット済み。テストのみ、実ブラウザ未確認）を実機で確認する。
   - Supabase の SQL Editor で「設定」タブの SQL のうちバケットとポリシーの分を実行する（既存プロジェクトは state の分は不要）。
   - 「登録→教材」で PDF と複数画像の取り込み（iPhone Safari で pdf.js が動くか、ページ番号が合うか）。
   - 「登録→単元」でワークの目次を撮り、既存単元への対応づけとページ範囲の手直し。
   - 「テスト→作る」で「添付される教材」が出て作問が通るか。図を参照した問題があれば PDF の資料ページに教材のページが入るか。「登録→項目」で教材から×を登録し、翌日の類題に元の問題が効くか。
   - 「今日→印刷」で類題の自動生成と1枚のPDF（見出し・説明の問い・自分の判定の欄）、翌日「今日→採点」でまとめて確定できるか。
   - 「登録→落とした項目」でページの×をタップして登録し、数秒後に項目名が付くか。印の当たり判定（22px）が指で押しやすいか。定期テストの画面に手つかずのページが出るか。
2. iPhone Safari で PDF 生成（共有シート）を確認。Windows Chrome での生成・保存は 2026-09-09 に確認済み。
3. iPhone Safari で写真読み取り（採点済み答案、目次、ワークの×）を確認。
4. Supabase 同期を2端末で確認。
5. コードを整理（1ファイルのままでよいが、関数の順序と重複を直す）。
