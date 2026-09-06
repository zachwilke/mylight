# Publishing MyLight

[← Back to MyLight](../README.md)

The `Releases` workflow builds five self-contained executables and publishes a GitHub Release when a version tag is pushed. It runs frontend lint/build/tests, installer regression tests, Go race tests and vet, and checks the existing multi-architecture container build before publication. Containers are validated but are not pushed to a registry.

## Publish a version

1. Merge the release changes, including the workflow, installer, and release notes, into the branch you intend to ship.
2. Check that CI passes. Review `docs/RELEASE_NOTES.md` for installation or migration changes.
3. Tag that exact commit with a new version and push it. For example:

   ```sh
   git tag -a v0.2.0 -m "MyLight v0.2.0"
   git push origin v0.2.0
   ```

Use an unused `vMAJOR.MINOR.PATCH` tag. The repository already has `v0.1.0`; do not move it. Use a tag such as `v0.2.0-rc.1` for a prerelease. Tags containing a suffix publish as prereleases and do not become the installer's latest stable download.

The publish job alone receives `contents: write`. It waits for both build jobs, downloads the verified build artifact, and uses `gh release create --verify-tag` with generated notes and the installation preamble. It does not replace an existing release. A manual workflow dispatch builds downloadable Actions artifacts without publishing.

The first release with this workflow activates the README's `/releases/latest/download/` links. Until then, source and Docker installation remain available. Remove the temporary first-release note in the README after successful publication.

## Assets

- `mylight-linux-amd64`, `mylight-linux-arm64`
- `mylight-darwin-amd64`, `mylight-darwin-arm64`
- `mylight-windows-amd64.exe`
- `install.sh`
- `SHA256SUMS` covering all of the above

Executables embed the freshly built Vite output and are compiled with `CGO_ENABLED=0`. No external UI directory is required. The installer supports Linux and macOS; Windows uses the standalone `.exe`. Signing/notarization and package-manager repositories are not configured.

## Release check

After publication, install into a disposable directory on each supported OS and architecture you have available. Check first-run setup and static assets at `/`, a nested route such as `/calendar`, `/healthz`, and `/readyz`. Check one upgrade with a backed-up disposable household. Cross-compilation does not replace native OS testing.

The installer regression suite (`python3 scripts/test-install.py`) uses offline release fixtures to check platform selection, version pinning, checksum rejection, failed downloads, argument forwarding, custom paths, and preservation of existing installations and data.

Workflow behavior follows the [GitHub CLI release documentation](https://cli.github.com/manual/gh_release_create).
