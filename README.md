# AdonisJS Legacy Helper

Extensão para Visual Studio Code com suporte ao padrão `use('App/...')` do AdonisJS 4.x e propriedades anotadas com JSDoc:

- 🧭 Go to Definition:
  - `use('App/...')`
  - `Organization.repository.search()` → abre o Repository (lido via `@type {typeof import('/App/...')}`)
- ⚡ Autocomplete de métodos e exports do arquivo alvo

## Uso

```js
const Utils = use('App/Helpers/Utils')
Utils.getSomething() // autocomplete + Ctrl+Click

class Organization extends BaseModel {
  /** @type {typeof import('/App/Repositories/Organization/OrganizationRepository')} */
  static repository
}

Organization.repository.search() // autocomplete + Ctrl+Click → abre o repo


