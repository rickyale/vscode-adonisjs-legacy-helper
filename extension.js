const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

function activate(context) {
  console.log('Adonis use() helper ativo ✅');

  // === Go to definition: Ctrl+Click no use('App/...') ===
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    ['javascript', 'typescript'],
    {
      provideDefinition(document, position) {
        const range = document.getWordRangeAtPosition(position, /use\(['"`](.*?)['"`]\)/);
        if (!range) return;

        const text = document.getText(range);
        const match = text.match(/use\(['"`](.*?)['"`]\)/);
        if (!match) return;

        const importPath = match[1]; // Ex: App/Models/Client/Client
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const root = workspaceFolders[0].uri.fsPath;
        const filePath = path.join(root, importPath.replace(/^App\//, 'app/') + '.js');

        if (fs.existsSync(filePath)) {
          const targetUri = vscode.Uri.file(filePath);
          const position = new vscode.Position(0, 0);
          return new vscode.Location(targetUri, position);
        }

        // Caso o arquivo .ts exista
        const tsPath = filePath.replace(/\.js$/, '.ts');
        if (fs.existsSync(tsPath)) {
          const targetUri = vscode.Uri.file(tsPath);
          const position = new vscode.Position(0, 0);
          return new vscode.Location(targetUri, position);
        }
      },
    }
  );

  // === Autocomplete ===
const completionProvider = vscode.languages.registerCompletionItemProvider(
  ['javascript', 'typescript'],
  {
    provideCompletionItems(document, position) {
      const line = document.lineAt(position).text;
      const textBeforeCursor = line.substring(0, position.character);

      // Detectar padrão: algo antes do ponto
      const matchVar = textBeforeCursor.match(/(\w+(?:\.\w+)?)\.$/);
      if (!matchVar) return;

      const varChain = matchVar[1]; // Ex: "Client.repository" ou "Utils"
      const fullText = document.getText();

      let importPath = null;

      // === 1️⃣ Procurar se foi declarado via "const X = use('App/...')"
      const varName = varChain.split('.')[0];
      const regexUse = new RegExp(`const\\s+${varName}\\s*=\\s*use\\(['"\`](App\\/[^'"\`]+)['"\`]\\)`);
      const matchUse = fullText.match(regexUse);
      if (matchUse) {
        importPath = matchUse[1];
      }

      // === 2️⃣ Procurar JSDoc: /** @type {typeof import('App/...')} */ static X
      if (!importPath) {
        const regexTypeof = new RegExp(
          `/\\*\\*[^*]*@type\\s*{\\s*typeof\\s*import\\(['"\`](App\\/[^'"\`]+)['"\`]\\)\\s*}\\s*\\*/[\\s\\S]*?(static\\s+${varChain.split('.')[1]})`
        );
        const matchType = fullText.match(regexTypeof);
        if (matchType) {
          importPath = matchType[1];
        }
      }

      if (!importPath) return;

      // === 3️⃣ Localizar o arquivo real no disco ===
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      const root = workspaceFolders[0].uri.fsPath;
      const filePath = path.join(root, importPath.replace(/^App\//, 'app/') + '.js');
      if (!fs.existsSync(filePath)) return;

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const items = [];

      // === 4️⃣ Procurar métodos de classe (estáticos e normais)
      const classRegex = /class\s+\w+\s*(?:extends\s+\w+)?\s*{([\s\S]*?)^}/gm;
      let classMatch;
      while ((classMatch = classRegex.exec(fileContent))) {
        const body = classMatch[1];
        const methodRegex = /^\s*(?:static\s+)?([a-zA-Z0-9_]+)\s*\(/gm;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(body))) {
          const methodName = methodMatch[1];
          if (!['constructor'].includes(methodName)) {
            const kind = body.includes(`static ${methodName}`) ?
              vscode.CompletionItemKind.Method :
              vscode.CompletionItemKind.Function;
            items.push(new vscode.CompletionItem(methodName, kind));
          }
        }

        // também pegar propriedades estáticas simples
        const staticProps = [...body.matchAll(/static\s+([a-zA-Z0-9_]+)\s*=/g)];
        staticProps.forEach(sp => {
          items.push(new vscode.CompletionItem(sp[1], vscode.CompletionItemKind.Property));
        });
      }

      // === 5️⃣ Procurar exports nomeados e funções soltas
      const functionRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
      let funcMatch;
      while ((funcMatch = functionRegex.exec(fileContent))) {
        items.push(new vscode.CompletionItem(funcMatch[1], vscode.CompletionItemKind.Function));
      }

      const exportRegex = /exports\.([a-zA-Z0-9_]+)\s*=/g;
      let exportMatch;
      while ((exportMatch = exportRegex.exec(fileContent))) {
        items.push(new vscode.CompletionItem(exportMatch[1], vscode.CompletionItemKind.Property));
      }

      const moduleExportsBlock = /module\.exports\s*=\s*{([\s\S]*?)};/m;
      const blockMatch = fileContent.match(moduleExportsBlock);
      if (blockMatch) {
        const props = blockMatch[1].match(/\b([a-zA-Z0-9_]+)\b(?=\s*[:,}])/g);
        if (props) {
          for (const p of props) {
            items.push(new vscode.CompletionItem(p, vscode.CompletionItemKind.Property));
          }
        }
      }

      // === 6️⃣ Remover duplicatas
      const unique = new Map();
      items.forEach(i => unique.set(i.label, i));
      return Array.from(unique.values());
    },
  },
  '.' // ativa ao digitar ponto
);

  // === Go to definition: Ctrl+Click em Utils.algumaCoisa ===
  const goToFunctionProvider = vscode.languages.registerDefinitionProvider(
    ['javascript', 'typescript'],
    {
      provideDefinition(document, position) {
        const wordRange = document.getWordRangeAtPosition(position, /\w+/);
        if (!wordRange) return;

        const word = document.getText(wordRange); // Ex: getSomething
        const line = document.lineAt(position).text;
        const varMatch = line.match(/(\w+)\./); // Ex: Utils.
        if (!varMatch) return;

        const varName = varMatch[1];
        const fullText = document.getText();

        // Encontrar onde a variável foi declarada via use()
        const regexUse = new RegExp(
          `const\\s+${varName}\\s*=\\s*use\\(['"\`](App\\/[^'"\`]+)['"\`]\\)`,
          'm'
        );
        const matchUse = fullText.match(regexUse);
        if (!matchUse) return;

        const importPath = matchUse[1];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return;

        const root = workspaceFolders[0].uri.fsPath;
        const filePath = path.join(root, importPath.replace(/^App\//, 'app/') + '.js');
        if (!fs.existsSync(filePath)) return;

        const fileContent = fs.readFileSync(filePath, 'utf8');

        // procurar posição da função dentro do arquivo
        const regexFn = new RegExp(
          `(?:static\\s+)?${word}\\s*\\(`,
          'm'
        );
        const lines = fileContent.split('\n');
        let targetLine = 0;
        for (let i = 0; i < lines.length; i++) {
          if (regexFn.test(lines[i])) {
            targetLine = i;
            break;
          }
        }

        const targetUri = vscode.Uri.file(filePath);
        const positionTarget = new vscode.Position(targetLine, 0);
        return new vscode.Location(targetUri, positionTarget);
      },
    }
  );


  context.subscriptions.push(definitionProvider, completionProvider, goToFunctionProvider);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
