import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";
import type { AnalysisReport, ProjectContext } from "./schemas";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const STYLE_EXTENSIONS = new Set([".css", ".scss", ".sass", ".less"]);
const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "build", ".next", ".expo", "coverage"]);
const REACT_NATIVE_COMPONENTS = new Set([
  "ActivityIndicator",
  "Button",
  "FlatList",
  "Image",
  "ImageBackground",
  "Modal",
  "Pressable",
  "SafeAreaView",
  "ScrollView",
  "SectionList",
  "Switch",
  "Text",
  "TextInput",
  "TouchableOpacity",
  "View",
]);

export interface AnalyzeProjectOptions {
  projectRoot?: string | undefined;
  targetPath?: string | undefined;
  targetRoute?: string | undefined;
  maxFiles?: number | undefined;
}

export async function analyzeProject(options: AnalyzeProjectOptions): Promise<AnalysisReport> {
  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const maxFiles = options.maxFiles ?? 80;
  const warnings: string[] = [];
  const tsconfig = readTsConfig(projectRoot, warnings);
  const aliases = readPathAliases(tsconfig);
  const framework = detectFramework(projectRoot);
  const targetFiles = await resolveTargetFiles(projectRoot, options, framework, warnings);
  if (targetFiles.length === 0) {
    warnings.push("No target source files were found. Analysis fell back to nearby project files.");
  }

  const sourceFiles = await collectAnalysisFiles(projectRoot, targetFiles, aliases, maxFiles, warnings);
  const components = new Set<string>();
  const componentTree: string[] = [];
  const styleSources = new Set<string>();
  const dataShapes = new Set<string>();
  const states = new Set<string>();
  const reusableFunctions = new Set<string>();
  const imports: AnalysisReport["imports"] = [];
  const routes = new Set<string>();

  for (const filePath of sourceFiles) {
    const relativeFile = toProjectPath(projectRoot, filePath);
    const sourceText = await readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKindForPath(filePath));
    const route = routeForFile(projectRoot, filePath, framework);
    if (route) routes.add(route);

    visitSourceFile(sourceFile, {
      projectRoot,
      filePath,
      relativeFile,
      aliases,
      components,
      componentTree,
      styleSources,
      dataShapes,
      states,
      reusableFunctions,
      imports,
    });
  }

  const targetProjectFiles = sourceFiles.map((filePath) => toProjectPath(projectRoot, filePath));
  const sourceFileSet = new Set(targetProjectFiles);
  for (const style of [...styleSources]) sourceFileSet.add(style);

  const referenceContext = {
    sourceFiles: [...sourceFileSet],
    components: [...components],
    routes: [...routes],
    styleSources: [...styleSources],
    dataShapes: [...dataShapes],
    states: [...states],
    notes: [
      `Auto-analyzed ${sourceFiles.length} source file(s) using static TypeScript/JSX AST inspection.`,
      ...warnings,
    ],
  };
  const projectContext: ProjectContext = {
    ...referenceContext,
    reusableFunctions: [...reusableFunctions],
  };

  return {
    framework,
    targetFiles: targetProjectFiles,
    componentTree: unique(componentTree),
    imports: uniqueImports(imports),
    referenceContext,
    projectContext,
    warnings,
    confidence: confidenceFor(referenceContext, warnings),
    createdAt: new Date().toISOString(),
  };
}

interface VisitContext {
  projectRoot: string;
  filePath: string;
  relativeFile: string;
  aliases: PathAlias[];
  components: Set<string>;
  componentTree: string[];
  styleSources: Set<string>;
  dataShapes: Set<string>;
  states: Set<string>;
  reusableFunctions: Set<string>;
  imports: AnalysisReport["imports"];
}

function visitSourceFile(sourceFile: ts.SourceFile, context: VisitContext): void {
  const localComponentNames = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      recordImport(node, context);
    }
    if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && node.name) {
      const name = node.name.text;
      if (isComponentName(name)) {
        localComponentNames.add(name);
        context.components.add(name);
      }
      if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
        context.dataShapes.add(name);
      }
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const name = declaration.name.getText(sourceFile);
        if (isComponentName(name)) {
          localComponentNames.add(name);
          context.components.add(name);
        }
        if (declaration.initializer && isStyleSheetCreateCall(declaration.initializer)) {
          context.styleSources.add(`${context.relativeFile}#${name}`);
        }
      }
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression.getText(sourceFile);
      if (expression === "useState" || expression === "React.useState") context.states.add("useState");
      if (expression === "useReducer" || expression === "React.useReducer") context.states.add("useReducer");
      if (/^use[A-Z].*(Query|Mutation|Store|Form|Data|State)$/.test(expression)) context.states.add(expression);
      if (/^(fetch|get|load|create|update|delete)[A-Z]/.test(expression)) context.reusableFunctions.add(expression);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tagName = node.tagName.getText(sourceFile);
      context.componentTree.push(tagName);
      if (isComponentName(tagName) || REACT_NATIVE_COMPONENTS.has(tagName)) context.components.add(tagName);
      for (const attribute of node.attributes.properties) {
        if (ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "className") {
          context.styleSources.add(`${context.relativeFile}#className`);
        }
        if (ts.isJsxAttribute(attribute) && attribute.name.getText(sourceFile) === "style") {
          context.styleSources.add(`${context.relativeFile}#style`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  if (localComponentNames.size === 0 && sourceFile.text.includes("export default")) {
    context.components.add(basename(context.filePath, extname(context.filePath)));
  }
}

function recordImport(node: ts.ImportDeclaration, context: VisitContext): void {
  if (!ts.isStringLiteral(node.moduleSpecifier)) return;
  const moduleSpecifier = node.moduleSpecifier.text;
  const importedNames = new Set<string>();
  const clause = node.importClause;
  if (clause?.name) importedNames.add(clause.name.text);
  if (clause?.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) importedNames.add(clause.namedBindings.name.text);
    if (ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) importedNames.add(element.name.text);
    }
  }

  const kind = importKind(moduleSpecifier, context.aliases);
  context.imports.push({
    sourceFile: context.relativeFile,
    moduleSpecifier,
    importedNames: [...importedNames],
    kind,
  });

  if (STYLE_EXTENSIONS.has(extname(moduleSpecifier))) {
    context.styleSources.add(resolveImportDisplayPath(context, moduleSpecifier));
  }
  if (moduleSpecifier.includes("theme") || moduleSpecifier.includes("style") || moduleSpecifier.includes("tailwind")) {
    context.styleSources.add(resolveImportDisplayPath(context, moduleSpecifier));
  }
  for (const name of importedNames) {
    if (isComponentName(name)) context.components.add(name);
    if (/^(use|format|parse|build|create|update|delete)[A-Z]/.test(name)) context.reusableFunctions.add(name);
  }
}

async function resolveTargetFiles(
  projectRoot: string,
  options: AnalyzeProjectOptions,
  framework: AnalysisReport["framework"],
  warnings: string[],
): Promise<string[]> {
  if (options.targetPath) {
    const target = resolve(projectRoot, options.targetPath);
    if (existsSync(target) && statSync(target).isFile()) return [target];
    warnings.push(`targetPath was not found: ${options.targetPath}`);
  }
  if (options.targetRoute) {
    const routeFile = await findRouteFile(projectRoot, options.targetRoute, framework);
    if (routeFile) return [routeFile];
    warnings.push(`targetRoute was not resolved to a source file: ${options.targetRoute}`);
  }
  const fallback = await firstSourceFiles(projectRoot, 10);
  return fallback;
}

async function collectAnalysisFiles(
  projectRoot: string,
  targetFiles: string[],
  aliases: PathAlias[],
  maxFiles: number,
  warnings: string[],
): Promise<string[]> {
  const queue = [...targetFiles];
  const visited = new Set<string>();
  while (queue.length > 0 && visited.size < maxFiles) {
    const filePath = queue.shift()!;
    if (visited.has(filePath) || !isSourceFile(filePath) || !existsSync(filePath)) continue;
    visited.add(filePath);
    const sourceText = await readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKindForPath(filePath));
    for (const importDecl of sourceFile.statements.filter(ts.isImportDeclaration)) {
      if (!ts.isStringLiteral(importDecl.moduleSpecifier)) continue;
      const resolvedImport = resolveSourceImport(projectRoot, filePath, importDecl.moduleSpecifier.text, aliases);
      if (resolvedImport && !visited.has(resolvedImport)) queue.push(resolvedImport);
    }
  }
  if (queue.length > 0) warnings.push(`Analysis stopped after maxFiles=${maxFiles}.`);
  return [...visited];
}

async function firstSourceFiles(projectRoot: string, limit: number): Promise<string[]> {
  const files: string[] = [];
  await walk(projectRoot, (filePath) => {
    if (files.length < limit && isSourceFile(filePath)) files.push(filePath);
  });
  return files;
}

async function walk(dir: string, onFile: (filePath: string) => void): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) await walk(entryPath, onFile);
    if (entry.isFile()) onFile(entryPath);
  }
}

async function findRouteFile(
  projectRoot: string,
  route: string,
  framework: AnalysisReport["framework"],
): Promise<string | null> {
  const normalized = route.replace(/^\/+|\/+$/g, "");
  const appRoots = ["src/app", "app"].map((root) => join(projectRoot, root));
  const pageRoots = ["src/pages", "pages"].map((root) => join(projectRoot, root));
  const appCandidates = [
    join(normalized, "page"),
    join(normalized, "index"),
    normalized,
  ].filter(Boolean);
  const pageCandidates = [normalized, join(normalized, "index")].filter(Boolean);
  const roots = framework === "next-pages" ? pageRoots : [...appRoots, ...pageRoots];
  const candidates = roots.flatMap((root) => {
    const suffixes = root.includes(`${projectRoot}/pages`) ? pageCandidates : appCandidates;
    return suffixes.flatMap((suffix) => SOURCE_EXTENSIONS.size ? [...SOURCE_EXTENSIONS].map((extension) => join(root, `${suffix}${extension}`)) : []);
  });
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function detectFramework(projectRoot: string): AnalysisReport["framework"] {
  const packageJsonPath = join(projectRoot, "package.json");
  const packageJson = existsSync(packageJsonPath) ? readJson(packageJsonPath) : {};
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if (deps["expo-router"] || existsSync(join(projectRoot, "app/_layout.tsx")) || existsSync(join(projectRoot, "src/app/_layout.tsx"))) {
    return "expo-router";
  }
  if (deps.next || existsSync(join(projectRoot, "next.config.js")) || existsSync(join(projectRoot, "next.config.ts"))) {
    if (existsSync(join(projectRoot, "app")) || existsSync(join(projectRoot, "src/app"))) return "next-app";
    return "next-pages";
  }
  if (deps["react-native"] || deps.expo) return "react-native";
  if (deps.react) return "react";
  return "unknown";
}

function routeForFile(projectRoot: string, filePath: string, framework: AnalysisReport["framework"]): string | null {
  const relativePath = toProjectPath(projectRoot, filePath);
  const routeRoot = ["src/app/", "app/", "src/pages/", "pages/"].find((root) => relativePath.startsWith(root));
  if (!routeRoot) return null;
  let route = relativePath.slice(routeRoot.length).replace(/\.[^.]+$/u, "");
  route = route.replace(/\/page$/u, "").replace(/\/index$/u, "").replace(/(^|\/)_layout$/u, "");
  if (framework === "expo-router" || framework === "next-app") {
    route = route.replace(/(^|\/)\([^/]+\)/gu, "");
  }
  return `/${route}`.replace(/\/+/gu, "/").replace(/\/$/u, "") || "/";
}

function readTsConfig(projectRoot: string, warnings: string[]): Record<string, unknown> {
  const configPath = join(projectRoot, "tsconfig.json");
  if (!existsSync(configPath)) return {};
  try {
    return readJson(configPath);
  } catch {
    warnings.push("Could not parse tsconfig.json.");
    return {};
  }
}

function readPathAliases(tsconfig: Record<string, unknown>): PathAlias[] {
  const compilerOptions = isRecord(tsconfig.compilerOptions) ? tsconfig.compilerOptions : {};
  const baseUrl = typeof compilerOptions.baseUrl === "string" ? compilerOptions.baseUrl : ".";
  const paths = isRecord(compilerOptions.paths) ? compilerOptions.paths : {};
  return Object.entries(paths).flatMap(([pattern, targets]) => {
    if (!Array.isArray(targets)) return [];
    return targets.filter((target): target is string => typeof target === "string").map((target) => ({
      pattern,
      target,
      baseUrl,
    }));
  });
}

function resolveSourceImport(projectRoot: string, fromFile: string, moduleSpecifier: string, aliases: PathAlias[]): string | null {
  if (!moduleSpecifier.startsWith(".") && !aliases.some((alias) => aliasMatches(alias.pattern, moduleSpecifier))) return null;
  const base = moduleSpecifier.startsWith(".")
    ? resolve(dirname(fromFile), moduleSpecifier)
    : resolveAlias(projectRoot, moduleSpecifier, aliases);
  if (!base) return null;
  return resolveFileCandidate(base);
}

function resolveFileCandidate(base: string): string | null {
  for (const extension of SOURCE_EXTENSIONS) {
    const direct = `${base}${extension}`;
    if (existsSync(direct)) return direct;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const index = join(base, `index${extension}`);
    if (existsSync(index)) return index;
  }
  return null;
}

function resolveAlias(projectRoot: string, moduleSpecifier: string, aliases: PathAlias[]): string | null {
  for (const alias of aliases) {
    if (!aliasMatches(alias.pattern, moduleSpecifier)) continue;
    const wildcard = wildcardValue(alias.pattern, moduleSpecifier);
    const target = alias.target.replace("*", wildcard);
    return resolve(projectRoot, alias.baseUrl, target);
  }
  return null;
}

function importKind(moduleSpecifier: string, aliases: PathAlias[]): "local" | "package" | "alias" {
  if (moduleSpecifier.startsWith(".")) return "local";
  if (aliases.some((alias) => aliasMatches(alias.pattern, moduleSpecifier))) return "alias";
  return "package";
}

function resolveImportDisplayPath(context: VisitContext, moduleSpecifier: string): string {
  const resolvedImport = resolveSourceImport(context.projectRoot, context.filePath, moduleSpecifier, context.aliases);
  return resolvedImport ? toProjectPath(context.projectRoot, resolvedImport) : moduleSpecifier;
}

function aliasMatches(pattern: string, moduleSpecifier: string): boolean {
  if (!pattern.includes("*")) return pattern === moduleSpecifier;
  const [prefix, suffix] = pattern.split("*");
  return moduleSpecifier.startsWith(prefix ?? "") && moduleSpecifier.endsWith(suffix ?? "");
}

function wildcardValue(pattern: string, moduleSpecifier: string): string {
  const [prefix, suffix] = pattern.split("*");
  return moduleSpecifier.slice((prefix ?? "").length, moduleSpecifier.length - (suffix ?? "").length);
}

function isStyleSheetCreateCall(node: ts.Expression): boolean {
  return ts.isCallExpression(node) && node.expression.getText().endsWith("StyleSheet.create");
}

function isComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_.]*$/u.test(name);
}

function isSourceFile(path: string): boolean {
  return SOURCE_EXTENSIONS.has(extname(path));
}

function scriptKindForPath(path: string): ts.ScriptKind {
  const extension = extname(path);
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if (extension === ".js") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function toProjectPath(projectRoot: string, filePath: string): string {
  return relative(projectRoot, filePath).replace(/\\/gu, "/");
}

function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueImports(imports: AnalysisReport["imports"]): AnalysisReport["imports"] {
  const seen = new Set<string>();
  return imports.filter((item) => {
    const key = `${item.sourceFile}\0${item.moduleSpecifier}\0${item.importedNames.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function confidenceFor(context: AnalysisReport["referenceContext"], warnings: string[]): number {
  let score = 0.35;
  if (context.sourceFiles.length > 0) score += 0.2;
  if (context.components.length > 0) score += 0.2;
  if (context.routes.length > 0) score += 0.1;
  if (context.styleSources.length > 0) score += 0.1;
  if (context.dataShapes.length > 0 || context.states.length > 0) score += 0.05;
  score -= Math.min(0.2, warnings.length * 0.04);
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface PathAlias {
  pattern: string;
  target: string;
  baseUrl: string;
}
