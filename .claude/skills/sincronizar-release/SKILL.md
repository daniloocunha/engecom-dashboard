---
name: sincronizar-release
description: Sincroniza o repositório local com o GitHub e conduz a cadeia de atualização automática do app Android — APK assinado, hash, tamanho, GitHub Release e aba Config do Google Sheets. Use quando o usuário pedir para sincronizar o projeto/repositório com o GitHub, atualizar o app, gerar ou publicar uma nova versão, subir um release, ou mexer no hash/versão que o app usa para se atualizar sozinho.
---

# Sincronizar repositório e publicar release do app

O pedido "sincronizar os arquivos do GitHub com o local" **quase nunca é só um
`git pull`** neste projeto. Quando o que está mais novo no GitHub é código do
app Android, a versão em campo só recebe a atualização se toda a cadeia abaixo
for percorrida — e ela envolve arquivos e sistemas fora do repositório.

Trate a sincronização como duas etapas: **(1) alinhar o repo** e, se houve
mudança no app, **(2) percorrer a cadeia de atualização**.

## Por que a cadeia existe

O app não se atualiza pela Play Store. Em cada abertura e a cada 6 h,
`UpdateChecker.kt` lê a aba **Config** de um Google Sheets e compara o
`versionCode` instalado com `versao_recomendada`. Se houver versão nova,
`UpdateDownloader.kt` baixa o APK de `url_download` e **valida o hash contra
`hash_md5`** antes de instalar. Ou seja: publicar o APK sem atualizar a aba
Config não entrega nada aos aparelhos; atualizar a aba com hash errado faz o
download ser rejeitado em todos eles.

## Etapa 1 — Alinhar o repositório

```bash
git fetch origin
git status                    # há trabalho local não commitado?
git log --oneline HEAD..origin/master   # o que o GitHub tem a mais
```

Se houver trabalho local não commitado, **pergunte antes** de qualquer
`pull`/`checkout` — não descarte alterações do usuário por conta própria.

```bash
git checkout master && git pull origin master
```

Se o objetivo era trazer um branch de trabalho (ex.: um PR do Claude Code na
web), use `git fetch origin <branch> && git checkout <branch>`.

## Etapa 2 — A cadeia de atualização (só se o app mudou)

Rode o script de preparação, que faz todas as verificações mecânicas e para
antes de qualquer ação externa:

```bash
bash scripts/preparar-release.sh
```

Ele verifica, nesta ordem:

1. **Repo alinhado** com `origin` e sem pendências que atrapalhem o build
2. **`versionCode`/`versionName`** em `app/build.gradle.kts` — o `versionCode`
   precisa ser **maior** que o `versao_recomendada` atual, senão nenhum
   aparelho enxerga a atualização
3. **Credenciais do Google** em `app/src/main/assets/rdo-engecom-*.json` — o
   arquivo é gitignored e, sem ele, o APK compila e instala normalmente mas
   **toda sincronização do app falha em campo**
4. **Keystore de release** configurado em `keystore.properties`
5. Gera o **APK de release** (`./gradlew assembleRelease`)
6. Confere a **assinatura** contra o certificado de produção — se o SHA-256 não
   bater, o APK não instala por cima da versão instalada
7. Confirma que as **credenciais entraram no APK**
8. Calcula **MD5** e **tamanho em MB**
9. Imprime o comando pronto para a aba Config

### Ações externas — sempre confirmar com o usuário antes

O script para aqui de propósito. As duas ações seguintes afetam os aparelhos em
campo e **não devem ser executadas sem o "pode ir" explícito**:

**a) Criar o GitHub Release** com o APK anexado (tag `vX.Y.Z`). A URL do asset é
o que vai para `url_download`.

**b) Atualizar a aba Config:**

```bash
python scripts/update_config_release.py            # mostra os valores atuais
python scripts/update_config_release.py --apply \
    --versao <versionCode> --hash <MD5> --tamanho <MB> \
    --url <URL do asset do release> \
    --mensagem "Nova versão X.Y.Z — <resumo>"
```

O script autentica com `rdo-engecom-0cdcc15ed168.json` na **raiz do repo** (não
é o mesmo caminho do arquivo em `assets/`, embora o conteúdo seja o mesmo).

## Regras que não podem ser violadas

- **Hash em MD5 (32 caracteres).** Enquanto houver aparelhos com
  `versionCode ≤ 23` em campo, só MD5 serve — versões antigas não calculam
  SHA-256 e rejeitariam o download. SHA-256 (64 caracteres) só quando todos
  estiverem em 24+.
- **`versao_minima` não é alterada pelo script.** Bloquear versões antigas
  derruba quem não atualizou; é decisão manual do usuário.
- **Nunca commitar** keystore, `keystore.properties` ou qualquer
  `rdo-engecom-*.json`. Já estão no `.gitignore` — se aparecerem em
  `git status`, algo está errado.
- **Assinatura sempre a mesma.** Certificado de produção:
  `CN=Engecom Engenharia`, SHA-256
  `05ff35faf2d84092b383add4204ea2f7031fa9bc366b16dd4c30867ab8218a5d`.

## Depois de publicar

Atualize, no repositório:

- `CLAUDE.md` → **Version Information** e uma entrada em **Version History**
- Commit e push das mudanças de versão

## Se o pedido for só do dashboard

Mudanças em `dashboard/**`, `src/**` ou `wrangler.jsonc` fazem deploy sozinhas
via GitHub Actions no push para `master`. Não há APK, hash nem aba Config
envolvidos — a cadeia acima não se aplica.
