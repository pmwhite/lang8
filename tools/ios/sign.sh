#!/bin/sh
# Sign Tempo.ipa for the phones in the development profile, on Linux, and
# put it on the iPhone plugged in:
#   sign.sh IN.ipa OUT.ipa       signed with what apple.py made
#   sign.sh IN.ipa OUT.ipa install   and installed over USB
# IN is CI's Tempo.ipa (ad hoc signed). The certificate, its key, the
# profile and the tools are in ~/.config/tempo-ios: rcodesign (from
# apple-codesign) in bin/, and pymobiledevice3 in venv/.
set -eu
in=$(realpath "$1")
out=$(realpath -m "$2")
home=$HOME/.config/tempo-ios
team=$(openssl x509 -inform der -in "$home/dev.cer" -noout -subject -nameopt multiline |
  sed -n 's/^ *organizationalUnitName *= *//p')
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
unzip -q "$in"
app=Payload/Tempo.app
cp "$home/dev.mobileprovision" "$app/embedded.mobileprovision"
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
  <true/>
</dict>
</plist>
EOF
openssl x509 -inform der -in "$home/dev.cer" -out cert.pem
"$home/bin/rcodesign" sign --pem-file "$home/dev.key" --pem-file cert.pem \
  --entitlements-xml-file entitlements.plist "$app" >/dev/null
rm -f "$out"
zip -qry "$out" Payload
echo "signed $out for team $team"
if [ "${3:-}" = install ]; then
  "$home/venv/bin/pymobiledevice3" apps install "$out"
  echo "installed"
fi
