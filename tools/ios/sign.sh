#!/bin/sh
# Sign CI's Tempo.ipa (ad hoc signed) on Linux, with what apple.py made:
#   sign.sh dev IN.ipa OUT.ipa [install]   for the phones in the development
#                                          profile (and put on the iPhone
#                                          plugged in)
#   sign.sh store IN.ipa OUT.ipa           for TestFlight and the App Store,
#                                          with the next build number
# The certificates, their keys, the profiles and the tools are in
# ~/.config/tempo-ios: rcodesign (from apple-codesign) in bin/, and
# pymobiledevice3 in venv/. A store build's number is kept in build-number
# there (each upload needs a higher one).
set -eu
kind=$1
in=$(realpath "$2")
out=$(realpath -m "$3")
home=$HOME/.config/tempo-ios
case "$kind" in
  dev) debug=true; extra= ;;
  store) debug=false; extra='<key>beta-reports-active</key><true/>' ;;
  *) sed -n '2,12p' "$0"; exit 2 ;;
esac
team=$(openssl x509 -inform der -in "$home/$kind.cer" -noout -subject -nameopt multiline |
  sed -n 's/^ *organizationalUnitName *= *//p')
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
unzip -q "$in"
app=$(ls -d Payload/*.app)
cp "$home/$kind.mobileprovision" "$app/embedded.mobileprovision"
if [ "$kind" = store ]; then
  n=$(( $(cat "$home/build-number" 2>/dev/null || echo 0) + 1 ))
  echo "$n" > "$home/build-number"
  python3 -I -c '
import plistlib, sys
p = sys.argv[1]
with open(p, "rb") as f:
    info = plistlib.load(f)
info["CFBundleVersion"] = sys.argv[2]
with open(p, "wb") as f:
    plistlib.dump(info, f)' "$app/Info.plist" "$n"
  echo "build $n"
fi
cat > entitlements.plist <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>application-identifier</key>
  <string>$team.space.trailingwhite.better</string>
  <key>com.apple.developer.team-identifier</key>
  <string>$team</string>
  <key>get-task-allow</key>
  <$debug/>
  $extra
</dict>
</plist>
EOF
openssl x509 -inform der -in "$home/$kind.cer" -out cert.pem
"$home/bin/rcodesign" sign --pem-file "$home/$kind.key" --pem-file cert.pem \
  --entitlements-xml-file entitlements.plist "$app" >/dev/null
rm -f "$out"
zip -qry "$out" Payload
echo "signed $out ($kind, team $team)"
if [ "${4:-}" = install ]; then
  "$home/venv/bin/pymobiledevice3" apps install "$out"
  echo "installed"
fi
