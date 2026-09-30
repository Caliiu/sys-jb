import { type HowToPlayTable, INVERSION_TOPIC_TABLES } from './how-to-play-inversions';
import { MODALITY_RULES, type ModalityRule } from './how-to-play-modalities';
import { ROUTES } from './routes';

/** Um tópico da tela "Como jogar": título, passos (ou parágrafos) e um atalho para a tela do assunto. */
export interface HowToPlayTopic {
  id: string;
  title: string;
  /** Passo a passo, na ordem das telas. */
  steps?: readonly string[];
  /** Explicações soltas (sem numeração). */
  notes?: readonly string[];
  /** Regras das modalidades (cada uma abre e fecha dentro do cartão). */
  modalities?: readonly ModalityRule[];
  /** Tabelas (cada uma abre e fecha dentro do cartão). */
  tables?: readonly HowToPlayTable[];
  link?: { href: string; label: string };
}

/**
 * Conteúdo da tela "Como jogar" (menu lateral). Descreve as telas e regras que existem no app; as cotações de cada banca
 * ficam em Relatórios > Cotações. Para mudar o texto, edite só este arquivo.
 */
export const HOW_TO_PLAY_TOPICS: readonly HowToPlayTopic[] = [
  {
    id: 'recarga',
    title: 'Recarregue sua conta',
    steps: [
      'No menu, toque em "Recarga PIX".',
      'Escolha o valor e onde usar o saldo: Loterias ou Games.',
      'Pague o PIX pelo app do seu banco. O saldo aparece na sua carteira.',
    ],
    link: { href: ROUTES.pixTopUp, label: 'Fazer recarga' },
  },
  {
    id: 'tradicional',
    title: 'Tradicional (1/7)',
    steps: [
      'Em Loterias, toque em "Tradicional".',
      'Escolha a data: hoje ou um dos próximos 6 dias.',
      'Escolha a modalidade (Milhar, Centena, Dezena, Grupo…) e a colocação.',
      'Digite seus palpites ou toque em "Surpresinha" para um palpite aleatório.',
      'Informe o valor: "Todos" divide o valor entre os palpites; "Cada" vale para cada palpite.',
      'Escolha uma ou mais loterias (extrações). Cada loteria gera um pule com as mesmas apostas.',
      'Confira o carrinho e toque em "Finalizar". O recibo mostra o número de cada pule.',
    ],
    notes: [
      'Cada loteria aceita apostas até o horário de venda, mostrado ao lado do nome dela.',
      'Toque em "Mais apostas" no carrinho para juntar outras apostas na mesma compra.',
    ],
    link: { href: ROUTES.lotteries, label: 'Apostar agora' },
  },
  {
    id: 'tradicional-10',
    title: 'Tradicional 1/10',
    notes: [
      'Funciona igual à Tradicional, nas loterias oficiais de 10 prêmios (como Bahia e Lotece/Lotep).',
      'Além das colocações da Tradicional, vale apostar até o 10º prêmio: 7º a 10º prêmio, 1/10 e as faixas como 6/10.',
    ],
    link: { href: ROUTES.lotteries, label: 'Apostar na 1/10' },
  },
  {
    id: 'colocacoes',
    title: 'Colocações',
    notes: [
      '1 PRÊMIO: vale só o 1º prêmio. É o que mais paga.',
      '1/5 PRÊMIO: vale do 1º ao 5º prêmio, com o prêmio dividido por 5.',
      '2/5 PRÊMIO (e as outras faixas): vale do 2º ao 5º, com o prêmio dividido pela quantidade de posições.',
      '1 e 1/5 PRÊMIO: metade do valor vale no 1º prêmio e metade no 1/5.',
      'Nas invertidas, o palpite vale em qualquer ordem, e o valor é dividido entre as combinações.',
    ],
    link: { href: ROUTES.quotes, label: 'Ver cotações' },
  },
  {
    id: 'modalidades',
    title: 'Modalidades',
    notes: ['Toque numa modalidade para ver como se joga e quando ganha.'],
    modalities: MODALITY_RULES,
  },
  {
    id: 'tabela-inversao',
    title: 'Tabela de Inversão',
    notes: [
      'Nas invertidas, o palpite vale em qualquer ordem: a centena 123 tem 6 inversões (123, 132, 213, 231, 312 e 321).',
      'Nas combinadas, os números do palpite formam várias combinações: 4 grupos no duque formam 6 duques.',
      'O prêmio é pago proporcionalmente à quantidade de inversões ou combinações.',
    ],
    tables: INVERSION_TOPIC_TABLES,
  },
  {
    id: 'fazendinha',
    title: 'Fazendinha',
    steps: [
      'No início, toque em "Fazendinha".',
      'Escolha o dia e a modalidade: Grupo, Dezena ou Centena.',
      'Na lista, escolha a loteria e o valor da aposta. Ao lado aparece quanto cada número paga.',
      'Marque os palpites disponíveis. Cada número é vendido uma vez só por extração.',
      'Confirme a compra. O comprovante mostra o número do pule.',
    ],
    link: { href: ROUTES.fazendinha, label: 'Jogar Fazendinha' },
  },
  {
    id: 'acompanhe',
    title: 'Acompanhe suas apostas',
    notes: [
      'Resultados > Resultado loterias: os resultados de hoje e dos 7 dias anteriores.',
      'Relatórios > Consultar pule: o recibo de qualquer aposta, por código ou por data.',
      'Loterias > Repetir pule: faz de novo a mesma aposta em outra data ou loteria.',
    ],
    link: { href: ROUTES.results, label: 'Ver resultados' },
  },
  {
    id: 'premios',
    title: 'Prêmios e saque',
    notes: [
      'Premiadas > Consultar premiadas: os pules premiados de cada dia.',
      'Para retirar, toque em "Solicitar saque" no menu e informe sua chave PIX.',
    ],
    link: { href: ROUTES.withdrawals, label: 'Solicitar saque' },
  },
];
