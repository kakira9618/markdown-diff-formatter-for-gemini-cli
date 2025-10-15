# markdown-diff-formatter-for-gemini-cli

Markdown内のdiffブロックを整形するツール。ネストされたdiffブロック内の`-`/`+`行のインデントを自動調整します。

## 概要

Markdownファイル内の diff ブロックにおいて、ブロックのネストレベルに応じてコード行のインデントを適切に整形します。

diff 行のインデントレベルを検出し、ブロック内のコード行の最小インデントとの差分を計算して、全てのコード行（diff ヘッダーを除く）に適切なスペースを追加します。

## 使い方

標準入力からMarkdownを読み込み、整形結果を標準出力に出力します：

```bash
cat input.md | node src/format-diff.js > output.md
```

または：

```bash
node src/format-diff.js < input.md > output.md
```

