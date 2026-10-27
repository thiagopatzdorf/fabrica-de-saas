# Fitrich v2, plataforma: backup cifrado e arquivo

Módulos puros (sem DOM na lógica), ESM, sem dependência. Testes em
`tests/unit/fitrich-v2-plataforma*.test.mjs` (Node 18).

## `cripto.mjs`: backup cifrado

PBKDF2-HMAC-SHA-256 com **600 000 iterações no mínimo** e sal de 16 B deriva uma chave
AES-256-GCM (IV de 12 B). Tudo pela WebCrypto. Arquivo = JSON com cabeçalho em claro
(`fmt`, `v`, `kdf`, `iter`, `salt`, `iv`) e corpo base64 (`dados` = cifra + tag).

| protege | não protege |
|---|---|
| o arquivo vazado fora do aparelho (Drive, e-mail, pen drive) | malware ou pessoa com o aparelho desbloqueado: o armazenamento local segue **em claro** (criptografia em repouso fica para depois) |
| adulteração: tag do GCM falha, nada é devolvido pela metade | senha fraca: iterações encarecem o chute, não o impedem |
| downgrade: `decifrar` recusa `iter` abaixo do piso | senha perdida: não há recuperação, por desenho |

`kdf` permite trocar por Argon2id no futuro; arquivo com `kdf` desconhecido é recusado.
No navegador roda em Web Worker (`cripto.worker.mjs`) para a derivação não congelar a tela.

## `arquivo.mjs`: salvar/abrir e mesclar

`mesclar(a, b)`: merge por `id` + `atualizadoEm` (último escrito vence por registro),
tombstones em `meta.removidos` (`{ id: quandoRemoveu }`), resultado determinístico,
comutativo e idempotente. É assim que dois aparelhos sincronizam por um arquivo numa
pasta de nuvem da própria pessoa. WebRTC/sinalização: descartados (exigem servidor nosso).

`salvarArquivo`/`abrirArquivo`: File System Access API (Chromium desktop; handle
guardado para "salvar sempre neste arquivo") com fallback de download e `<input type=file>`.
