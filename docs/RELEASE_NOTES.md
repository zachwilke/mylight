## Start your household

Linux & macOS:

```sh
curl -fsSL https://github.com/zachwilke/mylight/releases/latest/download/install.sh | sh
~/.local/bin/mylight
```

Open **http://localhost:3000** and create your household. No Docker, Node, Go, or sudo required. The installer checks the binary's SHA-256 hash before installing.

**Windows:** download `mylight-windows-amd64.exe`, put it in a dedicated folder, and run it. Open the same address. `SHA256SUMS` contains hashes for all executables.

**Trying a prerelease?** Download its `install.sh` and run `MYLIGHT_VERSION=<this-release-tag> sh install.sh`; the command above always selects the latest non-prerelease.

**Updating:** download a backup first, stop MyLight, install the update, and restart with the same data directory. Do not downgrade an upgraded database. Native binaries are currently unsigned; MyLight remains under active development.

[Installation details](https://github.com/zachwilke/mylight/blob/HEAD/docs/INSTALL.md) · [Household guide](https://github.com/zachwilke/mylight/blob/HEAD/docs/OPERATIONS.md)

## Changes
