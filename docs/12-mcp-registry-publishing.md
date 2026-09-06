# AXF MCP Registry Publishing

AXF publishes to the MCP Registry under the domain namespace
`dev.smartergpt/axf`.

That means publishing must use DNS auth for `smartergpt.dev`, not GitHub
auth.

## Namespace rule

- `dev.smartergpt/axf` is a domain namespace.
- `mcp-publisher` GitHub auth only authorizes `io.github.Guffawaffle/*`.
- GitHub auth is therefore insufficient for AXF MCP Registry publishing.

## Key material

- The active operator setup is Windows-native as of 2026-09-06. Its configuration
  is `%LOCALAPPDATA%\SmarterGPT\mcp-registry\publisher.json`; its Ed25519 seed is
  encrypted with Windows DPAPI CurrentUser beneath that directory's `secrets` folder.
  The folder grants access only to the current Windows account and SYSTEM.
- The original `/home/guff/mcp-keygen/mcp-registry-key.pem` on WSL distribution
  `rt-trans` is retained as a recovery copy, not the active publishing dependency.
- The PEM may not parse with `ssh-keygen`.
- OpenSSL can read it and derive both the public key and the private-key hex.

Never print private key material.

Never commit private key material.

Never commit `.mcpregistry_*` token files.

## Version and identity checks

- `package.json` version and `server.json` version must match the npm package version.
- Registry name must remain `dev.smartergpt/axf`.
- npm package identifier must remain `@smartergpt/axf`.
- The package argument must remain positional `mcp`.

## Verification source of truth

Use the versioned, encoded endpoint for verification:

```sh
https://registry.modelcontextprotocol.io/v0.1/servers/dev.smartergpt%2Faxf/versions/<version>
```

The non-versioned `/servers/dev.smartergpt/axf` URL is not the verification source of truth.

## Relationship to the npm release lane

`.github/workflows/release.yml` builds and retains the commit-bound npm tarball, publishes that
exact tarball through npm trusted publishing for an authorized owner-signed tag at the current
`main` tip and an independently authorized target-commit signer, verifies npm integrity, and
attaches the tarball and receipt to the GitHub release. The receipt binds the annotated tag
object, peeled target, validated `main` snapshot, and both signer identities. The publish lane
rechecks the remote ref before npm publication and GitHub release; the external `npm-release`
environment approval and immutable SemVer tag ruleset remain required parts of that authority
boundary.

## Failed 2.1.0 release attempt

The signed annotated `v2.1.0` tag is intentionally retained at
`d2977f73ad437de4cb9696f332ca851753d2db4a` as evidence of a failed release attempt. The tag-run
identity gate stopped before candidate construction or publication: npm `2.1.0` and a GitHub
`v2.1.0` release do not exist. Do not move, delete, recreate, or rerun that tag. The corrected
release policy and package version supersede it as `2.1.1`.

MCP Registry publication is deliberately separate and manual because the
`dev.smartergpt/axf` namespace uses DNS-held authority. A green npm/GitHub release does not prove
that the matching MCP Registry version exists. Run the DNS-auth recipe below and verify the
versioned endpoint before reporting dual-registry publication.

## Safe DNS-auth recipe

The following pattern verifies the public key against DNS, derives the
private key into a shell variable without echoing it, logs in with DNS
auth, unsets the private key, publishes, and verifies the versioned
registry record. The Linux recipe below is retained for recovery. The active
Windows recipe follows it.

```sh
KEY=/home/guff/mcp-keygen/mcp-registry-key.pem

PUB="$(openssl pkey -in "$KEY" -pubout -outform DER 2>/dev/null | tail -c 32 | base64 -w0)"
DNS="$(dig TXT smartergpt.dev +short | tr -d '"' | sed -n 's/^v=MCPv1; k=ed25519; p=//p')"
test "$PUB" = "$DNS"

PRIVATE_KEY="$(openssl pkey -in "$KEY" -text -noout 2>/dev/null | awk '/priv:/{capture=1; next} capture && /^[[:space:]]+[0-9a-f:]+$/{gsub(/[^0-9a-f]/, ""); printf "%s", $0; next} capture {exit}' | cut -c1-64)"
mcp-publisher login dns --domain smartergpt.dev --private-key "$PRIVATE_KEY"
unset PRIVATE_KEY

mcp-publisher publish

curl --path-as-is -fsSL 'https://registry.modelcontextprotocol.io/v0.1/servers/dev.smartergpt%2Faxf/versions/<version>'
```

## Windows-native publishing

The Windows migration verified publisher 1.8.1 against the official release
archive digest, then matched the existing key's public half against DNS. AXF
2.1.3 was published with that setup and independently verified through the
versioned endpoint. npm publication, signed tags, and protected release approvals
remain separate requirements.

Before publication, verify the intended signed release tag, target commit,
`server.json` digest and public npm version. Use metadata from that reviewed
release, even if another checkout contains newer work. Verify the publisher's
digest against its pinned official release, and confirm the DNS public key still
matches the configured public key.

Read `publisher.json` in PowerShell 7 to locate the native publisher and protected
key. Decrypt the seed only inside the publishing process with
`System.Security.Cryptography.ProtectedData.Unprotect`, using `CurrentUser`.
Pass its 32-byte hex representation to the publisher's DNS login without printing
it or recording expanded command arguments. The publisher accepts the seed as a
process argument; DPAPI protects its stored copy, not that transient argument.
Clear the byte array in a `finally` block and do not retain the decrypted value.

Run login and publication in a fresh child directory beneath the restricted
`secrets` directory. Set **both `USERPROFILE` and `HOME` for the child publisher
process** to that directory. Publisher 1.8.1 stores its token at
`.config/mcp-publisher/token.json` beneath the child profile; changing the working
directory alone does not isolate it. Copy only the reviewed `server.json` into
the publishing directory. Run DNS login for `smartergpt.dev`, then `publish`.
Always delete that exact temporary token in `finally`, including on failure.

Finally, fetch the versioned endpoint independently and compare the server name,
version, npm package identity/version and positional `mcp` argument with the
reviewed metadata. A successful login or publisher exit is not sufficient proof.
The control workspace retains the migration and 2.1.3 publication receipts in
`docs/evidence/registry-windows-migration.json` and
`docs/evidence/axf-2.1.3-native-registry-publication.json` respectively. Those files
contain public metadata and verification results, never key material or tokens.

## Cleanup

If registry token files are created in the repo root during local work,
remove them immediately:

```sh
rm -f .mcpregistry_github_token .mcpregistry_registry_token
```
