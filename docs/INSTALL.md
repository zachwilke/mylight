# Install MyLight

[← Back to MyLight](../README.md)

## Linux and macOS

```sh
curl -fsSL https://github.com/zachwilke/mylight/releases/latest/download/install.sh | sh
~/.local/bin/mylight
```

Open **http://localhost:3000** and create your owner account. Leave the terminal open while using the app; **Ctrl+C** stops it. The installer does not start a background service or modify your shell configuration.

Requires `curl` and either `sha256sum` (Linux) or `shasum` (macOS). Supports Linux x86-64/ARM64 and macOS Intel/Apple silicon. Raspberry Pi requires a **64-bit Linux OS**. No build tools or root access are needed.

| File | Purpose |
| --- | --- |
| `~/.local/bin/mylight` | Launcher; forwards command-line options and selects a stable data directory. |
| `~/.local/bin/mylight-server` | Self-contained executable, including the web UI. |
| `~/.local/share/mylight/data` | Default database, uploads, and data lock. Created on first launch. |

If `~/.local/bin` is on your `PATH`, just run `mylight`. Otherwise, the full path works from any directory. Customize the binary directory with `MYLIGHT_BIN_DIR` (an absolute path). Override household storage at launch with `DATA_DIR`:

```sh
DATA_DIR=/absolute/path/to/household ~/.local/bin/mylight
```

For an existing installation, use its existing data directory explicitly. The installer does not discover or move old databases.

### Review or pin the installer

To read the script before running it:

```sh
curl -fsSL https://github.com/zachwilke/mylight/releases/latest/download/install.sh -o install-mylight.sh
less install-mylight.sh
sh install-mylight.sh
```

To install a specific published tag (replace the example with an available release):

```sh
MYLIGHT_VERSION=v0.2.0 sh install-mylight.sh
```

The script resolves the latest release once, downloads the matching executable and checksum manifest, and aborts on missing or mismatched checksums. Checksums detect corrupted downloads; they are not independent publisher signatures. Binaries are not currently signed or notarized. macOS may require approval in Privacy & Security for manually downloaded executables; Windows may show a reputation warning. Only approve a download you trust.

## Windows

1. Download `mylight-windows-amd64.exe` and `SHA256SUMS` from [Releases](https://github.com/zachwilke/mylight/releases).
2. Put the executable in a dedicated folder such as `%USERPROFILE%\MyLight`.
3. Optionally verify the download in PowerShell and compare its hash with the matching line in `SHA256SUMS`:

   ```powershell
   Get-FileHash .\mylight-windows-amd64.exe -Algorithm SHA256
   ```

4. Start from that folder. For a consistent data location in PowerShell:

   ```powershell
   $env:DATA_DIR = "$env:USERPROFILE\MyLight\data"
   .\mylight-windows-amd64.exe
   ```

5. Open **http://localhost:3000**. Keep the terminal open. Press **Ctrl+C** to stop.

Double-clicking the executable also starts the server; without `DATA_DIR`, storage defaults to `data` in its working directory. Use the explicit path above when creating a shortcut or scheduled task.

## Manual native downloads

Download the executable for your computer and `SHA256SUMS` from the same release:

| Computer | Release asset |
| --- | --- |
| Linux x86-64 | `mylight-linux-amd64` |
| Linux ARM64 / 64-bit Raspberry Pi | `mylight-linux-arm64` |
| macOS Intel | `mylight-darwin-amd64` |
| macOS Apple silicon | `mylight-darwin-arm64` |
| Windows x86-64 | `mylight-windows-amd64.exe` |

On Linux, run `sha256sum mylight-linux-amd64`; on macOS, run `shasum -a 256 mylight-darwin-arm64` (substitute your asset). Compare with its entry in `SHA256SUMS`, then:

```sh
mv mylight-linux-amd64 mylight
chmod +x mylight
DATA_DIR=/absolute/path/to/household ./mylight
```

Manual binaries default to `./data`, unlike the installer's launcher. They contain the complete UI and need no Node or Go runtime.

## Updates and removal

Download a backup in **Settings → Backup**, stop MyLight, then rerun the installer. Restart using the same launcher and data directory. On Windows, replace the stopped executable with the new verified download. Database migrations run at startup; downgrading requires restoring a compatible backup.

To remove an installer-based installation, stop MyLight and delete `~/.local/bin/mylight` and `~/.local/bin/mylight-server` (or your custom binary paths). Your household data stays intact. Delete it separately only if you intend to erase the household.

## Run automatically

For an always-on server, [Docker Compose](../README.md#get-started) includes a restart policy. For a native installation, configure your OS service manager to run the executable or launcher with an absolute `DATA_DIR`. Service files are not installed automatically.

`PORT` defaults to `3000`; `LISTEN_HOST` defaults to all interfaces. To use another port or allow only this computer:

```sh
LISTEN_HOST=127.0.0.1 PORT=3030 ~/.local/bin/mylight
```

Open **http://localhost:3030** for that example. Complete first-run setup locally before sharing access. See the [operating guide](OPERATIONS.md) for backups, HTTPS, Tailscale, displays, and recovery.
