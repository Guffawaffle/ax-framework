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

- Existing key path: `/home/guff/mcp-keygen/mcp-registry-key.pem`
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
registry record.

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

## Cleanup

If registry token files are created in the repo root during local work,
remove them immediately:

```sh
rm -f .mcpregistry_github_token .mcpregistry_registry_token
```
