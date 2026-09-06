# Tailscale acceptance test

This checklist requires an operator-owned test tailnet. Automated tests use status
fixtures and **do not** enroll a real node. Do not use production household data.

1. Start a fresh MyLight instance with Tailscale disabled. Complete local owner
   setup; confirm normal HTTP health, login, calendar, and live updates work.
2. Enable `MYLIGHT_TAILSCALE=true`, restart, and open Settings → Remote access as
   the owner. Confirm the authorization link is not visible to signed-out users
   or non-owner family accounts. Do not paste the link into a public issue.
3. Authorize the node in the test tailnet. With device approval required, confirm
   the settings screen asks for approval. With HTTPS disabled, confirm it reports
   that prerequisite. Enable MagicDNS/HTTPS and check the private address appears.
4. On a second device connected to that tailnet, open the HTTPS address, verify
   its certificate, and sign in. Confirm the session cookie is Secure/HttpOnly.
   Create a test event and verify it updates on the local display through SSE.
5. Disable Tailscale on the second device. The private address must be unreachable.
   With it re-enabled, deny TCP 443 in the test tailnet policy; access must fail.
   Restore the test policy and verify access resumes. Do not enable Funnel.
6. Restart MyLight with the same identity storage and no auth key. Confirm it
   reuses the existing node/address and does not ask to enroll a duplicate device.
7. After enrollment, enable `MYLIGHT_TAILSCALE_ONLY=true` and restart. Confirm LAN
   HTTP is unavailable and tailnet HTTPS works. Native localhost stays available;
   Docker's published port does not (loopback is inside the container). Recover
   by disabling tailnet-only mode and recreating the container if necessary.
8. Revoke/expire the test node. Confirm private access stops and status no longer
   claims a usable running connection. Reauthorize per Tailscale's instructions.
9. Download a MyLight backup and confirm it contains only the database and uploads,
   never `tailscaled.state`, auth keys, or logs. Restore to another test host with
   a separate identity directory: it must enroll as a new node. Do not clone node
   identity between simultaneously running instances.
10. Disable embedded Tailscale, restart, and confirm its private listener is gone
    while normal LAN hosting works. Remove the retired test node in Tailscale.

Also test fresh install and existing-volume upgrade in the non-root Docker image
on Linux amd64 and arm64. Check that both the household and identity volumes are
writable by the image user, and that neither is published in build artifacts.
HTTPS certificate names are publicly logged; use non-sensitive test hostnames.
