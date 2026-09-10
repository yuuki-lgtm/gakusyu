#!/bin/sh
# 一度だけ実行: git の pre-commit フックを入れる（コミットのたびに index.html の VERSION を更新）
cp "$(dirname "$0")/pre-commit" "$(git rev-parse --git-dir)/hooks/pre-commit" && chmod +x "$(git rev-parse --git-dir)/hooks/pre-commit" && echo "installed"
