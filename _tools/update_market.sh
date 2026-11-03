#!/bin/zsh
# Refresh the fund-market dashboard: collect new data, rebuild assets/data/market, publish the site.
#
#   _tools/update_market.sh            update and push
#   _tools/update_market.sh --no-push  update, commit nothing
#
# Run without a VPN (FIPIRAN only answers Iranian addresses). The first run collects the last two
# weeks; later runs add the days since the previous one. Logs go to market-data/logs/.
set -euo pipefail

SITE=${0:A:h:h}
STORE=${MARKET_STORE:-$SITE/../market-data}
PY=$STORE/.venv/bin/python
mkdir -p "$STORE/logs"
exec > >(tee -a "$STORE/logs/update-$(date +%Y%m%d).log") 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M') updating"

"$PY" "$SITE/_tools/update_market_store.py" "$STORE"
"$PY" "$SITE/_tools/make_market_data.py" "$STORE"

[[ ${1:-} == --no-push ]] && exit 0
cd "$SITE"
git add assets/data/market _projects/fund-market.html assets/js/demos/market.js _tools README.md
if git diff --cached --quiet; then
  echo "no new data"
  exit 0
fi
git commit -q -m "Update fund-market data to $(date +%Y-%m-%d)"
# GitHub is often unreachable without a VPN; the commit is safe locally and can be pushed later
if git push -q; then
  echo "published"
else
  echo "committed but not pushed: turn the VPN on and run  git -C \"$SITE\" push"
fi
