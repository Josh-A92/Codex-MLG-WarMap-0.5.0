const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const testsDirectory = __dirname;
const testFiles = fs.readdirSync(testsDirectory)
  .filter((fileName) => fileName.endsWith(".test.js"))
  .sort((left, right) => left.localeCompare(right));

if (testFiles.length === 0) {
  console.error("No test files were found.");
  process.exit(1);
}

for (const testFile of testFiles) {
  console.log(`\n=== ${testFile} ===`);
  const result = spawnSync(process.execPath, [path.join(testsDirectory, testFile)], {
    cwd: path.resolve(testsDirectory, ".."),
    encoding: "utf8",
    stdio: ["inherit", "inherit", "pipe"]
  });

  if (result.stderr) process.stdout.write(result.stderr);

  if (result.error) {
    console.error(`Unable to run ${testFile}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`${testFile} failed with exit code ${result.status}.`);
    process.exit(result.status || 1);
  }
}

console.log(`\nAll ${testFiles.length} test files passed.`);
