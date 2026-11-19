import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 앱에 보이는 버전. android/app/build.gradle 의 versionName 과 같게 맞춘다.
const APP_VERSION = (JSON.parse(readFileSync("package.json", "utf8")) as { version: string }).version;

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(APP_VERSION) },
    // public/ 에는 개발용 로컬 데이터(public/data)만 있다. 원격 데이터 주소가 있으면 앱에 넣지 않는다(APK 35MB 절감)
    build: { target: "es2022", sourcemap: false, copyPublicDir: !(command === "build" && env.VITE_DATA_BASE) },
    server: { port: 5180 },
    test: { include: ["src/**/*.test.ts", "pipeline/**/*.test.ts"] },
  };
});
