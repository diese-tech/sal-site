#!/usr/bin/env bash
# Fail when any migration defines a SECURITY DEFINER function that is never
# pinned with SET search_path — either inline in the definition, or via
# ALTER FUNCTION ... SET search_path in any migration file (019 pins earlier
# functions that way, in a different file from their definitions).
# Intentionally grep-level, not a SQL parser (#146).
set -euo pipefail
cd "$(dirname "$0")/.."

report=$(awk '
  {
    l = tolower($0)
    sub(/--.*/, "", l)
    if (l ~ /alter[ \t]+function/) {
      name = l
      sub(/.*function[ \t]+/, "", name)
      sub(/[ \t]*\(.*/, "", name)
      gsub(/"/, "", name)
      sub(/^public\./, "", name)
      if (l ~ /set[ \t]+search_path/) print "PIN " name
      next
    }
    if (l ~ /create[ \t]+(or[ \t]+replace[ \t]+)?function/) {
      name = l
      sub(/.*function[ \t]+/, "", name)
      sub(/[ \t]*\(.*/, "", name)
      gsub(/"/, "", name)
      sub(/^public\./, "", name)
      fn = name
    }
    if (fn != "" && l ~ /security[ \t]+definer/) print "DEF " fn " " FILENAME
    if (fn != "" && l ~ /set[ \t]+search_path/) print "PIN " fn
  }
' supabase/migrations/*.sql)

defs=$(printf '%s\n' "$report" | awk '$1 == "DEF" { print $2 "\t" $3 }' | sort -u)
pins=$(printf '%s\n' "$report" | awk '$1 == "PIN" { print $2 }' | sort -u)

fail=0
while IFS=$'\t' read -r name file; do
  [ -z "$name" ] && continue
  if ! grep -Fqx "$name" <<<"$pins"; then
    echo "ERROR: $file: SECURITY DEFINER function '$name' is never pinned with SET search_path (inline or via ALTER FUNCTION)"
    fail=1
  fi
done <<<"$defs"

if [ "$fail" -eq 0 ]; then
  echo "OK: every SECURITY DEFINER function in supabase/migrations/ pins search_path"
fi
exit "$fail"
