import { describe, expect, it } from 'vitest'

import { audioStartDelay, chartDuration, chartTime } from './songClock'

/**
 * Numeros reais de "Paint It Black", que era a unica musica da biblioteca com
 * delay e a unica que dessincronizava.
 */
const PIB = {
  delay: 3.778,
  audioDuration: 231.779,
  chartLength: 224.296,
  primeiraNota: 0.108,
  ultimaNota: 223.613,
}

const LEAD_IN = 4.5

describe('chartTime', () => {
  it('sem delay, chart e audio andam juntos', () => {
    expect(chartTime(12.5, 0, 0)).toBeCloseTo(12.5, 6)
  })

  it('o chart zero acontece `delay` segundos dentro do audio', () => {
    expect(chartTime(PIB.delay, 0, PIB.delay)).toBeCloseTo(0, 6)
  })

  it('no inicio do audio o chart ainda NAO comecou', () => {
    // O bug era justamente este: com a soma, no instante em que o audio
    // comecava o chart ja estava em +3,778 s e as primeiras notas eram
    // inalcancaveis.
    expect(chartTime(0, 0, PIB.delay)).toBeLessThan(0)
    expect(chartTime(0, 0, PIB.delay)).toBeCloseTo(-PIB.delay, 6)
  })

  it('a primeira nota cai depois da entrada do audio', () => {
    const quandoToca = PIB.primeiraNota + PIB.delay
    expect(chartTime(quandoToca, 0, PIB.delay)).toBeCloseTo(PIB.primeiraNota, 6)
    expect(quandoToca).toBeGreaterThan(PIB.delay)
  })

  it('a ultima nota cabe dentro do audio', () => {
    const quandoToca = PIB.ultimaNota + PIB.delay
    expect(quandoToca).toBeLessThan(PIB.audioDuration)
  })

  it('aplica a calibracao do jogador', () => {
    expect(chartTime(10, 120, 0)).toBeCloseTo(10.12, 6)
    expect(chartTime(10, -80, 0)).toBeCloseTo(9.92, 6)
  })

  it('calibracao e delay se somam sem se atrapalhar', () => {
    expect(chartTime(10, 100, 2)).toBeCloseTo(8.1, 6)
  })

  it('delay negativo adianta o chart', () => {
    // Alguns charts usam delay negativo; o sinal tem de valer nos dois lados.
    expect(chartTime(5, 0, -1.5)).toBeCloseTo(6.5, 6)
  })

  it('funciona com audio negativo, durante a contagem', () => {
    expect(chartTime(-4.5, 0, 0)).toBeCloseTo(-4.5, 6)
  })
})

describe('audioStartDelay', () => {
  it('sem delay, espera o lead-in inteiro', () => {
    expect(audioStartDelay(LEAD_IN, 0)).toBeCloseTo(LEAD_IN, 6)
  })

  it('com delay, o audio comeca mais cedo na mesma medida', () => {
    expect(audioStartDelay(LEAD_IN, PIB.delay)).toBeCloseTo(LEAD_IN - PIB.delay, 6)
  })

  it('a intro tem o MESMO tamanho com e sem delay', () => {
    // O que importa: songTime tem de valer -leadIn quando a intro comeca,
    // nos dois casos.
    for (const delay of [0, 1, PIB.delay]) {
      const espera = audioStartDelay(LEAD_IN, delay)
      const audioNoInicioDaIntro = -espera
      expect(chartTime(audioNoInicioDaIntro, 0, delay)).toBeCloseTo(-LEAD_IN, 6)
    }
  })

  it('delay maior que o lead-in nao pede tempo negativo', () => {
    expect(audioStartDelay(LEAD_IN, 6)).toBe(0)
    expect(audioStartDelay(LEAD_IN, 99)).toBe(0)
  })
})

describe('chartDuration', () => {
  it('sem delay, e o maior entre chart e audio', () => {
    expect(chartDuration(200, 231.779, 0)).toBeCloseTo(231.779, 6)
    expect(chartDuration(240, 231.779, 0)).toBeCloseTo(240, 6)
  })

  it('desconta o delay da duracao do audio', () => {
    expect(chartDuration(PIB.chartLength, PIB.audioDuration, PIB.delay)).toBeCloseTo(
      PIB.audioDuration - PIB.delay,
      6,
    )
  })

  it('a duracao tem de ser ALCANCAVEL pelo songTime', () => {
    // Sem o desconto, a duracao era 231.779 mas songTime so chegava a 228.001:
    // a condicao de fim nunca batia e a musica nao terminava sozinha.
    const songTimeMaximo = chartTime(PIB.audioDuration, 0, PIB.delay)
    const duracao = chartDuration(PIB.chartLength, PIB.audioDuration, PIB.delay)
    expect(duracao).toBeLessThanOrEqual(songTimeMaximo + 1e-6)

    const antigo = Math.max(PIB.chartLength, PIB.audioDuration)
    expect(antigo).toBeGreaterThan(songTimeMaximo)
  })

  it('chart mais longo que o audio ainda manda', () => {
    expect(chartDuration(300, 231.779, PIB.delay)).toBeCloseTo(300, 6)
  })
})
