/**
 * Sincronizacao de relogio estilo NTP, sobre o PING/PONG do WebSocket.
 *
 * Por que isto existe: o host manda START_AT como um instante do relogio DELE.
 * Comparar esse numero direto com `Date.now()` do cliente sO funciona se as
 * duas maquinas estiverem com a hora igual, e nao estao: alguns segundos (ou
 * minutos) de diferenca sao normais. Sem conversao, a partida ou comeca no ato
 * ou espera para sempre.
 *
 * Matematica de um par ping/pong:
 *
 *     rtt    = t1 - t0
 *     offset = serverTime - (t0 + t1) / 2
 *
 * `offset` e quanto o relogio do host esta adiantado em relacao ao nosso.
 * Guardamos a MEDIANA das amostras, nao a media: um unico pico de latencia na
 * LAN nao deve mexer no inicio da musica.
 */

/** Quantas amostras cabem na janela. Mediana sobre as mais recentes. */
const WINDOW = 9

/** Abaixo disto a estimativa ainda e chute; o lobby espera antes de comecar. */
const MIN_SAMPLES = 3

export interface ClockSample {
  offset: number
  rtt: number
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

export class ClockSync {
  private samples: ClockSample[] = []

  /**
   * Registra um par ping/pong.
   *
   * @param clientTime instante em que o PING saiu (relogio local)
   * @param serverTime instante do host que veio no PONG
   * @param receivedAt instante em que o PONG chegou (relogio local)
   */
  addSample(clientTime: number, serverTime: number, receivedAt: number): void {
    const rtt = receivedAt - clientTime
    // Relogio local nao volta atras entre o envio e a chegada; se voltou, o
    // par nao serve (aba suspensa, ajuste de hora no meio do caminho).
    if (!Number.isFinite(rtt) || rtt < 0) return

    this.samples.push({ rtt, offset: serverTime - (clientTime + receivedAt) / 2 })
    if (this.samples.length > WINDOW) this.samples.shift()
  }

  reset(): void {
    this.samples = []
  }

  get sampleCount(): number {
    return this.samples.length
  }

  /** Verdadeiro quando ja da para confiar na conversao de timestamps. */
  get ready(): boolean {
    return this.samples.length >= MIN_SAMPLES
  }

  /** Quanto o relogio do host esta adiantado em relacao ao nosso, em ms. */
  get offsetMs(): number {
    return median(this.samples.map((s) => s.offset))
  }

  /** Ida e volta mediana, em ms. So para mostrar na interface. */
  get rttMs(): number {
    return median(this.samples.map((s) => s.rtt))
  }

  /** Converte um instante do relogio do host para o relogio local. */
  toLocal(serverTimestamp: number): number {
    return serverTimestamp - this.offsetMs
  }

  /**
   * Quanto falta, em ms, para um instante do host. Nunca negativo: se o
   * instante ja passou, o certo e comecar agora, nao pular para tras.
   */
  msUntil(serverTimestamp: number, now: number = Date.now()): number {
    return Math.max(0, this.toLocal(serverTimestamp) - now)
  }
}
