/**
 * Dicas mostradas na tela de carregamento.
 *
 * Falam de coisas que o jogo REALMENTE tem: uma dica sobre recurso inexistente
 * e pior que nenhuma dica.
 */
export const LOADING_TIPS: readonly string[] = [
  'Ajuste a calibração em Opções se as notas parecerem adiantadas ou atrasadas.',
  'Fones bluetooth costumam precisar de 100 a 200 ms de calibração.',
  'No modo sem palhetada, basta apertar o traste certo. Ligue a palhetada em Opções.',
  'Star Power ativa com Enter, a partir de metade da barra.',
  '10 de combo dobra seus pontos. 30 de combo multiplica por quatro.',
  'O anel em volta do multiplicador mostra quanto falta para o próximo degrau.',
  'Errar derruba o medidor de desempenho mais rápido do que acertar o levanta.',
  'Notas HOPO têm o miolo claro: não precisam de palhetada nova.',
  'Notas tap são as vazadas. Só o traste, sem palhetar.',
  'Aumente a velocidade das notas em Opções se a pista parecer poluída.',
  'Lefty flip inverte a ordem das lanes, em Opções.',
  'No multiplayer, só o host escolhe a música e o modo.',
  'No multiplayer LAN, use fones: duas máquinas na mesma sala viram eco.',
  'Em co-op, o BAND SCORE é a soma da banda. Em versus, vence quem fizer mais pontos.',
  'A faixa dos outros jogadores aparece em cima: dá para ver eles errando.',
  'Quem entra com a partida rolando assiste e joga na próxima música.',
  'Dificuldades diferentes em versus deixam os scores incomparáveis.',
  'Você pode trocar suas cores de nota em Opções.',
]

/**
 * Escolhe uma dica, evitando repetir a anterior.
 *
 * `random` entra por parametro para o teste poder fixar o sorteio.
 */
export function pickTip(previous?: string, random: () => number = Math.random): string {
  const candidatas =
    LOADING_TIPS.length > 1 && previous
      ? LOADING_TIPS.filter((tip) => tip !== previous)
      : LOADING_TIPS

  const indice = Math.min(candidatas.length - 1, Math.floor(random() * candidatas.length))
  return candidatas[indice]
}
