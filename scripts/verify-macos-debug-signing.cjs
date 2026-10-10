const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

function verifyDebugBundle(appPath, run = execFileSync) {
  const plist = join(appPath, "Contents", "Info.plist");
  const read = (key) => run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], { encoding: "utf8" }).trim();
  if (!read("NSLocalNetworkUsageDescription")) throw new Error("Missing local network privacy description");
  const bundleId = read("CFBundleIdentifier");
  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath], { stdio: "inherit" });
  // The sidecar is an extraResource, not a nested .app; verify it explicitly.
  run("codesign", ["--verify", "--strict", join(appPath, "Contents", "Resources", "bin", "pi-desktop-host-core")], { stdio: "inherit" });
  console.log(`Verified debug bundle ${bundleId}. Ad-hoc signing is not notarization or a Local Network grant.`);
}

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== "darwin") return;
  verifyDebugBundle(join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`));
};
module.exports.verifyDebugBundle = verifyDebugBundle;
