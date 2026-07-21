import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/plugin.ts",
  output: {
    file: "com.onemoremichael.codex-attention.sdPlugin/bin/plugin.js",
    format: "esm",
    sourcemap: true
  },
  plugins: [nodeResolve({ preferBuiltins: true }), commonjs(), typescript()],
  external: [/^node:/]
};
