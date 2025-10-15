# diff-formatter

Markdown内のdiffブロックを整形するツール。ネストされたdiffブロック内の`-`/`+`行のインデントを自動調整します。

## 概要

Markdownファイル内の````diff```ブロックにおいて、ネストレベルに応じて`-`（削除行）と`+`（追加行）のインデントを適切に整形します。diffブロックのインデントレベルを検出し、そのレベル分だけ`-`/`+`記号の後のスペースを調整します。

## 使い方

標準入力からMarkdownを読み込み、整形結果を標準出力に出力します：

```bash
cat input.md | node src/format-diff.js > output.md
```

または：

```bash
node src/format-diff.js < input.md > output.md
```

