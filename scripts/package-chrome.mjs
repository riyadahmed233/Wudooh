import {execFileSync} from "child_process";
import fs from "fs-extra";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");
const packageJson = fs.readJsonSync(path.join(repoRoot, "package.json"));
const distPath = path.join(repoRoot, "dist");
const buildRoot = path.join(repoRoot, "builddir");
const releaseName = `Wudooh-Chrome-${packageJson.version}`;
const packageDir = path.join(buildRoot, releaseName);
const zipPath = path.join(repoRoot, `${releaseName}.zip`);

if (!fs.existsSync(path.join(distPath, "manifest.json"))) {
    throw new Error("dist/manifest.json does not exist. Run the production build before packaging.");
}

fs.removeSync(buildRoot);
fs.removeSync(zipPath);
fs.ensureDirSync(packageDir);
fs.copySync(distPath, packageDir);

execFileSync("zip", ["-qr", zipPath, releaseName], {
    cwd: buildRoot,
    stdio: "inherit"
});

fs.removeSync(buildRoot);

console.log(`Created ${path.relative(repoRoot, zipPath)}`);
