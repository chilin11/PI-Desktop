const { resolve } = require("node:path");
const { build } = require("../package.json");

// Fork testing only. No Apple-issued identity, notarization, or permission grant.
module.exports = {
  ...build,
  appId: "io.github.chilin11.pi-desktop-fork",
  productName: "PI-Desktop Fork",
  afterSign: resolve(__dirname, "../../../scripts/verify-macos-debug-signing.cjs"),
  mac: {
    ...build.mac,
    identity: "-",
    notarize: false,
    binaries: ["Contents/Resources/bin/pi-desktop-host-core"],
  },
};
