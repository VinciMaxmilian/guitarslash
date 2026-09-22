/**
 * Versao do jogo, injetada pelo Vite a partir do `package.json`.
 *
 * Ver `define` em vite.config.ts. O `package.json` e a fonte unica: um numero
 * escrito tambem aqui garantiria que um dia os dois discordariam, e o rodape
 * do menu passaria a mentir sobre o que esta rodando.
 */
declare const __GAME_VERSION__: string

/**
 * O `typeof` protege quem roda o codigo sem passar pelo build do Vite - o
 * `define` e uma substituicao de texto, e sem ela o simbolo nao existiria.
 */
export const GAME_VERSION: string =
  typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : '0.0.0'
