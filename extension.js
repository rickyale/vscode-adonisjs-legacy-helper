/* Adonis Legacy Helper - VS Code Extension
 * Recursos:
 *  - Go to Definition em use('App/...') e em cadeias como Organization.repository.search()
 *  - Autocomplete de métodos/propriedades a partir do arquivo real (Repository/Helper/etc.)
 *  - Suporte a JSDoc: /** @type {typeof import('/App/...')} *\/ static repository
 *  - Normalização de alias: /App/... ou App/... → app/...
 *  - Busca da Model recursivamente (app/Models/**)
 */

const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
  console.log('Adonis use() helper ativo ✅');

  // ------------- Utilidades ---------------

  function normalizeImportAlias(importPath) {
    if (!importPath) return null;
    const raw = String(importPath).trim().replace(/['"`]/g, '').replace(/\\/g, '/');
    // remove barra inicial opcional e mapeia App/ → app/ (case-insensitive)
    return raw.replace(/^\/?App\//i, 'app/');
  }

  function resolveImportPath(importPath) {
    if (!vscode.workspace.workspaceFolders) return null;
    const root = vscode.workspace.workspaceFolders[0].uri.fsPath;

    const normalized = normalizeImportAlias(importPath);
    if (!normalized) return null;

    const jsPath = path.join(root, normalized + '.js');
    const tsPath = jsPath.replace(/\.js$/, '.ts');

    if (fs.existsSync(jsPath)) return jsPath;
    if (fs.existsSync(tsPath)) return tsPath;

    // Se normalized já tiver extensão (casos raros)
    const direct = path.join(root, normalized);
    if (fs.existsSync(direct)) return direct;

    return null;
  }

  function findFileRecursive(startDir, predicate) {
    const stack = [startDir];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
        } else if (ent.isFile() && predicate(full)) {
          return full;
        }
      }
    }
    return null;
  }

  function findModelFilePath(modelName) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) return null;

    // 1) caminho plano
    const flatJs = path.join(root, `app/Models/${modelName}.js`);
    const flatTs = path.join(root, `app/Models/${modelName}.ts`);
    if (fs.existsSync(flatJs)) return flatJs;
    if (fs.existsSync(flatTs)) return flatTs;

    // 2) padrão pasta/nome/nome.js (ex.: App/Models/Client/Client.js)
    const nestedJs = path.join(root, `app/Models/${modelName}/${modelName}.js`);
    const nestedTs = path.join(root, `app/Models/${modelName}/${modelName}.ts`);
    if (fs.existsSync(nestedJs)) return nestedJs;
    if (fs.existsSync(nestedTs)) return nestedTs;

    // 3) fallback recursivo
    const modelsRoot = path.join(root, 'app/Models');
    const found = findFileRecursive(modelsRoot, (fp) => {
      const base = path.basename(fp).toLowerCase();
      return base === `${modelName.toLowerCase()}.js` || base === `${modelName.toLowerCase()}.ts`;
    });
    return found;
  }

  // Lê @type {typeof import(...)} dentro de uma Model (para propriedades como "static repository")
  function findTypeImportInModel(modelName, propName) {
    const modelPath = findModelFilePath(modelName);
    if (!modelPath) return null;

    const modelContent = fs.readFileSync(modelPath, 'utf8');

    // Aceita '/App/...' ou 'App/...', qualquer aspas, espaços, quebras de linha
    const regexType = new RegExp(
      String.raw`@type\s*{\s*typeof\s*import\(['"\`](\/?App\/[^'"\`]+)['"\`]\)\s*}\s*\*\/[\s\S]*?(?:static\s+)?${propName}\b`,
      'mi'
    );

    const matchType = modelContent.match(regexType);
    return matchType ? matchType[1] : null;
  }

  // Procura importPath no arquivo atual (via JSDoc @type ou const var = use('...'))
  function findImportPath(fullText, varName, propName = null) {
    // PRIORIDADE 1: @type {typeof import(...)} próximo à declaração
    const regexTypeof = new RegExp(
      String.raw`@type\s*{\s*typeof\s*import\(['"\`](\/?App\/[^'"\`]+)['"\`]\)\s*}\s*\*\/[\s\S]*?(?:static\s+)?${propName || varName}\b`,
      'mi'
    );
    const matchType = fullText.match(regexTypeof);
    if (matchType) return matchType[1];

    // PRIORIDADE 2: const var = use('App/...')
    const regexUse = new RegExp(
      String.raw`const\s+${varName}\s*=\s*use\(['"\`](\/?App\/[^'"\`]+)['"\`]\)`,
      'mi'
    );
    const matchUse = fullText.match(regexUse);
    if (matchUse) return matchUse[1];

    return null;
  }

  // ------------- Providers ---------------

  // 1) Go to definition no próprio use('App/...')
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    ['javascript', 'typescript'],
    {
      provideDefinition(document, position) {
        const range = document.getWordRangeAtPosition(position, /use\(['"`](.*?)['"`]\)/);
        if (!range) return;

        const text = document.getText(range);
        const match = text.match(/use\(['"`](.*?)['"`]\)/);
        if (!match) return;

        const rawImport = match[1];
        const filePath = resolveImportPath(rawImport);
        if (!filePath) return;

        return new vscode.Location(vscode.Uri.file(filePath), new vscode.Position(0, 0));
      },
    }
  );

  // 2) Autocomplete após digitar ponto (X. / X.y.)
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    ['javascript', 'typescript'],
    {
      provideCompletionItems(document, position) {
        const line = document.lineAt(position).text;
        const textBeforeCursor = line.substring(0, position.character);

        // Detecta cadeias como "X." ou "X.y."
        const matchVar = textBeforeCursor.match(/(\w+(?:\.\w+)?)\.$/);
        if (!matchVar) return;

        const varChain = matchVar[1]; // "Organization.repository" | "Utils"
        const [varName, propName] = varChain.split('.');

        if (varName === 'this') return; // não tratamos membros de instância aqui

        const fullText = document.getText();

        // PRIORIDADE 1: procurar via JSDoc na Model (Organization.repository)
        let importPath = propName ? findTypeImportInModel(varName, propName) : null;

        // PRIORIDADE 2: procurar via @type/use() no arquivo atual
        if (!importPath) {
          importPath = findImportPath(fullText, varName, propName);
        }
        if (!importPath) return;

        const filePath = resolveImportPath(importPath);
        if (!filePath || !fs.existsSync(filePath)) return;

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const items = [];

        // Métodos de classe (static e instância)
        const methodRegex = /^\s*(?:static\s+)?([a-zA-Z0-9_]+)\s*\(/gm;
        let m;
        while ((m = methodRegex.exec(fileContent))) {
          const label = m[1];
          if (label === 'constructor') continue;
          items.push(new vscode.CompletionItem(label, vscode.CompletionItemKind.Method));
        }

        // exports.nome = ...
        const exportRegex = /exports\.([a-zA-Z0-9_]+)\s*=/g;
        while ((m = exportRegex.exec(fileContent))) {
          items.push(new vscode.CompletionItem(m[1], vscode.CompletionItemKind.Property));
        }

        // module.exports = { a, b: fn, c }
        const moduleExportsBlock = /module\.exports\s*=\s*{([\s\S]*?)}/m;
        const blockMatch = fileContent.match(moduleExportsBlock);
        if (blockMatch) {
          const props = blockMatch[1].match(/\b([a-zA-Z0-9_]+)\b(?=\s*[:,}])/g);
          if (props) {
            for (const p of props) {
              items.push(new vscode.CompletionItem(p, vscode.CompletionItemKind.Property));
            }
          }
        }

        // Remover duplicatas
        const unique = new Map();
        items.forEach((i) => unique.set(i.label, i));
        return Array.from(unique.values());
      },
    },
    '.' // ativa ao digitar ponto
  );

  // 3) Go to definition em X.metodo() ou X.prop.metodo()
  const goToFunctionProvider = vscode.languages.registerDefinitionProvider(
    ['javascript', 'typescript'],
    {
      provideDefinition(document, position) {
        const wordRange = document.getWordRangeAtPosition(position, /\w+/);
        if (!wordRange) return;

        const methodName = document.getText(wordRange); // ex.: search
        const line = document.lineAt(position).text;

        // captura "Var.prop." OU "Var."
        const chainMatch = line.match(/(\w+)(?:\.(\w+))?\./);
        if (!chainMatch) return;

        const varName = chainMatch[1];      // Organization | Utils
        const propName = chainMatch[2] || null; // repository | null

        if (varName === 'this') return; // membros de instância não tratados aqui

        const fullText = document.getText();

        // PRIORIDADE 1: tentar resolver via JSDoc da Model (Organization.repository)
        let importPath = propName ? findTypeImportInModel(varName, propName) : null;

        // PRIORIDADE 2: tentar via @type/use() no arquivo atual
        if (!importPath) {
          importPath = findImportPath(fullText, varName, propName);
        }
        if (!importPath) return;

        const filePath = resolveImportPath(importPath);
        if (!filePath || !fs.existsSync(filePath)) return;

        // achar a linha do método
        const fileContent = fs.readFileSync(filePath, 'utf8');

        // busca: "static method(" ou "method("
        const regexFn = new RegExp(String.raw`(?:static\s+)?${methodName}\s*\(`, 'm');
        const lines = fileContent.split('\n');
        let targetLine = 0;
        for (let i = 0; i < lines.length; i++) {
          if (regexFn.test(lines[i])) {
            targetLine = i;
            break;
          }
        }

        return new vscode.Location(
          vscode.Uri.file(filePath),
          new vscode.Position(targetLine, 0)
        );
      },
    }
  );

  context.subscriptions.push(definitionProvider, completionProvider, goToFunctionProvider);
}

function deactivate() {}

module.exports = { activate, deactivate };
