# Adonis Legacy Helper

Extensão para o Visual Studio Code que adiciona suporte ao AdonisJS 4.1:

- 🧭 Go to Definition para `use('App/...')`
- ⚡ Autocomplete de métodos e propriedades de helpers importados com `use()`
- 📁 Compatível com estrutura padrão `app/`

### Como usar
1. Instale a extensão (`adonis-legacy-helper`).
2. No seu código, use o padrão:
   ```js
   const Utils = use('App/Helpers/Utils')
   Utils.getSomething()
