#!/bin/sh
# Install a verified release without root. Override MYLIGHT_VERSION to pin a tag.
# Parse the complete function before a piped download can execute it.
main() {
set -eu
fail() { printf 'MyLight: %s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null 2>&1 || fail 'curl is required.'
case "$(uname -s)" in Linux) platform=linux ;; Darwin) platform=darwin ;; *) fail 'Use the Windows download from GitHub Releases.' ;; esac
case "$(uname -m)" in x86_64|amd64) arch=amd64 ;; aarch64|arm64) arch=arm64 ;; *) fail 'Supported architectures: x86_64 and arm64.' ;; esac
if command -v sha256sum >/dev/null 2>&1; then hash=sha256sum
elif command -v shasum >/dev/null 2>&1; then hash=shasum
else fail 'sha256sum or shasum is required.'; fi
version=${MYLIGHT_VERSION:-latest}
case "$version" in latest|v[0-9]*) ;; *) fail 'MYLIGHT_VERSION must be a release tag such as v0.2.0.' ;; esac
case "$version" in *[!a-zA-Z0-9._-]*) fail 'Invalid version.' ;; esac
base=https://github.com/zachwilke/mylight/releases
if [ "$version" = latest ]; then
  # Resolve latest once so all downloads belong to the same release.
  resolved=$(curl -fsSL --proto '=https' --proto-redir '=https' -o /dev/null -w '%{url_effective}' "$base/latest") || fail 'No release found. See https://github.com/zachwilke/mylight/releases.'
  version=${resolved##*/}
  case "$version" in v[0-9]*) ;; *) fail 'Could not resolve the latest release.' ;; esac
  case "$version" in *[!a-zA-Z0-9._-]*) fail 'Invalid release tag.' ;; esac
fi
asset=mylight-$platform-$arch
bin_dir=${MYLIGHT_BIN_DIR:-$HOME/.local/bin}
case "$bin_dir" in /*) ;; *) fail 'MYLIGHT_BIN_DIR must be an absolute path.' ;; esac
[ ! -d "$bin_dir/mylight" ] && [ ! -d "$bin_dir/mylight-server" ] || fail 'An install destination is a directory.'
tmp=$(mktemp -d)
staged=
trap 'rm -rf "$tmp"; if [ -n "$staged" ]; then rm -f "$staged"; fi' EXIT HUP INT TERM
printf 'Downloading MyLight %s for %s/%s…\n' "$version" "$platform" "$arch"
for file in "$asset" SHA256SUMS; do
  curl -fsSL --retry 3 --proto '=https' --proto-redir '=https' "$base/download/$version/$file" -o "$tmp/$file" || fail "Could not download $file. Check the release exists."
done
expected=$(awk -v name="$asset" '$2 == name {print $1}' "$tmp/SHA256SUMS")
[ "${#expected}" = 64 ] || fail 'Missing or invalid release checksum.'
if [ "$hash" = sha256sum ]; then actual=$(sha256sum "$tmp/$asset" | awk '{print $1}')
else actual=$(shasum -a 256 "$tmp/$asset" | awk '{print $1}'); fi
[ "$actual" = "$expected" ] || fail 'Checksum mismatch; installation cancelled.'
mkdir -p "$bin_dir"
# Stage beside the destination for an atomic replacement, even while running.
staged=$(mktemp "$bin_dir/.mylight-install.XXXXXX")
cp "$tmp/$asset" "$staged"
chmod 755 "$staged"
mv -f "$staged" "$bin_dir/mylight-server"
staged=$(mktemp "$bin_dir/.mylight-install.XXXXXX")
quoted_bin=$(printf '%s' "$bin_dir/mylight-server" | sed "s/'/'\\\\''/g")
cat > "$staged" <<LAUNCHER
#!/bin/sh
# Keep household data in the same place regardless of the working directory.
export DATA_DIR="\${DATA_DIR:-\$HOME/.local/share/mylight/data}"
exec '$quoted_bin' "\$@"
LAUNCHER
chmod 755 "$staged"
mv -f "$staged" "$bin_dir/mylight"
staged=
printf '\nInstalled! Start with:\n\n  "%s/mylight"\n\nThen open http://localhost:3000 and create your household.\nPress Ctrl+C to stop. Run this installer again to update after backing up.\n' "$bin_dir"
case ":$PATH:" in *":$bin_dir:"*) printf '\nYou can also run: mylight\n' ;; *) printf '\nAdd %s to your PATH to run mylight from anywhere.\n' "$bin_dir" ;; esac
}

main "$@"
