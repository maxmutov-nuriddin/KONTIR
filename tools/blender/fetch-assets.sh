#!/bin/sh
# Community MakeHuman clothes used by character.py (downloaded, not committed). Licences: tactical_vest_male by Mindfront (CC-BY,
# attribution required), combat_boots (CC0), hand_gloves (CC0). See docs/MODELS.md for attribution.
cd "$(dirname "$0")"; mkdir -p assets
get() { # name page-url-slug
  mkdir -p "assets/$1"; page=$(curl -s -m 60 "http://www.makehumancommunity.org/clothes/$2.html")
  for u in $(echo "$page" | grep -oE '"http://www.makehumancommunity.org/sites/default/files/(styles/thumbnail/public/)?clothes/[^"?]+' | sed 's/"//;s/styles\/thumbnail\/public\///' | sort -u); do
    f="assets/$1/$(basename "$u")"; for t in 1 2 3 4 5 6; do curl -s -C - -m 900 -o "$f" "$u" && break; done
  done; echo "fetched $1: $(ls "assets/$1" | tr '\n' ' ')"
}
get tactical_vest_male tactical_vest_male
get combat_boots combat_boots
get hand_gloves hand_gloves
