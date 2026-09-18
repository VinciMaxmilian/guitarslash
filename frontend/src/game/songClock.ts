/**
 * Conversao entre o relogio do AUDIO e o relogio do CHART.
 *
 * As duas escalas nao coincidem quando a musica tem `delay` no song.ini. Um
 * delay positivo significa que o audio tem uma entrada antes do chart comecar:
 * o chart zero acontece `delay` segundos DENTRO do audio.
 *
 * Errar o sinal aqui dessincroniza a musica inteira, e o erro passa despercebido
 * porque a maioria dos charts tem delay zero - em toda a biblioteca de teste,
 * so Paint It Black tinha delay (3,778 s), e era a unica que dessincronizava.
 */

/**
 * Posicao do audio -> tempo do chart.
 *
 * @param audioPosition segundos dentro do arquivo de audio. Fica NEGATIVO
 *                      durante a contagem regressiva, antes do audio comecar.
 * @param audioOffsetMs calibracao do jogador, em ms.
 * @param songDelay `delay` do song.ini, em segundos.
 */
export function chartTime(
  audioPosition: number,
  audioOffsetMs: number,
  songDelay: number,
): number {
  return audioPosition + audioOffsetMs / 1000 - songDelay
}

/**
 * Quanto esperar antes de disparar o audio, para a intro ter o tamanho certo.
 *
 * A intro conta a partir de `songTime = -leadIn`. Como songTime desconta o
 * delay, o audio tem de comecar mais cedo na mesma medida - senao a contagem
 * regressiva fica mais longa exatamente nas musicas com delay.
 *
 * Com delay maior que o lead-in nao da para comecar antes do zero: devolve 0,
 * o audio toca de imediato e o chart entra `delay` segundos depois. A intro
 * fica mais longa, o que e so espera, nao dessincronia.
 */
export function audioStartDelay(leadIn: number, songDelay: number): number {
  return Math.max(0, leadIn - songDelay)
}

/**
 * Duracao da partida em tempo de CHART, que e a escala de `songTime`.
 *
 * O fim do audio, medido em tempo de chart, vem `delay` segundos antes. Sem
 * descontar, a condicao de fim usa um valor que `songTime` nunca alcanca e a
 * musica com delay nao termina sozinha.
 */
export function chartDuration(
  chartLength: number,
  audioDuration: number,
  songDelay: number,
): number {
  return Math.max(chartLength, audioDuration - songDelay)
}
