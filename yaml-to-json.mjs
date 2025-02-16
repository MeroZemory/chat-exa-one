import fs from "fs";
import yaml from "js-yaml";

try {
  const yamlPath = "package.yaml";
  const jsonPath = "package.json";

  // 파일이 존재하는지 확인
  if (!fs.existsSync(yamlPath)) {
    console.log("package.yaml not found");
    process.exit(0);
  }

  // package.json이 없거나 package.yaml이 더 최신일 때만 변환
  if (
    !fs.existsSync(jsonPath) ||
    fs.statSync(yamlPath).mtime > fs.statSync(jsonPath).mtime
  ) {
    const yamlContent = fs.readFileSync(yamlPath, "utf8");
    const jsonContent = yaml.load(yamlContent);
    fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2));
    console.log("Successfully converted package.yaml to package.json");
  } else {
    console.log("package.json is up to date");
  }
} catch (e) {
  console.error("Error converting YAML to JSON:", e);
  process.exit(1);
}
